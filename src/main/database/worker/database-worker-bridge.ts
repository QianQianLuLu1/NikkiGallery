/**
 * 数据库写 worker 进程桥接层（主进程侧）
 *
 * 职责：
 * 1. 通过 utilityProcess.fork() 管理 worker 进程生命周期（惰性启动 + 退出时清理）
 * 2. 转发主进程写指令到 worker（DB_EXECUTE / DB_EXECUTE_BATCH / DB_TRANSACTION / DB_DISPOSE）
 * 3. 维护写请求队列：requestId → { resolve, reject } 的 Map
 *    worker 返回 DB_RESULT 时按 requestId 匹配并 resolve/reject 对应 Promise
 * 4. worker 异常退出时 reject 所有 pending 请求，避免调用方永久等待
 * 5. 提供 async API：execute / executeBatch / transaction / dispose
 *
 * 通信链路：
 *   主进程 → worker：worker.postMessage(DbWorkerCommand)
 *   worker → 主进程：worker.on('message', (event: DbWorkerEvent) => ...)
 *
 * 与 MediaWorkerBridge 的关系：
 * - 两个完全独立的 utilityProcess（database-worker 与 media-worker）
 * - 架构模式一致，但消息协议独立，避免任务类型耦合
 *
 * 写请求队列设计：
 * - requestId 单调递增（number），避免复用导致 Promise 错配
 * - pendingRequests: Map<requestId, { resolve, reject, sql }>
 *   保存 sql 用于错误诊断（reject 时附带原始 SQL）
 * - worker 退出时遍历 pendingRequests 全部 reject
 */
import { utilityProcess, type UtilityProcess } from 'electron'
import path from 'path'
import { logger } from '../../utils/logger'
import type {
  DbWorkerCommand,
  DbWorkerEvent,
  DbRunResult,
  DbStatement
} from './worker-protocol'

/** 写请求的 Promise 解析器（保存 sql 用于错误诊断） */
interface PendingRequest {
  resolve: (result: DbRunResult) => void
  reject: (error: Error) => void
  /** 原始 SQL（错误诊断用，DB_EXECUTE_BATCH / DB_TRANSACTION 取首条） */
  sql: string
  /** 入队时间戳（用于诊断卡死的请求） */
  enqueuedAt: number
}

export class DatabaseWorkerBridge {
  private worker: UtilityProcess | null = null
  /** 写请求队列：requestId → Promise 解析器 */
  private pendingRequests: Map<number, PendingRequest> = new Map()
  /** 单调递增的 requestId 生成器 */
  private nextRequestId = 1
  /** worker 启动握手：等待 DB_READY 信号 */
  private readyPromise: Promise<void> | null = null
  private readyResolve: (() => void) | null = null
  /** 当前已 OPEN 的 db 路径（避免重复 DB_OPEN） */
  private currentDbPath: string | null = null
  /** dispose 标志：避免 dispose 后再发起请求 */
  private isDisposed = false

  /**
   * 惰性启动 worker 并打开指定路径的数据库。
   *
   * 流程：
   * 1. fork worker（worker 立即注册 parentPort.on('message') 等待指令）
   * 2. 发送 DB_OPEN，worker 打开 DB 后回送 DB_READY
   * 3. 主进程 await readyPromise，等待 DB_READY 信号
   *
   * @param dbPath 数据库文件绝对路径
   * @returns worker 就绪后 resolve
   */
  private async ensureWorker(dbPath: string): Promise<void> {
    if (this.isDisposed) {
      throw new Error('DatabaseWorkerBridge 已 dispose，无法发起写请求')
    }

    // worker 已存在：检查 dbPath 是否变化
    if (this.worker) {
      if (this.currentDbPath !== dbPath) {
        // dbPath 变化：重新发送 DB_OPEN（worker 会先关闭旧连接再打开新路径）
        this.currentDbPath = dbPath
        const reopenCmd: DbWorkerCommand = { type: 'DB_OPEN', payload: { dbPath } }
        this.worker.postMessage(reopenCmd)
      }
      return
    }

    // 首次启动 worker：构造 readyPromise，等 worker 回送 DB_READY 后 resolve
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve
    })

    // worker-entry.js 与 bridge.js 同目录（开发和打包环境均成立）
    // 编译后 __dirname 为 dist/main/main/database/worker/，与 database-worker.js 同目录
    this.worker = utilityProcess.fork(path.join(__dirname, 'database-worker.js'), [], {
      serviceName: 'database-worker',
      stdio: 'pipe'
    })

    this.worker.on('message', (msg: DbWorkerEvent) => {
      this.handleWorkerMessage(msg)
    })

    this.worker.on('exit', (code) => {
      this.handleWorkerExit(code)
    })

    // 发送 DB_OPEN：worker 打开 DB 后回送 DB_READY
    this.currentDbPath = dbPath
    const cmd: DbWorkerCommand = { type: 'DB_OPEN', payload: { dbPath } }
    this.worker.postMessage(cmd)

    // 等待 DB_READY（无超时保护：worker 加载 better-sqlite3 native 模块可能耗时 1-2s）
    await this.readyPromise
  }

  /** worker 消息分发 */
  private handleWorkerMessage(msg: DbWorkerEvent): void {
    switch (msg.type) {
      case 'DB_READY':
        // worker 启动完成 / DB_OPEN 成功，解除 ensureWorker 的等待
        if (this.readyResolve) {
          this.readyResolve()
          this.readyResolve = null
        }
        break

      case 'DB_RESULT': {
        const { requestId, success, result, message } = msg.payload
        const pending = this.pendingRequests.get(requestId)
        if (!pending) {
          // worker 返回了已超时/已被 reject 的请求结果：忽略
          return
        }
        this.pendingRequests.delete(requestId)
        if (success) {
          pending.resolve(result ?? { changes: 0, lastInsertRowid: 0 })
        } else {
          pending.reject(
            new Error(`[DBWorker] 写操作失败: ${message ?? '未知错误'} | SQL: ${pending.sql}`)
          )
        }
        break
      }

      case 'DB_LOG': {
        const logMsg = `[DBWorker] ${msg.payload.message}`
        const args = msg.payload.args || []
        if (msg.payload.level === 'error') {
          logger.error(logMsg, ...args)
        } else if (msg.payload.level === 'warn') {
          logger.warn(logMsg, ...args)
        }
        break
      }

      case 'DB_WORKER_ERROR':
        logger.error(`[DBWorker] 异常: ${msg.payload.message}`, msg.payload.stack ?? '')
        break
    }
  }

  /** worker 退出处理：reject 所有 pending 请求 */
  private handleWorkerExit(code: number): void {
    if (code !== 0) {
      logger.error(`[DBWorker] 异常退出，exit code=${code}`)
    }
    // reject 所有未完成的写请求，避免调用方永久 await
    if (this.pendingRequests.size > 0) {
      const err = new Error(`[DBWorker] worker 进程退出（exit code=${code}），写请求被中止`)
      for (const [, pending] of this.pendingRequests) {
        try {
          pending.reject(err)
        } catch {}
      }
      this.pendingRequests.clear()
    }
    this.worker = null
    this.readyResolve = null
    this.currentDbPath = null
    // dispose 后不再恢复；非 dispose 场景下的异常退出由下次 ensureWorker 重新 fork
  }

  /** 生成下一个 requestId */
  private generateRequestId(): number {
    return this.nextRequestId++
  }

  /** 将 SQL 注册到 pending 队列，返回 Promise */
  private enqueueRequest(requestId: number, sql: string): Promise<DbRunResult> {
    return new Promise<DbRunResult>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        sql,
        enqueuedAt: Date.now()
      })
    })
  }

  /**
   * 单条写操作。
   * @param dbPath 数据库路径（用于 ensureWorker）
   * @param sql SQL 文本
   * @param params 参数数组
   */
  async execute(dbPath: string, sql: string, params?: unknown[]): Promise<DbRunResult> {
    await this.ensureWorker(dbPath)
    const requestId = this.generateRequestId()
    const promise = this.enqueueRequest(requestId, sql)
    const cmd: DbWorkerCommand = {
      type: 'DB_EXECUTE',
      payload: { requestId, statement: { sql, params } }
    }
    this.worker!.postMessage(cmd)
    return promise
  }

  /**
   * 批量写操作（不包事务）。
   * 调用方需自行评估原子性需求；需要原子性时使用 transaction。
   */
  async executeBatch(dbPath: string, statements: DbStatement[]): Promise<DbRunResult> {
    if (statements.length === 0) {
      return { changes: 0, lastInsertRowid: 0 }
    }
    await this.ensureWorker(dbPath)
    const requestId = this.generateRequestId()
    const promise = this.enqueueRequest(requestId, statements[0].sql)
    const cmd: DbWorkerCommand = {
      type: 'DB_EXECUTE_BATCH',
      payload: { requestId, statements }
    }
    this.worker!.postMessage(cmd)
    return promise
  }

  /**
   * 事务写操作（所有 statements 在同一事务中，任一失败回滚）。
   * 返回事务累积 changes；失败时 reject。
   */
  async transaction(dbPath: string, statements: DbStatement[]): Promise<DbRunResult> {
    if (statements.length === 0) {
      return { changes: 0, lastInsertRowid: 0 }
    }
    await this.ensureWorker(dbPath)
    const requestId = this.generateRequestId()
    const promise = this.enqueueRequest(requestId, statements[0].sql)
    const cmd: DbWorkerCommand = {
      type: 'DB_TRANSACTION',
      payload: { requestId, statements }
    }
    this.worker!.postMessage(cmd)
    return promise
  }

  /**
   * 主进程退出前调用：发送 DB_DISPOSE → 等待 500ms → 强制 kill。
   * worker 收到 DB_DISPOSE 后会主动 WAL checkpoint + close + exit。
   */
  async dispose(): Promise<void> {
    this.isDisposed = true
    if (!this.worker) return
    try {
      const cmd: DbWorkerCommand = { type: 'DB_DISPOSE' }
      this.worker.postMessage(cmd)
      // 给 worker 500ms 时间清理（WAL checkpoint + close）
      await new Promise((resolve) => setTimeout(resolve, 500))
    } catch {
      // postMessage 失败忽略，后续 kill 兜底
    }
    // UtilityProcess 无 killed 属性，直接调用 kill()（对已退出进程调用是安全的，try/catch 兜底）
    try {
      this.worker.kill()
    } catch {}
    this.worker = null
    this.readyResolve = null
    this.currentDbPath = null
    // dispose 后所有 pending 请求都不再有可能收到响应，reject 兜底
    if (this.pendingRequests.size > 0) {
      const err = new Error('[DBWorker] bridge disposed，写请求被中止')
      for (const [, pending] of this.pendingRequests) {
        try {
          pending.reject(err)
        } catch {}
      }
      this.pendingRequests.clear()
    }
  }
}
