/**
 * 缩略图 / pHash / 重复检测 worker 进程入口
 *
 * 由主进程通过 utilityProcess.fork() 启动，承载三类批量任务的 CPU 密集计算：
 * 1. 缩略图批量生成（同时补算缺 phash 的图片，保持 processThumbnailForRow 三路并行）
 * 2. pHash 批量补算（完成后自动链式 markDuplicates）
 * 3. 重复标记（O(n²) Union-Find 聚类）
 *
 * 改造点（相对原 thumbnail-phash-service.ts）：
 * 1. DB 连接：worker 内部 new Database(dbPath)，配置与主进程一致的 PRAGMA + busy_timeout=5000
 * 2. console.log → workerLog（warn/error 通过 MEDIA_WORKER_LOG 转发，info 丢弃）
 * 3. ctx.thumbnailGen.generate → 内部轻量版 generateThumbnailInWorker（不依赖主进程 ThumbnailGenerator 类）
 * 4. ctx.getMainWindow()?.webContents.send → 通过 parentPort 推送 *_PROGRESS / *_COMPLETE
 * 5. 三个独立的 shouldStop 标志，互不影响
 *
 * 兼容性：功能输出与原 thumbnail-phash-service.ts 完全一致
 * - 缩略图文件路径：<cacheDir>/<contentHash>.jpg（与主进程 ThumbnailGenerator 相同算法）
 * - media_files 字段更新：thumbnail / width / height / phash / is_duplicate / original_id
 */
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import Database from 'better-sqlite3'
// C-3：统一文件存在检查与视频扩展名判定
import { pathExists } from '../utils/file-utils'
import { isVideoExt } from '../utils/media-constants'
// P1-A7：统一 ffmpeg 路径解析（asar unpacked 路径自动修正）
import { ffmpegPath as ffmpegBinaryPath } from '../utils/ffmpeg-paths'
import { trackFfmpegCommand, untrackFfmpegCommand } from '../utils/process-registry'
import { killAllProcesses } from '../utils/process-registry'
import { runWithConcurrency } from '../utils/concurrency'
import { THUMBNAIL_CONCURRENCY } from '../utils/constants'
import { calculatePHash, hammingDistance } from '../utils/phash'
import { pickBestId } from '../utils/duplicate-scoring'
import type { MediaWorkerCommand, MediaWorkerEvent, ThumbnailQuality } from './worker-protocol'

// ============ 常量（与主进程 ThumbnailGenerator 保持一致，确保文件名/质量相同） ============

// A-S8：内容 hash 读取文件前 1MB，兼顾唯一性与性能
const CONTENT_HASH_READ_SIZE = 1024 * 1024
// 缩略图档位参数（与主进程 ThumbnailGenerator 完全一致）
const STANDARD_MAX_WIDTH = 320
const STANDARD_MAX_HEIGHT = 320
const STANDARD_QUALITY = 85
const LOW_MAX_WIDTH = 64
const LOW_MAX_HEIGHT = 64
const LOW_QUALITY = 30
// pHash 重复标记阈值（与原 markDuplicates 完全一致）
const MARK_THRESHOLD = 2

// ============ worker 模块级状态 ============

let db: Database.Database | null = null
let currentDbPath = ''

// 三个独立的取消标志（互不影响）
let shouldStopThumbnail = false
let shouldStopPhash = false
let shouldStopDuplicate = false

// 进度推送节流（500ms，与 scanner worker 一致）
let lastThumbnailProgressEmit = 0
let lastPhashProgressEmit = 0
let lastDuplicateProgressEmit = 0

// ============ worker log 转发 ============

/**
 * worker 内部日志转发。
 * - info 级别在 worker 内部丢弃（避免跨进程 IPC 开销）
 * - warn / error 级别通过 MEDIA_WORKER_LOG 转发到主进程
 */
function workerLog(level: 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
  if (level === 'info') return
  try {
    const event: MediaWorkerEvent = {
      type: 'MEDIA_WORKER_LOG',
      payload: { level, message, args: args.length > 0 ? args : undefined }
    }
    process.parentPort?.postMessage(event)
  } catch {
    // parentPort 不可用时丢弃日志
  }
}

/** 发送事件到主进程 */
function sendEvent(event: MediaWorkerEvent): void {
  try {
    process.parentPort?.postMessage(event)
  } catch {
    // parentPort 不可用时丢弃事件
  }
}

// ============ DB 连接管理 ============

/**
 * 惰性打开 DB 连接（路径变化时关闭旧连接）。
 * 与主进程 DatabaseManager 共享同一 db 文件，WAL 模式 + busy_timeout=5000 保证多连接并发安全。
 */
function openDatabaseIfNeeded(dbPath: string): Database.Database {
  if (db && currentDbPath === dbPath) return db
  if (db) {
    try {
      db.close()
    } catch {}
  }
  const newDb = new Database(dbPath)
  // PRAGMA 与主进程 DatabaseManager 一致（WAL 多连接并发安全保证）
  newDb.pragma('journal_mode = WAL')
  newDb.pragma('foreign_keys = ON')
  newDb.pragma('synchronous = NORMAL')
  newDb.pragma('cache_size = -20000')
  newDb.pragma('temp_store = MEMORY')
  newDb.pragma('mmap_size = 268435456')
  newDb.pragma('wal_autocheckpoint = 1000')
  // busy_timeout：WAL 模式下多连接并发写入冲突时自动重试 5 秒
  newDb.pragma('busy_timeout = 5000')
  db = newDb
  currentDbPath = dbPath
  return newDb
}

// ============ 缩略图生成（worker 内部轻量版，与主进程 ThumbnailGenerator 算法一致） ============

/**
 * 计算文件内容 hash（前 1MB sha256，取前 16 字符）。
 * 与主进程 ThumbnailGenerator.getFileHash 完全一致，确保文件名相同。
 */
async function getFileHash(filePath: string, stats: fs.Stats): Promise<string> {
  const mtime = stats.mtime.getTime()
  const size = stats.size
  try {
    const hash = crypto.createHash('sha256')
    const handle = await fsp.open(filePath, 'r')
    try {
      const buffer = Buffer.alloc(CONTENT_HASH_READ_SIZE)
      const { bytesRead } = await handle.read(buffer, 0, CONTENT_HASH_READ_SIZE, 0)
      hash.update(buffer.subarray(0, bytesRead))
    } finally {
      await handle.close()
    }
    return hash.digest('hex').slice(0, 16)
  } catch (err) {
    // 读取失败时降级为路径+mtime hash，保证功能可用
    workerLog('warn', `[Thumbnail] 内容 hash 计算失败，降级为路径 hash: ${filePath}`, err)
    return crypto
      .createHash('sha256')
      .update(`${filePath}:${mtime}:${size}`)
      .digest('hex')
      .slice(0, 16)
  }
}

/**
 * 提取视频第一帧（ffmpeg，与主进程 ThumbnailGenerator.extractVideoFrame 一致）。
 * 30 秒超时保护，超时后 kill 子进程避免 ffmpeg 累积泄漏。
 */
function extractVideoFrame(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      command.kill('SIGKILL')
      untrackFfmpegCommand(command)
      reject(new Error('ffmpeg 提取视频帧超时'))
    }, 30000)

    const command = ffmpeg(videoPath)
      .setFfmpegPath(ffmpegBinaryPath)
      .seekInput(0)
      .frames(1)
      .output(outputPath)
      .outputOptions(
        '-vf',
        `scale=${STANDARD_MAX_WIDTH}:${STANDARD_MAX_HEIGHT}:force_original_aspect_ratio=decrease`
      )
      .on('end', () => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        untrackFfmpegCommand(command)
        resolve()
      })
      .on('error', (err) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        untrackFfmpegCommand(command)
        reject(err)
      })

    trackFfmpegCommand(command)
    command.run()
  })
}

/**
 * worker 内部轻量版缩略图生成（不维护 LRU / accessTimes / contentHashCache）。
 * 与主进程 ThumbnailGenerator.doGenerate 算法一致，确保：
 * 1. 文件命名：${fileHash}.jpg + ${fileHash}_low.jpg（标准档位自动生成低质量版本）
 * 2. sharp 参数：resize(maxWidth, maxHeight, fit=inside, withoutEnlargement=true) + jpeg(quality=85, progressive=true)
 * 3. 视频文件走 ffmpeg 抽帧
 *
 * @returns 缩略图文件路径；生成失败返回 null
 */
async function generateThumbnailInWorker(
  filePath: string,
  cacheDir: string,
  _quality: ThumbnailQuality
): Promise<string | null> {
  try {
    // 确保 cacheDir 存在（主进程已创建，此处兜底）
    if (!(await pathExists(cacheDir))) {
      await fsp.mkdir(cacheDir, { recursive: true })
    }
    if (!(await pathExists(filePath))) {
      workerLog('warn', `[Thumbnail] 文件不存在: ${filePath}`)
      return null
    }

    const stats = await fsp.stat(filePath)
    const fileHash = await getFileHash(filePath, stats)
    const thumbnailPath = path.join(cacheDir, `${fileHash}.jpg`)

    // 缓存命中直接返回
    if (await pathExists(thumbnailPath)) {
      return thumbnailPath
    }

    const ext = path.extname(filePath).toLowerCase()
    const isVideo = isVideoExt(ext)

    if (isVideo) {
      await extractVideoFrame(filePath, thumbnailPath)
    } else {
      await sharp(filePath)
        .resize(STANDARD_MAX_WIDTH, STANDARD_MAX_HEIGHT, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: STANDARD_QUALITY, progressive: true })
        .toFile(thumbnailPath)
    }

    // 同步生成低质量版本（64px, q30），失败不阻断主流程
    // 与主进程 ThumbnailGenerator.doGenerate 一致：从刚生成的标准缩略图缩放
    const lowPath = path.join(cacheDir, `${fileHash}_low.jpg`)
    if (!(await pathExists(lowPath))) {
      try {
        await sharp(thumbnailPath)
          .resize(LOW_MAX_WIDTH, LOW_MAX_HEIGHT, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: LOW_QUALITY })
          .toFile(lowPath)
      } catch {
        // 低质量生成失败不影响标准缩略图返回
      }
    }

    return thumbnailPath
  } catch (error) {
    workerLog('error', `[Thumbnail] 缩略图生成失败: ${filePath}`, error)
    return null
  }
}

// ============ 任务 A：缩略图批量生成 ============

/**
 * 为缺缩略图/尺寸/phash 的记录生成缩略图并补算 phash。
 * 完整复刻原 thumbnail-phash-service.ts 的 processThumbnailForRow + generateThumbnailsForUnprocessed 逻辑。
 *
 * 改造点：
 * - ctx.thumbnailGen.generate → generateThumbnailInWorker
 * - ctx.getMainWindow()?.webContents.send → 通过 parentPort 推送 *_PROGRESS / *_COMPLETE
 */
async function startThumbnailBatch(
  dbPath: string,
  cacheDir: string,
  thumbnailQuality: ThumbnailQuality
): Promise<{ success: boolean; message: string; processed: number; total: number }> {
  shouldStopThumbnail = false
  const database = openDatabaseIfNeeded(dbPath)

  try {
    const rows = database
      .prepare(
        'SELECT id, file_path, file_type FROM media_files WHERE thumbnail IS NULL OR width IS NULL OR height IS NULL'
      )
      .all() as Array<{ id: number; file_path: string; file_type: string }>

    const total = rows.length
    if (total === 0) {
      return { success: true, message: '无需生成', processed: 0, total: 0 }
    }

    const updateStmt = database.prepare(
      'UPDATE media_files SET width = ?, height = ?, thumbnail = ?, phash = ? WHERE id = ?'
    )

    let processed = 0
    let lastProgressProcessed = 0

    const tasks = rows.map((row) => async () => {
      if (shouldStopThumbnail) return

      try {
        let width: number | null = null
        let height: number | null = null
        let thumbnailPath: string | null = null
        let phash: string | null = null

        if (row.file_type === 'image') {
          // C-G7：原实现 sharp 加载原图 3 次（metadata/generate/phash）串行执行
          // 优化为 Promise.all 并行执行，总耗时 = max(三操作) 而非 sum
          const [metadata, thumbResult, phashResult] = await Promise.all([
            sharp(row.file_path)
              .metadata()
              .catch(() => null),
            generateThumbnailInWorker(row.file_path, cacheDir, thumbnailQuality),
            calculatePHash(row.file_path)
          ])
          width = metadata?.width ?? null
          height = metadata?.height ?? null
          thumbnailPath = thumbResult
          phash = phashResult
        } else if (row.file_type === 'video') {
          thumbnailPath = await generateThumbnailInWorker(row.file_path, cacheDir, thumbnailQuality)
        }

        updateStmt.run(width, height, thumbnailPath, phash, row.id)
        processed++
      } catch (error) {
        workerLog('error', `[Thumbnail] 处理文件失败 ${row.file_path}`, error)
      }

      // 节流推送进度（500ms）
      const now = Date.now()
      if (now - lastThumbnailProgressEmit >= 500 || processed - lastProgressProcessed >= 10) {
        lastThumbnailProgressEmit = now
        lastProgressProcessed = processed
        sendEvent({
          type: 'THUMBNAIL_PROGRESS',
          payload: { processed, total, currentFile: row.file_path }
        })
      }
    })

    await runWithConcurrency(tasks, THUMBNAIL_CONCURRENCY)

    const message = shouldStopThumbnail ? '已取消' : '完成'
    return { success: true, message, processed, total }
  } catch (error) {
    workerLog('error', '[Thumbnail] 批量生成失败', error)
    return {
      success: false,
      message: `批量生成失败: ${error instanceof Error ? error.message : String(error)}`,
      processed: 0,
      total: 0
    }
  }
}

// ============ 任务 B：pHash 批量补算 + 链式 markDuplicates ============

/**
 * 为缺 phash 的图片补算 pHash，完成后自动链式 markDuplicates。
 * 完整复刻原 thumbnail-phash-service.ts 的 generatePhashForUnprocessed + markDuplicates 逻辑。
 */
async function startPhashBatch(dbPath: string): Promise<{
  success: boolean
  message: string
  processed: number
  total: number
  duplicatesResult?: { markedDuplicates: number; totalGroups: number }
}> {
  shouldStopPhash = false
  const database = openDatabaseIfNeeded(dbPath)

  try {
    const rows = database
      .prepare(
        "SELECT id, file_path FROM media_files WHERE file_type = 'image' AND is_deleted = 0 AND phash IS NULL"
      )
      .all() as Array<{ id: number; file_path: string }>

    const total = rows.length
    if (total === 0) {
      // 没有新图片需要补算，但仍触发一次重复标记（基于已有 pHash）
      const duplicatesResult = await markDuplicatesInWorker(database)
      return {
        success: true,
        message: '无需补算',
        processed: 0,
        total: 0,
        duplicatesResult
      }
    }

    workerLog('info', `[pHash] 待补算 ${total} 张图片`)

    const updateStmt = database.prepare('UPDATE media_files SET phash = ? WHERE id = ?')
    let processed = 0
    let lastProgressProcessed = 0

    const tasks = rows.map((row) => async () => {
      if (shouldStopPhash) return
      const hash = await calculatePHash(row.file_path)
      if (hash) {
        updateStmt.run(hash, row.id)
        processed++
      }

      // 节流推送进度（500ms）
      const now = Date.now()
      if (now - lastPhashProgressEmit >= 500 || processed - lastProgressProcessed >= 10) {
        lastPhashProgressEmit = now
        lastProgressProcessed = processed
        sendEvent({
          type: 'PHASH_PROGRESS',
          payload: { processed, total, currentFile: row.file_path }
        })
      }
    })

    await runWithConcurrency(tasks, THUMBNAIL_CONCURRENCY)
    workerLog('info', '[pHash] 补算完成')

    // P1-01：pHash 补算完成后触发重复标记（保持原有链式行为）
    // 若已被取消则跳过 markDuplicates，避免在 phash 未完整时基于部分数据聚类
    const duplicatesResult = shouldStopPhash ? undefined : await markDuplicatesInWorker(database)

    const message = shouldStopPhash ? '已取消' : '完成'
    return { success: true, message, processed, total, duplicatesResult }
  } catch (error) {
    workerLog('error', '[pHash] 补算失败', error)
    return {
      success: false,
      message: `补算失败: ${error instanceof Error ? error.message : String(error)}`,
      processed: 0,
      total: 0
    }
  }
}

// ============ 任务 C：重复标记 ============

/**
 * 基于 pHash 极严格阈值（≤2）聚类，评分标记重复文件。
 * 完整复刻原 thumbnail-phash-service.ts 的 markDuplicates 逻辑。
 */
async function startDuplicateMark(
  dbPath: string
): Promise<{ success: boolean; message: string; markedDuplicates: number; totalGroups: number }> {
  shouldStopDuplicate = false
  const database = openDatabaseIfNeeded(dbPath)

  try {
    const result = await markDuplicatesInWorker(database)
    return {
      success: true,
      message: shouldStopDuplicate ? '已取消' : '完成',
      ...result
    }
  } catch (error) {
    workerLog('error', '[Duplicate] 标记失败', error)
    return {
      success: false,
      message: `标记失败: ${error instanceof Error ? error.message : String(error)}`,
      markedDuplicates: 0,
      totalGroups: 0
    }
  }
}

/**
 * 重复标记核心实现（含 O(n²) 进度推送）。
 * 与原 markDuplicates 算法完全一致，仅增加 shouldStopDuplicate 检查与进度推送。
 */
async function markDuplicatesInWorker(
  database: Database.Database
): Promise<{ markedDuplicates: number; totalGroups: number }> {
  const rows = database
    .prepare(
      `SELECT id, file_size, width, height, modified_at, is_favorite, rating, phash
       FROM media_files
       WHERE is_deleted = 0 AND file_type = 'image' AND phash IS NOT NULL AND phash != ''`
    )
    .all() as Array<{
    id: number
    file_size: number
    width: number | null
    height: number | null
    modified_at: string
    is_favorite: number
    rating: number
    phash: string
  }>

  if (rows.length < 2) {
    // 单文件或无文件：清空所有重复标记
    database.prepare('UPDATE media_files SET is_duplicate = 0, original_id = NULL').run()
    return { markedDuplicates: 0, totalGroups: 0 }
  }

  // Union-Find 聚类
  const parent = new Int32Array(rows.length)
  for (let i = 0; i < rows.length; i++) parent[i] = i
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  // O(n²) 两两比较 + 进度推送
  const totalPairs = (rows.length * (rows.length - 1)) / 2
  let compared = 0
  let lastCompared = 0

  for (let i = 0; i < rows.length; i++) {
    if (shouldStopDuplicate) break
    for (let j = i + 1; j < rows.length; j++) {
      const dist = hammingDistance(rows[i].phash, rows[j].phash)
      if (dist >= 0 && dist <= MARK_THRESHOLD) {
        union(i, j)
      }
      compared++
    }
    // 每 1000 次比较或 500ms 推送一次进度
    const now = Date.now()
    if (now - lastDuplicateProgressEmit >= 500 || compared - lastCompared >= 1000) {
      lastDuplicateProgressEmit = now
      lastCompared = compared
      sendEvent({
        type: 'DUPLICATE_PROGRESS',
        payload: { compared, totalPairs }
      })
    }
  }

  // 按 root 分组
  const groupMap = new Map<number, number[]>()
  for (let i = 0; i < rows.length; i++) {
    const root = find(i)
    if (!groupMap.has(root)) groupMap.set(root, [])
    groupMap.get(root)!.push(i)
  }

  // 仅长度 >= 2 的组参与重复标记
  const duplicateGroups: number[][] = []
  for (const indices of groupMap.values()) {
    if (indices.length >= 2) duplicateGroups.push(indices)
  }

  // 先清空所有重复标记（删除/移动文件后旧标记会失效）
  database.prepare('UPDATE media_files SET is_duplicate = 0, original_id = NULL').run()

  if (duplicateGroups.length === 0) {
    workerLog('info', '[Duplicate] 无重复组')
    return { markedDuplicates: 0, totalGroups: 0 }
  }

  // 对每组评分，最佳项 id 设为 originalId，其余标记 is_duplicate=1
  const updateStmt = database.prepare(
    'UPDATE media_files SET is_duplicate = ?, original_id = ? WHERE id = ?'
  )
  let markedDuplicates = 0
  const updateMany = database.transaction(() => {
    for (const indices of duplicateGroups) {
      const groupItems = indices.map((i) => ({
        id: rows[i].id,
        file_size: rows[i].file_size,
        width: rows[i].width,
        height: rows[i].height,
        modified_at: rows[i].modified_at,
        is_favorite: rows[i].is_favorite === 1,
        rating: rows[i].rating
      }))
      const bestId = pickBestId(groupItems)
      if (bestId === null) continue
      for (const item of groupItems) {
        if (item.id === bestId) {
          // 推荐保留项：保持 is_duplicate=0
          updateStmt.run(0, null, item.id)
        } else {
          updateStmt.run(1, bestId, item.id)
          markedDuplicates++
        }
      }
    }
  })
  updateMany()

  workerLog(
    'info',
    `[Duplicate] 标记完成：${duplicateGroups.length} 组，${markedDuplicates} 个重复文件`
  )
  return { markedDuplicates, totalGroups: duplicateGroups.length }
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
  // kill 所有 worker 启动的 ffmpeg 子进程（process-registry 在 worker 内是独立实例）
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
  const msg = event.data as MediaWorkerCommand
  switch (msg.type) {
    case 'THUMBNAIL_BATCH_START': {
      try {
        const result = await startThumbnailBatch(
          msg.payload.dbPath,
          msg.payload.cacheDir,
          msg.payload.thumbnailQuality
        )
        sendEvent({ type: 'THUMBNAIL_COMPLETE', payload: result })
      } catch (err) {
        sendEvent({
          type: 'THUMBNAIL_COMPLETE',
          payload: {
            success: false,
            message: `缩略图批量生成异常: ${err instanceof Error ? err.message : String(err)}`,
            processed: 0,
            total: 0
          }
        })
      }
      break
    }
    case 'PHASH_BATCH_START': {
      try {
        const result = await startPhashBatch(msg.payload.dbPath)
        sendEvent({ type: 'PHASH_COMPLETE', payload: result })
      } catch (err) {
        sendEvent({
          type: 'PHASH_COMPLETE',
          payload: {
            success: false,
            message: `pHash 批量补算异常: ${err instanceof Error ? err.message : String(err)}`,
            processed: 0,
            total: 0
          }
        })
      }
      break
    }
    case 'DUPLICATE_MARK_START': {
      try {
        const result = await startDuplicateMark(msg.payload.dbPath)
        sendEvent({ type: 'DUPLICATE_COMPLETE', payload: result })
      } catch (err) {
        sendEvent({
          type: 'DUPLICATE_COMPLETE',
          payload: {
            success: false,
            message: `重复标记异常: ${err instanceof Error ? err.message : String(err)}`,
            markedDuplicates: 0,
            totalGroups: 0
          }
        })
      }
      break
    }
    case 'THUMBNAIL_STOP':
      shouldStopThumbnail = true
      break
    case 'PHASH_STOP':
      shouldStopPhash = true
      break
    case 'DUPLICATE_STOP':
      shouldStopDuplicate = true
      break
    case 'MEDIA_WORKER_DISPOSE':
      cleanupAndExit()
      break
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

// 向主进程发送 WORKER_READY，表示 worker 已就绪可接收任务
sendEvent({ type: 'WORKER_READY' })
