/**
 * 扫描 worker 进程桥接层（主进程侧）
 *
 * 职责：
 * 1. 通过 utilityProcess.fork() 管理 worker 进程生命周期（惰性启动 + 退出时清理）
 * 2. 转发主进程指令到 worker（SCAN_START / SCAN_STOP / SCAN_DISPOSE）
 * 3. 接收 worker 推送的事件（SCAN_PROGRESS / SCAN_COMPLETE / SCAN_LOG / WORKER_READY / WORKER_ERROR）
 *    并分发给注册的 handler
 * 4. worker 异常退出时合成失败的 SCAN_COMPLETE 事件，避免 ScannerManager 卡在 running 状态
 *
 * 通信链路：
 *   主进程 → worker：worker.postMessage(WorkerCommand)
 *   worker → 主进程：worker.on('message', (event: WorkerEvent) => ...)
 *
 * worker-entry.js 与 index.js 同目录（dist/main/main/），通过 __dirname 解析。
 */
import { utilityProcess, type UtilityProcess } from 'electron'
import path from 'path'
import { logger } from '../utils/logger'
import type { WorkerCommand, WorkerEvent, ScanOptions } from './worker-protocol'

export class ScannerWorkerBridge {
  private worker: UtilityProcess | null = null
  private messageHandlers: ((event: WorkerEvent) => void)[] = []
  // 跟踪扫描状态：worker 异常退出时若 isScanning=true，需合成失败的 SCAN_COMPLETE
  private isScanning = false
  // worker 启动握手：等待 WORKER_READY 信号
  private readyPromise: Promise<void> | null = null
  private readyResolve: (() => void) | null = null

  /**
   * 惰性启动 worker（首次 startScan 时调用）。
   * 若 worker 已存在，直接复用（dispose 时会置 null，无需 killed 判断）。
   */
  private async ensureWorker(): Promise<void> {
    if (this.worker) return

    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve
    })

    // worker-entry.js 与 index.js 同目录（开发和打包环境均成立）
    this.worker = utilityProcess.fork(path.join(__dirname, 'worker-entry.js'), [], {
      serviceName: 'scanner-worker',
      stdio: 'pipe'
    })

    this.worker.on('message', (msg: WorkerEvent) => {
      this.handleWorkerMessage(msg)
    })

    this.worker.on('exit', (code) => {
      this.handleWorkerExit(code)
    })

    // 等待 WORKER_READY（无超时保护：worker 加载 native 模块可能耗时 1-2s）
    await this.readyPromise
  }

  /** worker 消息分发 */
  private handleWorkerMessage(msg: WorkerEvent): void {
    switch (msg.type) {
      case 'WORKER_READY':
        // worker 启动完成，解除 ensureWorker 的等待
        if (this.readyResolve) {
          this.readyResolve()
          this.readyResolve = null
        }
        break

      case 'SCAN_LOG': {
        // 转发到主进程 logger（warn/error 级别，info 级别已在 worker 内丢弃）
        const logMsg = `[ScannerWorker] ${msg.payload.message}`
        const args = msg.payload.args || []
        if (msg.payload.level === 'error') {
          logger.error(logMsg, ...args)
        } else if (msg.payload.level === 'warn') {
          logger.warn(logMsg, ...args)
        }
        break
      }

      case 'SCAN_PROGRESS':
        // 推送给所有注册的 handler（ScannerManager 订阅后会 emit 'progress' 事件）
        this.messageHandlers.forEach((h) => h(msg))
        break

      case 'SCAN_COMPLETE':
        // 扫描结束，重置状态并通知 handler
        this.isScanning = false
        this.messageHandlers.forEach((h) => h(msg))
        break

      case 'WORKER_ERROR':
        logger.error(`[ScannerWorker] 异常: ${msg.payload.message}`, msg.payload.stack ?? '')
        break
    }
  }

  /** worker 退出处理：异常退出时合成失败的 SCAN_COMPLETE */
  private handleWorkerExit(code: number): void {
    if (code !== 0) {
      logger.error(`[ScannerWorker] 异常退出，exit code=${code}`)
    }
    // 若扫描正在进行中，合成一个失败的 SCAN_COMPLETE，避免 ScannerManager 卡在 running 状态
    if (this.isScanning) {
      this.isScanning = false
      const fakeComplete: WorkerEvent = {
        type: 'SCAN_COMPLETE',
        payload: { success: false, message: '扫描进程异常退出' }
      }
      this.messageHandlers.forEach((h) => h(fakeComplete))
    }
    this.worker = null
    this.readyResolve = null
  }

  /** 发送扫描指令（SCAN_START） */
  async startScan(dbPath: string, options: ScanOptions): Promise<void> {
    await this.ensureWorker()
    this.isScanning = true
    const cmd: WorkerCommand = {
      type: 'SCAN_START',
      payload: { dbPath, options }
    }
    this.worker!.postMessage(cmd)
  }

  /** 发送停止指令（SCAN_STOP） */
  stopScan(): void {
    if (!this.worker) return
    const cmd: WorkerCommand = { type: 'SCAN_STOP' }
    this.worker.postMessage(cmd)
  }

  /**
   * 注册 worker 事件回调（progress/complete）。
   * @returns 取消订阅函数
   */
  onEvent(handler: (event: WorkerEvent) => void): () => void {
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
      const cmd: WorkerCommand = { type: 'SCAN_DISPOSE' }
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
    this.isScanning = false
    this.readyResolve = null
  }
}
