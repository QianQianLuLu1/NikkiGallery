/**
 * MediaWorkerBridge 单元测试
 *
 * 测试目标：src/main/media-worker/bridge.ts
 * 测试层级：L2（依赖 mock，无真实 worker 进程）
 *
 * Mock 策略：
 * - electron.utilityProcess.fork → 返回 EventEmitter 模拟 worker
 * - ../utils/logger → vi.fn() 捕获调用
 *
 * 测试覆盖：
 * - startThumbnailBatch / startPhashBatch / startDuplicateMark：惰性启动 + 发送命令 + 设置运行状态
 * - stopThumbnailBatch / stopPhashBatch / stopDuplicateMark：发送 STOP、worker 为 null 时静默返回
 * - onEvent：订阅 / 取消订阅 / 多 handler
 * - handleWorkerMessage：WORKER_READY / MEDIA_WORKER_LOG / 三类 PROGRESS / 三类 COMPLETE / WORKER_ERROR
 * - handleWorkerExit：正常/异常退出、三类任务运行中合成 fakeComplete
 * - dispose：DISPOSE → 500ms → kill、异常容错
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

import { MediaWorkerBridge } from './bridge'

/**
 * 创建模拟 worker 对象（EventEmitter + postMessage + kill）
 */
function createMockWorker(): UtilityProcess & {
  postMessage: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
} {
  const emitter = new EventEmitter() as unknown as UtilityProcess & {
    postMessage: ReturnType<typeof vi.fn>
    kill: ReturnType<typeof vi.fn>
  }
  emitter.postMessage = vi.fn()
  emitter.kill = vi.fn()
  return emitter
}

describe('MediaWorkerBridge', () => {
  let bridge: MediaWorkerBridge
  let mockWorker: ReturnType<typeof createMockWorker>

  beforeEach(() => {
    vi.clearAllMocks()
    mockFork.mockReset()
    mockWorker = createMockWorker()
    mockFork.mockReturnValue(mockWorker)
    bridge = new MediaWorkerBridge()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // 辅助：触发 worker 启动握手
  async function readyWorker() {
    const p = bridge.startThumbnailBatch('/db', '/cache', 'standard')
    mockWorker.emit('message', { type: 'WORKER_READY' })
    await p
    mockWorker.postMessage.mockClear()
  }

  // ============ startThumbnailBatch ============
  describe('startThumbnailBatch', () => {
    it('首次调用应通过 utilityProcess.fork 惰性启动 worker', async () => {
      const p = bridge.startThumbnailBatch('/db', '/cache', 'standard')
      expect(mockFork).toHaveBeenCalledTimes(1)
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p
    })

    it('fork 时应使用 serviceName=media-worker 与 stdio=pipe', async () => {
      const p = bridge.startThumbnailBatch('/db', '/cache', 'standard')
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      expect(mockFork).toHaveBeenCalledWith(
        expect.stringContaining('worker-entry.js'),
        [],
        { serviceName: 'media-worker', stdio: 'pipe' }
      )
    })

    it('应发送 THUMBNAIL_BATCH_START 命令携带 dbPath/cacheDir/quality', async () => {
      const p = bridge.startThumbnailBatch('/db/path', '/cache/dir', 'high')
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      expect(mockWorker.postMessage).toHaveBeenCalledWith({
        type: 'THUMBNAIL_BATCH_START',
        payload: { dbPath: '/db/path', cacheDir: '/cache/dir', thumbnailQuality: 'high' }
      })
    })

    it('已有 worker 时应复用不重复 fork', async () => {
      const p1 = bridge.startThumbnailBatch('/db', '/cache', 'standard')
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p1

      mockFork.mockClear()
      await bridge.startThumbnailBatch('/db', '/cache', 'low')
      expect(mockFork).not.toHaveBeenCalled()
    })
  })

  // ============ startPhashBatch ============
  describe('startPhashBatch', () => {
    it('应发送 PHASH_BATCH_START 命令携带 dbPath', async () => {
      const p = bridge.startPhashBatch('/db/path')
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      expect(mockWorker.postMessage).toHaveBeenCalledWith({
        type: 'PHASH_BATCH_START',
        payload: { dbPath: '/db/path' }
      })
    })

    it('已有 worker 时应复用不重复 fork', async () => {
      const p1 = bridge.startThumbnailBatch('/db', '/cache', 'standard')
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p1

      mockFork.mockClear()
      await bridge.startPhashBatch('/db')
      expect(mockFork).not.toHaveBeenCalled()
    })
  })

  // ============ startDuplicateMark ============
  describe('startDuplicateMark', () => {
    it('应发送 DUPLICATE_MARK_START 命令携带 dbPath', async () => {
      const p = bridge.startDuplicateMark('/db/path')
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      expect(mockWorker.postMessage).toHaveBeenCalledWith({
        type: 'DUPLICATE_MARK_START',
        payload: { dbPath: '/db/path' }
      })
    })

    it('已有 worker 时应复用不重复 fork', async () => {
      const p1 = bridge.startThumbnailBatch('/db', '/cache', 'standard')
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p1

      mockFork.mockClear()
      await bridge.startDuplicateMark('/db')
      expect(mockFork).not.toHaveBeenCalled()
    })
  })

  // ============ stopThumbnailBatch / stopPhashBatch / stopDuplicateMark ============
  describe('stopThumbnailBatch', () => {
    it('应发送 THUMBNAIL_STOP 命令', async () => {
      await readyWorker()
      bridge.stopThumbnailBatch()
      expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'THUMBNAIL_STOP' })
    })

    it('worker 为 null 时应静默返回', () => {
      expect(() => bridge.stopThumbnailBatch()).not.toThrow()
      expect(mockWorker.postMessage).not.toHaveBeenCalled()
    })
  })

  describe('stopPhashBatch', () => {
    it('应发送 PHASH_STOP 命令', async () => {
      await readyWorker()
      bridge.stopPhashBatch()
      expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'PHASH_STOP' })
    })

    it('worker 为 null 时应静默返回', () => {
      expect(() => bridge.stopPhashBatch()).not.toThrow()
      expect(mockWorker.postMessage).not.toHaveBeenCalled()
    })
  })

  describe('stopDuplicateMark', () => {
    it('应发送 DUPLICATE_STOP 命令', async () => {
      await readyWorker()
      bridge.stopDuplicateMark()
      expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'DUPLICATE_STOP' })
    })

    it('worker 为 null 时应静默返回', () => {
      expect(() => bridge.stopDuplicateMark()).not.toThrow()
      expect(mockWorker.postMessage).not.toHaveBeenCalled()
    })
  })

  // ============ onEvent ============
  describe('onEvent', () => {
    it('注册的 handler 应收到 THUMBNAIL_PROGRESS 事件', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)
      await readyWorker()

      const evt = {
        type: 'THUMBNAIL_PROGRESS' as const,
        payload: { processed: 1, total: 10, currentFile: '/path/a.jpg' }
      }
      mockWorker.emit('message', evt)
      expect(handler).toHaveBeenCalledWith(evt)
    })

    it('注册的 handler 应收到 THUMBNAIL_COMPLETE 事件', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)
      await readyWorker()

      const evt = {
        type: 'THUMBNAIL_COMPLETE' as const,
        payload: { success: true, message: 'done', processed: 10, total: 10 }
      }
      mockWorker.emit('message', evt)
      expect(handler).toHaveBeenCalledWith(evt)
    })

    it('注册的 handler 应收到 PHASH_PROGRESS 事件', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)
      await readyWorker()

      const evt = {
        type: 'PHASH_PROGRESS' as const,
        payload: { processed: 2, total: 5, currentFile: '/path/b.jpg' }
      }
      mockWorker.emit('message', evt)
      expect(handler).toHaveBeenCalledWith(evt)
    })

    it('注册的 handler 应收到 PHASH_COMPLETE 事件', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)
      await readyWorker()

      const evt = {
        type: 'PHASH_COMPLETE' as const,
        payload: {
          success: true,
          message: 'done',
          processed: 5,
          total: 5,
          duplicatesResult: { markedDuplicates: 2, totalGroups: 1 }
        }
      }
      mockWorker.emit('message', evt)
      expect(handler).toHaveBeenCalledWith(evt)
    })

    it('注册的 handler 应收到 DUPLICATE_PROGRESS 事件', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)
      await readyWorker()

      const evt = {
        type: 'DUPLICATE_PROGRESS' as const,
        payload: { compared: 100, totalPairs: 1000 }
      }
      mockWorker.emit('message', evt)
      expect(handler).toHaveBeenCalledWith(evt)
    })

    it('注册的 handler 应收到 DUPLICATE_COMPLETE 事件', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)
      await readyWorker()

      const evt = {
        type: 'DUPLICATE_COMPLETE' as const,
        payload: { success: true, message: 'done', markedDuplicates: 3, totalGroups: 2 }
      }
      mockWorker.emit('message', evt)
      expect(handler).toHaveBeenCalledWith(evt)
    })

    it('取消订阅后 handler 不应再收到事件', async () => {
      const handler = vi.fn()
      const unsubscribe = bridge.onEvent(handler)
      await readyWorker()

      unsubscribe()
      mockWorker.emit('message', {
        type: 'THUMBNAIL_PROGRESS',
        payload: { processed: 1, total: 10, currentFile: '/path/a.jpg' }
      })
      expect(handler).not.toHaveBeenCalled()
    })

    it('多个 handler 应都被通知', async () => {
      const h1 = vi.fn()
      const h2 = vi.fn()
      bridge.onEvent(h1)
      bridge.onEvent(h2)
      await readyWorker()

      mockWorker.emit('message', {
        type: 'THUMBNAIL_PROGRESS',
        payload: { processed: 1, total: 10, currentFile: '/a.jpg' }
      })
      expect(h1).toHaveBeenCalledTimes(1)
      expect(h2).toHaveBeenCalledTimes(1)
    })

    it('THUMBNAIL_COMPLETE 后 isThumbnailRunning 应重置', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)
      await readyWorker()

      mockWorker.emit('message', {
        type: 'THUMBNAIL_COMPLETE',
        payload: { success: true, message: 'done', processed: 1, total: 1 }
      })
      expect(handler).toHaveBeenCalledTimes(1)

      // worker 异常退出不应再合成 fakeComplete
      mockWorker.emit('exit', 1)
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('PHASH_COMPLETE 后 isPhashRunning 应重置', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)

      const p = bridge.startPhashBatch('/db')
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p
      mockWorker.postMessage.mockClear()

      mockWorker.emit('message', {
        type: 'PHASH_COMPLETE',
        payload: { success: true, message: 'done', processed: 1, total: 1 }
      })
      expect(handler).toHaveBeenCalledTimes(1)

      mockWorker.emit('exit', 1)
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('DUPLICATE_COMPLETE 后 isDuplicateRunning 应重置', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)

      const p = bridge.startDuplicateMark('/db')
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p
      mockWorker.postMessage.mockClear()

      mockWorker.emit('message', {
        type: 'DUPLICATE_COMPLETE',
        payload: { success: true, message: 'done', markedDuplicates: 0, totalGroups: 0 }
      })
      expect(handler).toHaveBeenCalledTimes(1)

      mockWorker.emit('exit', 1)
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  // ============ MEDIA_WORKER_LOG 消息分发 ============
  describe('MEDIA_WORKER_LOG 消息分发', () => {
    it('error 级别应调用 logger.error', async () => {
      await readyWorker()
      mockWorker.emit('message', {
        type: 'MEDIA_WORKER_LOG',
        payload: { level: 'error', message: 'something broke', args: ['ctx'] }
      })
      expect(mockLoggerError).toHaveBeenCalledWith('[MediaWorker] something broke', 'ctx')
    })

    it('warn 级别应调用 logger.warn', async () => {
      await readyWorker()
      mockWorker.emit('message', {
        type: 'MEDIA_WORKER_LOG',
        payload: { level: 'warn', message: 'be careful' }
      })
      expect(mockLoggerWarn).toHaveBeenCalledWith('[MediaWorker] be careful')
    })

    it('warn 级别无 args 时不传额外参数', async () => {
      await readyWorker()
      mockWorker.emit('message', {
        type: 'MEDIA_WORKER_LOG',
        payload: { level: 'warn', message: 'no args' }
      })
      expect(mockLoggerWarn).toHaveBeenCalledWith('[MediaWorker] no args')
    })

    it('info 级别应被忽略', async () => {
      await readyWorker()
      mockWorker.emit('message', {
        type: 'MEDIA_WORKER_LOG',
        payload: { level: 'info', message: 'just info' }
      })
      expect(mockLoggerError).not.toHaveBeenCalled()
      expect(mockLoggerWarn).not.toHaveBeenCalled()
    })

    it('args 为 undefined 时应按空数组处理', async () => {
      await readyWorker()
      mockWorker.emit('message', {
        type: 'MEDIA_WORKER_LOG',
        payload: { level: 'error', message: 'err' }
      })
      expect(mockLoggerError).toHaveBeenCalledWith('[MediaWorker] err')
    })
  })

  // ============ WORKER_ERROR 消息 ============
  describe('WORKER_ERROR 消息', () => {
    it('应调用 logger.error 并附带 stack', async () => {
      await readyWorker()
      mockWorker.emit('message', {
        type: 'WORKER_ERROR',
        payload: { message: 'crashed', stack: 'Error: crashed\n  at ...' }
      })
      expect(mockLoggerError).toHaveBeenCalledWith(
        '[MediaWorker] 异常: crashed',
        'Error: crashed\n  at ...'
      )
    })

    it('stack 缺失时应传空字符串', async () => {
      await readyWorker()
      mockWorker.emit('message', {
        type: 'WORKER_ERROR',
        payload: { message: 'no stack' }
      })
      expect(mockLoggerError).toHaveBeenCalledWith('[MediaWorker] 异常: no stack', '')
    })
  })

  // ============ handleWorkerExit ============
  describe('handleWorkerExit', () => {
    it('正常退出 code=0 不应记录错误日志', async () => {
      await readyWorker()
      // 先完成所有任务（避免合成 fakeComplete）
      mockWorker.emit('message', {
        type: 'THUMBNAIL_COMPLETE',
        payload: { success: true, message: 'done', processed: 0, total: 0 }
      })
      mockWorker.emit('exit', 0)
      expect(mockLoggerError).not.toHaveBeenCalled()
    })

    it('异常退出 code!=0 应记录错误日志', async () => {
      await readyWorker()
      mockWorker.emit('message', {
        type: 'THUMBNAIL_COMPLETE',
        payload: { success: true, message: 'done', processed: 0, total: 0 }
      })
      mockWorker.emit('exit', 1)
      expect(mockLoggerError).toHaveBeenCalledWith('[MediaWorker] 异常退出，exit code=1')
    })

    it('缩略图任务运行中退出应合成失败的 THUMBNAIL_COMPLETE', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)
      await readyWorker()
      // 此时 isThumbnailRunning=true

      mockWorker.emit('exit', 1)
      expect(handler).toHaveBeenCalledWith({
        type: 'THUMBNAIL_COMPLETE',
        payload: {
          success: false,
          message: '缩略图批量生成进程异常退出',
          processed: 0,
          total: 0
        }
      })
    })

    it('pHash 任务运行中退出应合成失败的 PHASH_COMPLETE', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)

      const p = bridge.startPhashBatch('/db')
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      mockWorker.emit('exit', 1)
      expect(handler).toHaveBeenCalledWith({
        type: 'PHASH_COMPLETE',
        payload: {
          success: false,
          message: 'pHash 批量补算进程异常退出',
          processed: 0,
          total: 0
        }
      })
    })

    it('重复标记任务运行中退出应合成失败的 DUPLICATE_COMPLETE', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)

      const p = bridge.startDuplicateMark('/db')
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p

      mockWorker.emit('exit', 1)
      expect(handler).toHaveBeenCalledWith({
        type: 'DUPLICATE_COMPLETE',
        payload: {
          success: false,
          message: '重复标记进程异常退出',
          markedDuplicates: 0,
          totalGroups: 0
        }
      })
    })

    it('三类任务同时运行中退出应合成三个 fakeComplete', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)

      // 依次启动三类任务（复用同一 worker）
      const p1 = bridge.startThumbnailBatch('/db', '/cache', 'standard')
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p1

      await bridge.startPhashBatch('/db')
      await bridge.startDuplicateMark('/db')

      mockWorker.emit('exit', 1)
      // 应收到 3 个 fakeComplete
      const calls = handler.mock.calls.map((c) => c[0].type)
      expect(calls).toContain('THUMBNAIL_COMPLETE')
      expect(calls).toContain('PHASH_COMPLETE')
      expect(calls).toContain('DUPLICATE_COMPLETE')
      expect(handler).toHaveBeenCalledTimes(3)
    })

    it('退出后再次 exit 不应重复合成 fakeComplete', async () => {
      const handler = vi.fn()
      bridge.onEvent(handler)
      await readyWorker()

      mockWorker.emit('exit', 1)
      expect(handler).toHaveBeenCalledTimes(1)

      mockWorker.emit('exit', 1)
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('退出后 worker 应置 null（stop 不再 postMessage）', async () => {
      await readyWorker()
      mockWorker.postMessage.mockClear()

      mockWorker.emit('exit', 0)
      bridge.stopThumbnailBatch()
      expect(mockWorker.postMessage).not.toHaveBeenCalled()
    })
  })

  // ============ dispose ============
  describe('dispose', () => {
    it('worker 为 null 时应直接返回', async () => {
      await bridge.dispose()
      expect(mockFork).not.toHaveBeenCalled()
    })

    it('应发送 MEDIA_WORKER_DISPOSE 命令', async () => {
      vi.useFakeTimers()
      await readyWorker()

      const disposePromise = bridge.dispose()
      expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'MEDIA_WORKER_DISPOSE' })
      vi.advanceTimersByTime(500)
      await disposePromise
    })

    it('应在发送 DISPOSE 后等待 500ms 再 kill', async () => {
      vi.useFakeTimers()
      await readyWorker()

      const disposePromise = bridge.dispose()
      expect(mockWorker.kill).not.toHaveBeenCalled()
      vi.advanceTimersByTime(499)
      expect(mockWorker.kill).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      await disposePromise
      expect(mockWorker.kill).toHaveBeenCalledTimes(1)
    })

    it('完成后 worker 应置 null', async () => {
      vi.useFakeTimers()
      await readyWorker()

      const disposePromise = bridge.dispose()
      vi.advanceTimersByTime(500)
      await disposePromise

      mockWorker.postMessage.mockClear()
      bridge.stopThumbnailBatch()
      expect(mockWorker.postMessage).not.toHaveBeenCalled()
    })

    it('完成后三类运行状态应重置', async () => {
      vi.useFakeTimers()
      const handler = vi.fn()
      bridge.onEvent(handler)

      // 启动三类任务
      const p1 = bridge.startThumbnailBatch('/db', '/cache', 'standard')
      mockWorker.emit('message', { type: 'WORKER_READY' })
      await p1
      await bridge.startPhashBatch('/db')
      await bridge.startDuplicateMark('/db')

      const disposePromise = bridge.dispose()
      vi.advanceTimersByTime(500)
      await disposePromise

      // worker 退出不应再合成任何 fakeComplete
      mockWorker.emit('exit', 1)
      expect(handler).not.toHaveBeenCalled()
    })

    it('postMessage 失败时应继续 kill 兜底', async () => {
      vi.useFakeTimers()
      await readyWorker()

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
      await readyWorker()

      mockWorker.kill.mockImplementation(() => {
        throw new Error('kill failed')
      })

      const disposePromise = bridge.dispose()
      vi.advanceTimersByTime(500)
      await expect(disposePromise).resolves.toBeUndefined()
    })

    it('完成后 readyResolve 应清空', async () => {
      vi.useFakeTimers()
      await readyWorker()

      const disposePromise = bridge.dispose()
      vi.advanceTimersByTime(500)
      await disposePromise

      // 再次 dispose 不应报错
      await bridge.dispose()
    })
  })
})
