/**
 * 扫描 worker 进程入口
 *
 * 由主进程通过 utilityProcess.fork() 启动，承载全部扫描核心逻辑（迁移自 ScannerManager）。
 * - 独立打开 better-sqlite3 连接（与主进程 DatabaseManager 共享同一 db 文件，WAL 模式并发）
 * - 通过 process.parentPort 与主进程通信（SCAN_START/STOP/DISPOSE → SCAN_PROGRESS/COMPLETE/LOG）
 * - 收到 SCAN_DISPOSE 时主动关闭 DB + kill 子进程 + 退出
 *
 * 改造点（相对原 ScannerManager）：
 * 1. DB 连接：worker 内部 new Database(dbPath)，配置与主进程一致的 PRAGMA + busy_timeout=5000
 * 2. EventEmitter emit('progress') → process.parentPort.postMessage({ type: 'SCAN_PROGRESS' })
 * 3. logger → workerLog（warn/error 通过 SCAN_LOG 转发到主进程，info 级别丢弃以减少 IPC 开销）
 * 4. shouldStop 改为模块级变量，由 SCAN_STOP 消息设置
 * 5. repairLegacyData 中 dbManager 调用改为直接查询 schema_migrations 表（worker 不持有 DatabaseManager）
 * 6. ffprobe 路径：直接 import video-probe（resolveAsarUnpackedPath 已处理路径修正）
 * 7. insertStmtCache / realpathCache 保持原缓存机制，每次 SCAN_START 时清空
 */
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { execFile } from 'child_process'
import Database from 'better-sqlite3'
import { detectSceneCategory } from '../utils/scene-category'
// C-3：统一媒体扩展名常量（取代本文件内联定义）
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from '../utils/media-constants'
import { runWithConcurrency } from '../utils/concurrency'
// 建议改#1：复用共享 ffprobe 实现（取代本文件 getVideoMetadata 私有方法）
import { probeVideoMetadata } from '../utils/video-probe'
// C-G3：共享命名常量（取代魔法数字）
import { DRIVE_LETTER_START, DRIVE_LETTER_END } from '../utils/constants'
// TDD 重构：路径分类纯函数抽取到独立文件，便于单元测试（无 electron/sharp/ffmpeg 依赖）
import {
  extractUidFromPath,
  extractAlbumTypeFromPath,
  extractMediaSourceFromPath
} from './path-classifier'
// 子进程注册表：worker 退出时 kill 所有活跃的 ffmpeg/ffprobe 子进程
import { killAllProcesses } from '../utils/process-registry'
import type {
  WorkerCommand,
  WorkerEvent,
  ScanOptions,
  ScanProgress,
  MediaFile
} from './worker-protocol'

// ============ 常量（保持原值，禁止改值） ============

// A-S5：扫描深度限制（默认 10），防止过深递归
// 修复：原值 10 不足以扫描游戏目录的完整深度（X6Game\Plugins\PaperSDK\... 可达 12+ 层）
// 提升至 15 确保所有媒体子目录都能被递归扫描
const MAX_SCAN_DEPTH = 15
// A-S6：流式写入分批大小（每 500 条 INSERT 一次），降低峰值内存
const SCAN_BATCH_SIZE = 500

// 游戏特征文件（全盘文件名签名搜索的核心签名）
const GAME_SIGNATURES = [
  'InfinityNikki.exe',
  'NikkiLauncher.exe',
  'GameConfig.ini',
  'InfinityNikkiLauncher.exe',
  'Launcher.exe'
]

// 大小写不敏感匹配用 Set（小写形式），Windows 文件系统不区分大小写
const GAME_SIGNATURES_LOWER = new Set(GAME_SIGNATURES.map((s) => s.toLowerCase()))

// 媒体特征文件夹（用于全盘扫描识别游戏媒体目录，不依赖游戏 exe）
// 修复：移除 Video/Videos/Movies 等通用签名（误匹配 QQ/剪映/其他游戏目录）
// 只保留无限暖暖专属签名，这些签名在非游戏目录中不会出现
const MEDIA_FOLDER_SIGNATURES = [
  // 游戏内主要相册（位于 X6Game\Saved\GamePlayPhotos\$uid$\ 下）
  // 这些是无限暖暖专属命名，不会误匹配
  'NikkiPhotos_HighQuality',
  'NikkiPhotos_LowQuality',
  'MagazinePhotos',
  'ClockInPhoto',
  'CloudPhotos',
  'CloudPhotos_LowQuality',
  // 拼图相册父目录（GamePlayPhotos\$uid$\Collage\）
  'Collage',
  // 其他游戏内相册（位于 X6Game\Saved\ 下，均为无限暖暖专属命名）
  'CustomAvatar',
  'CustomCard',
  'CustomHomeBoardPhoto',
  'HomeTemplate',
  'PlantDyeing',
  'DIY',
  'XSdkQrCode',
  'MallPic',
  // 游戏截图（位于 X6Game\ScreenShot，ScreenShot 较通用但配合游戏目录上下文可接受）
  'ScreenShot'
  // 移除：'Videos'、'Video'、'Movies' —— 过度通用，误匹配 QQ/剪映/其他游戏
  // 这些目录的扫描改为通过游戏 exe 定位后，扫描游戏目录下的所有子目录
]

// 大小写不敏感匹配用 Set（小写形式），避免 Windows 目录大小写差异导致漏匹配
const MEDIA_FOLDER_SIGNATURES_LOWER = new Set(MEDIA_FOLDER_SIGNATURES.map((s) => s.toLowerCase()))

// 全盘搜索时跳过的系统目录（小写匹配，避免扫描无意义目录浪费时间）
const SYSTEM_DIRS_TO_SKIP = new Set([
  'windows',
  'programdata',
  '$recycle.bin',
  'system volume information',
  'recovery',
  'perflogs',
  'msocache',
  'config.msi',
  '$windows.~bt',
  '$windows.~ws',
  'intel',
  'amd',
  'nvidia corporation',
  'driverstore',
  'winsxs',
  'servicing',
  'installer',
  'assembly',
  'temp',
  'tmp',
  // P0-01：新增更多系统/应用目录跳过，提升全盘搜索性能
  'appdata',
  'microsoft',
  'windowsapps',
  'packages',
  'node_modules',
  '.git',
  '__pycache__',
  '.vscode',
  '.idea',
  // F-G1：云同步目录跳过——避免扫描 OneDrive/iCloud/Dropbox/Google Drive 照片库
  // 这些目录中的照片通常已是云端的本地副本，扫描会引入重复索引且占用 OneDrive 下载配额
  'onedrive',
  'iclouddrive',
  'dropbox',
  'google drive'
])

// P0-01：全盘文件名签名搜索的并发盘符数限制
const DRIVE_SCAN_CONCURRENCY = 4

// ============ worker 模块级状态 ============

let db: Database.Database | null = null
let currentDbPath = ''
let shouldStop = false
let progress: ScanProgress = {
  scanned: 0,
  found: 0,
  currentPath: '',
  status: 'idle'
}
// C-G6：缓存 saveBatchToDatabase 的 prepared statement，避免每个批次都重新 prepare
// 生命周期：db 变化时置空，下次调用 saveBatchToDatabase 时重新 prepare
let insertStmtCache: Database.Statement | null = null
// P1-A3：realpath 结果缓存，避免对同一路径重复调用 fsp.realpath（符号链接解析 IO 开销）
// 生命周期：每次 startScan 开始时清空
const realpathCache = new Map<string, string>()

// ============ worker log 转发 ============

/**
 * worker 内部日志转发。
 * - info 级别在 worker 内部丢弃（避免跨进程 IPC 开销）
 * - warn / error 级别通过 SCAN_LOG 转发到主进程，由主进程 logger 统一记录
 */
function workerLog(level: 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
  if (level === 'info') return
  try {
    const event: WorkerEvent = {
      type: 'SCAN_LOG',
      payload: { level, message, args: args.length > 0 ? args : undefined }
    }
    process.parentPort?.postMessage(event)
  } catch {
    // parentPort 不可用时丢弃日志，避免日志本身导致 worker 崩溃
  }
}

/** 发送事件到主进程 */
function sendEvent(event: WorkerEvent): void {
  try {
    process.parentPort?.postMessage(event)
  } catch {
    // parentPort 不可用时丢弃事件
  }
}

// ============ 进度推送（保持原 500ms 节流） ============

let lastProgressEmit = 0

function emitProgress(force = false): void {
  const now = Date.now()
  if (force || now - lastProgressEmit >= 500) {
    lastProgressEmit = now
    sendEvent({ type: 'SCAN_PROGRESS', payload: { ...progress } })
  }
}

// ============ 工具方法（迁移自 ScannerManager） ============

/**
 * P1-A3：带缓存的 realpath，避免对同一路径重复调用 fsp.realpath
 * 符号链接解析涉及系统调用，全盘搜索时同一路径可能被多个驱动器任务重复解析
 */
async function cachedRealpath(dir: string): Promise<string> {
  const cached = realpathCache.get(dir)
  if (cached) return cached
  const real = await fsp.realpath(dir)
  realpathCache.set(dir, real)
  return real
}

// ============ 修复旧数据 ============

/**
 * 修复旧数据（在 startScan 开头调用，确保字段一致性）
 *
 * 问题背景：P0-02/P0-03/media_source 功能添加前写入的旧记录，account_uid='default'、
 * album_type='其他'、media_source='unknown'。增量扫描因 mtime 匹配跳过这些文件，
 * 字段从未被更新。同时，ScreenShot 签名误匹配导致非游戏目录图片被扫描入库。
 * 另外，MallPic 商城图最初被识别为 'game'，应归为 'launcher'（非用户拍摄）。
 *
 * 修复内容：
 * 1. 删除 file_path 不含 'InfinityNikki' 的误扫描记录（Trae skills、War Thunder、test_media 等）
 * 2. 对 media_source='unknown' 或误识别为 game 的 MallPic 记录，重新计算 media_source/account_uid/album_type
 *
 * P0-A2：改为版本化一次性迁移，通过 schema_migrations 表跟踪，避免每次 startScan 执行 3 个 LIKE 全表扫描
 *
 * worker 改造：原 dbManager.isMigrationApplied/markMigrationApplied 改为直接查询 schema_migrations 表
 */
function repairLegacyData(): void {
  if (!db) return

  // 检查迁移是否已应用（直接查询 schema_migrations 表）
  try {
    const applied = db
      .prepare('SELECT 1 FROM schema_migrations WHERE name = ?')
      .get('repair_legacy_data_v1')
    if (applied) {
      return
    }
  } catch {
    // schema_migrations 表可能尚未创建（极旧版本数据库），降级为每次执行
  }

  try {
    // 1. 删除误扫描的非游戏目录文件
    // 判定标准：file_path 中不含 'InfinityNikki'（覆盖 InfinityNikki.exe 和 InfinityNikki Launcher 两种路径）
    const nonGameFiles = db
      .prepare("SELECT id FROM media_files WHERE LOWER(file_path) NOT LIKE '%infinitynikki%'")
      .all() as Array<{ id: number }>

    if (nonGameFiles.length > 0) {
      const deleteStmt = db.prepare('DELETE FROM media_files WHERE id = ?')
      const deleteMany = db.transaction((ids: number[]) => {
        for (const id of ids) deleteStmt.run(id)
      })
      deleteMany(nonGameFiles.map((f) => f.id))
      workerLog(
        'info',
        `[Scanner] repairLegacyData: 删除 ${nonGameFiles.length} 条误扫描的非游戏目录文件`
      )
    }

    // 2. 重新计算需要修复的记录字段
    // 触发条件：
    //   a) media_source='unknown'（功能上线前写入的旧记录）
    //   b) media_source='game' 但路径属于非用户拍摄类别：
    //      - MallPic 商城图
    //      - X6Game\ScreenShot 游戏截图
    //      - CloudPhotos\Temp 云照片临时缓存
    const legacyFiles = db
      .prepare(
        "SELECT id, file_path FROM media_files WHERE media_source = 'unknown' " +
          "OR (media_source = 'game' AND (LOWER(file_path) LIKE '%\\mallpic\\%' " +
          "OR LOWER(file_path) LIKE '%\\x6game\\screenshot\\%' " +
          "OR LOWER(file_path) LIKE '%\\cloudphotos\\temp\\%'))"
      )
      .all() as Array<{ id: number; file_path: string }>

    if (legacyFiles.length > 0) {
      const updateStmt = db.prepare(
        'UPDATE media_files SET media_source = ?, account_uid = ?, album_type = ? WHERE id = ?'
      )
      const updateMany = db.transaction((files: Array<{ id: number; file_path: string }>) => {
        for (const file of files) {
          updateStmt.run(
            extractMediaSourceFromPath(file.file_path),
            extractUidFromPath(file.file_path),
            extractAlbumTypeFromPath(file.file_path),
            file.id
          )
        }
      })
      updateMany(legacyFiles)
      workerLog(
        'info',
        `[Scanner] repairLegacyData: 更新 ${legacyFiles.length} 条旧记录的 media_source/account_uid/album_type 字段`
      )
    }

    // 标记迁移已完成（直接写入 schema_migrations 表）
    try {
      db.prepare(
        "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, datetime('now'))"
      ).run('repair_legacy_data_v1')
    } catch (markErr) {
      // 标记失败不阻塞扫描，但下次启动会重复执行（安全降级）
      workerLog(
        'warn',
        '[Scanner] repairLegacyData: 标记迁移状态失败，下次将重复执行:',
        markErr instanceof Error ? markErr.message : String(markErr)
      )
    }
  } catch (err) {
    // 修复失败不阻塞扫描，仅记录错误
    workerLog(
      'error',
      '[Scanner] repairLegacyData 失败:',
      err instanceof Error ? err.message : String(err)
    )
  }
}

// ============ 扫描历史记录 ============

function insertScanHistory(scanType: string): number {
  if (!db) return 0
  const result = db
    .prepare(
      "INSERT INTO scan_history (scan_type, start_time, status) VALUES (?, datetime('now'), 'running')"
    )
    .run(scanType)
  return Number(result.lastInsertRowid)
}

function updateScanHistory(id: number, status: string, filesFound: number, filesNew: number): void {
  if (!db) return
  db.prepare(
    "UPDATE scan_history SET end_time = datetime('now'), files_found = ?, files_new = ?, status = ? WHERE id = ?"
  ).run(filesFound, filesNew, status, id)
}

// ============ 文件完整性校验 ============

/**
 * T02：文件完整性校验
 * 对数据库中所有未软删除的记录检查文件是否存在
 * 连续两次缺失才标记 is_missing=1，一次出现即恢复
 *
 * C-F1 修复：原实现使用同步 fs.existsSync 逐条检查，万级文件下阻塞主进程数秒。
 * 现改为 fsp.access 异步 + runWithConcurrency(8) 并发检查，文件存在性检查不再阻塞事件循环。
 * DB 事务仍同步执行（better-sqlite3 特性），但仅在收集完结果后执行一次。
 */
async function checkMissingFiles(): Promise<void> {
  if (!db) return
  try {
    const rows = db
      .prepare('SELECT id, file_path FROM media_files WHERE is_deleted = 0')
      .all() as Array<{ id: number; file_path: string }>

    if (rows.length === 0) return

    const updateMissing = db.prepare(
      'UPDATE media_files SET missing_count = missing_count + 1, is_missing = CASE WHEN missing_count + 1 >= 2 THEN 1 ELSE 0 END WHERE id = ?'
    )
    const updateFound = db.prepare(
      'UPDATE media_files SET missing_count = 0, is_missing = 0 WHERE id = ?'
    )
    const updateAll = db.transaction((missingIds: number[], foundIds: number[]) => {
      for (const id of missingIds) updateMissing.run(id)
      for (const id of foundIds) updateFound.run(id)
    })

    // 异步并发检查文件存在性（8 路并发，避免同步 fs.existsSync 阻塞主进程事件循环）
    const missingIds: number[] = []
    const foundIds: number[] = []
    const tasks = rows.map((row) => async () => {
      try {
        await fsp.access(row.file_path, fs.constants.R_OK)
        foundIds.push(row.id)
      } catch {
        missingIds.push(row.id)
      }
    })
    await runWithConcurrency(tasks, 8)
    updateAll(missingIds, foundIds)

    if (missingIds.length > 0) {
      workerLog(
        'info',
        `[Scanner] 完整性校验：${missingIds.length} 个文件缺失，${foundIds.length} 个文件存在`
      )
    }
  } catch (error) {
    // workerLog 对 Error 对象会用 JSON.stringify 丢失 stack，转 message 保留可读信息
    workerLog(
      'error',
      '[Scanner] 完整性校验失败:',
      error instanceof Error ? error.message : String(error)
    )
  }
}

// ============ 游戏目录查找 ============

/**
 * P0-01：查找所有游戏媒体目录（注册表快速路径 + 全盘签名深度搜索）
 *
 * C-G4：原 findGameDirectories 与 findAllMediaDirectories 逻辑完全一致，合并为单一方法。
 *
 * 流程：
 * - 快速路径：Steam/Epic 注册表查询 + 用户数据目录（AppData 下游戏数据）
 * - 签名搜索：对所有可用盘符执行 depth=8 深度优先搜索
 *   优先匹配媒体特征文件夹（精确），未命中再回退到游戏 exe 签名
 * - 并发扫描多个盘符（并发限制 4），提升搜索速度
 *
 * @param _customPaths 向后兼容参数，内部不再使用
 * @returns 所有匹配的媒体目录列表（去重）
 */
async function findMediaDirectories(_customPaths?: string[]): Promise<string[]> {
  const found = new Set<string>()

  // 1. 快速路径：Steam + Epic 注册表查询
  for (const p of await findSteamGamePaths()) found.add(p)
  for (const p of await findEpicGamePaths()) found.add(p)

  // 2. 快速路径：用户数据目录（AppData 下的游戏数据）
  // SYSTEM_DIRS_TO_SKIP 跳过 appdata，全盘签名搜索无法进入，必须显式检查
  for (const p of await getUserDataPaths()) found.add(p)

  // P1-A3：快速路径早退——Steam/Epic/用户数据目录已找到结果时跳过全盘签名搜索
  // 全盘搜索遍历所有盘符 depth=8，单盘 30s+，快速路径通常已覆盖常见安装位置
  if (found.size > 0) {
    workerLog('info', `[Scanner] 快速路径已找到 ${found.size} 个目录，跳过全盘签名搜索`)
  } else {
    // 3. 签名搜索（depth 8，覆盖游戏媒体的完整路径深度）
    // 实际媒体路径：H:\InfinityNikki Launcher\InfinityNikki\X6Game\Saved\GamePlayPhotos\$uid$\NikkiPhotos_HighQuality
    // 媒体文件夹在 depth 7，必须用 depth 8 才能匹配
    const drives = await getAvailableDrives()
    const driveTasks = drives.map((drive) => async () => {
      if (shouldStop) return
      // 优先搜索媒体文件夹（精确），找到就不搜索游戏 exe（避免扫描整个游戏目录）
      const mediaDirs = await searchByMediaFolderSignatureShallow(drive, 8)
      if (mediaDirs.length > 0) {
        for (const d of mediaDirs) found.add(d)
        return
      }
      // 媒体文件夹没找到，搜索游戏 exe
      const gameDir = await searchBySignatureShallow(drive, 8)
      if (gameDir) found.add(gameDir)
    })
    await runWithConcurrency(driveTasks, DRIVE_SCAN_CONCURRENCY)
  } // end of else（全盘签名搜索）

  // 过滤误匹配：只保留含 InfinityNikki 的路径
  // 原因：NikkiPhotos_LowQuality 等签名虽是无限暖暖专属，但用户的 test_media 测试目录会模仿游戏目录结构
  // War Thunder 等其他游戏的 ScreenShot 目录也会被签名匹配
  // 真正的游戏目录路径中必含 'InfinityNikki'（游戏安装目录或启动器缓存目录）
  const filtered = Array.from(found).filter((p) => p.toLowerCase().includes('infinitynikki'))
  workerLog(
    'info',
    `[Scanner] findMediaDirectories 搜索结果: ${filtered.length} 个目录（过滤前 ${found.size} 个）`
  )
  for (const d of filtered) workerLog('info', `[Scanner]   - ${d}`)

  return filtered
}

/**
 * C-G5：签名搜索通用骨架（searchBySignatureShallow 与 searchByMediaFolderSignatureShallow 共用）
 *
 * 遍历目录树（限制深度），对每个条目调用 matcher 判定是否命中：
 * - { value, stop: true }：记录命中并立即终止整个搜索（首匹配即返回）
 * - { value, stop: false }：记录命中，跳过该条目子树，继续扫描兄弟节点
 * - null：按常规目录递归处理
 *
 * 跳过 SYSTEM_DIRS_TO_SKIP 与符号链接，realpath 去环。
 *
 * @param rootPath 搜索根目录
 * @param maxDepth 最大搜索深度（含根目录 depth 0）
 * @param matcher 命中判定函数
 * @returns 所有命中值列表（按找到顺序）
 */
async function searchBySignature<T>(
  rootPath: string,
  maxDepth: number,
  matcher: (entry: fs.Dirent, dir: string) => { value: T; stop: boolean } | null
): Promise<T[]> {
  const visitedRealPaths = new Set<string>()
  const found: T[] = []
  let stopped = false

  const search = async (dir: string, depth: number): Promise<void> => {
    if (shouldStop || stopped || depth >= maxDepth) return
    try {
      const realDir = await cachedRealpath(dir)
      if (visitedRealPaths.has(realDir)) return
      visitedRealPaths.add(realDir)
      const entries = await fsp.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (shouldStop || stopped) return
        const match = matcher(entry, dir)
        if (match) {
          found.push(match.value)
          if (match.stop) {
            stopped = true
            return
          }
          // 命中但不终止：跳过该条目子树，继续扫描兄弟节点
          continue
        }
        if (entry.isDirectory() && depth < maxDepth - 1) {
          if (SYSTEM_DIRS_TO_SKIP.has(entry.name.toLowerCase())) continue
          if (entry.isSymbolicLink()) continue
          await search(path.join(dir, entry.name), depth + 1)
        }
      }
    } catch (err) {
      // 修复 F2：原 catch 块静默吞错，违反"错误必须被处理，不能静默失败"硬约束
      // 加日志输出，使扫描跳过的目录可诊断化（权限不足/目录不存在/I/O 错误/符号链接环等）
      workerLog(
        'warn',
        `[Scanner] 跳过目录: ${dir}`,
        err instanceof Error ? err.message : String(err)
      )
    }
  }

  await search(rootPath, 0)
  return found
}

/**
 * 浅层签名搜索（限制深度，快速定位常见安装路径）
 * @param rootPath 搜索根目录（通常是盘符根）
 * @param maxDepth 最大搜索深度
 */
async function searchBySignatureShallow(
  rootPath: string,
  maxDepth: number
): Promise<string | null> {
  const results = await searchBySignature<string>(rootPath, maxDepth, (entry, dir) => {
    if (entry.isFile() && GAME_SIGNATURES_LOWER.has(entry.name.toLowerCase())) {
      return { value: dir, stop: true }
    }
    return null
  })
  return results[0] ?? null
}

/**
 * 浅层媒体文件夹签名搜索（限制深度，快速定位常见媒体目录）
 * @param rootPath 搜索根目录（通常是盘符根）
 * @param maxDepth 最大搜索深度
 */
async function searchByMediaFolderSignatureShallow(
  rootPath: string,
  maxDepth: number
): Promise<string[]> {
  const results = await searchBySignature<string>(rootPath, maxDepth, (entry, dir) => {
    if (entry.isDirectory() && MEDIA_FOLDER_SIGNATURES_LOWER.has(entry.name.toLowerCase())) {
      // 修复：ScreenShot 签名较通用（Trae skills/screenshot、War Thunder 等都会误匹配）
      // 需要路径上下文验证：仅当路径中含 InfinityNikki 或 X6Game 时才认为是游戏截图目录
      if (entry.name.toLowerCase() === 'screenshot') {
        const normalizedDir = dir.replace(/\//g, '\\').toLowerCase()
        if (!normalizedDir.includes('infinitynikki') && !normalizedDir.includes('x6game')) {
          return null
        }
      }
      return { value: dir, stop: false }
    }
    return null
  })
  // 去重：同一父目录下可能有多个匹配子目录（如 NikkiPhotos_HighQuality + NikkiPhotos_LowQuality）
  return Array.from(new Set(results))
}

/**
 * 通过 Steam 注册表和 libraryfolders.vdf 查找所有无限暖暖游戏路径（复数）
 * 流程：
 *   1) 注册表查询 Steam 安装路径（HKCU/HKLM）
 *   2) 解析 steamapps/libraryfolders.vdf 获取所有 Steam 库
 *   3) 在每个库的 steamapps/common/InfinityNikki 下验证特征文件
 * 返回所有匹配路径（可能为空数组）
 */
async function findSteamGamePaths(): Promise<string[]> {
  if (process.platform !== 'win32') return []

  const steamInstallPath = await querySteamInstallPath()
  if (!steamInstallPath) return []

  // 收集所有 Steam 库路径（Steam 主目录 + libraryfolders.vdf 中的额外库）
  const libraryPaths = new Set<string>()
  libraryPaths.add(steamInstallPath)

  const vdfPath = path.join(steamInstallPath, 'steamapps', 'libraryfolders.vdf')
  try {
    const vdfContent = await fsp.readFile(vdfPath, 'utf-8')
    // 简化 VDF 解析：正则提取 "path" 字段，不引入 VDF 解析依赖
    const matches = vdfContent.matchAll(/"path"\s+"([^"]+)"/g)
    for (const match of matches) {
      // VDF 中路径用双反斜杠转义，需还原为单反斜杠
      const libPath = match[1].replace(/\\\\/g, '\\')
      libraryPaths.add(libPath)
    }
  } catch {
    // VDF 文件不存在或读取失败，仅用 Steam 主目录
  }

  const found: string[] = []
  // 在每个 Steam 库的 steamapps/common/InfinityNikki 下查找特征文件
  for (const libPath of libraryPaths) {
    if (shouldStop) break
    const gamePath = path.join(libPath, 'steamapps', 'common', 'InfinityNikki')
    try {
      await fsp.access(gamePath, fs.constants.F_OK)
      // 验证至少一个特征文件存在，避免误识别同名空目录
      for (const sig of GAME_SIGNATURES) {
        try {
          await fsp.access(path.join(gamePath, sig), fs.constants.F_OK)
          found.push(gamePath)
          break
        } catch {
          // 该特征文件不存在，尝试下一个
        }
      }
    } catch {
      // 该库下无 InfinityNikki 目录
    }
  }

  return found
}

/**
 * 查询 Epic Games 安装的无限暖暖路径
 * 通过 Epic Launcher 注册表项查找已安装游戏
 * HKCU\Software\Epic Games\EOS\InstallPath（Epic 启动器路径）
 * 随后检查 <EpicPath>\InfinityNikki 目录
 */
async function findEpicGamePaths(): Promise<string[]> {
  if (process.platform !== 'win32') return []

  const found: string[] = []
  const regKeys = [
    { key: 'HKCU\\Software\\Epic Games\\EOS', value: 'InstallPath' },
    { key: 'HKLM\\SOFTWARE\\WOW6432Node\\Epic Games\\EOS', value: 'InstallPath' }
  ]

  const epicPaths = new Set<string>()
  for (const { key, value } of regKeys) {
    try {
      const result = await new Promise<string | null>((resolve) => {
        execFile(
          'reg',
          ['query', key, '/v', value],
          { timeout: 3000, windowsHide: true },
          (err, stdout) => {
            if (err) {
              resolve(null)
              return
            }
            const lines = stdout.split(/\r?\n/)
            for (const line of lines) {
              const m = line.match(/REG_(?:SZ|EXPAND_SZ)\s+(.+?)\s*$/i)
              if (m) {
                resolve(m[1].trim())
                return
              }
            }
            resolve(null)
          }
        )
      })
      if (result) epicPaths.add(result)
    } catch {
      // 该注册表键查询失败
    }
  }

  // 在每个 Epic 安装路径下查找 InfinityNikki
  for (const epicPath of epicPaths) {
    if (shouldStop) break
    const gamePath = path.join(epicPath, 'InfinityNikki')
    try {
      await fsp.access(gamePath, fs.constants.F_OK)
      found.push(gamePath)
    } catch {
      // 该路径下无 InfinityNikki
    }
  }

  return found
}

/**
 * 查询 Steam 安装路径（Windows 注册表）
 * 候选键（按优先级）：
 *   HKCU\Software\Valve\Steam SteamPath（用户级，最常见）
 *   HKLM\SOFTWARE\WOW6432Node\Valve\Steam InstallPath（32位兼容层）
 *   HKLM\SOFTWARE\Valve\Steam InstallPath（64位）
 */
async function querySteamInstallPath(): Promise<string | null> {
  const regKeys = [
    { key: 'HKCU\\Software\\Valve\\Steam', value: 'SteamPath' },
    { key: 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', value: 'InstallPath' },
    { key: 'HKLM\\SOFTWARE\\Valve\\Steam', value: 'InstallPath' }
  ]

  for (const { key, value } of regKeys) {
    try {
      const result = await new Promise<string | null>((resolve) => {
        execFile(
          'reg',
          ['query', key, '/v', value],
          { timeout: 3000, windowsHide: true },
          (err, stdout) => {
            if (err) {
              resolve(null)
              return
            }
            // 解析 reg query 输出，提取 REG_SZ / REG_EXPAND_SZ 值
            const lines = stdout.split(/\r?\n/)
            for (const line of lines) {
              const m = line.match(/REG_(?:SZ|EXPAND_SZ)\s+(.+?)\s*$/i)
              if (m) {
                resolve(m[1].trim())
                return
              }
            }
            resolve(null)
          }
        )
      })
      if (result) return result
    } catch {
      // 该注册表键查询失败，尝试下一个
    }
  }

  return null
}

async function getAvailableDrives(): Promise<string[]> {
  const drives: string[] = []
  // C-G3：驱动器字母范围 C-Z 用命名常量
  for (let i = DRIVE_LETTER_START; i <= DRIVE_LETTER_END; i++) {
    const drive = `${String.fromCharCode(i)}:\\`
    try {
      await fsp.access(drive, fs.constants.F_OK)
      drives.push(drive)
    } catch {
      // 驱动器不存在
    }
  }
  return drives
}

/**
 * 修复：恢复用户数据路径快速通道（P0-01 重构时误移除，违反 project_memory 约束）
 *
 * 检查以下不依赖游戏 exe 的媒体目录：
 * 1. %LOCALAPPDATA%\InfinityNikki\（游戏用户数据）
 * 2. %USERPROFILE%\Documents\InfinityNikki\（游戏用户数据）
 * 3. %LOCALAPPDATA%\InfinityNikki Launcher\cache\images\（启动器缓存图片）
 * 4. %LOCALAPPDATA%\InfinityNikkiGlobal Launcher\cache\images\（国际服启动器缓存）
 *
 * 这些目录位于 AppData 下，而 SYSTEM_DIRS_TO_SKIP 跳过 appdata，
 * 全盘签名搜索无法进入，必须通过快速通道显式检查。
 *
 * @returns 存在的用户数据路径列表（仅返回实际存在的目录）
 */
async function getUserDataPaths(): Promise<string[]> {
  const found: string[] = []
  const userProfile = process.env.USERPROFILE || process.env.HOME || ''
  const localAppData =
    process.env.LOCALAPPDATA || (userProfile ? path.join(userProfile, 'AppData', 'Local') : '')

  const candidates: string[] = []
  if (localAppData) {
    // 游戏用户数据（可能含媒体文件）
    candidates.push(path.join(localAppData, 'InfinityNikki'))
    // 启动器缓存图片（LauncherCacheImages 资源相册）
    candidates.push(path.join(localAppData, 'InfinityNikki Launcher', 'cache', 'images'))
    // 国际服启动器缓存图片
    candidates.push(path.join(localAppData, 'InfinityNikkiGlobal Launcher', 'cache', 'images'))
  }
  if (userProfile) {
    // Documents 下的游戏数据
    candidates.push(path.join(userProfile, 'Documents', 'InfinityNikki'))
  }

  for (const candidate of candidates) {
    if (shouldStop) break
    try {
      await fsp.access(candidate, fs.constants.F_OK)
      // 校验目录非空（避免误识别空目录）
      const entries = await fsp.readdir(candidate)
      if (entries.length > 0) {
        found.push(candidate)
      }
    } catch {
      // 目录不存在
    }
  }

  return found
}

// ============ 目录扫描 ============

async function scanDirectory(
  rootPath: string,
  incremental?: boolean
): Promise<{ files: MediaFile[]; savedCount: number }> {
  const files: MediaFile[] = []
  let savedCount = 0

  // 增量扫描：获取已索引的文件路径和修改时间
  const existingFiles = new Map<string, string>()
  if (incremental && db) {
    const rows = db.prepare('SELECT file_path, modified_at FROM media_files').all() as Array<{
      file_path: string
      modified_at: string
    }>
    for (const row of rows) {
      existingFiles.set(row.file_path, row.modified_at)
    }
  }

  // A-S6：流式分批写入缓冲区，满 SCAN_BATCH_SIZE 条即 flush 到数据库
  let batchBuffer: MediaFile[] = []
  const flushBatch = async () => {
    if (batchBuffer.length === 0) return
    const batch = batchBuffer
    batchBuffer = []
    savedCount += await saveBatchToDatabase(batch)
  }
  const addFile = async (file: MediaFile) => {
    files.push(file)
    batchBuffer.push(file)
    if (batchBuffer.length >= SCAN_BATCH_SIZE) {
      await flushBatch()
    }
  }

  // 收集待处理视频路径，扫描结束后批量并发读取元数据
  const pendingVideos: Array<{
    fullPath: string
    ext: string
    entryName: string
    stats: fs.Stats
  }> = []

  // A-S5：符号链接环检测——记录已访问目录的真实路径
  const visitedRealPaths = new Set<string>()
  // F-G1：进度更新改为时间节流（每 500ms emit 一次），小目录也能及时反馈
  lastProgressEmit = 0

  const scan = async (dir: string, depth: number) => {
    if (shouldStop) return
    // A-S5：深度限制，防止过深递归
    if (depth > MAX_SCAN_DEPTH) {
      workerLog('warn', `[Scanner] 超过最大扫描深度 ${MAX_SCAN_DEPTH}，跳过: ${dir}`)
      return
    }

    try {
      // A-S5：符号链接环检测——解析真实路径，若已访问则跳过
      const realDir = await cachedRealpath(dir)
      if (visitedRealPaths.has(realDir)) {
        workerLog('warn', `[Scanner] 检测到符号链接环，跳过: ${dir} -> ${realDir}`)
        return
      }
      visitedRealPaths.add(realDir)

      const entries = await fsp.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (shouldStop) return

        const fullPath = path.join(dir, entry.name)
        progress.scanned++
        progress.currentPath = fullPath

        // F-G1：进度更新改为时间节流（每 500ms emit 一次），保证小目录也有反馈
        emitProgress()

        if (entry.isDirectory()) {
          // A-S5：跳过符号链接目录，避免环（realpath 检测在递归入口处理）
          if (entry.isSymbolicLink()) continue
          await scan(fullPath, depth + 1)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext)) {
            const stats = await fsp.stat(fullPath)

            // 增量扫描：跳过未修改的文件
            // F-G5：mtime 比较容忍 1 秒精度差，避免 ISO 字符串毫秒精度丢失导致重复处理
            if (incremental) {
              const existingMtime = existingFiles.get(fullPath)
              if (
                existingMtime &&
                Math.abs(new Date(existingMtime).getTime() - stats.mtime.getTime()) <= 1000
              ) {
                continue
              }
            }

            if (VIDEO_EXTENSIONS.has(ext)) {
              pendingVideos.push({ fullPath, ext, entryName: entry.name, stats })
            } else {
              await addFile({
                file_path: fullPath,
                file_name: entry.name,
                file_type: 'image',
                file_ext: ext,
                file_size: stats.size,
                width: undefined,
                height: undefined,
                duration: undefined,
                created_at: stats.birthtime.toISOString(),
                modified_at: stats.mtime.toISOString(),
                source_path: rootPath,
                indexed_at: new Date().toISOString(),
                scene_category: detectSceneCategory(fullPath),
                // F-O1：扫描时不分析亮度（避免 I/O 阻塞），默认 unknown，后续可手动触发批量分析
                scene_time: 'unknown',
                outfit: '',
                // P0-02：根据路径识别角色档案 UID
                account_uid: extractUidFromPath(fullPath),
                // P0-03：根据父文件夹名映射相册类型
                album_type: extractAlbumTypeFromPath(fullPath),
                // 区分游戏内拍摄与启动器缓存
                media_source: extractMediaSourceFromPath(fullPath)
              })
              progress.found++
            }
          }
        }
      }
    } catch (err) {
      // 修复 F2：原 catch 块静默吞错，违反"错误必须被处理，不能静默失败"硬约束
      // 加日志输出，使扫描跳过的目录可诊断化（权限不足/目录不存在/I/O 错误/符号链接环等）
      workerLog(
        'warn',
        `[Scanner] 跳过目录: ${dir}`,
        err instanceof Error ? err.message : String(err)
      )
    }
  }

  await scan(rootPath, 0)

  // 批量并发读取视频元数据（限制 4 并发），读取后流式写入数据库
  const videoTasks = pendingVideos.map(({ fullPath, ext, entryName, stats }) => async () => {
    // C-G10：probeVideoMetadata 现在会 reject，单个视频失败不应中断整个扫描
    // 15 秒超时：ffprobe 二进制不可用时不会 reject 而永久挂起，会卡死整个扫描流程
    let meta: { width?: number; height?: number; duration?: number } = {}
    try {
      meta = await probeVideoMetadata(fullPath, 15000)
    } catch (err) {
      workerLog(
        'error',
        `[Scanner] 跳过视频元数据读取失败: ${fullPath}`,
        err instanceof Error ? err.message : String(err)
      )
    }
    await addFile({
      file_path: fullPath,
      file_name: entryName,
      file_type: 'video',
      file_ext: ext,
      file_size: stats.size,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      created_at: stats.birthtime.toISOString(),
      modified_at: stats.mtime.toISOString(),
      source_path: rootPath,
      indexed_at: new Date().toISOString(),
      scene_category: detectSceneCategory(fullPath),
      scene_time: 'unknown',
      outfit: '',
      // P0-02：根据路径识别角色档案 UID
      account_uid: extractUidFromPath(fullPath),
      // P0-03：根据父文件夹名映射相册类型
      album_type: extractAlbumTypeFromPath(fullPath),
      // 区分游戏内拍摄与启动器缓存
      media_source: extractMediaSourceFromPath(fullPath)
    })
    progress.found++
  })
  await runWithConcurrency(videoTasks, 4)

  // A-S6：刷新剩余未满批次的记录
  await flushBatch()

  emitProgress(true)
  return { files, savedCount }
}

// ============ 流式写入数据库 ============

async function saveBatchToDatabase(batch: MediaFile[]): Promise<number> {
  if (!db || batch.length === 0) {
    if (!db) workerLog('info', `[Scanner] 数据库未连接，跳过保存 ${batch.length} 个文件`)
    return 0
  }

  // C-G6：复用缓存的 prepared statement，避免每批次重新 prepare
  // 性能评估（2026-07-18）：已具备事务包裹 + 批次 500 + 缓存 statement 三项优化
  // 联合索引新增后，INSERT 路径会多更新 5 个索引，但 WAL 模式下影响可忽略
  // 如未来索引数量超过 20 个，需重新评估写入性能
  if (!insertStmtCache) {
    insertStmtCache = db.prepare(`
      INSERT INTO media_files
      (file_path, file_name, file_type, file_ext, file_size, width, height, duration, created_at, modified_at, source_path, indexed_at, tags, category_id, rating, is_favorite, notes, scene_category, scene_time, outfit, account_uid, album_type, media_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', NULL, 0, 0, '', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        file_name = excluded.file_name,
        file_type = excluded.file_type,
        file_ext = excluded.file_ext,
        file_size = excluded.file_size,
        width = excluded.width,
        height = excluded.height,
        duration = excluded.duration,
        created_at = excluded.created_at,
        modified_at = excluded.modified_at,
        source_path = excluded.source_path,
        indexed_at = excluded.indexed_at,
        scene_category = excluded.scene_category,
        account_uid = excluded.account_uid,
        album_type = excluded.album_type,
        media_source = excluded.media_source
      -- F-O1：scene_time 和 outfit 不在 ON CONFLICT 更新列表中，避免覆盖用户手动设置
      -- P0-02：account_uid 在 ON CONFLICT 时更新（路径变更可能导致 UID 变化）
      -- P0-03：album_type 在 ON CONFLICT 时更新（父目录变更可能导致相册类型变化）
      -- media_source 在 ON CONFLICT 时更新（路径变更可能导致来源变化）
    `)
  }
  const insertStmt = insertStmtCache

  const insertMany = db.transaction((mediaFiles: MediaFile[]) => {
    for (const file of mediaFiles) {
      insertStmt.run(
        file.file_path,
        file.file_name,
        file.file_type,
        file.file_ext,
        file.file_size,
        file.width ?? null,
        file.height ?? null,
        file.duration ?? null,
        file.created_at,
        file.modified_at,
        file.source_path,
        file.indexed_at,
        file.scene_category,
        // F-O1：仅 INSERT 时写入，冲突时保留已有值
        file.scene_time ?? 'unknown',
        file.outfit ?? '',
        // P0-02：角色档案 UID
        file.account_uid,
        // P0-03：游戏相册类型
        file.album_type,
        // 媒体来源：game 或 launcher
        file.media_source
      )
    }
  })

  insertMany(batch)
  workerLog('info', `[Scanner] 流式写入批次：${batch.length} 个文件`)
  return batch.length
}

// ============ 主扫描入口 ============

/**
 * 打开数据库连接（如未打开或路径变化）。
 * 配置与主进程 DatabaseManager 一致的 PRAGMA，并额外设置 busy_timeout=5000
 * 以处理与主进程业务 IPC 的偶发写入冲突。
 */
function openDatabaseIfNeeded(dbPath: string): void {
  if (db && currentDbPath === dbPath) return

  // 路径变化时关闭旧连接
  if (db) {
    try {
      db.pragma('wal_checkpoint(PASSIVE)')
      db.close()
    } catch {}
    db = null
    insertStmtCache = null
  }

  db = new Database(dbPath)
  // 与主进程 DatabaseManager 一致的 PRAGMA
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -20000')
  db.pragma('temp_store = MEMORY')
  db.pragma('mmap_size = 268435456')
  db.pragma('wal_autocheckpoint = 1000')
  // worker 独有：处理与主进程业务 IPC 的偶发写入冲突
  db.pragma('busy_timeout = 5000')
  currentDbPath = dbPath
}

/**
 * 扫描入口（迁移自 ScannerManager.startScan）。
 * 接收 SCAN_START 消息后调用，执行完整扫描流程并通过 SCAN_PROGRESS/SCAN_COMPLETE 推送结果。
 */
async function startScan(
  dbPath: string,
  options: ScanOptions
): Promise<{ success: boolean; message: string; filesFound?: number }> {
  // 1. 打开 DB（如未打开或路径变化）
  try {
    openDatabaseIfNeeded(dbPath)
  } catch (err) {
    return {
      success: false,
      message: `数据库打开失败: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  // 2. 重置状态
  shouldStop = false
  progress = { scanned: 0, found: 0, currentPath: '', status: 'running' }
  // P1-A3：每次扫描开始时清空 realpath 缓存
  realpathCache.clear()

  // 3. 记录扫描历史
  const scanType = options?.fullScan ? 'full_scan' : options?.incremental ? 'incremental' : 'full'
  const scanId = insertScanHistory(scanType)

  // 4. 修复旧数据：删除误扫描的非游戏目录文件 + 重新计算 media_source='unknown' 记录的字段
  repairLegacyData()

  try {
    // 全盘扫描模式：直接全盘搜索媒体特征文件夹，不依赖游戏目录查找
    // 修复：原"全量重扫"只是 incremental:false，仍依赖 findGameDirectory 找单个目录
    // 全盘扫描遍历所有盘符查找含媒体特征文件夹的目录并全部扫描，覆盖所有安装场景
    if (options?.fullScan && !options?.path) {
      const mediaDirs = await findMediaDirectories(options?.customKnownPaths)
      if (mediaDirs.length === 0) {
        progress.status = 'failed'
        updateScanHistory(scanId, 'failed', 0, 0)
        return { success: false, message: '全盘扫描未找到任何游戏媒体目录，请手动指定路径' }
      }

      let totalFiles = 0
      let totalSaved = 0
      for (const dir of mediaDirs) {
        if (shouldStop) break
        progress.currentPath = dir
        const { files, savedCount } = await scanDirectory(dir, options?.incremental)
        totalFiles += files.length
        totalSaved += savedCount
      }

      // T02：扫描完成后执行文件完整性校验
      await checkMissingFiles()

      progress.status = 'completed'
      updateScanHistory(scanId, 'completed', totalFiles, totalSaved)

      return {
        success: true,
        message: `全盘扫描完成，扫描 ${mediaDirs.length} 个目录，发现 ${totalFiles} 个媒体文件，新增 ${totalSaved} 个`,
        filesFound: totalFiles
      }
    }

    let targetPath: string | null | undefined = options?.path

    if (!targetPath) {
      // F-O1：优先使用用户自定义路径，回退到默认 KNOWN_PATHS
      // 修复：findGameDirectory 改为 findMediaDirectories 返回所有匹配目录
      const gameDirs = await findMediaDirectories(options?.customKnownPaths)
      if (gameDirs.length > 0) {
        // 扫描所有找到的游戏目录（修复：原版只扫描第一个）
        let totalFiles = 0
        let totalSaved = 0
        for (const dir of gameDirs) {
          if (shouldStop) break
          progress.currentPath = dir
          const { files, savedCount } = await scanDirectory(dir, options?.incremental)
          totalFiles += files.length
          totalSaved += savedCount
        }

        await checkMissingFiles()
        progress.status = 'completed'
        updateScanHistory(scanId, 'completed', totalFiles, totalSaved)

        return {
          success: true,
          message: `扫描完成，扫描 ${gameDirs.length} 个目录，发现 ${totalFiles} 个媒体文件，新增 ${totalSaved} 个`,
          filesFound: totalFiles
        }
      }
      targetPath = null
    }

    if (!targetPath) {
      progress.status = 'failed'
      updateScanHistory(scanId, 'failed', 0, 0)
      return { success: false, message: '未找到游戏目录，请手动指定或使用全盘扫描' }
    }

    const { files, savedCount } = await scanDirectory(targetPath, options?.incremental)

    // T02：扫描完成后执行文件完整性校验
    await checkMissingFiles()

    progress.status = 'completed'
    updateScanHistory(scanId, 'completed', files.length, savedCount)

    return {
      success: true,
      message: `扫描完成，发现 ${files.length} 个媒体文件，新增 ${savedCount} 个`,
      filesFound: files.length
    }
  } catch (error) {
    progress.status = 'failed'
    updateScanHistory(scanId, 'failed', progress.found, 0)
    return {
      success: false,
      message: `扫描失败: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

// ============ 资源清理与退出 ============

/**
 * worker 退出前清理：关闭 DB + kill 所有子进程 + 退出。
 * 必须使用同步操作，避免异步 I/O 延迟进程退出。
 */
function cleanupAndExit(): void {
  try {
    if (db) {
      try {
        db.pragma('wal_checkpoint(PASSIVE)')
      } catch {}
      db.close()
      db = null
    }
  } catch {}
  // kill 所有 worker 启动的 ffprobe 子进程（process-registry 在 worker 内是独立实例）
  try {
    killAllProcesses('SIGKILL')
  } catch {}
  process.exit(0)
}

// ============ 消息处理 ============

// utilityProcess 中 parentPort 推送的 'message' 事件参数是 Node.js 的 MessageEvent（仅含 data 字段），
// 但 lib.dom.d.ts 也声明了 MessageEvent（含 lastEventId/origin/source 等），两者冲突。
// 此处用最小结构类型 { data: unknown } 避免冲突，运行时只读 data 字段
process.parentPort?.on('message', async (event: { data: unknown }) => {
  const msg = event.data as WorkerCommand
  if (msg.type === 'SCAN_START') {
    try {
      const result = await startScan(msg.payload.dbPath, msg.payload.options)
      sendEvent({ type: 'SCAN_COMPLETE', payload: result })
    } catch (err) {
      sendEvent({
        type: 'SCAN_COMPLETE',
        payload: {
          success: false,
          message: `扫描异常: ${err instanceof Error ? err.message : String(err)}`
        }
      })
    }
  } else if (msg.type === 'SCAN_STOP') {
    shouldStop = true
  } else if (msg.type === 'SCAN_DISPOSE') {
    cleanupAndExit()
  }
})

// ============ 兜底清理 ============

// process.exit 触发时清理（Node.js 原生事件，一定会触发）
process.on('exit', cleanupAndExit)

// 未捕获异常：发送 WORKER_ERROR 后清理退出
process.on('uncaughtException', (err) => {
  sendEvent({
    type: 'WORKER_ERROR',
    payload: { message: err.message, stack: err.stack }
  })
  cleanupAndExit()
})

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason))
  sendEvent({
    type: 'WORKER_ERROR',
    payload: { message: err.message, stack: err.stack }
  })
  cleanupAndExit()
})

// ============ 启动完成通知 ============

// 向主进程发送 WORKER_READY，表示 worker 已就绪可接收 SCAN_START
sendEvent({ type: 'WORKER_READY' })
