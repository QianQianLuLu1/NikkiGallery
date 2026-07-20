/**
 * @layer L3
 * @module src/main/ipc/handlers/file
 * @coverage 文件操作域 IPC handler 注册与执行
 * @dependencies electron / FileService / DBManager
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HandlerContext } from '../handler-context'
import { AppError } from '../../../shared/errors/app-error'

const { handleMock, showMessageBoxMock, assertFileReadPathMock, assertFileWritePathMock, schemasProxy } = vi.hoisted(() => {
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
    assertFileReadPathMock: vi.fn(),
    assertFileWritePathMock: vi.fn(),
    schemasProxy
  }
})

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock, on: vi.fn() },
  dialog: { showMessageBox: showMessageBoxMock }
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
    schemas: schemasProxy,
    assertFileReadPath: assertFileReadPathMock,
    assertFileWritePath: assertFileWritePathMock
  }
})

import { registerFileHandlers } from './file'

interface FileServiceStub {
  moveToRecycleBin: ReturnType<typeof vi.fn>
  copyFiles: ReturnType<typeof vi.fn>
  moveFiles: ReturnType<typeof vi.fn>
  renameFile: ReturnType<typeof vi.fn>
  batchRename: ReturnType<typeof vi.fn>
  exportFiles: ReturnType<typeof vi.fn>
  saveAs: ReturnType<typeof vi.fn>
  deletePermanent: ReturnType<typeof vi.fn>
  getExif: ReturnType<typeof vi.fn>
}

function makeCtx(fileService: FileServiceStub, db?: unknown): HandlerContext {
  return {
    fileService,
    dbManager: {
      getDatabase: vi.fn(() => db ?? null),
      getSetting: vi.fn()
    },
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

describe('registerFileHandlers', () => {
  let fileService: FileServiceStub

  beforeEach(() => {
    handleMock.mockClear()
    assertFileReadPathMock.mockReset()
    assertFileWritePathMock.mockReset()
    showMessageBoxMock.mockReset()
    fileService = {
      moveToRecycleBin: vi.fn(),
      copyFiles: vi.fn(),
      moveFiles: vi.fn(),
      renameFile: vi.fn(),
      batchRename: vi.fn(),
      exportFiles: vi.fn(),
      saveAs: vi.fn(),
      deletePermanent: vi.fn(),
      getExif: vi.fn()
    }
  })

  it('应注册 8 个 file channel', () => {
    registerFileHandlers(makeCtx(fileService))
    const channels = handleMock.mock.calls.map((c) => c[0])
    expect(channels).toEqual([
      'file:delete',
      'file:copy',
      'file:move',
      'file:rename',
      'file:batchRename',
      'file:export',
      'file:saveAs',
      'file:deletePermanent',
      'file:getExif'
    ])
  })

  it('file:delete 调用每个路径的 assertFileReadPath 并返回 service 结果', async () => {
    fileService.moveToRecycleBin.mockResolvedValue({ deleted: 2 })
    const ctx = makeCtx(fileService)
    registerFileHandlers(ctx)
    const result = (await getHandler('file:delete')([['/a', '/b']])) as { success: true; data: { deleted: number } }
    expect(assertFileReadPathMock).toHaveBeenCalledWith('/a')
    expect(assertFileReadPathMock).toHaveBeenCalledWith('/b')
    expect(fileService.moveToRecycleBin).toHaveBeenCalledWith(['/a', '/b'])
    expect(result.data.deleted).toBe(2)
  })

  it('file:copy 校验所有源路径与目标目录', async () => {
    fileService.copyFiles.mockResolvedValue({ copied: 2 })
    registerFileHandlers(makeCtx(fileService))
    await getHandler('file:copy')([['/a', '/b'], '/target'])
    expect(assertFileReadPathMock).toHaveBeenCalledWith('/a')
    expect(assertFileReadPathMock).toHaveBeenCalledWith('/b')
    expect(assertFileWritePathMock).toHaveBeenCalledWith('/target')
    expect(fileService.copyFiles).toHaveBeenCalledWith(['/a', '/b'], '/target')
  })

  it('file:move 校验读写路径并调用 moveFiles', async () => {
    fileService.moveFiles.mockResolvedValue({ moved: 1 })
    registerFileHandlers(makeCtx(fileService))
    await getHandler('file:move')([['/a'], '/target'])
    expect(assertFileReadPathMock).toHaveBeenCalledWith('/a')
    expect(assertFileWritePathMock).toHaveBeenCalledWith('/target')
    expect(fileService.moveFiles).toHaveBeenCalledWith(['/a'], '/target')
  })

  it('file:rename 仅校验源路径', async () => {
    fileService.renameFile.mockResolvedValue({ newPath: '/new.png' })
    registerFileHandlers(makeCtx(fileService))
    await getHandler('file:rename')(['/old.png', 'new.png'])
    expect(assertFileReadPathMock).toHaveBeenCalledWith('/old.png')
    expect(fileService.renameFile).toHaveBeenCalledWith('/old.png', 'new.png')
  })

  it('file:batchRename 校验所有 oldPath 并同步数据库', async () => {
    const runMock = vi.fn()
    const db = {
      prepare: vi.fn(() => ({ run: runMock })),
      transaction: vi.fn((fn: (rows: unknown[]) => void) => (rows: unknown[]) => fn(rows))
    }
    fileService.batchRename.mockResolvedValue({
      renamed: [{ oldPath: '/a', newPath: '/b', newFileName: 'b' }],
      skipped: [],
      failed: []
    })
    registerFileHandlers(makeCtx(fileService, db))
    const result = (await getHandler('file:batchRename')([
      [{ oldPath: '/a', newName: 'b' }]
    ])) as { success: true; data: { renamed: unknown[] } }
    expect(assertFileReadPathMock).toHaveBeenCalledWith('/a')
    expect(fileService.batchRename).toHaveBeenCalled()
    expect(db.prepare).toHaveBeenCalledWith(
      'UPDATE media_files SET file_path = ?, file_name = ? WHERE file_path = ?'
    )
    expect(runMock).toHaveBeenCalledWith('/b', 'b', '/a')
    expect(result.data.renamed).toHaveLength(1)
  })

  it('file:batchRename 数据库不存在时不报错', async () => {
    fileService.batchRename.mockResolvedValue({ renamed: [], skipped: [], failed: [] })
    registerFileHandlers(makeCtx(fileService, null))
    const result = (await getHandler('file:batchRename')([[{ oldPath: '/a', newName: 'b' }]])) as {
      success: true
      data: { renamed: unknown[] }
    }
    expect(result.data.renamed).toEqual([])
  })

  it('file:export useDefaultDir=true 时从 settings 读取默认路径', async () => {
    fileService.exportFiles.mockResolvedValue({ exported: 1 })
    const ctx = makeCtx(fileService, null)
    ;(ctx.dbManager.getSetting as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce('/default/export' as never)
      .mockReturnValueOnce(null as never)
    registerFileHandlers(ctx)
    await getHandler('file:export')([['/a'], '/target', { useDefaultDir: true }])
    expect(fileService.exportFiles).toHaveBeenCalledWith(
      ['/a'],
      '/default/export',
      expect.objectContaining({ useDefaultDir: true }),
      undefined
    )
  })

  it('file:export useDefaultDir=true 但未配置默认路径时抛 preconditionFailed', async () => {
    fileService.exportFiles.mockResolvedValue({ exported: 1 })
    const ctx = makeCtx(fileService, null)
    ;(ctx.dbManager.getSetting as ReturnType<typeof vi.fn>).mockReturnValue(null)
    registerFileHandlers(ctx)
    const result = (await getHandler('file:export')([['/a'], '/target', { useDefaultDir: true }])) as {
      success: false
      error: { code: string }
    }
    expect(result.error.code).toBe('IPC_PRECONDITION_FAILED')
  })

  it('file:export 启用 namingPattern 时查询元数据并传给 service', async () => {
    fileService.exportFiles.mockResolvedValue({ exported: 1 })
    const allMock = vi.fn(() => [{ file_path: '/a', album_type: 'game', account_uid: 'u1' }])
    const db = { prepare: vi.fn(() => ({ all: allMock })) }
    const ctx = makeCtx(fileService, db)
    registerFileHandlers(ctx)
    await getHandler('file:export')([['/a'], '/target', { namingPattern: '{album}' }])
    const callArgs = fileService.exportFiles.mock.calls[0]
    const metadataMap = callArgs[3] as Map<string, unknown>
    expect(metadataMap).toBeInstanceOf(Map)
    expect(metadataMap.get('/a')).toEqual({ album_type: 'game', account_uid: 'u1' })
  })

  it('file:saveAs 校验读写路径', async () => {
    fileService.saveAs.mockResolvedValue({ saved: true })
    registerFileHandlers(makeCtx(fileService))
    await getHandler('file:saveAs')(['/src', '/target', 'new.png'])
    expect(assertFileReadPathMock).toHaveBeenCalledWith('/src')
    expect(assertFileWritePathMock).toHaveBeenCalledWith('/target')
    expect(fileService.saveAs).toHaveBeenCalledWith('/src', '/target', 'new.png')
  })

  it('file:saveAs newName 省略时传 undefined', async () => {
    fileService.saveAs.mockResolvedValue({ saved: true })
    registerFileHandlers(makeCtx(fileService))
    await getHandler('file:saveAs')(['/src', '/target', undefined])
    expect(fileService.saveAs).toHaveBeenCalledWith('/src', '/target', undefined)
  })

  it('file:deletePermanent 用户取消时抛 canceled', async () => {
    showMessageBoxMock.mockResolvedValue({ response: 0 })
    registerFileHandlers(makeCtx(fileService))
    const result = (await getHandler('file:deletePermanent')([['/a']])) as {
      success: false
      error: { code: string }
    }
    expect(showMessageBoxMock).toHaveBeenCalled()
    expect(fileService.deletePermanent).not.toHaveBeenCalled()
    expect(result.error.code).toBe('IPC_CANCELED')
  })

  it('file:deletePermanent 用户确认时调用 deletePermanent', async () => {
    showMessageBoxMock.mockResolvedValue({ response: 1 })
    fileService.deletePermanent.mockResolvedValue({ deleted: 1 })
    registerFileHandlers(makeCtx(fileService))
    const result = (await getHandler('file:deletePermanent')([['/a']])) as {
      success: true
      data: { deleted: number }
    }
    expect(fileService.deletePermanent).toHaveBeenCalledWith(['/a'])
    expect(result.data.deleted).toBe(1)
  })

  it('file:getExif 调用 service 返回 exif 数据', async () => {
    fileService.getExif.mockResolvedValue({ make: 'Nikon' })
    registerFileHandlers(makeCtx(fileService))
    const result = (await getHandler('file:getExif')(['/img.jpg'])) as {
      success: true
      data: { make: string }
    }
    expect(assertFileReadPathMock).toHaveBeenCalledWith('/img.jpg')
    expect(fileService.getExif).toHaveBeenCalledWith('/img.jpg')
    expect(result.data.make).toBe('Nikon')
  })
})
