import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  nativeTheme,
  protocol,
  crashReporter
} from 'electron'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import Database from 'better-sqlite3'
import { DatabaseManager } from './database/connection'
import { ScannerManager } from './scanner'
// 全盘扫描模块进程拆分：ScannerManager 改为薄壳，通过 ScannerWorkerBridge 与 utilityProcess 通信
import { ScannerWorkerBridge } from './scanner/scanner-worker-bridge'
// 缩略图 / pHash / 重复检测进程拆分：MediaWorkerManager 改为薄壳，通过 MediaWorkerBridge 与 utilityProcess 通信
import { MediaWorkerBridge } from './media-worker/bridge'
import { MediaWorkerManager } from './media-worker/manager'
// 分级任务调度队列：用户主动触发=高优先级，后台自动触发=低优先级串行
import { TaskScheduler } from './scheduler/task-scheduler'
import { ThumbnailGenerator } from './thumbnail/generator'
import { FileService } from './services/file-service'
import { VideoService } from './services/video-service'
import { WatermarkService } from './services/watermark-service'
import { backupService } from './services/backup-service'
// P1-05：Live Photo 导出服务（单例，复用 ffmpeg 二进制路径解析）
import { livePhotoService } from './services/livephoto-service'
// P1-M：编辑器服务（sharp pipeline 从 editor:save handler 抽取）
import { editorService } from './services/editor-service'
// T08：WiFi 局域网分享服务
import { wifiShareService } from './services/share-wifi-service'
// T09：剪贴板分享服务（CF_HDROP 格式）
import { copyFilesToClipboard, getAppStatus, launchApp } from './services/share-clipboard-service'
// P1-A1：4 组重复函数抽取到共享服务模块，启动路径与 IPC 路径共用同一份实现
import {
  processThumbnailForRow,
  generateThumbnailsForUnprocessed,
  generatePhashForUnprocessed
} from './services/thumbnail-phash-service'
// C-3：统一媒体常量与文件工具函数（取代各文件内联重复定义）
import { MEDIA_EXTENSIONS, getMimeType, isVideoExt } from './utils/media-constants'
// C-G3：共享命名常量（取代魔法数字）
import { STARTUP_SCAN_DELAY_MS, THUMBNAIL_CONCURRENCY, MEDIA_CACHE_TTL_MS } from './utils/constants'
// 日志管理：故障记录与日志服务
import { initLogger, logFault, getLogDirectory, logger, setLogDirectory } from './utils/logger'
// T13：崩溃报告服务（crashReporter dump 文件管理）
import {
  initCrashDir,
  enforceCrashLimit,
  getCrashDirectory,
  setCrashDirectory
} from './services/crash-service'
import { runWithConcurrency } from './utils/concurrency'
// 自定义目录管理：4 个功能的保存路径可配置
import {
  resolveCustomDir,
  ensureDir,
  migrateDirFiles,
  MIGRATE_PATTERNS,
  SETTING_KEYS
} from './utils/dir-manager'
// 启动诊断：在 logger 系统就绪前提供独立错误记录
import { logStartupError } from './utils/startup-diagnostic'
// 子进程注册表：退出时 kill 所有活跃的 ffmpeg/ffprobe/PowerShell 子进程
import { killAllProcesses, getProcessRegistryStats } from './utils/process-registry'
// P0-A1：IPC handler 按域拆分模块
import type { HandlerContext } from './ipc/handler-context'
// Slice 7c-fix：复用 Repository 的 refreshMediaCountCache，消除 media_count 双写路径
import { MediaRepository } from './database/media-repository'
import { registerMediaHandlers } from './ipc/handlers/media'
import { registerFileHandlers } from './ipc/handlers/file'
import { registerVideoHandlers } from './ipc/handlers/video'
import { registerWatermarkHandlers } from './ipc/handlers/watermark'
import { registerEditorHandlers } from './ipc/handlers/editor'
import { registerBackupHandlers } from './ipc/handlers/backup'
import { registerCacheHandlers } from './ipc/handlers/cache'
import { registerLogHandlers } from './ipc/handlers/log'
import { registerCrashHandlers } from './ipc/handlers/crash'
import { registerMiscHandlers } from './ipc/handlers/misc'
import { registerShareHandlers } from './ipc/handlers/share'

// 注册自定义协议，使渲染进程可以安全访问本地媒体文件
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true
    }
  }
])

// 安全解析 media_files.tags 字段（可能是 JSON 字符串、数组或 null），失败回退空数组
// 单条损坏的 tags 不应让整个 media:list IPC 抛错
function parseTagsField(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags
  if (typeof tags !== 'string' || tags.length === 0) return []
  try {
    const parsed = JSON.parse(tags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// P1-5：安全获取日志目录路径，避免在 logger 未初始化或异常情况下抛错
// 用于错误对话框等关键路径，必须保证不会因获取路径失败而再次抛错
function getLogDirectorySafe(): string {
  try {
    const dir = getLogDirectory()
    return dir || '<未知>'
  } catch {
    return '<未知>'
  }
}

class Application {
  private mainWindow: BrowserWindow | null = null
  private dbManager: DatabaseManager
  private scannerWorkerBridge: ScannerWorkerBridge
  private scannerManager: ScannerManager
  // 缩略图 / pHash / 重复检测进程拆分：media worker 独立 utilityProcess
  private mediaWorkerBridge: MediaWorkerBridge
  private mediaWorkerManager: MediaWorkerManager
  // 分级任务调度队列：高优先级立即执行可抢占低优先级，低优先级 FIFO 串行
  private taskScheduler: TaskScheduler
  private thumbnailGen: ThumbnailGenerator

  private fileService: FileService
  private videoService: VideoService
  private watermarkService: WatermarkService

  // media:// 协议白名单内存缓存（修复 A-S1/C-S2：原实现每次请求都全表扫描）
  // pathCache: 路径 → 是否允许，带 TTL（5分钟）
  // sourcePathCache: 已索引 source_path 列表，带 TTL（5分钟）
  private mediaPathCache: Map<string, { allowed: boolean; expiresAt: number }> = new Map()
  private mediaSourcePathCache: { paths: string[]; expiresAt: number } | null = null

  // A-7：缩略图批量生成运行标志，防止启动自动扫描与手动触发并发重复执行
  private thumbnailsGenerating = false
  // P1-A1：IPC handler 依赖注入上下文缓存，setupIPC 中赋值，performStartupScan 等启动路径复用
  private ctx: HandlerContext | null = null
  // C-G3：media:// 协议白名单缓存 TTL 使用共享常量
  private static readonly MEDIA_CACHE_TTL = MEDIA_CACHE_TTL_MS
  // P1-C：路径缓存条目上限，超过时清空（避免长期运行内存膨胀）
  private static readonly MEDIA_PATH_CACHE_MAX = 1000
  // 修复：保存启动延迟定时器引用，退出时清理，避免回调访问已关闭资源或启动新子进程
  private startupTimers: NodeJS.Timeout[] = []
  // 修复：退出清理标志，防止 before-quit 重复触发清理逻辑
  private isCleaningUp = false

  constructor() {
    this.dbManager = new DatabaseManager()
    // 全盘扫描模块进程拆分：bridge 先于 ScannerManager 实例化，由其持有 utilityProcess 生命周期
    this.scannerWorkerBridge = new ScannerWorkerBridge()
    this.scannerManager = new ScannerManager(this.scannerWorkerBridge)
    // 缩略图 / pHash / 重复检测进程拆分：bridge 先于 MediaWorkerManager 实例化
    this.mediaWorkerBridge = new MediaWorkerBridge()
    this.mediaWorkerManager = new MediaWorkerManager(this.mediaWorkerBridge)
    // 分级任务调度队列：启动期 pause，主窗口 ready-to-show 后 resume
    this.taskScheduler = new TaskScheduler()
    this.taskScheduler.pause()
    this.thumbnailGen = new ThumbnailGenerator()

    this.fileService = new FileService()
    this.videoService = new VideoService()
    this.watermarkService = new WatermarkService()
  }

  async initialize(): Promise<void> {
    // 启动失败兜底：任何阶段抛错都走 failStartup，确保进程退出 + 释放单实例锁
    // 修复"前几次正常，后续无法启动"的核心问题：原实现 initialize 失败后只 .catch(console.error)，
    // 进程不退出、持单实例锁、无窗口、无日志，变僵尸；后续启动全部 gotLock=false 静默退出
    let lockAcquired = false
    try {
      // 单实例锁：防止多实例并发操作同一 SQLite 数据库导致竞争
      let gotLock = app.requestSingleInstanceLock()
      if (!gotLock) {
        // P0 修复：旧实例可能正在 before-quit 清理流程中（DB WAL checkpoint 耗时 2-5s），
        // 锁尚未释放。等待 1s 后重试，最多 3 次，避免频繁弹出"已有实例运行"对话框。
        // 场景：用户关闭应用后立即重新打开，旧进程仍在 cleanup 中持锁。
        for (let retry = 0; retry < 3 && !gotLock; retry++) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          gotLock = app.requestSingleInstanceLock()
        }
      }
      if (!gotLock) {
        // P0-5：已有实例运行（可能是僵尸进程持锁），提供三选项对话框
        // 修复：原实现静默退出，用户完全不知道为何软件没启动
        // 改用 showMessageBox 提供"清理并重启 / 手动处理 / 退出"三个选项
        await app.whenReady()
        try {
          const result = await dialog.showMessageBox({
            type: 'warning',
            title: '已有实例运行',
            message: '应用已在运行中',
            detail:
              '可能是之前的进程异常未退出，导致单实例锁未释放。\n\n' +
              '点击"清理并重启"将自动结束所有残留进程并重启应用；\n' +
              '点击"手动处理"将打开任务管理器供您手动结束进程；\n' +
              '点击"退出"将直接关闭本窗口。',
            buttons: ['清理并重启', '手动处理', '退出'],
            defaultId: 0,
            cancelId: 2,
            noLink: true
          })

          if (result.response === 0) {
            // 清理并重启：结束除当前进程外的所有同名进程，然后重启
            // 修复1：原 wmic 在 Win11 24H2+ 已移除，回退分支 taskkill /F /IM 会杀死自己
            // 修复2：中文进程名在 PowerShell 5.1 -Command 模式下编码错误，改用 -EncodedCommand
            // 修复3：taskkill 不带 /T 无法杀死 crashpad_handler 子进程，子进程可能持锁
            //        改用 taskkill /F /T /PID 递归杀整个进程树
            // 修复4：延长等待到 2000ms，给 OS 更多时间释放 named mutex
            const appName = path.basename(app.getPath('exe'))
            const currentPid = process.pid
            let killedAny = false
            try {
              const { execFileSync } = require('child_process')
              // 用 -EncodedCommand 避免 PowerShell 5.1 的中文编码问题
              const psCommand = `Get-CimInstance Win32_Process -Filter "Name='${appName}'" | Where-Object { $_.ProcessId -ne ${currentPid} } | Select-Object -ExpandProperty ProcessId`
              const encoded = Buffer.from(psCommand, 'utf16le').toString('base64')
              const output = execFileSync(
                'powershell',
                ['-NoProfile', '-EncodedCommand', encoded],
                { windowsHide: true, encoding: 'utf8', timeout: 10000 }
              )
              const pids = output
                .split('\n')
                .map((line: string) => line.trim())
                .filter((p: string) => /^\d+$/.test(p))
                .map((p: string) => parseInt(p, 10))

              for (const pid of pids) {
                try {
                  // /T 递归杀整个进程树（含 crashpad_handler 等子进程）
                  execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true })
                  killedAny = true
                } catch {
                  // 单个进程杀失败忽略（可能已自行退出）
                }
              }
            } catch {
              // 回退：用 -EncodedCommand 调用 Stop-Process，排除当前 PID
              try {
                const { execFileSync } = require('child_process')
                const psCommand2 = `Get-Process -Name '${appName.replace('.exe', '')}' -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne ${currentPid} } | Stop-Process -Force`
                const encoded2 = Buffer.from(psCommand2, 'utf16le').toString('base64')
                execFileSync('powershell', ['-NoProfile', '-EncodedCommand', encoded2], {
                  windowsHide: true,
                  timeout: 10000
                })
                killedAny = true
              } catch {
                // 两种方案都失败，跳过杀进程，直接重启（新实例会再次尝试获取锁）
              }
            }
            // 等待旧进程完全退出后重启
            // 修复：延长到 2000ms，给 OS 足够时间释放 named mutex 和清理子进程
            // P1 修复：若 taskkill 未杀死任何进程（killedAny=false），不重启
            // 避免新实例再次拿不到锁 → 再次弹窗 → 用户再点"清理并重启" → 无限循环
            if (!killedAny) {
              try {
                await dialog
                  .showMessageBox({
                    type: 'warning',
                    title: '清理失败',
                    message: '未能自动结束残留进程',
                    detail:
                      '可能原因：\n• 残留进程以管理员权限运行\n• PowerShell 执行策略限制\n• 安全软件拦截\n\n请手动打开任务管理器，结束所有"无限暖暖相册管理工具"进程后重试。',
                    buttons: ['打开任务管理器', '退出'],
                    defaultId: 0,
                    cancelId: 1,
                    noLink: true
                  })
                  .then((r) => {
                    if (r.response === 0) {
                      try {
                        const { exec } = require('child_process')
                        exec('taskmgr', { windowsHide: false })
                      } catch {}
                    }
                  })
              } catch {}
              app.quit()
              return
            }
            setTimeout(() => {
              // 当前进程没有锁（gotLock=false），但安全起见仍尝试释放
              try {
                app.releaseSingleInstanceLock?.()
              } catch {}
              app.relaunch()
              app.exit(0)
            }, 2000)
            return
          } else if (result.response === 1) {
            // 手动处理：打开任务管理器
            try {
              const { exec } = require('child_process')
              exec('taskmgr', { windowsHide: false })
            } catch {}
          }
        } catch (err) {
          // 对话框显示失败时记录到诊断日志
          logStartupError('gotLock-false-dialog', err)
        }
        app.quit()
        return
      }
      lockAcquired = true
      // 第二实例尝试启动时，聚焦到已有窗口
      app.on('second-instance', () => {
        const windows = BrowserWindow.getAllWindows()
        if (windows.length > 0) {
          const win = windows[0]
          if (win.isMinimized()) win.restore()
          win.focus()
        }
      })

      await app.whenReady()

      // 提前注册全局异常捕获（在 dbManager.initialize 之前）
      // 修复：原实现注册时机太晚，dbManager.initialize 抛错时此处理器未注册
      // 即便此处 logFault 不可用（logDir 未设置），logStartupError 仍能写入独立文件
      // P1-5：首次异常弹出对话框提示用户，避免高频打扰
      let hasShownRuntimeErrorDialog = false
      // P1-A9：退出竞态 guard，避免 uncaughtException/unhandledRejection 在 100ms 内连续触发
      // 多次调度 setTimeout 会导致重复 releaseSingleInstanceLock 和 exit(1) 调用
      let isExiting = false
      process.on('uncaughtException', (err) => {
        logStartupError('uncaughtException', err)
        try {
          logFault('uncaughtException', err, { source: 'process.uncaughtException' }).catch(
            () => {}
          )
        } catch {}
        // P1-5：首次未捕获异常弹出对话框，后续静默记录避免打扰
        if (!hasShownRuntimeErrorDialog) {
          hasShownRuntimeErrorDialog = true
          try {
            dialog.showErrorBox(
              '应用遇到错误',
              `应用遇到未预期的错误：\n\n${err.message}\n\n` +
                `错误详情已记录到日志。建议：\n` +
                `1. 保存当前工作后重启应用\n` +
                `2. 如反复出现，请在设置→诊断中导出诊断包反馈给开发者\n\n` +
                `日志路径：${getLogDirectorySafe()}`
            )
          } catch {}
        }
        // P1-A9：已进入退出流程则直接返回，避免重复调度 setTimeout
        if (isExiting) return
        isExiting = true
        // 修复：异常后进程状态不可预测，必须退出释放单实例锁
        // 不退出会导致僵尸进程持有锁，下次启动报"已有实例运行"
        // P0 根因修复：原用 setTimeout(100ms) 延迟退出，但 logFault 产生的 FileHandleCloseReq
        // 会延迟 setTimeout 回调。改为直接 app.exit(1) 立即终止进程
        try {
          app.releaseSingleInstanceLock?.()
        } catch {}
        try {
          app.exit(1)
        } catch {}
      })
      process.on('unhandledRejection', (reason) => {
        const err = reason instanceof Error ? reason : new Error(String(reason))
        logStartupError('unhandledRejection', err)
        try {
          logFault('unhandledRejection', err, { source: 'process.unhandledRejection' }).catch(
            () => {}
          )
        } catch {}
        // P1-A9：已进入退出流程则直接返回，避免重复调度 setTimeout
        if (isExiting) return
        isExiting = true
        // 修复：与 uncaughtException 对齐，未捕获的 Promise rejection 后进程状态不可预测
        // 不退出会导致僵尸进程持锁，下次启动报"已有实例运行"
        try {
          app.releaseSingleInstanceLock?.()
        } catch {}
        try {
          app.exit(1)
        } catch {}
      })

      // 阶段 1：数据库初始化（最可能失败的阶段）
      // 修复：包裹 try/catch，失败时记录到独立诊断日志（不依赖 logger 系统）
      try {
        await this.dbManager.initialize()
      } catch (dbErr) {
        logStartupError('dbManager.initialize', dbErr)
        // 数据库初始化失败属于致命错误，无法继续
        throw dbErr
      }

      // 阶段 2：自定义目录迁移（每个目录独立 try/catch，避免单点失败阻塞全部）
      // 修复：原实现 4 个 ensureDir 任一抛错会阻塞后续 initLogger / crashReporter
      // P1-C6：migrateDirFiles 已改为 async，避免 GB 级文件迁移阻塞主进程事件循环
      try {
        await this.applyCustomDirectories()
      } catch (dirErr) {
        logStartupError('applyCustomDirectories', dirErr)
        // 自定义目录失败不应阻塞启动，继续使用默认目录
      }

      // 阶段 3：日志系统初始化（即便阶段 2 失败也要尝试）
      try {
        initLogger()
      } catch (logErr) {
        logStartupError('initLogger', logErr)
        // 日志失败不阻塞启动
      }

      // 阶段 4：崩溃报告系统
      try {
        crashReporter.start({ uploadToServer: false, compress: true })
        initCrashDir()
        logger.info('[Crash] crashReporter 已启动，dump 目录: ' + getCrashDirectory())
      } catch (err) {
        logStartupError('crashReporter.start', err)
        try {
          logger.error('[Crash] crashReporter 启动失败:', err)
        } catch {}
      }

      // 阶段 5：备份服务
      try {
        backupService.init(this.dbManager)
        // 分级调度：注入 scheduler，启动备份通过低优先级队列执行
        backupService.setScheduler(this.taskScheduler)
        backupService.scheduleStartupBackup()
        // P1-M：编辑器服务初始化（注入 dbManager）
        editorService.init(this.dbManager)
        // 分级调度：注入 scheduler，pruneOldSnapshots 通过低优先级队列执行
        editorService.setScheduler(this.taskScheduler)
      } catch (err) {
        logStartupError('backupService.init', err)
        try {
          logger.error('[Backup] 初始化失败:', err)
        } catch {}
      }

      // 阶段 6：协议注册 + IPC + 窗口
      this.registerMediaProtocol()
      // 全盘扫描模块进程拆分：worker 进程独立打开同一 db 文件（WAL 多连接并发）
      // 不再向 ScannerManager 注入主进程的 Database / DatabaseManager
      // dbPath 与 DatabaseManager 内部计算保持一致（userData/database/wxnn_photo_manager.db）
      this.scannerManager.setDbPath(
        path.join(app.getPath('userData'), 'database', 'wxnn_photo_manager.db')
      )
      // 缩略图 / pHash / 重复检测进程拆分：media worker 独立打开同一 db 文件（WAL 多连接并发）
      this.mediaWorkerManager.setDbPath(
        path.join(app.getPath('userData'), 'database', 'wxnn_photo_manager.db')
      )
      this.setupIPC()
      await this.createMainWindow()

      // 阶段 7：主题 + 数据库修复
      try {
        const savedUITheme = this.dbManager.getSetting('uiTheme', 'default') as
          'default' | 'soft-pink-luxury'
        this.applyUITheme(savedUITheme)
        await this.cleanupAndRepairDatabase()
        this.setupThemeListener()
      } catch (err) {
        logStartupError('cleanup', err)
        try {
          logger?.error?.('[App] 主题/清理修复失败:', err)
        } catch {}
      }

      // 阶段 7.5：确保桌面快捷方式存在（NSIS 覆盖安装时可能未创建）
      // F5 修复：改为 fire-and-forget 异步调用，避免注册表查询阻塞启动流程
      void this.ensureDesktopShortcut().catch((err) =>
        logStartupError('ensureDesktopShortcut', err)
      )

      // 阶段 8：启动后延迟任务（非关键，失败不阻塞）
      // 分级调度改造：启动期任务通过 taskScheduler.enqueueLow 入队，等主窗口 ready-to-show 后 resume 才执行
      // 修复：保存定时器引用，退出时清理，避免回调在数据库关闭后访问或启动新子进程
      const autoScan = this.dbManager.getSetting('autoScanOnStartup', true)
      if (autoScan) {
        this.startupTimers.push(
          setTimeout(() => {
            // 分级调度：启动扫描作为低优先级任务入队，等空闲时执行
            void this.taskScheduler
              .enqueueLow(() => this.performStartupScan(), {
                id: 'startup-scan',
                cancel: () => void this.scannerManager.stopScan()
              })
              .catch((err) => {
                logStartupError('performStartupScan', err)
              })
          }, STARTUP_SCAN_DELAY_MS)
        )
      }
      this.startupTimers.push(
        setTimeout(() => {
          // 分级调度：LRU 强制校准作为低优先级任务入队
          void this.taskScheduler
            .enqueueLow(() => this.thumbnailGen.enforceLimitNow(), { id: 'startup-lru-enforce' })
            .catch((err) => {
              logStartupError('enforceLimitNow', err)
            })
        }, STARTUP_SCAN_DELAY_MS + 5000)
      )
      // F-S5：启动后台 LRU 定时校准任务（每 5 分钟）
      this.thumbnailGen.startLruBackgroundTask()
      this.startupTimers.push(
        setTimeout(() => {
          // 分级调度：崩溃文件清理作为低优先级任务入队
          void this.taskScheduler
            .enqueueLow(() => enforceCrashLimit(), { id: 'startup-crash-cleanup' })
            .catch((err) => {
              logger?.warn?.('[Crash] 清理过期崩溃文件失败:', err)
            })
        }, STARTUP_SCAN_DELAY_MS + 6000)
      )

      // 退出清理：确保数据库正确关闭并执行 WAL checkpoint
      // 修复：原实现同步 before-quit 中调用异步清理且未 await，异步清理来不及完成；
      // 且未 kill ffmpeg/ffprobe 子进程，这些子进程保持事件循环活跃 → 进程不退出 → 持有单实例锁 → 下次启动失败
      // 改为 event.preventDefault + 异步清理 + app.exit(0) 强制退出兜底
      // P1-8：增加超时强制退出兜底，防止 performCleanup 卡住（如 db.close 阻塞）
      // P1-A8：根据 WAL 文件大小动态调整超时——WAL 较大时延长到 5s，避免强制退出时 WAL 未合并
      //        （配合 dbManager.close() 改用 PASSIVE 非阻塞 checkpoint，正常情况下 2s 足够）
      app.on('before-quit', (event) => {
        if (this.isCleaningUp) return
        this.isCleaningUp = true
        event.preventDefault()

        // P1-A8：根据 WAL 文件大小动态计算超时
        // 默认 2s；WAL > 10MB 时延长到 5s（万级日志场景兜底）
        let forceExitTimeoutMs = 2000
        try {
          const walSize = this.dbManager.getWalFileSize()
          if (walSize > 10 * 1024 * 1024) {
            forceExitTimeoutMs = 5000
          }
        } catch {}
        const forceExitReason = forceExitTimeoutMs > 2000 ? 'WAL 文件较大' : '默认'

        // P1-8：超时强制退出定时器——清理逻辑超时则 app.exit(1)
        // 用 logStartupError 记录超时诊断信息，便于排查卡死原因
        const forceExitTimer = setTimeout(() => {
          try {
            logStartupError(
              'force-exit-timeout',
              new Error(
                `performCleanup 超过 ${forceExitTimeoutMs}ms 未完成，强制退出（${forceExitReason}）`
              )
            )
            const stats = getProcessRegistryStats()
            logStartupError(
              'force-exit-stats',
              new Error(
                JSON.stringify({
                  childProcessCount: stats.childProcessCount,
                  ffmpegCommandCount: stats.ffmpegCommandCount,
                  startupTimers: this.startupTimers.length,
                  hasMediaUpdateTimer: !!this.mediaUpdateTimer,
                  forceExitTimeoutMs
                })
              )
            )
          } catch {}
          // P0 修复：强制退出前显式释放单实例锁
          // 原用 setTimeout(100ms) 延迟 app.exit(1)，但 I/O 活跃时 setTimeout 会被延迟
          // 改为直接 app.exit(1)，确保进程立即终止
          try {
            app.releaseSingleInstanceLock?.()
          } catch {}
          try {
            app.exit(1)
          } catch {}
        }, forceExitTimeoutMs)

        // 异步清理后清除超时定时器并正常退出
        this.performCleanup().finally(() => {
          try {
            clearTimeout(forceExitTimer)
          } catch {}
          // P0 修复：锁已在 performCleanup 中 DB 关闭后释放
          // 此处仅兜底：若 performCleanup 在 DB 关闭前异常退出，确保锁被释放
          try {
            app.releaseSingleInstanceLock?.()
          } catch {}
          // P0 根因修复：原用 setTimeout(100ms) 延迟 app.exit(0)，但 performCleanup 末尾的
          // logFault 产生 FileHandleCloseReq 活跃请求，保持事件循环活跃，setTimeout 回调
          // 被 I/O 操作延迟，进程挂着不退出。现在 logFault 已改为同步写入，直接 app.exit(0)
          // app.exit 立即终止进程，不触发 before-quit/will-quit，不等事件循环清空
          try {
            app.exit(0)
          } catch {}
        })
      })

      app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
          app.quit()
        }
      })

      app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          await this.createMainWindow()
        }
      })
    } catch (fatalErr) {
      // 启动失败兜底：记录错误 + 显示用户可见错误对话框 + 释放锁 + 退出
      logStartupError('initialize-fatal', fatalErr)
      try {
        // 尝试用 logger 记录（如果已初始化）
        if (logger) logger.error('[App] 启动失败:', fatalErr)
      } catch {}

      // P1-7：用 dialog.showMessageBox 替代 showErrorBox，提供"打开日志目录"操作按钮
      // 原实现仅能"确定"关闭，用户拿到错误后还得手动去找日志路径，体验差
      try {
        const errMsg = fatalErr instanceof Error ? fatalErr.message : String(fatalErr)
        const startupLogPath = path.join(app.getPath('userData'), 'startup-errors.log')
        const result = await dialog.showMessageBox({
          type: 'error',
          title: '无限暖暖相册管理工具启动失败',
          message: '软件启动时遇到错误',
          detail: `${errMsg}\n\n错误详情已记录到：\n${startupLogPath}\n\n如反复出现，请将日志反馈给开发者。`,
          buttons: ['打开日志目录', '退出'],
          defaultId: 1,
          cancelId: 1
        })
        if (result.response === 0) {
          // 打开日志所在目录（startup-errors.log 在 userData 根目录）
          try {
            await shell.openPath(path.dirname(startupLogPath))
          } catch {}
        }
      } catch {}

      // 释放资源并退出
      try {
        this.dbManager?.close?.()
      } catch {}
      if (lockAcquired) {
        try {
          app.releaseSingleInstanceLock?.()
        } catch {}
        // 修复：直接 app.exit 而非 app.quit，避免触发 before-quit 异步清理流程
        // 启动失败时 performCleanup 中的 dbManager.close 可能再次抛错（已关闭）
        // P0 根因修复：原用 setTimeout(100ms)，改为直接 app.exit(1) 立即终止
        try {
          app.exit(1)
        } catch {}
      } else {
        app.quit()
      }
    }
  }

  /**
   * 退出前异步清理：确保所有资源正确释放后再调用 app.exit(0)
   * 修复"前几次正常，后续无法启动"的核心问题：
   * 1. 清理启动定时器（防止回调在 db.close 后访问数据库或启动新子进程）
   * 2. kill 所有活跃 ffmpeg/ffprobe/PowerShell 子进程（防止子进程保持事件循环活跃）
   * 3. 停止扫描器 + WiFi 服务
   * 4. flush 缩略图访问时间
   * 5. 关闭数据库（含 WAL checkpoint）
   * 6. 兜底：app.exit(0) 强制退出，不等待事件循环
   */
  private async performCleanup(): Promise<void> {
    // P0-6：清理前记录诊断信息（活跃句柄、子进程数量等），便于诊断"进程不退出"问题
    const beforeStats = this.collectExitDiagnosis('before-cleanup')

    // 1. 清理启动定时器
    for (const t of this.startupTimers) {
      try {
        clearTimeout(t)
      } catch {}
    }
    this.startupTimers = []
    if (this.mediaUpdateTimer) {
      try {
        clearTimeout(this.mediaUpdateTimer)
      } catch {}
      this.mediaUpdateTimer = null
    }

    // 2. kill 所有活跃子进程（ffmpeg/ffprobe/PowerShell）
    try {
      killAllProcesses('SIGKILL')
    } catch {}

    // 2.5 分级调度：暂停调度器 + 取消所有低优先级任务（队列中 + 正在运行）
    // 必须在 stopScan / dispose worker 之前调用，避免新任务在清理过程中启动
    try {
      this.taskScheduler.pause()
      this.taskScheduler.cancelAllLow()
    } catch {}

    // 3. 停止扫描器（设置 shouldStop 标志）
    try {
      await this.scannerManager.stopScan().catch(() => {})
    } catch {}

    // 3.5 全盘扫描模块进程拆分：dispose worker 进程
    // 顺序：先 stopScan（让 worker 自然完成当前批次并退出）→ 再 dispose（kill 兜底）
    // 加 1s 超时保护，避免 worker 卡住阻塞主进程退出
    try {
      await Promise.race([
        this.scannerWorkerBridge.dispose(),
        new Promise<void>((resolve) => setTimeout(resolve, 1000))
      ])
    } catch {}

    // 3.6 缩略图 / pHash / 重复检测进程拆分：dispose media worker 进程
    // 加 1s 超时保护，避免 worker 卡住阻塞主进程退出
    try {
      await Promise.race([
        this.mediaWorkerBridge.dispose(),
        new Promise<void>((resolve) => setTimeout(resolve, 1000))
      ])
    } catch {}

    // 4. 停止 WiFi 分享服务
    try {
      wifiShareService.stop()
    } catch {}

    // 5. 备份服务清理定时器
    try {
      backupService.dispose()
    } catch {}

    // F-S5：停止缩略图 LRU 后台定时任务
    try {
      this.thumbnailGen.stopLruBackgroundTask()
    } catch {}

    // 6. flush 缩略图访问时间（带超时保护，避免卡住）
    try {
      await Promise.race([
        this.thumbnailGen.flushAccessTimes().catch(() => {}),
        new Promise<void>((resolve) => setTimeout(resolve, 1000))
      ])
    } catch {}

    // 7. 关闭数据库（同步，含 WAL checkpoint）
    try {
      this.dbManager.close()
    } catch (error) {
      logStartupError('before-quit-db-close', error)
    }

    // P0 修复：数据库已关闭（WAL checkpoint 完成），立即释放单实例锁
    // 允许新实例启动打开数据库，不等 DLL 卸载等次要清理
    // 将持锁窗口从 2-5s（整个 cleanup）缩短到 ~1.5s（到 DB close 为止）
    // 避免"关闭应用后立即重开 → 弹'已有实例运行'对话框"的问题
    try {
      app.releaseSingleInstanceLock?.()
    } catch {}

    // P0-A3：卸载 decryption DLL，释放 C 资源，避免进程退出时内存泄漏
    try {
      const { disposeDecryptionService } = await import('./services/decryption-service')
      disposeDecryptionService()
    } catch {
      /* DLL 未加载或已卸载，忽略 */
    }

    // P0-6：清理后记录诊断信息，对比 before/after 可判断哪些资源被释放
    const afterStats = this.collectExitDiagnosis('after-cleanup')
    // P0 根因修复：原实现调用 logFault（async，内部用 fs.promises.appendFile），
    // 产生 FileHandleCloseReq 活跃请求，保持事件循环活跃，导致 app.exit(0) 被延迟
    // 改用同步写入 fs.appendFileSync，不产生异步请求，确保进程能立即退出
    try {
      const faultRecord = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        timestamp: new Date().toISOString(),
        type: 'exitDiagnosis',
        summary: '进程退出诊断',
        detail: `before: ${JSON.stringify(beforeStats)}\nafter: ${JSON.stringify(afterStats)}`,
        pid: process.pid,
        uptime: process.uptime()
      }
      const faultPath = path.join(
        app.getPath('userData'),
        'logs',
        `faults-${new Date().toISOString().slice(0, 10)}.jsonl`
      )
      fs.appendFileSync(faultPath, JSON.stringify(faultRecord) + '\n', 'utf-8')
    } catch {}
  }

  /**
   * P0-6：收集进程退出诊断信息
   * 记录活跃句柄、活跃请求、子进程数量、定时器数量等
   * 这些信息在"进程不退出"问题发生时能快速定位是哪个资源持有了事件循环
   */
  private collectExitDiagnosis(stage: string): Record<string, unknown> {
    const stats = getProcessRegistryStats()
    const diagnosis: Record<string, unknown> = {
      stage,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: process.uptime(),
      startupTimers: this.startupTimers.length,
      hasMediaUpdateTimer: !!this.mediaUpdateTimer,
      childProcessCount: stats.childProcessCount,
      ffmpegCommandCount: stats.ffmpegCommandCount
    }

    // 收集活跃句柄（HTTP server / socket / pipe 等）
    // _getActiveHandles 是 Node.js 内部 API，可能不存在于所有版本
    try {
      const handles =
        (process as unknown as { _getActiveHandles?: () => unknown[] })._getActiveHandles?.() || []
      diagnosis.activeHandles = handles.map((h: unknown) => {
        if (h && typeof h === 'object' && 'constructor' in h) {
          return (h as { constructor: { name: string } }).constructor.name
        }
        return String(h)
      })
    } catch {}

    // 收集活跃请求
    try {
      const requests =
        (process as unknown as { _getActiveRequests?: () => unknown[] })._getActiveRequests?.() ||
        []
      diagnosis.activeRequests = requests.map((r: unknown) => {
        if (r && typeof r === 'object' && 'constructor' in r) {
          return (r as { constructor: { name: string } }).constructor.name
        }
        return String(r)
      })
    } catch {}

    // 仅在检测到异常资源时才记录到 startup-errors.log（避免正常退出污染日志）
    // 异常判定：有活跃句柄/请求/子进程/启动定时器未清理
    const hasIssue =
      (diagnosis.activeHandles as string[]).length > 0 ||
      (diagnosis.activeRequests as string[]).length > 0 ||
      (diagnosis.childProcessCount as number) > 0 ||
      (diagnosis.startupTimers as number) > 0

    if (hasIssue) {
      try {
        logStartupError(`exit-diagnosis-${stage}`, new Error(JSON.stringify(diagnosis, null, 2)))
      } catch {}
    }

    return diagnosis
  }

  /**
   * 确保桌面快捷方式存在
   * NSIS 安装器在覆盖安装等场景下可能未创建桌面快捷方式
   * 启动时主动检查并补创建，使用 Electron 原生 shell.writeShortcutLink（仅 Windows）
   */
  private async ensureDesktopShortcut(): Promise<void> {
    // 仅打包环境执行（开发环境不需要桌面快捷方式）
    if (!app.isPackaged) return

    try {
      // F5 修复：显式读注册表自定义桌面路径 + 写权限校验
      // 硬约束：Application must handle custom desktop paths configured via Windows registry
      const desktopPath = await resolveDesktopPath()
      if (!desktopPath) {
        logger.warn('[App] 无法确定可写的桌面路径，跳过快捷方式创建')
        return
      }
      const shortcutPath = path.join(desktopPath, '无限暖暖相册管理工具.lnk')
      const exePath = app.getPath('exe')

      // P2-A9：快捷方式已存在时校验目标有效性——target 指向的 exe 不存在则重建
      // 修复：原实现仅检查 .lnk 文件存在就跳过，exe 被移动/重命名后快捷方式失效
      if (fs.existsSync(shortcutPath)) {
        try {
          const link = shell.readShortcutLink(shortcutPath)
          if (link.target && fs.existsSync(link.target)) {
            return // 快捷方式有效，跳过
          }
          // target 失效，删除旧快捷方式后重建
          try {
            fs.unlinkSync(shortcutPath)
          } catch {}
        } catch {
          // readShortcutLink 失败（快捷方式损坏），删除后重建
          try {
            fs.unlinkSync(shortcutPath)
          } catch {}
        }
      }

      // F5 修复：shell.writeShortcutLink 返回 false 表示创建失败，fallback 到用户主目录
      // 硬约束：错误必须被处理，不能静默失败
      const shortcutOpts: Electron.ShortcutDetails = {
        target: exePath,
        description: '无限暖暖相册管理工具',
        icon: exePath,
        iconIndex: 0
      }
      const created = shell.writeShortcutLink(shortcutPath, 'create', shortcutOpts)
      if (created) {
        try {
          logger.info('[App] 桌面快捷方式已创建')
        } catch {}
        return
      }

      // 桌面不可写或创建失败，fallback 到用户主目录
      logger.warn('[App] 桌面快捷方式创建失败，尝试 fallback 到用户主目录')
      const homePath = app.getPath('home')
      const fallbackPath = path.join(homePath, '无限暖暖相册管理工具.lnk')
      const fallbackCreated = shell.writeShortcutLink(fallbackPath, 'create', shortcutOpts)
      if (fallbackCreated) {
        try {
          logger.info(`[App] 桌面快捷方式已创建（fallback 到用户主目录: ${homePath}）`)
        } catch {}
      } else {
        logger.error('[App] 桌面快捷方式创建失败（包括 fallback 到用户主目录）')
      }
    } catch (err) {
      logStartupError('ensureDesktopShortcut', err)
    }
  }

  /**
   * 自定义目录支持：读取 4 个功能的自定义路径，迁移老数据到新目录
   * 必须在 initLogger / crashReporter.start / backupService.init / ThumbnailGenerator 初始化前调用
   * - backupDir：数据库备份目录
   * - thumbnailCacheDir：缩略图缓存目录
   * - logDir：日志目录
   * - crashDir：崩溃 dump 目录（必须通过 app.setPath('crashDumps', ...) 设置，crashReporter 才会写入）
   *
   * P1-A10：抽取 applyCustomDir 辅助函数消除 4 段重复 try/catch + migrateDirFiles 模板
   */
  private async applyCustomDirectories(): Promise<void> {
    // P1-A10：通用迁移流程抽取为辅助函数，每个目录仅 1 行调用 + postSetup 回调
    await this.applyCustomDir(
      'backupDir',
      'backups',
      MIGRATE_PATTERNS.backupDir,
      '备份文件',
      (dir) => backupService.setDir(dir)
    )

    await this.applyCustomDir(
      'thumbnailCacheDir',
      'thumbnails',
      /metadata\.json$/i,
      '缩略图元数据',
      (dir) => {
        this.thumbnailGen.setDir(dir)
        // 恢复自定义缓存上限（如有）
        const savedLimit = this.dbManager.getSetting<number>('thumbnailCacheLimitBytes', 0)
        if (savedLimit && savedLimit >= 100 * 1024 * 1024) {
          this.thumbnailGen.setCacheLimitBytes(savedLimit)
        }
      }
    )

    await this.applyCustomDir('logDir', 'logs', MIGRATE_PATTERNS.logDir, '日志文件', (dir) =>
      setLogDirectory(dir)
    )

    // crashDir 必须在 crashReporter.start() 之前调用 app.setPath，crashpad 子进程才能正确写入
    await this.applyCustomDir(
      'crashDir',
      'crashes',
      MIGRATE_PATTERNS.crashDir,
      '崩溃 dump',
      (dir) => {
        app.setPath('crashDumps', dir)
        setCrashDirectory(dir)
      }
    )
  }

  /**
   * P1-A10：单个自定义目录的通用迁移流程
   * 1. resolveCustomDir 解析实际目录（优先自定义，回退默认）
   * 2. ensureDir 确保目录存在
   * 3. 若与默认目录不同，migrateDirFiles 迁移老数据
   * 4. setSetting 持久化目录路径
   * 5. postSetup 回调执行目录相关的副作用（如 setDir / setPath）
   *
   * P1-C6：migrateDirFiles 已改为 async，避免 GB 级文件迁移阻塞主进程
   */
  private async applyCustomDir(
    key: keyof typeof SETTING_KEYS,
    defaultDirName: string,
    migratePattern: RegExp,
    logLabel: string,
    postSetup: (dir: string) => void
  ): Promise<void> {
    const userData = app.getPath('userData')
    try {
      const dir = resolveCustomDir(this.dbManager, key)
      ensureDir(dir)
      const defaultDir = path.join(userData, defaultDirName)
      if (dir !== defaultDir) {
        const r = await migrateDirFiles(defaultDir, dir, migratePattern)
        if (r.moved > 0) console.log(`[Dir] 迁移${logLabel} ${r.moved} 个到 ${dir}`)
      }
      this.dbManager.setSetting(SETTING_KEYS[key], dir)
      postSetup(dir)
    } catch (err) {
      logStartupError(`applyCustomDirectories.${defaultDirName}`, err)
      // P2-A12：自定义目录失败时回退到默认目录，确保 postSetup 至少用默认目录初始化对应服务，
      // 避免自定义目录解析失败导致 backupService/thumbnailGen/logger/crash 等服务未初始化
      try {
        const fallbackDir = path.join(app.getPath('userData'), defaultDirName)
        ensureDir(fallbackDir)
        postSetup(fallbackDir)
      } catch (fallbackErr) {
        logStartupError(`applyCustomDirectories.${defaultDirName}.fallback`, fallbackErr)
      }
    }
  }

  private async createMainWindow(): Promise<void> {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 900,
      minHeight: 600,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: 'rgba(0,0,0,0)',
        symbolColor: '#1A1A1A',
        height: 40
      },
      backgroundColor: '#F5F5F5',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      },
      show: false,
      roundedCorners: true
    })

    // 加载渲染进程
    if (process.env.NODE_ENV === 'development') {
      await this.mainWindow.loadURL('http://localhost:5173')
      this.mainWindow.webContents.openDevTools()
    } else {
      // 路径计算：__dirname 在打包后为 app.asar/dist/main/main/（双层 main 因 tsconfig rootDir:'../' 导致）
      // 渲染进程产物在 dist/renderer/，需回退两层才能到达
      await this.mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'))
    }

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show()
      // 分级调度：主窗口显示后恢复调度器，启动期入队的低优先级任务开始执行
      this.taskScheduler.resume()
    })

    // 渲染进程崩溃捕获：P1-6 增强——记录故障日志 + 弹出用户选择对话框
    // 原实现仅记录日志，用户面对白屏毫无感知；改为询问用户是否重新加载
    this.mainWindow.webContents.on('render-process-gone', async (_event, details) => {
      const err = new Error(`Renderer process gone: ${details.reason}`)
      logFault('rendererCrash', err, {
        reason: details.reason,
        exitCode: details.exitCode,
        source: 'webContents.render-process-gone'
      }).catch(() => {})
      try {
        logger?.error?.('[Renderer] 渲染进程崩溃:', details)
      } catch {}

      // P1-6：弹窗询问用户是否重新加载（崩溃后窗口可能已不可用，需先销毁重建）
      if (!this.mainWindow || this.mainWindow.isDestroyed()) return
      const result = await dialog.showMessageBox(this.mainWindow, {
        type: 'error',
        title: '页面崩溃',
        message: '页面已崩溃，需要重新加载',
        detail: `崩溃原因：${details.reason}\n退出代码：${details.exitCode}\n\n错误详情已记录到日志，建议重新加载页面继续使用。`,
        buttons: ['重新加载', '关闭应用'],
        defaultId: 0,
        cancelId: 1
      })

      if (result.response === 0) {
        // 重新加载：reload 之前先确保 webContents 仍可用
        try {
          if (!this.mainWindow?.isDestroyed()) {
            this.mainWindow?.webContents.reload()
          }
        } catch (reloadErr) {
          logStartupError('renderer-reload-failed', reloadErr)
          // reload 失败时重建窗口作为最后兜底
          try {
            await this.createMainWindow()
          } catch {}
        }
      } else {
        app.quit()
      }
    })

    // 渲染层 console.error 捕获：将前端错误同步记录到故障日志
    // 仅捕获 error 级别，避免 info/warn 日志噪音
    this.mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      // level: 0=verbose, 1=info, 2=warning, 3=error
      if (level !== 3) return
      const err = new Error(message)
      logFault('rendererError', err, {
        source: 'renderer.console.error',
        location: `${sourceId}:${line}`
      }).catch(() => {})
    })
  }

  // C-G7：扫描进度监听器用具名函数引用，避免 removeAllListeners('progress')
  // 误伤其他潜在监听者（副作用过大）；改用 removeListener 精准移除自己的监听器
  private readonly onScanProgress = (progress: unknown): void => {
    this.mainWindow?.webContents.send('scanner:progress', progress)
  }

  private setupIPC(): void {
    // 扫描操作（进度监听只注册一次，避免重复累积）
    // C-G7：原 removeAllListeners('progress') 会移除所有 progress 监听器，
    // 改为先 removeListener 自己的监听器再 on，避免重复累积且不误伤其他监听者
    this.scannerManager.removeListener('progress', this.onScanProgress)
    this.scannerManager.on('progress', this.onScanProgress)

    // P0-A1：IPC handler 已按域拆分到 src/main/ipc/handlers/，通过 HandlerContext 注入依赖
    // P1-A1：ctx 缓存为成员变量，performStartupScan 等启动路径调用共享服务模块时复用
    this.ctx = {
      dbManager: this.dbManager,
      scannerManager: this.scannerManager,
      // 缩略图 / pHash / 重复检测进程拆分：注入 MediaWorkerManager，由共享服务模块转发到 worker
      mediaWorkerManager: this.mediaWorkerManager,
      // 分级任务调度队列：注入到共享服务模块，用于优先级管控
      taskScheduler: this.taskScheduler,
      thumbnailGen: this.thumbnailGen,
      fileService: this.fileService,
      videoService: this.videoService,
      watermarkService: this.watermarkService,
      getMainWindow: () => this.getMainWindow(),
      notifyMediaUpdated: () => this.notifyMediaUpdated(),
      invalidateMediaPathCache: () => this.invalidateMediaPathCache(),
      applyUITheme: (theme) => this.applyUITheme(theme),
      isThumbnailsGenerating: () => this.thumbnailsGenerating,
      setThumbnailsGenerating: (v) => {
        this.thumbnailsGenerating = v
      }
    }

    registerMediaHandlers(this.ctx)
    registerFileHandlers(this.ctx)
    registerVideoHandlers(this.ctx)
    registerWatermarkHandlers(this.ctx)
    registerEditorHandlers(this.ctx)
    registerBackupHandlers(this.ctx)
    registerCacheHandlers(this.ctx)
    registerLogHandlers(this.ctx)
    registerCrashHandlers(this.ctx)
    registerMiscHandlers(this.ctx)
    registerShareHandlers(this.ctx)
  }

  // 待确认#6：media:updated 广播节流
  // 高频单条更新（如连续评分、标签编辑）会触发多次全量广播，渲染层重载数据
  // 节流为 100ms 内仅广播一次，失效缓存立即执行，广播延迟合并
  private mediaUpdateTimer: NodeJS.Timeout | null = null
  private static readonly MEDIA_UPDATE_THROTTLE_MS = 100

  private notifyMediaUpdated(): void {
    // 失效 media:// 协议白名单缓存，确保新增/删除/移动的文件能被正确识别（立即执行）
    this.invalidateMediaPathCache()
    // A-S4：同步更新 media_count 缓存（仅缓存未软删除记录数，用于 media:list 分页 total）
    // Slice 7c-fix：写入逻辑收口到 MediaRepository.refreshMediaCountCache，消除双写路径
    try {
      const db = this.dbManager.getDatabase()
      if (db) {
        new MediaRepository(db).refreshMediaCountCache()
      }
    } catch {
      // 缓存更新失败不影响主流程，media:list 会回退到实时 COUNT
    }
    // 广播节流：100ms 内多次调用合并为一次
    if (this.mediaUpdateTimer) return
    this.mediaUpdateTimer = setTimeout(() => {
      this.mediaUpdateTimer = null
      this.mainWindow?.webContents.send('media:updated')
    }, Application.MEDIA_UPDATE_THROTTLE_MS)
  }

  private applyUITheme(theme: 'default' | 'soft-pink-luxury'): void {
    this.dbManager.setSetting('uiTheme', theme)

    // 当前主题集合均为浅色，保留深色主题扩展能力
    const darkThemes = new Set<string>([])
    const isDark = darkThemes.has(theme)

    // 同步系统原生主题为对应亮/暗模式，使标题栏按钮颜色匹配
    nativeTheme.themeSource = isDark ? 'dark' : 'light'

    // 更新窗口标题栏叠加按钮颜色
    const win = this.mainWindow
    if (win && !win.isDestroyed()) {
      win.setTitleBarOverlay({
        color: 'rgba(0,0,0,0)',
        symbolColor: isDark ? '#FFFFFF' : '#1A1A1A',
        height: 40
      })
      const backgroundColors: Record<string, string> = {
        default: '#F5F5F5',
        'soft-pink-luxury': '#fdf9fb'
      }
      win.setBackgroundColor(backgroundColors[theme] ?? '#F5F5F5')
    }
  }

  private getMainWindow(): BrowserWindow {
    const win = this.mainWindow ?? BrowserWindow.getFocusedWindow()
    if (!win) {
      throw new Error('主窗口未初始化')
    }
    return win
  }

  // P0-B：parseTags 私有方法已随 tag:add/tag:remove IPC 一并删除（仅被这两个 handler 调用）

  private setupThemeListener(): void {
    nativeTheme.on('updated', () => {
      this.mainWindow?.webContents.send('theme:changed', {
        shouldUseDarkColors: nativeTheme.shouldUseDarkColors
      })
    })
  }

  // 注册 media:// 协议，将渲染进程的图片请求映射到本地文件
  private registerMediaProtocol(): void {
    try {
      protocol.unhandle('media')
    } catch {
      // 协议未注册时忽略错误
    }

    protocol.handle('media', async (request) => {
      try {
        const url = new URL(request.url)
        const encodedPath = url.searchParams.get('path')
        if (!encodedPath) {
          console.warn('[Media Protocol] 缺少 path 参数:', request.url)
          return new Response('Missing path', { status: 400 })
        }

        const filePath = decodeURIComponent(encodedPath)
        const normalizedPath = path.resolve(filePath)

        // 路径白名单校验：仅允许访问已索引的媒体文件或已知缩略图
        if (!this.isMediaPathAllowed(normalizedPath)) {
          console.warn('[Media Protocol] 拒绝访问白名单外文件:', filePath)
          return new Response('Forbidden', { status: 403 })
        }

        try {
          await fs.promises.access(normalizedPath, fs.constants.R_OK)
        } catch {
          console.warn('[Media Protocol] 文件不存在或无权限:', filePath)
          return new Response('File not found', { status: 404 })
        }

        const ext = path.extname(normalizedPath).toLowerCase()
        const mimeType = getMimeType(ext)
        const isVideo = isVideoExt(ext)

        // 视频文件：支持 Range 请求（视频 seek 必需），流式响应避免 OOM
        if (isVideo) {
          const fileStat = await fs.promises.stat(normalizedPath)
          const fileSize = fileStat.size
          const rangeHeader = request.headers.get('range')

          if (rangeHeader) {
            // 解析 Range: bytes=start-end
            const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
            if (match) {
              const start = match[1] ? parseInt(match[1], 10) : 0
              const end = match[2] ? parseInt(match[2], 10) : fileSize - 1
              const chunkSize = end - start + 1
              const stream = fs.createReadStream(normalizedPath, { start, end })
              return new Response(stream as unknown as ReadableStream, {
                status: 206,
                headers: {
                  'Content-Type': mimeType,
                  'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                  'Content-Length': String(chunkSize),
                  'Accept-Ranges': 'bytes',
                  'Cache-Control': 'public, max-age=31536000'
                }
              })
            }
          }

          // 无 Range 头：返回完整文件流
          const stream = fs.createReadStream(normalizedPath)
          return new Response(stream as unknown as ReadableStream, {
            headers: {
              'Content-Type': mimeType,
              'Content-Length': String(fileSize),
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'public, max-age=31536000'
            }
          })
        }

        // 图片流式响应（与视频分支一致）：避免大原图整文件读入内存导致内存峰值飙升
        const imgStat = await fs.promises.stat(normalizedPath)
        const imgSize = imgStat.size
        const imgRange = request.headers.get('range')

        if (imgRange) {
          const match = /bytes=(\d*)-(\d*)/.exec(imgRange)
          if (match) {
            const start = match[1] ? parseInt(match[1], 10) : 0
            const end = match[2] ? parseInt(match[2], 10) : imgSize - 1
            const chunkSize = end - start + 1
            const stream = fs.createReadStream(normalizedPath, { start, end })
            return new Response(stream as unknown as ReadableStream, {
              status: 206,
              headers: {
                'Content-Type': mimeType,
                'Content-Range': `bytes ${start}-${end}/${imgSize}`,
                'Content-Length': String(chunkSize),
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=31536000'
              }
            })
          }
        }

        const imgStream = fs.createReadStream(normalizedPath)
        return new Response(imgStream as unknown as ReadableStream, {
          headers: {
            'Content-Type': mimeType,
            'Content-Length': String(imgSize),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=31536000'
          }
        })
      } catch (error) {
        console.error('[Media Protocol] 处理请求失败:', error)
        return new Response('Internal error', { status: 500 })
      }
    })
  }

  // 检查 media:// 请求路径是否在白名单内
  // 安全策略：
  //   1. 缩略图缓存目录下的文件（受控目录）
  //   2. 数据库中已索引的媒体文件（file_path 精确匹配）或其缩略图路径（thumbnail 精确匹配）
  //   3. 已索引 source_path 目录下的媒体文件（扩展名必须在白名单内，防止读取任意文件）
  // 注：媒体扩展名白名单已抽到 utils/media-constants.ts 的 MEDIA_EXTENSIONS 常量
  // 已修复 A-S2/C-F5：原实现 source_path 前缀匹配无扩展名限制，扫描 D:\ 后可读取整盘任意文件
  // 已修复 A-S1/C-S2：原实现每次请求都执行数据库查询，现使用内存缓存（TTL 5分钟）
  private isMediaPathAllowed(filePath: string): boolean {
    const db = this.dbManager.getDatabase()
    if (!db) return false

    try {
      const thumbnailDir = path.resolve(this.thumbnailGen.getCacheDir())
      const normalizedRequest = path.resolve(filePath)

      // 0. 检查路径级缓存（命中则直接返回，避免数据库查询）
      // P1-A4：命中时 delete+set 把 key 移到 Map 末尾，实现 LRU 最近访问优先
      const cached = this.mediaPathCache.get(normalizedRequest)
      if (cached && cached.expiresAt > Date.now()) {
        // LRU：移到末尾（最近访问）
        this.mediaPathCache.delete(normalizedRequest)
        this.mediaPathCache.set(normalizedRequest, cached)
        return cached.allowed
      }

      let allowed = false

      // 1. 允许访问缩略图缓存目录下的文件（受控目录，仅含生成的缩略图）
      if (normalizedRequest.startsWith(thumbnailDir + path.sep)) {
        allowed = true
      }

      // 2. 允许访问数据库中已索引的媒体文件或缩略图路径（精确匹配）
      // P1-A4：原 `WHERE file_path = ? OR thumbnail = ?` 可能走全表扫描
      //        拆为两次查询：先查 file_path（UNIQUE 索引，最快），未命中再查 thumbnail（idx_media_files_thumbnail）
      if (!allowed) {
        const fpRow = db
          .prepare('SELECT 1 FROM media_files WHERE file_path = ? LIMIT 1')
          .get(normalizedRequest) as { 1: number } | undefined
        if (fpRow) {
          allowed = true
        } else {
          const thRow = db
            .prepare('SELECT 1 FROM media_files WHERE thumbnail = ? LIMIT 1')
            .get(normalizedRequest) as { 1: number } | undefined
          if (thRow) allowed = true
        }
      }

      // 3. 仅允许访问已索引 source_path 目录下、且扩展名在媒体白名单内的文件
      //    防止扫描宽目录（如 D:\）后可读取该目录下任意类型文件（如 .txt/.exe/.json 等敏感文件）
      if (!allowed) {
        const ext = path.extname(normalizedRequest).toLowerCase()
        if (MEDIA_EXTENSIONS.has(ext)) {
          const sourcePaths = this.getCachedSourcePaths(db)
          for (const sourcePath of sourcePaths) {
            const resolvedSource = path.resolve(sourcePath)
            if (normalizedRequest.startsWith(resolvedSource + path.sep)) {
              allowed = true
              break
            }
          }
        }
      }

      // 写入缓存（包括否定结果，避免重复查询不存在的路径）
      // P1-A4：原实现 cache 满 1000 条时 clear() 全清，热门路径被一起清空引发性能抖动
      //        改用 LRU 策略：命中时 delete+set 移到末尾（最近访问），满时删除最早 key（最久未访问）
      if (this.mediaPathCache.size >= Application.MEDIA_PATH_CACHE_MAX) {
        // 删除最久未访问的 key（Map 迭代顺序 = 插入顺序，首个 key 即 LRU）
        const oldestKey = this.mediaPathCache.keys().next().value
        if (oldestKey !== undefined) {
          this.mediaPathCache.delete(oldestKey)
        }
      }
      this.mediaPathCache.set(normalizedRequest, {
        allowed,
        expiresAt: Date.now() + Application.MEDIA_CACHE_TTL
      })

      return allowed
    } catch (error) {
      console.error('[Media Protocol] 白名单校验失败:', error)
      return false
    }
  }

  // 获取已索引 source_path 列表（带内存缓存，避免每次请求都 DISTINCT 全表扫描）
  private getCachedSourcePaths(db: Database.Database): string[] {
    if (this.mediaSourcePathCache && this.mediaSourcePathCache.expiresAt > Date.now()) {
      return this.mediaSourcePathCache.paths
    }
    const rows = db
      .prepare('SELECT DISTINCT source_path FROM media_files WHERE source_path IS NOT NULL')
      .all() as Array<{ source_path: string }>
    const paths = rows.map((r) => r.source_path)
    this.mediaSourcePathCache = {
      paths,
      expiresAt: Date.now() + Application.MEDIA_CACHE_TTL
    }
    return paths
  }

  // 失效 media:// 协议白名单缓存（在媒体数据变更后调用）
  private invalidateMediaPathCache(): void {
    this.mediaPathCache.clear()
    this.mediaSourcePathCache = null
  }

  // P1-A1：processThumbnailForRow / generateThumbnailsForUnprocessed / generatePhashForUnprocessed / markDuplicates
  // 4 个私有方法已抽取到 src/main/services/thumbnail-phash-service.ts，启动路径与 IPC 路径共用同一份实现

  // 启动时后台执行一次自动扫描
  private async performStartupScan(): Promise<void> {
    try {
      // 修复：首次启动默认使用全盘扫描
      // 原版默认 incremental:true，若游戏目录查找失败则用户看不到任何媒体
      // 全盘扫描直接搜索所有盘符的媒体特征文件夹，覆盖所有安装场景
      // 后续启动按用户设置（incrementalScan）执行
      const db = this.dbManager.getDatabase()
      let isFirstLaunch = false
      if (db) {
        try {
          const row = db.prepare('SELECT COUNT(*) as count FROM scan_history').get() as {
            count: number
          }
          isFirstLaunch = row.count === 0
        } catch {
          // scan_history 表不存在时视为首次启动
          isFirstLaunch = true
        }
      }

      const incremental = isFirstLaunch ? false : this.dbManager.getSetting('incrementalScan', true)
      const fullScan = isFirstLaunch // 首次启动强制全盘扫描
      console.log(
        `[Startup] 开始后台自动扫描，首次启动: ${isFirstLaunch}，全盘扫描: ${fullScan}，增量模式: ${incremental}`
      )
      // 修复：读取用户在设置页配置的自定义游戏路径，原先未传导致设置失效
      const savedPaths = this.dbManager.getSetting<string[]>('knownPaths', [])
      const customKnownPaths =
        Array.isArray(savedPaths) && savedPaths.length > 0 ? savedPaths : undefined
      const result = await this.scannerManager.startScan({
        incremental,
        customKnownPaths,
        fullScan
      })
      console.log('[Startup] 扫描完成:', result)
      // 启动扫描也需发送 complete 事件，否则渲染进程的 scanProgress 会一直停留在 scanning:true
      this.mainWindow?.webContents.send('scanner:complete', result)
      if (result.success && (result.filesFound ?? 0) > 0) {
        // P1-A1：调用共享服务模块（this.ctx 在 setupIPC 中赋值，performStartupScan 在其后执行）
        // 分级调度：扫描后链式触发的缩略图生成作为低优先级任务入队
        if (this.ctx) {
          await generateThumbnailsForUnprocessed(this.ctx, 'low')
        }
      }
      // T05：扫描后异步补算 pHash（与缩略图生成解耦，避免阻塞）
      // Bug #08-F1：保留 fire-and-forget 模式（避免阻塞 autoAnalyzeSceneTime），仅 console.error → logger.error
      // 分级调度：扫描后链式触发的 pHash 补算作为低优先级任务入队
      if (this.ctx) {
        void generatePhashForUnprocessed(this.ctx, 'low').catch((e) =>
          logger.error('[pHash] 启动补算失败:', e)
        )
      }
      // 场景时段自动分析：扫描后自动分析 scene_time='unknown' 的图片
      // 基于本地缓存的图像亮度分析，避免重复扫描
      await this.autoAnalyzeSceneTime()
    } catch (error) {
      // Bug #08-F1：console.error → logger.error，统一日志渠道
      logger.error('[Startup] 自动扫描失败:', error)
      this.mainWindow?.webContents.send('scanner:complete', {
        success: false,
        message: String(error)
      })
    }
  }

  // 场景时段自动分析：启动后自动运行，分析结果写入数据库缓存
  private async autoAnalyzeSceneTime(): Promise<void> {
    try {
      const db = this.dbManager.getDatabase()
      if (!db) return

      const rows = db
        .prepare(
          "SELECT id, file_path FROM media_files WHERE scene_time = 'unknown' AND file_type = 'image' AND is_deleted = 0"
        )
        .all() as Array<{ id: number; file_path: string }>

      if (rows.length === 0) {
        console.log('[Startup] 场景时段分析：无待分析图片')
        return
      }

      console.log(`[Startup] 场景时段分析：开始分析 ${rows.length} 张图片`)
      const { analyzeSceneBrightness } = await import('./utils/scene-brightness')
      const updateStmt = db.prepare('UPDATE media_files SET scene_time = ? WHERE id = ?')

      const tasks = rows.map((row) => async () => {
        const sceneTime = await analyzeSceneBrightness(row.file_path)
        updateStmt.run(sceneTime, row.id)
      })
      await runWithConcurrency(tasks, 4)

      console.log(`[Startup] 场景时段分析：完成 ${rows.length} 张图片`)
      this.mainWindow?.webContents.send('media:updated')
    } catch (error) {
      console.error('[Startup] 场景时段分析失败:', error)
    }
  }

  // 清理无对应数据库记录的孤儿缩略图
  private async cleanupOrphanThumbnails(): Promise<void> {
    const db = this.dbManager.getDatabase()
    if (!db) return

    try {
      const thumbnailDir = this.thumbnailGen.getCacheDir()
      const entries = await fs.promises.readdir(thumbnailDir)
      if (entries.length === 0) return

      const referencedThumbnails = new Set(
        (
          db
            .prepare('SELECT thumbnail FROM media_files WHERE thumbnail IS NOT NULL')
            .all() as Array<{ thumbnail: string }>
        ).map((r) => path.resolve(r.thumbnail))
      )

      let removed = 0
      await Promise.all(
        entries.map(async (entry) => {
          const thumbPath = path.resolve(thumbnailDir, entry)
          if (!referencedThumbnails.has(thumbPath)) {
            try {
              await fs.promises.rm(thumbPath, { force: true })
              removed++
            } catch (err) {
              console.error(`[Thumbnail Cleanup] 删除孤儿缩略图失败 ${thumbPath}:`, err)
            }
          }
        })
      )

      if (removed > 0) {
        console.log(`[Thumbnail Cleanup] 清理 ${removed} 个孤儿缩略图`)
      }
    } catch (error) {
      console.error('[Thumbnail Cleanup] 清理孤儿缩略图失败:', error)
    }
  }

  // 清理失效/模拟数据，并修复损坏或缺失的缩略图
  private async cleanupAndRepairDatabase(): Promise<void> {
    const db = this.dbManager.getDatabase()
    if (!db) return

    const rows = db
      .prepare('SELECT id, file_path, file_type, thumbnail, width, height FROM media_files')
      .all() as Array<{
      id: number
      file_path: string
      file_type: string
      thumbnail: string | null
      width: number | null
      height: number | null
    }>

    let removedCount = 0
    let repairedCount = 0
    const deleteStmt = db.prepare('DELETE FROM media_files WHERE id = ?')
    const updateStmt = db.prepare(
      'UPDATE media_files SET width = ?, height = ?, thumbnail = ? WHERE id = ?'
    )

    // 第一阶段：顺序检查文件是否存在并清理失效记录（避免并发删除冲突）
    const validRows: typeof rows = []
    for (const row of rows) {
      try {
        try {
          await fs.promises.access(row.file_path, fs.constants.F_OK)
        } catch {
          deleteStmt.run(row.id)
          removedCount++
          continue
        }
        validRows.push(row)
      } catch (error) {
        console.error(`[Cleanup] 检查记录失败 id=${row.id} path=${row.file_path}:`, error)
      }
    }

    // 第二阶段：并发修复缩略图（也修复视频缩略图）
    // 仅修复缺失尺寸或缺失缩略图的记录，避免对已正常记录重复调用 sharp/ffmpeg
    const rowsToRepair = validRows.filter((row) => {
      const needsDimensions = row.width == null || row.height == null
      return needsDimensions || !row.thumbnail
    })

    const repairTasks = rowsToRepair.map((row) => async () => {
      // P1-A1：调用共享服务模块（this.ctx 在 setupIPC 中赋值，cleanupAndRepairDatabase 在其后执行）
      const success = this.ctx
        ? await processThumbnailForRow(
            this.ctx,
            { id: row.id, file_path: row.file_path, file_type: row.file_type },
            updateStmt
          )
        : false
      if (success) repairedCount++
    })
    await runWithConcurrency(repairTasks, THUMBNAIL_CONCURRENCY)

    if (removedCount > 0 || repairedCount > 0) {
      console.log(`[Cleanup] 移除 ${removedCount} 条失效记录，修复 ${repairedCount} 条缩略图记录`)
      this.mainWindow?.webContents.send('media:updated')
    }

    // 清理无对应记录的孤儿缩略图
    await this.cleanupOrphanThumbnails()
  }
}

/**
 * F5 修复：解析可写的桌面路径
 * 优先级：1) 注册表 HKCU\...\Shell Folders\Desktop（处理 OneDrive 重定向 + 自定义桌面路径）
 *         2) app.getPath('desktop')（Electron 内置）
 * 校验：路径必须存在且可写（fs.accessSync W_OK），否则尝试下一个候选
 * 返回：第一个可写的候选路径；全部不可写时返回 null
 */
async function resolveDesktopPath(): Promise<string | null> {
  const candidates: string[] = []

  // 1) 注册表自定义桌面路径（硬约束：Application must handle custom desktop paths configured via Windows registry）
  if (process.platform === 'win32') {
    const regDesktop = await regQueryDesktopPath()
    if (regDesktop) candidates.push(regDesktop)
  }

  // 2) Electron 内置桌面路径作为兜底候选
  try {
    const electronDesktop = app.getPath('desktop')
    if (electronDesktop) candidates.push(electronDesktop)
  } catch {}

  // 选第一个存在且可写的候选路径
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.W_OK)
      return candidate
    } catch {
      // 路径不存在或不可写，尝试下一个候选
    }
  }
  return null
}

/**
 * F5 修复：读取注册表 HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders\Desktop
 * 处理 REG_EXPAND_SZ 类型值（含 %USERPROFILE% 等环境变量，process.cwd 已展开）
 * 未读取到或非 Windows 平台返回 null
 */
function regQueryDesktopPath(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'reg',
      [
        'query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders',
        '/v',
        'Desktop'
      ],
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
}

// 修复：Application 构造函数中的 DatabaseManager 和 ThumbnailGenerator
// 都调用了 app.getPath('userData')，这在 app.whenReady() 之前会抛错
// （打包环境下错误为 "Cannot create app data folder before app.whenReady()"）
// 因此必须将 new Application() 延迟到 app.whenReady() 之后执行
app.whenReady().then(() => {
  const application = new Application()
  application.initialize().catch(console.error)
})
