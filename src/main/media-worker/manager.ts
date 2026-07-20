import { EventEmitter } from 'events'
import { BrowserWindow } from 'electron'
import { MediaWorkerBridge } from './bridge'
import type { ThumbnailQuality } from './worker-protocol'

// re-export 公开类型，保持外部 import 路径不变
export type { ThumbnailQuality, MediaWorkerCommand, MediaWorkerEvent } from './worker-protocol'

/**
 * 缩略图 / pHash / 重复检测管理器（薄壳）
 *
 * 拆分到 utilityProcess 后，本类仅保留接口外壳：
 * - 通过 MediaWorkerBridge 转发任务指令到 worker 进程
 * - 接收 worker 推送的 *_PROGRESS / *_COMPLETE 事件，通过 EventEmitter 通知外部
 * - 维护三类任务的 pendingPromise，在收到 *_COMPLETE 时 resolve
 *
 * 所有 CPU 密集逻辑（sharp 缩放 / ffmpeg 抽帧 / DCT-II pHash 计算 / Union-Find 聚类）
 * 已迁移到 worker-entry.ts。
 *
 * 兼容性：startThumbnailBatch / startPhashBatch / startDuplicateMark 的返回值结构
 * 与原 thumbnail-phash-service.ts 完全一致，调用方无需修改。
 */
export class MediaWorkerManager extends EventEmitter {
  private bridge: MediaWorkerBridge
  private dbPath = ''
  // 三类任务各自的 pendingPromise resolver
  private pendingThumbnailComplete:
    | ((result: { success: boolean; message: string; processed: number; total: number }) => void)
    | null = null
  private pendingPhashComplete:
    | ((result: {
        success: boolean
        message: string
        processed: number
        total: number
        duplicatesResult?: { markedDuplicates: number; totalGroups: number }
      }) => void)
    | null = null
  private pendingDuplicateComplete:
    | ((result: {
        success: boolean
        message: string
        markedDuplicates: number
        totalGroups: number
      }) => void)
    | null = null
  // 三类任务运行标志（与 bridge 的 isXxxRunning 解耦，Manager 侧用于互斥拦截）
  private isThumbnailRunning = false
  private isPhashRunning = false
  private isDuplicateRunning = false
  private unsubscribe: (() => void) | null = null

  constructor(bridge: MediaWorkerBridge) {
    super()
    this.bridge = bridge
    this.subscribeBridgeEvents()
  }

  /** 订阅 worker 事件，转发为 EventEmitter */
  private subscribeBridgeEvents(): void {
    this.unsubscribe = this.bridge.onEvent((event) => {
      switch (event.type) {
        case 'THUMBNAIL_PROGRESS':
          this.emit('thumbnail:progress', { ...event.payload })
          break
        case 'THUMBNAIL_COMPLETE':
          this.isThumbnailRunning = false
          this.emit('thumbnail:complete', event.payload)
          if (this.pendingThumbnailComplete) {
            const resolve = this.pendingThumbnailComplete
            this.pendingThumbnailComplete = null
            resolve(event.payload)
          }
          break
        case 'PHASH_PROGRESS':
          this.emit('phash:progress', { ...event.payload })
          break
        case 'PHASH_COMPLETE':
          this.isPhashRunning = false
          this.emit('phash:complete', event.payload)
          if (this.pendingPhashComplete) {
            const resolve = this.pendingPhashComplete
            this.pendingPhashComplete = null
            resolve(event.payload)
          }
          break
        case 'DUPLICATE_PROGRESS':
          this.emit('duplicate:progress', { ...event.payload })
          break
        case 'DUPLICATE_COMPLETE':
          this.isDuplicateRunning = false
          this.emit('duplicate:complete', event.payload)
          if (this.pendingDuplicateComplete) {
            const resolve = this.pendingDuplicateComplete
            this.pendingDuplicateComplete = null
            resolve(event.payload)
          }
          break
        // MEDIA_WORKER_LOG / WORKER_READY / WORKER_ERROR 由 bridge 直接处理（写日志），无需此处转发
      }
    })
  }

  /** 推送事件到主窗口（可选订阅，渲染层不订阅也不影响功能） */
  private broadcastToMainWindow(channel: string, data: unknown): void {
    try {
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send(channel, data)
        }
      }
    } catch {
      // 窗口可能已关闭，忽略
    }
  }

  /**
   * 启动缩略图批量生成。
   * 调用方式与原 generateThumbnailsForUnprocessed 一致：返回 Promise 在任务完成时 resolve。
   */
  async startThumbnailBatch(params: {
    cacheDir: string
    thumbnailQuality?: ThumbnailQuality
  }): Promise<{ success: boolean; message: string; processed: number; total: number }> {
    if (this.isThumbnailRunning) {
      return { success: false, message: '缩略图批量生成已在进行中', processed: 0, total: 0 }
    }
    if (!this.dbPath) {
      return { success: false, message: '数据库路径未初始化', processed: 0, total: 0 }
    }

    this.isThumbnailRunning = true

    // 发送任务，等待 THUMBNAIL_COMPLETE
    return new Promise((resolve) => {
      this.pendingThumbnailComplete = resolve
      this.bridge
        .startThumbnailBatch(this.dbPath, params.cacheDir, params.thumbnailQuality ?? 'standard')
        .catch((err) => {
          // worker 启动失败或 postMessage 失败
          if (this.pendingThumbnailComplete) {
            const r = this.pendingThumbnailComplete
            this.pendingThumbnailComplete = null
            this.isThumbnailRunning = false
            r({
              success: false,
              message: `缩略图批量生成启动失败: ${
                err instanceof Error ? err.message : String(err)
              }`,
              processed: 0,
              total: 0
            })
          }
        })
    })
  }

  /**
   * 启动 pHash 批量补算（含链式 markDuplicates）。
   * 返回值结构与原 generatePhashForUnprocessed 一致。
   */
  async startPhashBatch(): Promise<{
    success: boolean
    message: string
    processed: number
    total: number
    duplicatesResult?: { markedDuplicates: number; totalGroups: number }
  }> {
    if (this.isPhashRunning) {
      return {
        success: false,
        message: 'pHash 批量补算已在进行中',
        processed: 0,
        total: 0
      }
    }
    if (!this.dbPath) {
      return { success: false, message: '数据库路径未初始化', processed: 0, total: 0 }
    }

    this.isPhashRunning = true

    return new Promise((resolve) => {
      this.pendingPhashComplete = resolve
      this.bridge.startPhashBatch(this.dbPath).catch((err) => {
        if (this.pendingPhashComplete) {
          const r = this.pendingPhashComplete
          this.pendingPhashComplete = null
          this.isPhashRunning = false
          r({
            success: false,
            message: `pHash 批量补算启动失败: ${err instanceof Error ? err.message : String(err)}`,
            processed: 0,
            total: 0
          })
        }
      })
    })
  }

  /**
   * 启动重复标记（手动触发）。
   * 返回值结构与原 markDuplicates 一致。
   */
  async startDuplicateMark(): Promise<{
    success: boolean
    message: string
    markedDuplicates: number
    totalGroups: number
  }> {
    if (this.isDuplicateRunning) {
      return {
        success: false,
        message: '重复标记已在进行中',
        markedDuplicates: 0,
        totalGroups: 0
      }
    }
    if (!this.dbPath) {
      return {
        success: false,
        message: '数据库路径未初始化',
        markedDuplicates: 0,
        totalGroups: 0
      }
    }

    this.isDuplicateRunning = true

    return new Promise((resolve) => {
      this.pendingDuplicateComplete = resolve
      this.bridge.startDuplicateMark(this.dbPath).catch((err) => {
        if (this.pendingDuplicateComplete) {
          const r = this.pendingDuplicateComplete
          this.pendingDuplicateComplete = null
          this.isDuplicateRunning = false
          r({
            success: false,
            message: `重复标记启动失败: ${err instanceof Error ? err.message : String(err)}`,
            markedDuplicates: 0,
            totalGroups: 0
          })
        }
      })
    })
  }

  /** 取消缩略图批量生成 */
  stopThumbnailBatch(): void {
    this.bridge.stopThumbnailBatch()
  }

  /** 取消 pHash 批量补算 */
  stopPhashBatch(): void {
    this.bridge.stopPhashBatch()
  }

  /** 取消重复标记 */
  stopDuplicateMark(): void {
    this.bridge.stopDuplicateMark()
  }

  /** 缩略图任务是否运行中 */
  isThumbnailBatchRunning(): boolean {
    return this.isThumbnailRunning
  }

  /** pHash 任务是否运行中 */
  isPhashBatchRunning(): boolean {
    return this.isPhashRunning
  }

  /** 重复标记任务是否运行中 */
  isDuplicateMarkRunning(): boolean {
    return this.isDuplicateRunning
  }

  /**
   * 注入数据库路径。
   * worker 进程通过此路径独立打开 better-sqlite3 连接（与主进程 DatabaseManager 共享同一 db 文件）。
   * 由 Application 在 dbManager.initialize 之后调用。
   */
  setDbPath(dbPath: string): void {
    this.dbPath = dbPath
  }
}
