/**
 * @layer L3
 * @module src/main/ipc/handlers/media
 * @coverage 媒体域 IPC handler 注册与执行
 * @dependencies electron / MediaRepository / file-utils / phash / duplicate-scoring
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HandlerContext } from '../handler-context'
import { AppError } from '../../../shared/errors/app-error'

const {
  handleMock,
  showMessageBoxMock,
  trashItemMock,
  calculateFileHashMock,
  hammingDistanceMock,
  pickBestIdMock,
  repoMock,
  generatePhashForUnprocessedMock,
  markDuplicatesMock,
  schemasProxy
} = vi.hoisted(() => {
  // 链式 mock：支持任意属性访问与方法调用，返回值仍可继续链式调用
  const makeChainable = (): any => {
    const fn: any = () => makeChainable()
    return new Proxy(fn, {
      get: (_t, prop) => {
        if (prop === 'then') return undefined
        if (typeof prop === 'symbol') return undefined
        return () => makeChainable()
      }
    })
  }
  const schemasProxy: any = new Proxy({}, {
    get: (_, prop) => {
      if (typeof prop === 'symbol') return undefined
      return makeChainable()
    }
  })
  return {
  handleMock: vi.fn(),
  showMessageBoxMock: vi.fn(),
  trashItemMock: vi.fn(),
  calculateFileHashMock: vi.fn(),
  hammingDistanceMock: vi.fn(),
  pickBestIdMock: vi.fn(),
  repoMock: {
    updateRating: vi.fn(),
    updateFavorite: vi.fn(),
    updateTags: vi.fn(),
    updateNotes: vi.fn(),
    updateCategory: vi.fn(),
    updateOutfit: vi.fn(),
    updateSceneTime: vi.fn(),
    hardDelete: vi.fn(),
    softDeleteBatch: vi.fn(),
    restoreBatch: vi.fn(),
    softDeleteForPermanentDelete: vi.fn(),
    hardDeleteBatch: vi.fn(),
    cleanupMissingRecords: vi.fn().mockReturnValue(0),
    removeMissingRecord: vi.fn().mockReturnValue(true),
    getOutfitAggStats: vi.fn().mockReturnValue([]),
    getLatestOutfitMedia: vi.fn(),
    getDuplicateCandidates: vi.fn().mockReturnValue([]),
    getPhashRows: vi.fn().mockReturnValue([]),
    getGroupCounts: vi.fn().mockReturnValue([]),
    createCategory: vi.fn().mockReturnValue(1),
    updateCategoryFields: vi.fn(),
    deleteCategoryCascade: vi.fn(),
    reorderCategories: vi.fn(),
    listCategories: vi.fn().mockReturnValue([]),
    listProfiles: vi.fn().mockReturnValue([]),
    addProfile: vi.fn(),
    updateProfileFields: vi.fn(),
    deleteProfileAndReassign: vi.fn(),
    touchProfileActive: vi.fn(),
    getProfileByUid: vi.fn(),
    transferFilesToProfile: vi.fn(),
    getProfileBaseStats: vi.fn().mockReturnValue({}),
    getProfileTopOutfits: vi.fn().mockReturnValue([]),
    getProfileTopScenes: vi.fn().mockReturnValue([]),
    getProfileTimeDistribution: vi.fn().mockReturnValue([]),
    getMediaForSceneAnalysis: vi.fn().mockReturnValue([]),
    getMediaPathsByIds: vi.fn().mockReturnValue([]),
    getSoftDeletedMediaPaths: vi.fn().mockReturnValue([]),
    listMedia: vi.fn().mockReturnValue({ rows: [], total: 0, page: 1, pageSize: 50, hasMore: false }),
    getDuplicateGroupRows: vi.fn().mockReturnValue([]),
    getOriginalsByIds: vi.fn().mockReturnValue([])
  },
  generatePhashForUnprocessedMock: vi.fn(),
  markDuplicatesMock: vi.fn(),
  schemasProxy
  }
})

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock, on: vi.fn() },
  dialog: { showMessageBox: showMessageBoxMock },
  shell: { trashItem: trashItemMock }
}))

vi.mock('fs', () => ({
  default: {
    promises: { access: vi.fn() },
    constants: { F_OK: 0 }
  }
}))

vi.mock('../../utils/file-utils', () => ({ calculateFileHash: calculateFileHashMock }))
vi.mock('../../utils/phash', () => ({ hammingDistance: hammingDistanceMock }))
vi.mock('../../utils/duplicate-scoring', () => ({ pickBestId: pickBestIdMock }))
vi.mock('../../utils/concurrency', () => ({ runWithConcurrency: vi.fn(async (tasks: (() => unknown)[], _n: number) => {
    for (const t of tasks) await t()
  }) }))

vi.mock('../../database/media-repository', () => ({
  MediaRepository: vi.fn(() => repoMock)
}))

vi.mock('../../services/thumbnail-phash-service', () => ({
  generatePhashForUnprocessed: generatePhashForUnprocessedMock,
  markDuplicates: markDuplicatesMock
}))

vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logFault: vi.fn(),
  getLogDirectory: vi.fn(() => '/mock/logs')
}))

vi.mock('../validator', () => {
  // 测试约定：handler 调用时第一个实参为参数元组，需解包为 zod parseResult.data 形式
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
  schemas: schemasProxy,
  assertFileReadPath: vi.fn(),
  assertFileWritePath: vi.fn()
  }
})

import { registerMediaHandlers } from './media'

function makeCtx(db?: unknown): HandlerContext {
  return {
    dbManager: { getDatabase: vi.fn(() => db ?? {}) },
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

describe('registerMediaHandlers', () => {
  beforeEach(() => {
    handleMock.mockClear()
    showMessageBoxMock.mockReset()
    trashItemMock.mockReset()
    calculateFileHashMock.mockReset()
    hammingDistanceMock.mockReset()
    pickBestIdMock.mockReset()
    generatePhashForUnprocessedMock.mockReset()
    markDuplicatesMock.mockReset()
    Object.values(repoMock).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockClear?.())
    // 重设默认返回值
    repoMock.cleanupMissingRecords.mockReturnValue(0)
    repoMock.removeMissingRecord.mockReturnValue(true)
    repoMock.getOutfitAggStats.mockReturnValue([])
    repoMock.getDuplicateCandidates.mockReturnValue([])
    repoMock.getPhashRows.mockReturnValue([])
    repoMock.getGroupCounts.mockReturnValue([])
    repoMock.createCategory.mockReturnValue(1)
    repoMock.listCategories.mockReturnValue([])
    repoMock.listProfiles.mockReturnValue([])
    repoMock.getProfileBaseStats.mockReturnValue({})
    repoMock.getProfileTopOutfits.mockReturnValue([])
    repoMock.getProfileTopScenes.mockReturnValue([])
    repoMock.getProfileTimeDistribution.mockReturnValue([])
    repoMock.getMediaForSceneAnalysis.mockReturnValue([])
    repoMock.getMediaPathsByIds.mockReturnValue([])
    repoMock.getSoftDeletedMediaPaths.mockReturnValue([])
    repoMock.listMedia.mockReturnValue({ rows: [], total: 0, page: 1, pageSize: 50, hasMore: false })
    repoMock.getDuplicateGroupRows.mockReturnValue([])
    repoMock.getOriginalsByIds.mockReturnValue([])
    repoMock.getProfileByUid.mockReturnValue(null)
    repoMock.removeMissingRecord.mockReturnValue(true)
  })

  it('应注册全部 media/category/profile/duplicate channel', () => {
    registerMediaHandlers(makeCtx())
    const channels = handleMock.mock.calls.map((c) => c[0])
    expect(channels).toContain('media:updateRating')
    expect(channels).toContain('media:updateFavorite')
    expect(channels).toContain('media:updateTags')
    expect(channels).toContain('media:updateNotes')
    expect(channels).toContain('media:updateCategory')
    expect(channels).toContain('media:updateOutfit')
    expect(channels).toContain('media:analyzeSceneTime')
    expect(channels).toContain('media:delete')
    expect(channels).toContain('media:softDelete')
    expect(channels).toContain('media:restore')
    expect(channels).toContain('media:permanentDelete')
    expect(channels).toContain('media:emptyRecycleBin')
    expect(channels).toContain('media:cleanupMissing')
    expect(channels).toContain('media:removeMissing')
    expect(channels).toContain('media:getOutfitStats')
    expect(channels).toContain('media:findDuplicates')
    expect(channels).toContain('media:findSimilar')
    expect(channels).toContain('media:generatePhash')
    expect(channels).toContain('media:markDuplicates')
    expect(channels).toContain('media:list')
    expect(channels).toContain('media:getGroupCounts')
    expect(channels).toContain('category:create')
    expect(channels).toContain('category:update')
    expect(channels).toContain('category:delete')
    expect(channels).toContain('category:reorder')
    expect(channels).toContain('category:list')
    expect(channels).toContain('profile:list')
    expect(channels).toContain('profile:add')
    expect(channels).toContain('profile:update')
    expect(channels).toContain('profile:delete')
    expect(channels).toContain('profile:setCurrent')
    expect(channels).toContain('profile:transferFiles')
    expect(channels).toContain('profile:getStats')
    expect(channels).toContain('duplicate:listGroups')
  })

  it('media:updateRating 成功时返回 { updated: true }', async () => {
    const ctx = makeCtx()
    registerMediaHandlers(ctx)
    const result = (await getHandler('media:updateRating')([1, 5])) as { success: true; data: { updated: boolean } }
    expect(repoMock.updateRating).toHaveBeenCalledWith(1, 5)
    expect(ctx.notifyMediaUpdated).toHaveBeenCalled()
    expect(result.data.updated).toBe(true)
  })

  it('media:updateFavorite 调用 repo 并通知', async () => {
    registerMediaHandlers(makeCtx())
    await getHandler('media:updateFavorite')([1, true])
    expect(repoMock.updateFavorite).toHaveBeenCalledWith(1, true)
  })

  it('media:updateTags 调用 repo 并通知', async () => {
    registerMediaHandlers(makeCtx())
    await getHandler('media:updateTags')([1, ['tag1', 'tag2']])
    expect(repoMock.updateTags).toHaveBeenCalledWith(1, ['tag1', 'tag2'])
  })

  it('media:updateNotes 调用 repo 并通知', async () => {
    registerMediaHandlers(makeCtx())
    await getHandler('media:updateNotes')([1, '备注'])
    expect(repoMock.updateNotes).toHaveBeenCalledWith(1, '备注')
  })

  it('media:updateCategory 传 null 也支持', async () => {
    registerMediaHandlers(makeCtx())
    await getHandler('media:updateCategory')([1, null])
    expect(repoMock.updateCategory).toHaveBeenCalledWith(1, null)
  })

  it('media:updateOutfit 调用 repo 并通知', async () => {
    registerMediaHandlers(makeCtx())
    await getHandler('media:updateOutfit')([1, '套装A'])
    expect(repoMock.updateOutfit).toHaveBeenCalledWith(1, '套装A')
  })

  it('media:analyzeSceneTime 无待分析图片时返回 analyzed=0', async () => {
    repoMock.getMediaForSceneAnalysis.mockReturnValue([])
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:analyzeSceneTime')([undefined])) as {
      success: true
      data: { analyzed: number; message: string }
    }
    expect(result.data.analyzed).toBe(0)
    expect(result.data.message).toContain('没有需要分析')
  })

  it('media:delete 调用 hardDelete 并通知', async () => {
    registerMediaHandlers(makeCtx())
    await getHandler('media:delete')([1])
    expect(repoMock.hardDelete).toHaveBeenCalledWith(1)
  })

  it('media:softDelete 批量软删除并返回消息', async () => {
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:softDelete')([[1, 2, 3]])) as {
      success: true
      data: { message: string }
    }
    expect(repoMock.softDeleteBatch).toHaveBeenCalledWith([1, 2, 3])
    expect(result.data.message).toContain('3')
  })

  it('media:restore 批量恢复并返回消息', async () => {
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:restore')([[1, 2]])) as { success: true; data: { message: string } }
    expect(repoMock.restoreBatch).toHaveBeenCalledWith([1, 2])
    expect(result.data.message).toContain('2')
  })

  it('media:permanentDelete 用户取消时抛 canceled', async () => {
    showMessageBoxMock.mockResolvedValue({ response: 0 })
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:permanentDelete')([[1]])) as {
      success: false
      error: { code: string }
    }
    expect(result.error.code).toBe('IPC_CANCELED')
  })

  it('media:permanentDelete 用户确认后软删→trash→硬删', async () => {
    showMessageBoxMock.mockResolvedValue({ response: 1 })
    repoMock.getMediaPathsByIds.mockReturnValue([
      { id: 1, file_path: '/a' },
      { id: 2, file_path: '/b' }
    ])
    trashItemMock.mockResolvedValue(undefined)
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:permanentDelete')([[1, 2]])) as {
      success: true
      data: { deletedCount: number; failedCount: number }
    }
    expect(repoMock.softDeleteForPermanentDelete).toHaveBeenCalledWith([1, 2])
    expect(trashItemMock).toHaveBeenCalledWith('/a')
    expect(trashItemMock).toHaveBeenCalledWith('/b')
    expect(repoMock.hardDeleteBatch).toHaveBeenCalledWith([1, 2])
    expect(result.data.deletedCount).toBe(2)
    expect(result.data.failedCount).toBe(0)
  })

  it('media:permanentDelete trashItem 失败但文件不存在时仍硬删', async () => {
    showMessageBoxMock.mockResolvedValue({ response: 1 })
    repoMock.getMediaPathsByIds.mockReturnValue([{ id: 1, file_path: '/missing' }])
    trashItemMock.mockRejectedValue(new Error('not found'))
    const fsMock = await import('fs')
    ;(fsMock.default.promises.access as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'))
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:permanentDelete')([[1]])) as {
      success: true
      data: { deletedCount: number; failedCount: number }
    }
    expect(result.data.deletedCount).toBe(1)
    expect(result.data.failedCount).toBe(0)
  })

  it('media:permanentDelete trashItem 失败且文件存在时计入 failedPaths', async () => {
    showMessageBoxMock.mockResolvedValue({ response: 1 })
    repoMock.getMediaPathsByIds.mockReturnValue([{ id: 1, file_path: '/exists' }])
    trashItemMock.mockRejectedValue(new Error('permission'))
    const fsMock = await import('fs')
    ;(fsMock.default.promises.access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:permanentDelete')([[1]])) as {
      success: true
      data: { deletedCount: number; failedCount: number; message: string }
    }
    expect(result.data.deletedCount).toBe(0)
    expect(result.data.failedCount).toBe(1)
    expect(result.data.message).toContain('失败')
  })

  it('media:emptyRecycleBin 回收站为空时返回提示', async () => {
    repoMock.getSoftDeletedMediaPaths.mockReturnValue([])
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:emptyRecycleBin')()) as {
      success: true
      data: { message: string; movedCount: number }
    }
    expect(result.data.movedCount).toBe(0)
    expect(result.data.message).toContain('为空')
  })

  it('media:emptyRecycleBin 用户取消时抛 canceled', async () => {
    repoMock.getSoftDeletedMediaPaths.mockReturnValue([{ id: 1, file_path: '/a' }])
    showMessageBoxMock.mockResolvedValue({ response: 0 })
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:emptyRecycleBin')()) as { success: false; error: { code: string } }
    expect(result.error.code).toBe('IPC_CANCELED')
  })

  it('media:emptyRecycleBin 用户确认后批量删除', async () => {
    repoMock.getSoftDeletedMediaPaths.mockReturnValue([
      { id: 1, file_path: '/a' },
      { id: 2, file_path: '/b' }
    ])
    showMessageBoxMock.mockResolvedValue({ response: 1 })
    trashItemMock.mockResolvedValue(undefined)
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:emptyRecycleBin')()) as {
      success: true
      data: { movedCount: number }
    }
    expect(repoMock.hardDeleteBatch).toHaveBeenCalledWith([1, 2])
    expect(result.data.movedCount).toBe(2)
  })

  it('media:emptyRecycleBin trashItem 失败时仍记录 id 并继续', async () => {
    repoMock.getSoftDeletedMediaPaths.mockReturnValue([{ id: 1, file_path: '/a' }])
    showMessageBoxMock.mockResolvedValue({ response: 1 })
    trashItemMock.mockRejectedValue(new Error('权限'))
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:emptyRecycleBin')()) as {
      success: true
      data: { movedCount: number }
    }
    expect(repoMock.hardDeleteBatch).toHaveBeenCalledWith([1])
    expect(result.data.movedCount).toBe(0)
  })

  it('media:cleanupMissing 返回清理数量', async () => {
    repoMock.cleanupMissingRecords.mockReturnValue(3)
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:cleanupMissing')()) as {
      success: true
      data: { cleared: number; message: string }
    }
    expect(result.data.cleared).toBe(3)
  })

  it('media:removeMissing 记录不存在时抛 notFound', async () => {
    repoMock.removeMissingRecord.mockReturnValue(false)
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:removeMissing')([1])) as { success: false; error: { code: string } }
    expect(result.error.code).toBe('IPC_NOT_FOUND')
  })

  it('media:removeMissing 记录存在时返回成功消息', async () => {
    repoMock.removeMissingRecord.mockReturnValue(true)
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:removeMissing')([1])) as { success: true; data: { message: string } }
    expect(result.data.message).toContain('已从库中移除')
  })

  it('media:getOutfitStats 聚合 stats 并查询封面', async () => {
    repoMock.getOutfitAggStats.mockReturnValue([
      { outfit: '套装A', count: 3, latest_created: '2026-01-01' }
    ])
    repoMock.getLatestOutfitMedia.mockReturnValue({ file_path: '/a', thumbnail: 'thumb' })
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:getOutfitStats')()) as {
      success: true
      data: { stats: Array<{ outfit: string; coverFilePath: string }> }
    }
    expect(result.data.stats[0].outfit).toBe('套装A')
    expect(result.data.stats[0].coverFilePath).toBe('/a')
  })

  it('media:getOutfitStats 最新媒体不存在时 cover 为空字符串', async () => {
    repoMock.getOutfitAggStats.mockReturnValue([{ outfit: 'B', count: 1, latest_created: '2026-01-01' }])
    repoMock.getLatestOutfitMedia.mockReturnValue(undefined)
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:getOutfitStats')()) as {
      success: true
      data: { stats: Array<{ coverFilePath: string; coverThumbnail: null }> }
    }
    expect(result.data.stats[0].coverFilePath).toBe('')
    expect(result.data.stats[0].coverThumbnail).toBeNull()
  })

  it('media:findDuplicates 无候选时返回空结果', async () => {
    repoMock.getDuplicateCandidates.mockReturnValue([])
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:findDuplicates')()) as {
      success: true
      data: { totalGroups: number; totalFiles: number; wastedBytes: number }
    }
    expect(result.data.totalGroups).toBe(0)
    expect(result.data.totalFiles).toBe(0)
  })

  it('media:findDuplicates 计算哈希后聚合重复组', async () => {
    repoMock.getDuplicateCandidates.mockReturnValue([
      { id: 1, file_path: '/a', file_name: 'a', file_type: 'image', file_size: 100, modified_at: '2026-01-01', width: 100, height: 100, is_favorite: 0, rating: 0 },
      { id: 2, file_path: '/b', file_name: 'b', file_type: 'image', file_size: 100, modified_at: '2026-01-02', width: 100, height: 100, is_favorite: 0, rating: 0 }
    ])
    calculateFileHashMock.mockResolvedValue('hashA')
    pickBestIdMock.mockReturnValue(1)
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:findDuplicates')()) as {
      success: true
      data: { totalGroups: number; totalFiles: number; wastedBytes: number; bestItemIds: number[] }
    }
    expect(calculateFileHashMock).toHaveBeenCalledTimes(2)
    expect(result.data.totalGroups).toBe(1)
    expect(result.data.totalFiles).toBe(2)
    expect(result.data.wastedBytes).toBe(100)
    expect(result.data.bestItemIds).toEqual([1])
  })

  it('media:findDuplicates file_size<=0 的行被跳过', async () => {
    repoMock.getDuplicateCandidates.mockReturnValue([
      { id: 1, file_path: '/a', file_name: 'a', file_type: 'image', file_size: 0, modified_at: '2026-01-01', width: 100, height: 100, is_favorite: 0, rating: 0 }
    ])
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:findDuplicates')()) as {
      success: true
      data: { totalGroups: number }
    }
    expect(result.data.totalGroups).toBe(0)
  })

  it('media:findDuplicates 哈希计算失败时跳过该行', async () => {
    repoMock.getDuplicateCandidates.mockReturnValue([
      { id: 1, file_path: '/a', file_name: 'a', file_type: 'image', file_size: 100, modified_at: '2026-01-01', width: 100, height: 100, is_favorite: 0, rating: 0 },
      { id: 2, file_path: '/b', file_name: 'b', file_type: 'image', file_size: 100, modified_at: '2026-01-02', width: 100, height: 100, is_favorite: 0, rating: 0 }
    ])
    calculateFileHashMock.mockRejectedValue(new Error('读取失败'))
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:findDuplicates')()) as {
      success: true
      data: { totalGroups: number }
    }
    expect(result.data.totalGroups).toBe(0)
  })

  it('media:findSimilar 行数小于 2 时返回空结果', async () => {
    repoMock.getPhashRows.mockReturnValue([{ id: 1, file_path: '/a', file_name: 'a', file_type: 'image', file_size: 100, modified_at: '2026-01-01', width: 1, height: 1, is_favorite: 0, rating: 0, phash: 'abc' }])
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:findSimilar')([undefined])) as {
      success: true
      data: { totalGroups: number; threshold: number }
    }
    expect(result.data.totalGroups).toBe(0)
    expect(result.data.threshold).toBe(5)
  })

  it('media:findSimilar 自定义 threshold 透传', async () => {
    repoMock.getPhashRows.mockReturnValue([])
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:findSimilar')([{ threshold: 10 }])) as {
      success: true
      data: { threshold: number }
    }
    expect(result.data.threshold).toBe(10)
  })

  it('media:findSimilar 距离<=threshold 时聚类成组', async () => {
    repoMock.getPhashRows.mockReturnValue([
      { id: 1, file_path: '/a', file_name: 'a', file_type: 'image', file_size: 100, modified_at: '2026-01-01', width: 1, height: 1, is_favorite: 0, rating: 0, phash: 'a' },
      { id: 2, file_path: '/b', file_name: 'b', file_type: 'image', file_size: 100, modified_at: '2026-01-02', width: 1, height: 1, is_favorite: 0, rating: 0, phash: 'b' }
    ])
    hammingDistanceMock.mockReturnValue(3)
    pickBestIdMock.mockReturnValue(1)
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:findSimilar')([{ threshold: 5 }])) as {
      success: true
      data: { totalGroups: number; totalFiles: number; wastedBytes: number }
    }
    expect(hammingDistanceMock).toHaveBeenCalledWith('a', 'b')
    expect(result.data.totalGroups).toBe(1)
    expect(result.data.totalFiles).toBe(2)
    expect(result.data.wastedBytes).toBe(100)
  })

  it('media:findSimilar 距离<0 时不算同组', async () => {
    repoMock.getPhashRows.mockReturnValue([
      { id: 1, file_path: '/a', file_name: 'a', file_type: 'image', file_size: 100, modified_at: '2026-01-01', width: 1, height: 1, is_favorite: 0, rating: 0, phash: 'a' },
      { id: 2, file_path: '/b', file_name: 'b', file_type: 'image', file_size: 100, modified_at: '2026-01-02', width: 1, height: 1, is_favorite: 0, rating: 0, phash: 'b' }
    ])
    hammingDistanceMock.mockReturnValue(-1)
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:findSimilar')([undefined])) as {
      success: true
      data: { totalGroups: number }
    }
    expect(result.data.totalGroups).toBe(0)
  })

  it('media:generatePhash 调用 generatePhashForUnprocessed', async () => {
    generatePhashForUnprocessedMock.mockResolvedValue({ processed: 5, total: 10 })
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:generatePhash')()) as {
      success: true
      data: { processed: number; total: number }
    }
    expect(generatePhashForUnprocessedMock).toHaveBeenCalled()
    expect(result.data.processed).toBe(5)
  })

  it('media:markDuplicates 调用 markDuplicates 并合并 message', async () => {
    markDuplicatesMock.mockResolvedValue({ groups: 2, marked: 5 })
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:markDuplicates')()) as {
      success: true
      data: { message: string; groups: number }
    }
    expect(markDuplicatesMock).toHaveBeenCalled()
    expect(result.data.groups).toBe(2)
    expect(result.data.message).toContain('重复标记完成')
  })

  it('media:list 返回 files/total/page/pageSize/hasMore', async () => {
    repoMock.listMedia.mockReturnValue({
      rows: [
        { id: 1, file_path: '/a', is_favorite: 1, is_deleted: 0, is_missing: 0, is_duplicate: 0 }
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      hasMore: false
    })
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:list')([undefined])) as {
      success: true
      data: { files: Array<{ id: string; is_favorite: boolean }>; total: number }
    }
    expect(result.data.files[0].id).toBe('1')
    expect(result.data.files[0].is_favorite).toBe(true)
    expect(result.data.total).toBe(1)
  })

  it('media:getGroupCounts 调用 repo 并返回 groups', async () => {
    repoMock.getGroupCounts.mockReturnValue([{ key: 'game', count: 5 }])
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('media:getGroupCounts')(['album_type', undefined, undefined])) as {
      success: true
      data: { groups: unknown[] }
    }
    expect(repoMock.getGroupCounts).toHaveBeenCalledWith('album_type', undefined, undefined)
    expect(result.data.groups).toHaveLength(1)
  })

  it('category:create 使用默认 icon/color 调用 repo', async () => {
    repoMock.createCategory.mockReturnValue(7)
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('category:create')(['新分类', undefined])) as {
      success: true
      data: { id: number }
    }
    expect(repoMock.createCategory).toHaveBeenCalledWith('新分类', 'folder', '#888888', null)
    expect(result.data.id).toBe(7)
  })

  it('category:create 传 options 时透传 icon/color/parentId', async () => {
    registerMediaHandlers(makeCtx())
    await getHandler('category:create')(['n', { icon: 'star', color: '#fff', parentId: 3 }])
    expect(repoMock.createCategory).toHaveBeenCalledWith('n', 'star', '#fff', 3)
  })

  it('category:update 仅允许特定字段并调用 updateCategoryFields', async () => {
    registerMediaHandlers(makeCtx())
    await getHandler('category:update')([1, { name: 'new', icon: 'i', color: '#000', parent_id: 2, extra: 'x' }])
    expect(repoMock.updateCategoryFields).toHaveBeenCalledWith(
      1,
      ['name = ?', 'icon = ?', 'color = ?', 'parent_id = ?'],
      ['new', 'i', '#000', 2]
    )
  })

  it('category:update 无可更新字段时抛 validation', async () => {
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('category:update')([1, { extra: 'x' }])) as {
      success: false
      error: { code: string }
    }
    expect(result.error.code).toBe('IPC_VALIDATION_ERROR')
  })

  it('category:delete 调用 deleteCategoryCascade', async () => {
    registerMediaHandlers(makeCtx())
    await getHandler('category:delete')([1])
    expect(repoMock.deleteCategoryCascade).toHaveBeenCalledWith(1)
  })

  it('category:reorder 调用 reorderCategories', async () => {
    registerMediaHandlers(makeCtx())
    await getHandler('category:reorder')([[{ id: 1, sort_order: 0 }]])
    expect(repoMock.reorderCategories).toHaveBeenCalledWith([{ id: 1, sort_order: 0 }])
  })

  it('category:list 返回 categories 并将 is_system 转 boolean', async () => {
    repoMock.listCategories.mockReturnValue([{ id: 1, is_system: 1 }])
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('category:list')()) as {
      success: true
      data: { categories: Array<{ is_system: boolean }> }
    }
    expect(result.data.categories[0].is_system).toBe(true)
  })

  it('profile:list 返回 profiles', async () => {
    repoMock.listProfiles.mockReturnValue([{ uid: 'u1', nickname: 'n1' }])
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('profile:list')()) as { success: true; data: { profiles: unknown[] } }
    expect(result.data.profiles).toHaveLength(1)
  })

  it('profile:add 成功时返回 { added: true }', async () => {
    repoMock.addProfile.mockImplementation(() => {})
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('profile:add')(['u1', 'n1', '/avatar.png'])) as {
      success: true
      data: { added: boolean }
    }
    expect(repoMock.addProfile).toHaveBeenCalledWith('u1', 'n1', '/avatar.png')
    expect(result.data.added).toBe(true)
  })

  it('profile:add UID 唯一约束冲突时抛 conflict', async () => {
    repoMock.addProfile.mockImplementation(() => {
      throw new Error('UNIQUE constraint failed: profiles.uid')
    })
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('profile:add')(['u1', 'n1', undefined])) as {
      success: false
      error: { code: string; message: string }
    }
    expect(result.error.code).toBe('IPC_CONFLICT')
    expect(result.error.message).toContain('UID 已存在')
  })

  it('profile:add 抛非 UNIQUE 错误时直接透传', async () => {
    repoMock.addProfile.mockImplementation(() => {
      throw new Error('其他错误')
    })
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('profile:add')(['u1', 'n1', undefined])) as {
      success: false
      error: { code: string }
    }
    expect(result.error.code).toBe('IPC_INTERNAL_ERROR')
  })

  it('profile:update 同时传 nickname 和 avatar 时调用两个字段更新', async () => {
    registerMediaHandlers(makeCtx())
    await getHandler('profile:update')(['u1', '新名', '/a.png'])
    expect(repoMock.updateProfileFields).toHaveBeenCalledWith(
      'u1',
      ['nickname = ?', 'avatar = ?'],
      ['新名', '/a.png']
    )
  })

  it('profile:update 仅传 nickname 时只更新一个字段', async () => {
    registerMediaHandlers(makeCtx())
    await getHandler('profile:update')(['u1', '新名', undefined])
    expect(repoMock.updateProfileFields).toHaveBeenCalledWith('u1', ['nickname = ?'], ['新名'])
  })

  it('profile:update 无字段时直接返回 { updated: true }', async () => {
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('profile:update')(['u1', undefined, undefined])) as {
      success: true
      data: { updated: boolean }
    }
    expect(repoMock.updateProfileFields).not.toHaveBeenCalled()
    expect(result.data.updated).toBe(true)
  })

  it('profile:delete 删除默认档案时抛 PATH_FORBIDDEN', async () => {
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('profile:delete')(['default'])) as {
      success: false
      error: { code: string }
    }
    expect(result.error.code).toBe('IPC_PATH_FORBIDDEN')
  })

  it('profile:delete 非默认档案时调用 deleteProfileAndReassign', async () => {
    registerMediaHandlers(makeCtx())
    await getHandler('profile:delete')(['u1'])
    expect(repoMock.deleteProfileAndReassign).toHaveBeenCalledWith('u1')
  })

  it('profile:setCurrent 调用 touchProfileActive 与 setSetting', async () => {
    const ctx = makeCtx()
    ;(ctx.dbManager.setSetting as ReturnType<typeof vi.fn>) = vi.fn()
    registerMediaHandlers(ctx)
    await getHandler('profile:setCurrent')(['u1'])
    expect(repoMock.touchProfileActive).toHaveBeenCalledWith('u1')
    expect(ctx.dbManager.setSetting).toHaveBeenCalledWith('currentProfileUid', 'u1')
  })

  it('profile:transferFiles 目标档案不存在时抛 notFound', async () => {
    repoMock.getProfileByUid.mockReturnValue(null)
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('profile:transferFiles')([[1, 2], 'u2'])) as {
      success: false
      error: { code: string; message: string }
    }
    expect(result.error.code).toBe('IPC_NOT_FOUND')
    expect(result.error.message).toContain('u2')
  })

  it('profile:transferFiles 成功时返回 transferred 数量', async () => {
    repoMock.getProfileByUid.mockReturnValue({ uid: 'u2', nickname: 'n' })
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('profile:transferFiles')([[1, 2], 'u2'])) as {
      success: true
      data: { transferred: number }
    }
    expect(repoMock.transferFilesToProfile).toHaveBeenCalledWith([1, 2], 'u2')
    expect(result.data.transferred).toBe(2)
  })

  it('profile:getStats 聚合 baseStats/outfit/scene/time', async () => {
    repoMock.getProfileBaseStats.mockReturnValue({ total_count: 10, image_count: 7, video_count: 3, total_size: 1024, earliest_time: 't1', latest_time: 't2' })
    repoMock.getProfileTopOutfits.mockReturnValue([{ outfit: 'A' }])
    repoMock.getProfileTopScenes.mockReturnValue([{ scene: 'B' }])
    repoMock.getProfileTimeDistribution.mockReturnValue([{ hour: 12 }])
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('profile:getStats')(['u1'])) as {
      success: true
      data: { stats: { totalCount: number; topOutfits: unknown[]; timeDistribution: unknown[] } }
    }
    expect(result.data.stats.totalCount).toBe(10)
    expect(result.data.stats.topOutfits).toHaveLength(1)
    expect(result.data.stats.timeDistribution).toHaveLength(1)
  })

  it('profile:getStats baseStats 为 null 时回退为 0', async () => {
    repoMock.getProfileBaseStats.mockReturnValue({})
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('profile:getStats')(['u1'])) as {
      success: true
      data: { stats: { totalCount: number; imageCount: number } }
    }
    expect(result.data.stats.totalCount).toBe(0)
    expect(result.data.stats.imageCount).toBe(0)
  })

  it('duplicate:listGroups 聚合 originalId 与 duplicates', async () => {
    repoMock.getDuplicateGroupRows.mockReturnValue([
      { id: 2, file_path: '/b', file_name: 'b', file_type: 'image', file_size: 100, modified_at: '2026-01-01', width: 1, height: 1, is_favorite: 0, rating: 0, original_id: 1 }
    ])
    repoMock.getOriginalsByIds.mockReturnValue([
      { id: 1, file_path: '/a', file_name: 'a', file_type: 'image', file_size: 100, modified_at: '2026-01-02', width: 1, height: 1, is_favorite: 0, rating: 0 }
    ])
    registerMediaHandlers(makeCtx())
    const result = (await getHandler('duplicate:listGroups')()) as {
      success: true
      data: { groups: Array<{ originalId: number; original: { id: number } | null; duplicates: unknown[] }>; totalGroups: number }
    }
    expect(result.data.totalGroups).toBe(1)
    expect(result.data.groups[0].originalId).toBe(1)
    expect(result.data.groups[0].original?.id).toBe(1)
    expect(result.data.groups[0].duplicates).toHaveLength(1)
  })
})
