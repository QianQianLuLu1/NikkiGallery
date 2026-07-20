/**
 * @layer L3
 * @module src/main/ipc/handlers/cache
 * @coverage 缓存域 IPC handler 注册与执行
 * @dependencies electron / ThumbnailGenerator / set-dir-handler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HandlerContext } from '../handler-context'
import { AppError } from '../../../shared/errors/app-error'

const { handleMock, registerSetDirHandlerMock, registerResetDirHandlerMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  registerSetDirHandlerMock: vi.fn(),
  registerResetDirHandlerMock: vi.fn()
}))

vi.mock('electron', () => ({ ipcMain: { handle: handleMock, on: vi.fn() } }))

vi.mock('./set-dir-handler', () => ({
  registerSetDirHandler: registerSetDirHandlerMock,
  registerResetDirHandler: registerResetDirHandlerMock
}))

vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logFault: vi.fn(),
  getLogDirectory: vi.fn(() => '/mock/logs')
}))

vi.mock('../validator', () => {
  const unwrap = (args: unknown[]) =>
    args.length === 1 && Array.isArray(args[0]) ? args[0] : args
  return {
    wrapHandler: vi.fn(
      (ctx: unknown, _schema: unknown, handler: (args: unknown[]) => unknown) =>
        async (...args: unknown[]) => {
          try {
            const data = await handler(unwrap(args))
            return { success: true as const, data }
          } catch (e) {
            if (e instanceof AppError) return { success: false as const, error: e.toIpcError() }
            return {
              success: false as const,
              error: { code: 'IPC_INTERNAL_ERROR', message: e instanceof Error ? e.message : String(e) }
            }
          }
        }
    ),
    wrapHandlerNoArgs: vi.fn(
      (ctx: unknown, handler: () => unknown) =>
        async () => {
          try {
            const data = await handler()
            return { success: true as const, data }
          } catch (e) {
            if (e instanceof AppError) return { success: false as const, error: e.toIpcError() }
            return {
              success: false as const,
              error: { code: 'IPC_INTERNAL_ERROR', message: e instanceof Error ? e.message : String(e) }
            }
          }
        }
    ),
    wrapHandlerRaw: vi.fn(
      (ctx: unknown, handler: (args: unknown[]) => unknown) =>
        async (...args: unknown[]) => {
          try {
            const data = await handler(unwrap(args))
            return { success: true as const, data }
          } catch (e) {
            if (e instanceof AppError) return { success: false as const, error: e.toIpcError() }
            return {
              success: false as const,
              error: { code: 'IPC_INTERNAL_ERROR', message: e instanceof Error ? e.message : String(e) }
            }
          }
        }
    ),
    schemas: {
      filePath: { min: () => ({ max: () => ({}) }) },
      cacheLimitBytes: { finite: () => ({ positive: () => ({}) }) }
    },
    assertFileReadPath: vi.fn(),
    assertFileWritePath: vi.fn()
  }
})

import { registerCacheHandlers } from './cache'

interface ThumbnailGenStubs {
  getCacheStats: ReturnType<typeof vi.fn>
  cleanAll: ReturnType<typeof vi.fn>
  setCacheLimit: ReturnType<typeof vi.fn>
  enforceLimitNow: ReturnType<typeof vi.fn>
  getCacheDir: ReturnType<typeof vi.fn>
}

function makeCtx(thumbnailGen: ThumbnailGenStubs): HandlerContext {
  return {
    thumbnailGen,
    dbManager: { getSetting: vi.fn(), setSetting: vi.fn() },
    getMainWindow: () => null,
    notifyMediaUpdated: vi.fn(),
    invalidateMediaPathCache: vi.fn(),
    applyUITheme: vi.fn(),
    isThumbnailsGenerating: () => false,
    setThumbnailsGenerating: vi.fn()
  } as unknown as HandlerContext
}

function getHandler(channel: string): (...args: unknown[]) => Promise<unknown> {
  for (const call of handleMock.mock.calls) {
    if (call[0] === channel) return call[1]
  }
  throw new Error(`未找到 channel: ${channel}`)
}

describe('registerCacheHandlers', () => {
  let thumbnailGen: ThumbnailGenStubs

  beforeEach(() => {
    handleMock.mockClear()
    registerSetDirHandlerMock.mockClear()
    registerResetDirHandlerMock.mockClear()
    thumbnailGen = {
      getCacheStats: vi.fn(),
      cleanAll: vi.fn(),
      setCacheLimit: vi.fn(),
      enforceLimitNow: vi.fn(),
      getCacheDir: vi.fn()
    }
  })

  it('应注册 5 个 cache channel 并调用 setDir/resetDir 工厂', () => {
    registerCacheHandlers(makeCtx(thumbnailGen))
    const channels = handleMock.mock.calls.map((c) => c[0])
    expect(channels).toEqual(['cache:getStats', 'cache:clean', 'cache:setLimit', 'cache:enforceLimit', 'cache:getDir'])
    expect(registerSetDirHandlerMock).toHaveBeenCalledWith(expect.anything(), 'cache:setDir', 'thumbnailCacheDir')
    expect(registerResetDirHandlerMock).toHaveBeenCalledWith(expect.anything(), 'cache:resetDir', 'thumbnailCacheDir')
  })

  it('cache:getStats 成功时返回统计信息', async () => {
    thumbnailGen.getCacheStats.mockResolvedValue({ totalBytes: 1024, fileCount: 5 })
    registerCacheHandlers(makeCtx(thumbnailGen))
    const result = (await getHandler('cache:getStats')()) as { success: true; data: { totalBytes: number } }
    expect(result.data.totalBytes).toBe(1024)
  })

  it('cache:getStats 抛 Error 时返回 INTERNAL_ERROR', async () => {
    thumbnailGen.getCacheStats.mockRejectedValue(new Error('读取目录失败'))
    registerCacheHandlers(makeCtx(thumbnailGen))
    const result = (await getHandler('cache:getStats')()) as { success: false; error: { code: string; message: string } }
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('IPC_INTERNAL_ERROR')
    expect(result.error.message).toContain('获取缓存统计失败')
  })

  it('cache:clean 成功时返回清理结果', async () => {
    thumbnailGen.cleanAll.mockResolvedValue({ cleaned: 10 })
    registerCacheHandlers(makeCtx(thumbnailGen))
    const result = (await getHandler('cache:clean')()) as { success: true; data: { cleaned: number } }
    expect(result.data.cleaned).toBe(10)
  })

  it('cache:clean 抛错时返回 INTERNAL_ERROR', async () => {
    thumbnailGen.cleanAll.mockRejectedValue(new Error('删除失败'))
    registerCacheHandlers(makeCtx(thumbnailGen))
    const result = (await getHandler('cache:clean')()) as { success: false; error: { code: string } }
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('IPC_INTERNAL_ERROR')
  })

  it('cache:setLimit 成功时调用 setCacheLimit 并持久化到 settings', async () => {
    thumbnailGen.setCacheLimit.mockResolvedValue({ applied: true })
    const ctx = makeCtx(thumbnailGen)
    registerCacheHandlers(ctx)
    const result = (await getHandler('cache:setLimit')([104857600])) as { success: true; data: { applied: boolean } }
    expect(thumbnailGen.setCacheLimit).toHaveBeenCalledWith(104857600)
    expect(ctx.dbManager.setSetting).toHaveBeenCalledWith('thumbnailCacheLimitBytes', 104857600)
    expect(result.data.applied).toBe(true)
  })

  it('cache:setLimit 抛错时返回 INTERNAL_ERROR 且不持久化', async () => {
    thumbnailGen.setCacheLimit.mockRejectedValue(new Error('磁盘满'))
    const ctx = makeCtx(thumbnailGen)
    registerCacheHandlers(ctx)
    const result = (await getHandler('cache:setLimit')([104857600])) as { success: false; error: { code: string } }
    expect(result.success).toBe(false)
    expect(ctx.dbManager.setSetting).not.toHaveBeenCalled()
  })

  it('cache:enforceLimit 成功时返回淘汰结果', async () => {
    thumbnailGen.enforceLimitNow.mockResolvedValue({ evicted: 3 })
    registerCacheHandlers(makeCtx(thumbnailGen))
    const result = (await getHandler('cache:enforceLimit')()) as { success: true; data: { evicted: number } }
    expect(result.data.evicted).toBe(3)
  })

  it('cache:enforceLimit 抛错时返回 INTERNAL_ERROR', async () => {
    thumbnailGen.enforceLimitNow.mockRejectedValue(new Error('LRU 异常'))
    registerCacheHandlers(makeCtx(thumbnailGen))
    const result = (await getHandler('cache:enforceLimit')()) as { success: false; error: { code: string } }
    expect(result.success).toBe(false)
    expect(result.error.code).toBe('IPC_INTERNAL_ERROR')
  })

  it('cache:getDir 返回缓存目录字符串', async () => {
    thumbnailGen.getCacheDir.mockReturnValue('/mock/cache/dir')
    registerCacheHandlers(makeCtx(thumbnailGen))
    const result = (await getHandler('cache:getDir')()) as { success: true; data: string }
    expect(result.data).toBe('/mock/cache/dir')
  })
})
