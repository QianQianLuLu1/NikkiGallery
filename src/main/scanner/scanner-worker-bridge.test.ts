/**
 * ScannerWorkerBridge 单元测试
 *
 * 测试目标：src/main/scanner/scanner-worker-bridge.ts
 * 测试层级：L2（依赖 mock，无真实 worker 进程）
 *
 * Mock 策略：
 * - electron.utilityProcess.fork → 返回 EventEmitter 模拟 worker
 * - ../utils/logger → vi.fn() 捕获调用
 *
 * 测试覆盖：
 * - startScan：惰性启动、复用 worker、发送 SCAN_START
 * - stopScan：发送 SCAN_STOP、worker 为 null 时静默返回
 * - onEvent：订阅 / 取消订阅
 * - handleWorkerMessage：WORKER_READY / SCAN_LOG / SCAN_PROGRESS / SCAN_COMPLETE / WORKER_ERROR
 * - handleWorkerExit：正常退出、异常退出、扫描中退出合成 fakeComplete
 * - dispose：发送 DISPOSE、等待 500ms、kill、异常容错
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import type { UtilityProcess } from 'electron'

// ---- Mock electron ----
const mockFork = vi.fn()
vi.mock('electron', () => ({
  utilityProcess: {
    fork: (...args: unknown[]) => mockFork(...args)
  }
}))

// ---- Mock logger ----
const mockLoggerError = vi.fn()
const mockLoggerWarn = vi.fn()
vi.mock('../utils/logger', () => ({
  logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    info: vi.fn(),
    debug: vi.fn(),
    fault: vi.fn()
  }
}))

import { ScannerWorkerBridge } from './scanner-worker-bridge'

/**
 * 创建模拟 worker 对象（EventEmitter + postMessage + kill）
 */
function createMockWorker(): UtilityProcess & { postMessage: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn> } {
  const emitter = new EventEmitter() as unknown as UtilityProcess & {
    postMessage: ReturnType<typeof vi.fn>
    kill: ReturnType<typeof vi.fn>
  }
  emitter.postMessage = vi.fn()
  emitter.kill = vi.fn()
  return emitter
}

describe('ScannerWorkerBridge', () => {
  let bridge: ScannerWorkerBridge
  let mockWorker: ReturnType<typeof createMockWorker>

  beforeEach(() => {
    vi.clearAllMocks()
    mockFork.mockReset()
    mockWorker = createMockWorker()
    mockFork.mockReturnValue(mockWorker)
    bridge = new ScannerWorkerBridge()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ============ startScan ============
  describe('startScan', () => {
    it('首次调用应通过 utilityProcess.fork 惰性启动 worker', async () => {
      // 触发 fork 但先不让 ready 完成
      const startPromise = bridge.startScan('/db/path', { incremental: true })
      // fork 已被调用
      expect(mockFork).toHaveBeenCalledTimes(1)
      // 释放 await
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await startPromise
    })

    it('fork 时应使用 serviceName=scanner-worker 与 stdio=pipe', async () => {
      const startPromise = bridge.startScan('/db/path', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await startPromise

      expect(mockFork).toHaveBeenCalledWith(
        expect.stringContaining('worker-entry.js'),
        [],
        { serviceName: 'scanner-worker', stdio: 'pipe' }
      )
    })

    it('已有 worker 时应复用，不重复 fork', async () => {
      const p1 = bridge.startScan('/db/path', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p1

      // 第二次调用不应再次 fork
      await bridge.startScan('/db/path', {})
      expect(mockFork).toHaveBeenCalledTimes(1)
    })

    it('应发送 SCAN_START 命令并携带 dbPath 与 options', async () => {
      const p = bridge.startScan('/db/path', { incremental: true, fullScan: false })
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      expect(mockWorker.postMessage).toHaveBeenCalledWith({
        type: 'SCAN_START',
        payload: { dbPath: '/db/path', options: { incremental: true, fullScan: false } }
      })
    })

    it('WORKER_READY 后应清空 readyResolve', async () => {
      const p = bridge.startScan('/db/path', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p
      // 重复 WORKER_READY 不应报错（readyResolve 已 null）
      expect(() => mockWorker.emit('message', { type: 'WORKER_READY' })).not.toThrow()
    })
  })

  // ============ stopScan ============
  describe('stopScan', () => {
    it('应向 worker 发送 SCAN_STOP 命令', async () => {
      const p = bridge.startScan('/db/path', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      bridge.stopScan()
      expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'SCAN_STOP' })
    })

    it('worker 为 null 时应静默返回不抛错', () => {
      expect(() => bridge.stopScan()).not.toThrow()
      expect(mockWorker.postMessage).not.toHaveBeenCalled()
    })
  })

  // ============ onEvent ============
  describe('onEvent', () => {
    it('注册的 handler 应收到 SCAN_PROGRESS 事件', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)

      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      const progressEvent = {
        type: 'SCAN_PROGRESS' as const,
        payload: { scanned: 10, found: 5, status: 'running' as const }
      }
      mockWorker.emit('message', progressEvent)
      expect(handler).toHaveBeenCalledWith(progressEvent)
    })

    it('注册的 handler 应收到 SCAN_COMPLETE 事件', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)

      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      const completeEvent = {
        type: 'SCAN_COMPLETE' as const,
        payload: { success: true, message: 'done', filesFound: 5 }
      }
      mockWorker.emit('message', completeEvent)
      expect(handler).toHaveBeenCalledWith(completeEvent)
    })

    it('SCAN_COMPLETE 后应重置 isScanning 状态（不再合成 fakeComplete）', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)

      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      // 正常 COMPLETE
      mockWorker.emit('message', {
        type: 'SCAN_COMPLETE',
        payload: { success: true, message: 'done' }
      })
      expect(handler).toHaveBeenCalledTimes(1)

      // 此后 worker 异常退出不应再合成 fakeComplete
      mockWorker.emit('exit', 1)
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('取消订阅后 handler 不应再收到事件', async () => {
      const handler = vi.fn()
      const unsubscribe = bridge.onEvent(handler)

      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      unsubscribe()
      mockWorker.emit('message', {
        type: 'SCAN_PROGRESS',
        payload: { scanned: 1, found: 0, status: 'running' }
      })
      expect(handler).not.toHaveBeenCalled()
    })

    it('多个 handler 应都被通知', async () => {
      const h1 = vi.fn()
      const h2 = vi.fn()
      bridge.onEvent(h1)
      bridge.onEvent(h2)

      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      mockWorker.emit('message', {
        type: 'SCAN_PROGRESS',
        payload: { scanned: 1, found: 0, status: 'running' }
      })
      expect(h1).toHaveBeenCalledTimes(1)
      expect(h2).toHaveBeenCalledTimes(1)
    })
  })

  // ============ SCAN_LOG 消息分发 ============
  describe('SCAN_LOG 消息分发', () => {
    it('error 级别应调用 logger.error', async () => {
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      mockWorker.emit('message', {
        type: 'SCAN_LOG',
        payload: { level: 'error', message: 'something broke', args: ['ctx'] }
      })
      expect(mockLoggerError).toHaveBeenCalledWith('[ScannerWorker] something broke', 'ctx')
    })

    it('warn 级别应调用 logger.warn', async () => {
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      mockWorker.emit('message', {
        type: 'SCAN_LOG',
        payload: { level: 'warn', message: 'be careful' }
      })
      expect(mockLoggerWarn).toHaveBeenCalledWith('[ScannerWorker] be careful')
    })

    it('warn 级别无 args 时不传额外参数', async () => {
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      mockWorker.emit('message', {
        type: 'SCAN_LOG',
        payload: { level: 'warn', message: 'no args' }
      })
      expect(mockLoggerWarn).toHaveBeenCalledWith('[ScannerWorker] no args')
    })

    it('info 级别应被忽略（不调用 logger.error/warn）', async () => {
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      mockWorker.emit('message', {
        type: 'SCAN_LOG',
        payload: { level: 'info', message: 'just info' }
      })
      expect(mockLoggerError).not.toHaveBeenCalled()
      expect(mockLoggerWarn).not.toHaveBeenCalled()
    })

    it('args 为 undefined 时应按空数组处理', async () => {
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      mockWorker.emit('message', {
        type: 'SCAN_LOG',
        payload: { level: 'error', message: 'err' }
      })
      expect(mockLoggerError).toHaveBeenCalledWith('[ScannerWorker] err')
    })
  })

  // ============ WORKER_ERROR 消息 ============
  describe('WORKER_ERROR 消息', () => {
    it('应调用 logger.error 并附带 stack', async () => {
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      mockWorker.emit('message', {
        type: 'WORKER_ERROR',
        payload: { message: 'crashed', stack: 'Error: crashed\n  at ...' }
      })
      expect(mockLoggerError).toHaveBeenCalledWith(
        '[ScannerWorker] 异常: crashed',
        'Error: crashed\n  at ...'
      )
    })

    it('stack 缺失时应传空字符串', async () => {
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      mockWorker.emit('message', {
        type: 'WORKER_ERROR',
        payload: { message: 'no stack' }
      })
      expect(mockLoggerError).toHaveBeenCalledWith('[ScannerWorker] 异常: no stack', '')
    })
  })

  // ============ handleWorkerExit ============
  describe('handleWorkerExit', () => {
    it('正常退出 code=0 不应记录错误日志', async () => {
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      // 先完成扫描，避免合成 fakeComplete
      mockWorker.emit('message', {
        type: 'SCAN_COMPLETE',
        payload: { success: true, message: 'done' }
      })

      mockWorker.emit('exit', 0)
      expect(mockLoggerError).not.toHaveBeenCalled()
    })

    it('异常退出 code!=0 应记录错误日志', async () => {
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      mockWorker.emit('message', {
        type: 'SCAN_COMPLETE',
        payload: { success: true, message: 'done' }
      })

      mockWorker.emit('exit', 1)
      expect(mockLoggerError).toHaveBeenCalledWith('[ScannerWorker] 异常退出，exit code=1')
    })

    it('扫描中异常退出应合成失败的 SCAN_COMPLETE 事件', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)

      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p
      // 此时 isScanning=true，未发送 SCAN_COMPLETE

      mockWorker.emit('exit', 1)
      expect(handler).toHaveBeenCalledWith({
        type: 'SCAN_COMPLETE',
        payload: { success: false, message: '扫描进程异常退出' }
      })
    })

    it('扫描中异常退出后 isScanning 应重置（再次退出不重复合成）', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)

      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      mockWorker.emit('exit', 1)
      expect(handler).toHaveBeenCalledTimes(1)

      // 再次 exit 不应重复合成
      mockWorker.emit('exit', 1)
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('未启动扫描时 worker 退出不应合成 fakeComplete', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)

      // 直接构造一个 worker 但不调用 startScan
      // 通过反射调用 ensureWorker 不现实，改用：startScan 后立即 COMPLETE，再 exit
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      // 正常 COMPLETE 会让 handler 被调用一次
      mockWorker.emit('message', {
        type: 'SCAN_COMPLETE',
        payload: { success: true, message: 'done' }
      })
      expect(handler).toHaveBeenCalledTimes(1)
      // isScanning 已重置为 false，exit 不应再合成 fakeComplete
      mockWorker.emit('exit', 1)
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('退出后 worker 应被置 null（stopScan 不再 postMessage）', async () => {
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      mockWorker.postMessage.mockClear()
      mockWorker.emit('exit', 0)
      bridge.stopScan()
      expect(mockWorker.postMessage).not.toHaveBeenCalled()
    })
  })

  // ============ dispose ============
  describe('dispose', () => {
    it('worker 为 null 时应直接返回', async () => {
      await bridge.dispose()
      expect(mockFork).not.toHaveBeenCalled()
    })

    it('应发送 SCAN_DISPOSE 命令', async () => {
      vi.useFakeTimers()
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      const disposePromise = bridge.dispose()
      expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'SCAN_DISPOSE' })
      vi.advanceTimersByTime(500)
      await disposePromise
    })

    it('应在发送 DISPOSE 后等待 500ms 再 kill', async () => {
      vi.useFakeTimers()
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      const disposePromise = bridge.dispose()
      // 此时还未 kill
      expect(mockWorker.kill).not.toHaveBeenCalled()
      vi.advanceTimersByTime(499)
      expect(mockWorker.kill).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      await disposePromise
      expect(mockWorker.kill).toHaveBeenCalledTimes(1)
    })

    it('完成后 worker 应置 null', async () => {
      vi.useFakeTimers()
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      const disposePromise = bridge.dispose()
      vi.advanceTimersByTime(500)
      await disposePromise

      // 验证 worker 已置 null：stopScan 不应调用 postMessage
      mockWorker.postMessage.mockClear()
      bridge.stopScan()
      expect(mockWorker.postMessage).not.toHaveBeenCalled()
    })

    it('完成后 isScanning 应重置（exit 不再合成 fakeComplete）', async () => {
      vi.useFakeTimers()
      const handler = vi.fn()
      bridge.onEvent(handler)

      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      const disposePromise = bridge.dispose()
      vi.advanceTimersByTime(500)
      await disposePromise

      mockWorker.emit('exit', 1)
      expect(handler).not.toHaveBeenCalled()
    })

    it('postMessage 失败时应继续 kill 兜底', async () => {
      vi.useFakeTimers()
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      mockWorker.postMessage.mockImplementation(() => {
        throw new Error('postMessage failed')
      })

      const disposePromise = bridge.dispose()
      vi.advanceTimersByTime(500)
      await disposePromise
      expect(mockWorker.kill).toHaveBeenCalledTimes(1)
    })

    it('kill 失败时应静默忽略不抛错', async () => {
      vi.useFakeTimers()
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      mockWorker.kill.mockImplementation(() => {
        throw new Error('kill failed')
      })

      const disposePromise = bridge.dispose()
      vi.advanceTimersByTime(500)
      await expect(disposePromise).resolves.toBeUndefined()
    })

    it('完成后 readyResolve 应清空', async () => {
      vi.useFakeTimers()
      const p = bridge.startScan('/db', {})
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      const disposePromise = bridge.dispose()
      vi.advanceTimersByTime(500)
      await disposePromise

      // 再次 dispose 不应报错
      await bridge.dispose()
    })
  })
})
