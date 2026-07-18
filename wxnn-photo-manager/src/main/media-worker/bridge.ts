/**
 * media worker 进程桥接层（主进程侧）
 *
 * 职责：
 * 1. 通过 utilityProcess.fork() 管理 worker 进程生命周期（惰性启动 + 退出时清理）
 * 2. 转发主进程指令到 worker（THUMBNAIL_BATCH_START / PHASH_BATCH_START / DUPLICATE_MARK_START / *_STOP / DISPOSE）
 * 3. 接收 worker 推送的事件（*_PROGRESS / *_COMPLETE / MEDIA_WORKER_LOG / WORKER_READY / WORKER_ERROR）
 *    并分发给注册的 handler
 * 4. worker 异常退出时合成失败的 *_COMPLETE 事件，避免 Manager 卡在 running 状态
 *
 * 通信链路：
 *   主进程 → worker：worker.postMessage(MediaWorkerCommand)
 *   worker → 主进程：worker.on('message', (event: MediaWorkerEvent) => ...)
 *
 * worker-entry.js 与 index.js 同目录（dist/main/main/media-worker/），通过 __dirname 解析。
 *
 * 与 ScannerWorkerBridge 的关系：
 * - 两个完全独立的 utilityProcess（scanner-worker 与 media-worker）
 * - 架构模式一致，但消息协议独立，避免任务类型耦合
 */
import { utilityProcess, type UtilityProcess } from 'electron'
import path from 'path'
import { logger } from '../utils/logger'
import type { MediaWorkerCommand, MediaWorkerEvent, ThumbnailQuality } from './worker-protocol'

export class MediaWorkerBridge {
  private worker: UtilityProcess | null = null
  private messageHandlers: ((event: MediaWorkerEvent) => void)[] = []
  // 跟踪三类任务运行状态：worker 异常退出时若任一为 true，需合成失败的 *_COMPLETE
  private isThumbnailRunning = false
  private isPhashRunning = false
  private isDuplicateRunning = false
  // worker 启动握手：等待 WORKER_READY 信号
  private readyPromise: Promise<void> | null = null
  private readyResolve: (() => void) | null = null

  /**
   * 惰性启动 worker（首次任务时调用）。
   * 若 worker 已存在，直接复用（dispose 时会置 null）。
   */
  private async ensureWorker(): Promise<void> {
    if (this.worker) return

    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve
    })

    // worker-entry.js 与 bridge.js 同目录（开发和打包环境均成立）
    // 编译后 __dirname 为 dist/main/main/media-worker/，与 worker-entry.js 同目录
    this.worker = utilityProcess.fork(path.join(__dirname, 'worker-entry.js'), [], {
      serviceName: 'media-worker',
      stdio: 'pipe'
    })

    this.worker.on('message', (msg: MediaWorkerEvent) => {
      this.handleWorkerMessage(msg)
    })

    this.worker.on('exit', (code) => {
      this.handleWorkerExit(code)
    })

    // 等待 WORKER_READY（无超时保护：worker 加载 native 模块 sharp 可能耗时 1-2s）
    await this.readyPromise
  }

  /** worker 消息分发 */
  private handleWorkerMessage(msg: MediaWorkerEvent): void {
    switch (msg.type) {
      case 'WORKER_READY':
        // worker 启动完成，解除 ensureWorker 的等待
        if (this.readyResolve) {
          this.readyResolve()
          this.readyResolve = null
        }
        break

      case 'MEDIA_WORKER_LOG': {
        // 转发到主进程 logger（warn/error 级别，info 级别已在 worker 内丢弃）
        const logMsg = `[MediaWorker] ${msg.payload.message}`
        const args = msg.payload.args || []
        if (msg.payload.level === 'error') {
          logger.error(logMsg, ...args)
        } else if (msg.payload.level === 'warn') {
          logger.warn(logMsg, ...args)
        }
        break
      }

      case 'THUMBNAIL_PROGRESS':
      case 'THUMBNAIL_COMPLETE':
        // THUMBNAIL_COMPLETE 时重置状态
        if (msg.type === 'THUMBNAIL_COMPLETE') this.isThumbnailRunning = false
        this.messageHandlers.forEach((h) => h(msg))
        break

      case 'PHASH_PROGRESS':
      case 'PHASH_COMPLETE':
        if (msg.type === 'PHASH_COMPLETE') this.isPhashRunning = false
        this.messageHandlers.forEach((h) => h(msg))
        break

      case 'DUPLICATE_PROGRESS':
      case 'DUPLICATE_COMPLETE':
        if (msg.type === 'DUPLICATE_COMPLETE') this.isDuplicateRunning = false
        this.messageHandlers.forEach((h) => h(msg))
        break

      case 'WORKER_ERROR':
        logger.error(`[MediaWorker] 异常: ${msg.payload.message}`, msg.payload.stack ?? '')
        break
    }
  }

  /** worker 退出处理：异常退出时合成失败的 *_COMPLETE，避免 Manager 卡在 running 状态 */
  private handleWorkerExit(code: number): void {
    if (code !== 0) {
      logger.error(`[MediaWorker] 异常退出，exit code=${code}`)
    }
    // 若任一任务正在进行中，合成对应的失败 COMPLETE 事件
    if (this.isThumbnailRunning) {
      this.isThumbnailRunning = false
      const fakeComplete: MediaWorkerEvent = {
        type: 'THUMBNAIL_COMPLETE',
        payload: {
          success: false,
          message: '缩略图批量生成进程异常退出',
          processed: 0,
          total: 0
        }
      }
      this.messageHandlers.forEach((h) => h(fakeComplete))
    }
    if (this.isPhashRunning) {
      this.isPhashRunning = false
      const fakeComplete: MediaWorkerEvent = {
        type: 'PHASH_COMPLETE',
        payload: {
          success: false,
          message: 'pHash 批量补算进程异常退出',
          processed: 0,
          total: 0
        }
      }
      this.messageHandlers.forEach((h) => h(fakeComplete))
    }
    if (this.isDuplicateRunning) {
      this.isDuplicateRunning = false
      const fakeComplete: MediaWorkerEvent = {
        type: 'DUPLICATE_COMPLETE',
        payload: {
          success: false,
          message: '重复标记进程异常退出',
          markedDuplicates: 0,
          totalGroups: 0
        }
      }
      this.messageHandlers.forEach((h) => h(fakeComplete))
    }
    this.worker = null
    this.readyResolve = null
  }

  /** 发送缩略图批量生成指令 */
  async startThumbnailBatch(
    dbPath: string,
    cacheDir: string,
    thumbnailQuality: ThumbnailQuality
  ): Promise<void> {
    await this.ensureWorker()
    this.isThumbnailRunning = true
    const cmd: MediaWorkerCommand = {
      type: 'THUMBNAIL_BATCH_START',
      payload: { dbPath, cacheDir, thumbnailQuality }
    }
    this.worker!.postMessage(cmd)
  }

  /** 发送 pHash 批量补算指令 */
  async startPhashBatch(dbPath: string): Promise<void> {
    await this.ensureWorker()
    this.isPhashRunning = true
    const cmd: MediaWorkerCommand = {
      type: 'PHASH_BATCH_START',
      payload: { dbPath }
    }
    this.worker!.postMessage(cmd)
  }

  /** 发送重复标记指令 */
  async startDuplicateMark(dbPath: string): Promise<void> {
    await this.ensureWorker()
    this.isDuplicateRunning = true
    const cmd: MediaWorkerCommand = {
      type: 'DUPLICATE_MARK_START',
      payload: { dbPath }
    }
    this.worker!.postMessage(cmd)
  }

  /** 发送缩略图取消指令 */
  stopThumbnailBatch(): void {
    if (!this.worker) return
    const cmd: MediaWorkerCommand = { type: 'THUMBNAIL_STOP' }
    this.worker.postMessage(cmd)
  }

  /** 发送 pHash 取消指令 */
  stopPhashBatch(): void {
    if (!this.worker) return
    const cmd: MediaWorkerCommand = { type: 'PHASH_STOP' }
    this.worker.postMessage(cmd)
  }

  /** 发送重复标记取消指令 */
  stopDuplicateMark(): void {
    if (!this.worker) return
    const cmd: MediaWorkerCommand = { type: 'DUPLICATE_STOP' }
    this.worker.postMessage(cmd)
  }

  /**
   * 注册 worker 事件回调（progress/complete）。
   * @returns 取消订阅函数
   */
  onEvent(handler: (event: MediaWorkerEvent) => void): () => void {
    this.messageHandlers.push(handler)
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler)
    }
  }

  /**
   * 主进程退出前调用：发送 DISPOSE → 等待 500ms → 强制 kill。
   * worker 收到 DISPOSE 后会主动关闭 DB + kill 子进程 + 退出。
   */
  async dispose(): Promise<void> {
    if (!this.worker) return
    try {
      const cmd: MediaWorkerCommand = { type: 'MEDIA_WORKER_DISPOSE' }
      this.worker.postMessage(cmd)
      // 给 worker 500ms 时间清理（关闭 DB + kill 子进程）
      await new Promise((resolve) => setTimeout(resolve, 500))
    } catch {
      // postMessage 失败忽略，后续 kill 兜底
    }
    // UtilityProcess 无 killed 属性，直接调用 kill()（对已退出进程调用是安全的，try/catch 兜底）
    try {
      this.worker.kill()
    } catch {}
    this.worker = null
    this.isThumbnailRunning = false
    this.isPhashRunning = false
    this.isDuplicateRunning = false
    this.readyResolve = null
  }
}
