/**
 * @layer L3
 * @module src/main/ipc/handlers/misc
 * @coverage 杂项域 IPC handler 注册与执行（scanner / decrypt / thumbnail / ui-theme / shell / settings / dialog / data / import / app / operation-history）
 * @dependencies electron / scannerManager / thumbnail-phash-service / decryption-service / dbManager
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import type { HandlerContext } from '../handler-context'
import { AppError } from '../../../shared/errors/app-error'

const {
  handleMock,
  appRelaunchMock,
  appQuitMock,
  appGetVersionMock,
  shellOpenExternalMock,
  shellOpenPathMock,
  shellShowItemInFolderMock,
  showOpenDialogMock,
  showSaveDialogMock,
  showMessageBoxMock,
  getFocusedWindowMock,
  fsReaddirMock,
  fsRmMock,
  generateThumbnailsForUnprocessedMock,
  decodeFileParamsMock,
  encodeCameraParamsMock,
  decodeClothDiyShareCodeMock,
  decodeHomeBuildShareCodeMock,
  assertFileReadPathMock,
  assertFileWritePathMock,
  schemasMock
} = vi.hoisted(() => {
  // 真实 zod schema 集合：misc.ts 在模块级用 z.object/z.array/z.tuple 组合 schemas，
  // 必须提供真实 ZodType 才能让 zod 安全构造与 safeParse 正常工作。
  const zmod = require('zod') as typeof import('zod')
  const filePath = zmod.z.string().min(1).max(1024)
  const filePathArray = zmod.z.array(filePath).min(1).max(1000)
  const positiveIntId = zmod.z.number().int().positive()
  const httpUrl = zmod.z.string().min(1).max(2048).url().refine((u: string) => u.startsWith('http://') || u.startsWith('https://'))
  const uiTheme = zmod.z.enum(['default', 'soft-pink-luxury'])
  const thumbnailQuality = zmod.z.enum(['low', 'standard', 'high']).optional()
  const backupFilename = zmod.z.string().regex(/.+/)
  const cacheLimitBytes = zmod.z.number().finite().positive()
  const rating = zmod.z.number().int().min(0).max(5)
  const mediaId = zmod.z.number().int().positive()
  const mediaIdArray = zmod.z.array(mediaId).min(1).max(1000)
  const shortString = (max = 64) => zmod.z.string().min(1).max(max)
  const uid = zmod.z.string().min(1).max(32).regex(/^[A-Za-z0-9]+$/)
  const schemasMock = {
    filePath,
    filePathArray,
    positiveIntId,
    httpUrl,
    uiTheme,
    thumbnailQuality,
    backupFilename,
    cacheLimitBytes,
    rating,
    mediaId,
    mediaIdArray,
    shortString,
    uid
  }
  return {
    handleMock: vi.fn(),
    appRelaunchMock: vi.fn(),
    appQuitMock: vi.fn(),
    appGetVersionMock: vi.fn(),
    shellOpenExternalMock: vi.fn(),
    shellOpenPathMock: vi.fn(),
    shellShowItemInFolderMock: vi.fn(),
    showOpenDialogMock: vi.fn(),
    showSaveDialogMock: vi.fn(),
    showMessageBoxMock: vi.fn(),
    getFocusedWindowMock: vi.fn(),
    fsReaddirMock: vi.fn(),
    fsRmMock: vi.fn(),
    generateThumbnailsForUnprocessedMock: vi.fn(),
    decodeFileParamsMock: vi.fn(),
    encodeCameraParamsMock: vi.fn(),
    decodeClothDiyShareCodeMock: vi.fn(),
    decodeHomeBuildShareCodeMock: vi.fn(),
    assertFileReadPathMock: vi.fn(),
    assertFileWritePathMock: vi.fn(),
    schemasMock
  }
})

vi.mock('electron', () => ({
  app: {
    relaunch: appRelaunchMock,
    quit: appQuitMock,
    getVersion: appGetVersionMock
  },
  ipcMain: { handle: handleMock, on: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => getFocusedWindowMock() },
  dialog: {
    showOpenDialog: showOpenDialogMock,
    showSaveDialog: showSaveDialogMock,
    showMessageBox: showMessageBoxMock
  },
  shell: {
    openExternal: shellOpenExternalMock,
    openPath: shellOpenPathMock,
    showItemInFolder: shellShowItemInFolderMock
  }
}))

vi.mock('fs', () => ({
  default: {
    promises: {
      readdir: fsReaddirMock,
      rm: fsRmMock
    }
  }
}))

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path')
  return { default: actual }
})

vi.mock('../../services/thumbnail-phash-service', () => ({
  generateThumbnailsForUnprocessed: generateThumbnailsForUnprocessedMock
}))

vi.mock('../../services/decryption-service', () => ({
  decodeFileParams: decodeFileParamsMock,
  encodeCameraParams: encodeCameraParamsMock,
  decodeClothDiyShareCode: decodeClothDiyShareCodeMock,
  decodeHomeBuildShareCode: decodeHomeBuildShareCodeMock
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
  wrapHandlerRaw: vi.fn(
    (ctx: unknown, handler: (args: unknown[], ctx?: unknown, event?: unknown) => unknown) =>
      async (...args: unknown[]) => {
        try {
          const data = await handler(unwrap(args), ctx)
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
  schemas: schemasMock,
  assertFileReadPath: assertFileReadPathMock,
  assertFileWritePath: assertFileWritePathMock
  }
})

import { registerMiscHandlers } from './misc'

interface ScannerManagerStub {
  startScan: ReturnType<typeof vi.fn>
  stopScan: ReturnType<typeof vi.fn>
  getStatus: ReturnType<typeof vi.fn>
}

interface ThumbnailGenStub {
  generate: ReturnType<typeof vi.fn>
  getCacheDir: ReturnType<typeof vi.fn>
}

interface FileServiceStub {
  previewImport: ReturnType<typeof vi.fn>
  importFiles: ReturnType<typeof vi.fn>
}

interface DbStub {
  exec: ReturnType<typeof vi.fn>
  prepare: ReturnType<typeof vi.fn>
  transaction: ReturnType<typeof vi.fn>
}

function makeCtx(opts: {
  scannerManager?: ScannerManagerStub
  thumbnailGen?: ThumbnailGenStub
  fileService?: FileServiceStub
  db?: DbStub | null
  mainWindow?: unknown
}): HandlerContext {
  return {
    scannerManager: opts.scannerManager ?? { startScan: vi.fn(), stopScan: vi.fn(), getStatus: vi.fn() },
    thumbnailGen: opts.thumbnailGen ?? { generate: vi.fn(), getCacheDir: vi.fn(() => '/mock/cache') },
    fileService: opts.fileService ?? { previewImport: vi.fn(), importFiles: vi.fn() },
    dbManager: {
      getDatabase: vi.fn(() => opts.db === undefined ? {} : opts.db),
      getSetting: vi.fn(),
      setSetting: vi.fn()
    },
    getMainWindow: () => opts.mainWindow ?? null,
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

describe('registerMiscHandlers', () => {
  beforeEach(() => {
    handleMock.mockClear()
    appRelaunchMock.mockReset()
    appQuitMock.mockReset()
    appGetVersionMock.mockReset()
    shellOpenExternalMock.mockReset()
    shellOpenPathMock.mockReset()
    shellShowItemInFolderMock.mockReset()
    showOpenDialogMock.mockReset()
    showSaveDialogMock.mockReset()
    showMessageBoxMock.mockReset()
    getFocusedWindowMock.mockReturnValue(null)
    fsReaddirMock.mockReset()
    fsRmMock.mockReset()
    generateThumbnailsForUnprocessedMock.mockReset()
    decodeFileParamsMock.mockReset()
    encodeCameraParamsMock.mockReset()
    decodeClothDiyShareCodeMock.mockReset()
    decodeHomeBuildShareCodeMock.mockReset()
    assertFileReadPathMock.mockReset()
    assertFileWritePathMock.mockReset()
  })

  it('应注册全部 misc channel', () => {
    registerMiscHandlers(makeCtx({}))
    const channels = handleMock.mock.calls.map((c) => c[0])
    expect(channels).toContain('scanner:start')
    expect(channels).toContain('scanner:stop')
    expect(channels).toContain('scanner:status')
    expect(channels).toContain('decrypt:decodeFile')
    expect(channels).toContain('decrypt:encodeCameraParams')
    expect(channels).toContain('decrypt:decodeClothDiy')
    expect(channels).toContain('decrypt:decodeHomeBuild')
    expect(channels).toContain('thumbnail:generate')
    expect(channels).toContain('ui-theme:get')
    expect(channels).toContain('ui-theme:set')
    expect(channels).toContain('shell:openExternal')
    expect(channels).toContain('shell:openPath')
    expect(channels).toContain('shell:showItemInFolder')
    expect(channels).toContain('settings:get')
    expect(channels).toContain('settings:set')
    expect(channels).toContain('dialog:selectDirectory')
    expect(channels).toContain('dialog:openFile')
    expect(channels).toContain('dialog:saveFile')
    expect(channels).toContain('dialog:showMessageBox')
    expect(channels).toContain('data:clear')
    expect(channels).toContain('import:preview')
    expect(channels).toContain('import:run')
    expect(channels).toContain('app:relaunch')
    expect(channels).toContain('app:getVersion')
    expect(channels).toContain('operation-history:add')
    expect(channels).toContain('operation-history:list')
    expect(channels).toContain('operation-history:remove')
    expect(channels).toContain('operation-history:clear')
  })

  // ---------- scanner ----------

  it('scanner:start 参数校验失败时广播 scanner:complete 并抛 validation', async () => {
    const sendMock = vi.fn()
    const mainWindow = { webContents: { send: sendMock } }
    registerMiscHandlers(makeCtx({ mainWindow }))
    const result = (await getHandler('scanner:start')([{ path: 123 }])) as {
      success: false
      error: { code: string }
    }
    expect(result.error.code).toBe('IPC_VALIDATION_ERROR')
    expect(sendMock).toHaveBeenCalledWith('scanner:complete', expect.objectContaining({ success: false }))
  })

  it('scanner:start 成功时返回 result 并广播 scanner:complete', async () => {
    const scannerManager = { startScan: vi.fn().mockResolvedValue({ success: true, filesFound: 10 }), stopScan: vi.fn(), getStatus: vi.fn() }
    generateThumbnailsForUnprocessedMock.mockResolvedValue(undefined)
    const sendMock = vi.fn()
    const mainWindow = { webContents: { send: sendMock } }
    registerMiscHandlers(makeCtx({ scannerManager, mainWindow }))
    const result = (await getHandler('scanner:start')([{ incremental: true }])) as {
      success: true
      data: { success: boolean; filesFound: number }
    }
    expect(scannerManager.startScan).toHaveBeenCalledWith({ incremental: true })
    expect(result.data.success).toBe(true)
    expect(sendMock).toHaveBeenCalledWith('scanner:complete', expect.objectContaining({ success: true }))
  })

  it('scanner:start filesFound>0 时触发缩略图生成', async () => {
    const scannerManager = { startScan: vi.fn().mockResolvedValue({ success: true, filesFound: 5 }), stopScan: vi.fn(), getStatus: vi.fn() }
    generateThumbnailsForUnprocessedMock.mockResolvedValue(undefined)
    const mainWindow = { webContents: { send: vi.fn() } }
    registerMiscHandlers(makeCtx({ scannerManager, mainWindow }))
    await getHandler('scanner:start')([undefined])
    // 异步触发，等待微任务
    await new Promise((r) => setTimeout(r, 0))
    expect(generateThumbnailsForUnprocessedMock).toHaveBeenCalled()
  })

  it('scanner:start service 抛错时广播失败并返回 INTERNAL_ERROR', async () => {
    const scannerManager = { startScan: vi.fn().mockRejectedValue(new Error('扫描异常')), stopScan: vi.fn(), getStatus: vi.fn() }
    const sendMock = vi.fn()
    const mainWindow = { webContents: { send: sendMock } }
    registerMiscHandlers(makeCtx({ scannerManager, mainWindow }))
    const result = (await getHandler('scanner:start')([undefined])) as {
      success: false
      error: { code: string; message: string }
    }
    expect(result.error.code).toBe('IPC_INTERNAL_ERROR')
    expect(result.error.message).toContain('扫描失败')
    expect(sendMock).toHaveBeenCalledWith('scanner:complete', expect.objectContaining({ success: false }))
  })

  it('scanner:stop 调用 stopScan', async () => {
    const scannerManager = { startScan: vi.fn(), stopScan: vi.fn().mockReturnValue({ stopped: true }), getStatus: vi.fn() }
    registerMiscHandlers(makeCtx({ scannerManager }))
    const result = (await getHandler('scanner:stop')()) as { success: true; data: { stopped: boolean } }
    expect(scannerManager.stopScan).toHaveBeenCalled()
    expect(result.data.stopped).toBe(true)
  })

  it('scanner:status 返回 scanner 状态', async () => {
    const scannerManager = { startScan: vi.fn(), stopScan: vi.fn(), getStatus: vi.fn().mockReturnValue({ scanning: true }) }
    registerMiscHandlers(makeCtx({ scannerManager }))
    const result = (await getHandler('scanner:status')()) as { success: true; data: { scanning: boolean } }
    expect(result.data.scanning).toBe(true)
  })

  // ---------- decrypt ----------

  it('decrypt:decodeFile 调用 decodeFileParams 并返回 { ok, data, message }', async () => {
    decodeFileParamsMock.mockResolvedValue({ params: { a: 1 } })
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('decrypt:decodeFile')(['/file', 'albumType', 'uid'])) as {
      success: true
      data: { ok: boolean; data: unknown }
    }
    expect(assertFileReadPathMock).toHaveBeenCalledWith('/file')
    expect(decodeFileParamsMock).toHaveBeenCalledWith('/file', 'albumType', 'uid')
    expect(result.data.ok).toBe(true)
  })

  it('decrypt:decodeFile 返回 error 时 ok=false', async () => {
    decodeFileParamsMock.mockResolvedValue({ error: '解码失败' })
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('decrypt:decodeFile')(['/f', 'a'])) as {
      success: true
      data: { ok: boolean; message: string }
    }
    expect(result.data.ok).toBe(false)
    expect(result.data.message).toBe('解码失败')
  })

  it('decrypt:encodeCameraParams 返回 base64 字符串', async () => {
    encodeCameraParamsMock.mockResolvedValue({ success: true, data: Buffer.from([1, 2, 3]) })
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('decrypt:encodeCameraParams')(['{}'])) as {
      success: true
      data: { ok: boolean; data: string }
    }
    expect(encodeCameraParamsMock).toHaveBeenCalledWith('{}')
    expect(result.data.ok).toBe(true)
    expect(result.data.data).toBe(Buffer.from([1, 2, 3]).toString('base64'))
  })

  it('decrypt:encodeCameraParams 失败时不返回 data', async () => {
    encodeCameraParamsMock.mockResolvedValue({ success: false, error: '加密失败' })
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('decrypt:encodeCameraParams')(['{}'])) as {
      success: true
      data: { ok: boolean; data: undefined }
    }
    expect(result.data.ok).toBe(false)
    expect(result.data.data).toBeUndefined()
  })

  it('decrypt:decodeClothDiy 返回 timestamp/uidBytes/networkData', async () => {
    decodeClothDiyShareCodeMock.mockResolvedValue({
      success: true,
      timestamp: 123,
      uidBytes: Buffer.from([1, 2]),
      networkData: { k: 'v' }
    })
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('decrypt:decodeClothDiy')(['code'])) as {
      success: true
      data: { ok: boolean; data: { timestamp: number; uidBytes: string; networkData: unknown } }
    }
    expect(result.data.ok).toBe(true)
    expect(result.data.data.timestamp).toBe(123)
    expect(result.data.data.uidBytes).toBe('0102')
  })

  it('decrypt:decodeHomeBuild 返回 server/networkData', async () => {
    decodeHomeBuildShareCodeMock.mockResolvedValue({ success: true, server: 's1', networkData: { k: 1 } })
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('decrypt:decodeHomeBuild')(['code'])) as {
      success: true
      data: { ok: boolean; data: { server: string } }
    }
    expect(result.data.ok).toBe(true)
    expect(result.data.data.server).toBe('s1')
  })

  // ---------- thumbnail ----------

  it('thumbnail:generate 调用 thumbnailGen.generate', async () => {
    const thumbnailGen = { generate: vi.fn().mockResolvedValue('/thumb/path'), getCacheDir: vi.fn() }
    registerMiscHandlers(makeCtx({ thumbnailGen }))
    const result = (await getHandler('thumbnail:generate')(['/file', 'high'])) as {
      success: true
      data: string
    }
    expect(assertFileReadPathMock).toHaveBeenCalledWith('/file')
    expect(thumbnailGen.generate).toHaveBeenCalledWith('/file', 'high')
    expect(result.data).toBe('/thumb/path')
  })

  // ---------- ui-theme ----------

  it('ui-theme:get 从 settings 读取，默认为 default', async () => {
    const ctx = makeCtx({})
    ;(ctx.dbManager.getSetting as ReturnType<typeof vi.fn>).mockReturnValue('soft-pink-luxury')
    registerMiscHandlers(ctx)
    const result = (await getHandler('ui-theme:get')()) as { success: true; data: { theme: string } }
    expect(ctx.dbManager.getSetting).toHaveBeenCalledWith('uiTheme', 'default')
    expect(result.data.theme).toBe('soft-pink-luxury')
  })

  it('ui-theme:set 调用 applyUITheme', async () => {
    const ctx = makeCtx({})
    registerMiscHandlers(ctx)
    const result = (await getHandler('ui-theme:set')(['soft-pink-luxury'])) as {
      success: true
      data: { applied: boolean }
    }
    expect(ctx.applyUITheme).toHaveBeenCalledWith('soft-pink-luxury')
    expect(result.data.applied).toBe(true)
  })

  // ---------- shell ----------

  it('shell:openExternal 成功时返回 { opened: true }', async () => {
    shellOpenExternalMock.mockResolvedValue(undefined)
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('shell:openExternal')(['https://example.com'])) as {
      success: true
      data: { opened: boolean }
    }
    expect(shellOpenExternalMock).toHaveBeenCalledWith('https://example.com')
    expect(result.data.opened).toBe(true)
  })

  it('shell:openExternal 抛错时返回 INTERNAL_ERROR', async () => {
    shellOpenExternalMock.mockRejectedValue(new Error('无法打开'))
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('shell:openExternal')(['https://example.com'])) as {
      success: false
      error: { code: string; message: string }
    }
    expect(result.error.code).toBe('IPC_INTERNAL_ERROR')
    expect(result.error.message).toContain('打开外部链接失败')
  })

  it('shell:openPath 校验路径并返回 opened', async () => {
    shellOpenPathMock.mockResolvedValue('')
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('shell:openPath')(['/some/dir'])) as {
      success: true
      data: { opened: boolean }
    }
    expect(assertFileReadPathMock).toHaveBeenCalledWith('/some/dir')
    expect(result.data.opened).toBe(true)
  })

  it('shell:openPath 抛错时返回 INTERNAL_ERROR', async () => {
    shellOpenPathMock.mockRejectedValue(new Error('拒绝访问'))
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('shell:openPath')(['/d'])) as { success: false; error: { code: string } }
    expect(result.error.code).toBe('IPC_INTERNAL_ERROR')
  })

  it('shell:showItemInFolder 调用 shell API', async () => {
    registerMiscHandlers(makeCtx({}))
    await getHandler('shell:showItemInFolder')(['/file'])
    expect(shellShowItemInFolderMock).toHaveBeenCalledWith('/file')
  })

  it('shell:showItemInFolder 抛错时返回 INTERNAL_ERROR', async () => {
    shellShowItemInFolderMock.mockImplementation(() => {
      throw new Error('not found')
    })
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('shell:showItemInFolder')(['/f'])) as { success: false; error: { code: string } }
    expect(result.error.code).toBe('IPC_INTERNAL_ERROR')
  })

  // ---------- settings ----------

  it('settings:get 校验失败时抛 validation', async () => {
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('settings:get')(['', 'default'])) as {
      success: false
      error: { code: string }
    }
    expect(result.error.code).toBe('IPC_VALIDATION_ERROR')
  })

  it('settings:get 成功时返回 settings 值', async () => {
    const ctx = makeCtx({})
    ;(ctx.dbManager.getSetting as ReturnType<typeof vi.fn>).mockReturnValue('value')
    registerMiscHandlers(ctx)
    const result = (await getHandler('settings:get')(['key', 'default'])) as { success: true; data: string }
    expect(ctx.dbManager.getSetting).toHaveBeenCalledWith('key', 'default')
    expect(result.data).toBe('value')
  })

  it('settings:set 成功时持久化并返回 saved', async () => {
    const ctx = makeCtx({})
    registerMiscHandlers(ctx)
    const result = (await getHandler('settings:set')(['key', { a: 1 }])) as {
      success: true
      data: { saved: boolean }
    }
    expect(ctx.dbManager.setSetting).toHaveBeenCalledWith('key', { a: 1 })
    expect(result.data.saved).toBe(true)
  })

  it('settings:set 值超过 1MB 时抛 validation', async () => {
    registerMiscHandlers(makeCtx({}))
    const big = 'x'.repeat(1024 * 1024 + 1)
    const result = (await getHandler('settings:set')(['key', big])) as {
      success: false
      error: { code: string; message: string }
    }
    expect(result.error.code).toBe('IPC_VALIDATION_ERROR')
    expect(result.error.message).toContain('过大')
  })

  // ---------- dialog ----------

  it('dialog:selectDirectory 取消时返回 null', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] })
    getFocusedWindowMock.mockReturnValue({ webContents: { send: vi.fn() } })
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('dialog:selectDirectory')()) as { success: true; data: string | null }
    expect(result.data).toBeNull()
  })

  it('dialog:selectDirectory 选择目录时返回路径', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['/selected'] })
    getFocusedWindowMock.mockReturnValue({ webContents: { send: vi.fn() } })
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('dialog:selectDirectory')()) as { success: true; data: string }
    expect(result.data).toBe('/selected')
  })

  it('dialog:selectDirectory 主窗口不存在时抛 preconditionFailed', async () => {
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('dialog:selectDirectory')()) as { success: false; error: { code: string } }
    expect(result.error.code).toBe('IPC_PRECONDITION_FAILED')
  })

  it('dialog:openFile 取消时返回 null', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] })
    getFocusedWindowMock.mockReturnValue({ webContents: { send: vi.fn() } })
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('dialog:openFile')([undefined])) as { success: true; data: string | null }
    expect(result.data).toBeNull()
  })

  it('dialog:openFile 选择文件时返回路径', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['/file.txt'] })
    getFocusedWindowMock.mockReturnValue({ webContents: { send: vi.fn() } })
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('dialog:openFile')([{ properties: ['openFile'] }])) as {
      success: true
      data: string
    }
    expect(result.data).toBe('/file.txt')
  })

  it('dialog:saveFile 取消时返回 null', async () => {
    showSaveDialogMock.mockResolvedValue({ canceled: true, filePath: '' })
    getFocusedWindowMock.mockReturnValue({ webContents: { send: vi.fn() } })
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('dialog:saveFile')([undefined])) as { success: true; data: string | null }
    expect(result.data).toBeNull()
  })

  it('dialog:saveFile 成功时返回路径', async () => {
    showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: '/out.txt' })
    getFocusedWindowMock.mockReturnValue({ webContents: { send: vi.fn() } })
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('dialog:saveFile')([{ defaultPath: '/out.txt' }])) as {
      success: true
      data: string
    }
    expect(result.data).toBe('/out.txt')
  })

  it('dialog:showMessageBox 返回 response 索引', async () => {
    showMessageBoxMock.mockResolvedValue({ response: 1 })
    getFocusedWindowMock.mockReturnValue({ webContents: { send: vi.fn() } })
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('dialog:showMessageBox')([{ message: 'hi' }])) as {
      success: true
      data: number
    }
    expect(result.data).toBe(1)
  })

  // ---------- data ----------

  it('data:clear 用户取消时抛 canceled', async () => {
    showMessageBoxMock.mockResolvedValue({ response: 0 })
    const db = { exec: vi.fn(), transaction: vi.fn((fn: () => void) => () => fn()) }
    registerMiscHandlers(makeCtx({ db }))
    const result = (await getHandler('data:clear')()) as { success: false; error: { code: string } }
    expect(result.error.code).toBe('IPC_CANCELED')
    expect(db.exec).not.toHaveBeenCalled()
  })

  it('data:clear 用户确认后清空所有表并清空缩略图目录', async () => {
    showMessageBoxMock.mockResolvedValue({ response: 1 })
    const db = { exec: vi.fn(), transaction: vi.fn((fn: () => void) => () => fn()) }
    fsReaddirMock.mockResolvedValue(['a', 'b'])
    fsRmMock.mockResolvedValue(undefined)
    const ctx = makeCtx({ db, thumbnailGen: { generate: vi.fn(), getCacheDir: vi.fn(() => '/cache') } })
    registerMiscHandlers(ctx)
    const result = (await getHandler('data:clear')()) as { success: true; data: { message: string } }
    expect(db.exec).toHaveBeenCalledWith('DELETE FROM media_files')
    expect(db.exec).toHaveBeenCalledWith('DELETE FROM scan_history')
    expect(db.exec).toHaveBeenCalledWith('DELETE FROM filter_presets WHERE is_builtin = 0')
    expect(db.exec).toHaveBeenCalledWith('DELETE FROM watermark_templates WHERE is_builtin = 0')
    expect(db.exec).toHaveBeenCalledWith('DELETE FROM edit_history')
    expect(fsReaddirMock).toHaveBeenCalledWith('/cache')
    expect(fsRmMock).toHaveBeenCalledTimes(2)
    expect(ctx.notifyMediaUpdated).toHaveBeenCalled()
    expect(result.data.message).toContain('已清除')
  })

  it('data:clear 数据库未初始化时抛 preconditionFailed', async () => {
    registerMiscHandlers(makeCtx({ db: null }))
    const result = (await getHandler('data:clear')()) as { success: false; error: { code: string } }
    expect(result.error.code).toBe('IPC_PRECONDITION_FAILED')
  })

  it('data:clear 缩略图目录读取失败时不影响清理', async () => {
    showMessageBoxMock.mockResolvedValue({ response: 1 })
    const db = { exec: vi.fn(), transaction: vi.fn((fn: () => void) => () => fn()) }
    fsReaddirMock.mockRejectedValue(new Error('ENOENT'))
    registerMiscHandlers(makeCtx({ db, thumbnailGen: { generate: vi.fn(), getCacheDir: vi.fn(() => '/cache') } }))
    const result = (await getHandler('data:clear')()) as { success: true; data: { message: string } }
    expect(result.success).toBe(true)
  })

  // ---------- import ----------

  it('import:preview 调用 fileService.previewImport', async () => {
    const fileService = { previewImport: vi.fn().mockResolvedValue({ items: [] }), importFiles: vi.fn() }
    registerMiscHandlers(makeCtx({ fileService }))
    const result = (await getHandler('import:preview')(['/src'])) as { success: true; data: { items: unknown[] } }
    expect(assertFileReadPathMock).toHaveBeenCalledWith('/src')
    expect(fileService.previewImport).toHaveBeenCalledWith('/src')
    expect(result.data.items).toEqual([])
  })

  it('import:run 成功时返回 result 并触发 notifyMediaUpdated', async () => {
    const fileService = {
      previewImport: vi.fn(),
      importFiles: vi.fn().mockImplementation(async (_srcs: string[], _dst: string, _opts: unknown, onProgress: (c: number, t: number) => void) => {
        onProgress(1, 2)
        return { imported: [{ path: '/d/a' }], skipped: [], failed: [] }
      })
    }
    const ctx = makeCtx({ fileService })
    getFocusedWindowMock.mockReturnValue({ webContents: { send: vi.fn() } })
    registerMiscHandlers(ctx)
    const opts = { namingRule: 'keep', categorize: 'flat', conflictStrategy: 'skip' }
    const result = (await getHandler('import:run')([['/s'], '/d', opts])) as {
      success: true
      data: { imported: unknown[] }
    }
    expect(assertFileReadPathMock).toHaveBeenCalledWith('/s')
    expect(assertFileWritePathMock).toHaveBeenCalledWith('/d')
    expect(fileService.importFiles).toHaveBeenCalled()
    expect(ctx.notifyMediaUpdated).toHaveBeenCalled()
    expect(result.data.imported).toHaveLength(1)
  })

  it('import:run 无导入项时不触发 notifyMediaUpdated', async () => {
    const fileService = {
      previewImport: vi.fn(),
      importFiles: vi.fn().mockResolvedValue({ imported: [], skipped: [], failed: [] })
    }
    const ctx = makeCtx({ fileService })
    registerMiscHandlers(ctx)
    const opts = { namingRule: 'keep', categorize: 'flat', conflictStrategy: 'skip' }
    await getHandler('import:run')([['/s'], '/d', opts])
    expect(ctx.notifyMediaUpdated).not.toHaveBeenCalled()
  })

  it('import:run service 抛错时返回 INTERNAL_ERROR', async () => {
    const fileService = {
      previewImport: vi.fn(),
      importFiles: vi.fn().mockRejectedValue(new Error('磁盘满'))
    }
    registerMiscHandlers(makeCtx({ fileService }))
    const opts = { namingRule: 'keep', categorize: 'flat', conflictStrategy: 'skip' }
    const result = (await getHandler('import:run')([['/s'], '/d', opts])) as {
      success: false
      error: { code: string; message: string }
    }
    expect(result.error.code).toBe('IPC_INTERNAL_ERROR')
    expect(result.error.message).toContain('导入失败')
  })

  // ---------- app ----------

  it('app:relaunch 调用 app.relaunch + app.quit', async () => {
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('app:relaunch')()) as { success: true; data: { relaunching: boolean } }
    expect(appRelaunchMock).toHaveBeenCalled()
    expect(appQuitMock).toHaveBeenCalled()
    expect(result.data.relaunching).toBe(true)
  })

  it('app:getVersion 返回 app.getVersion()', async () => {
    appGetVersionMock.mockReturnValue('2.3.0')
    registerMiscHandlers(makeCtx({}))
    const result = (await getHandler('app:getVersion')()) as { success: true; data: string }
    expect(result.data).toBe('2.3.0')
  })

  // ---------- operation-history ----------

  it('operation-history:add 成功时返回自增 id', async () => {
    const runMock = vi.fn(() => ({ lastInsertRowid: 5n }))
    const db = { prepare: vi.fn(() => ({ run: runMock })) }
    registerMiscHandlers(makeCtx({ db }))
    const payload = {
      operationType: 'edit',
      payload: { k: 1 },
      description: '描述',
      createdAt: '2026-01-01'
    }
    const result = (await getHandler('operation-history:add')([payload])) as {
      success: true
      data: { id: number }
    }
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO operation_history'))
    expect(runMock).toHaveBeenCalledWith('edit', null, JSON.stringify({ k: 1 }), '描述', '2026-01-01')
    expect(result.data.id).toBe(5)
  })

  it('operation-history:add 数据库未初始化时抛 preconditionFailed', async () => {
    registerMiscHandlers(makeCtx({ db: null }))
    const payload = { operationType: 't', payload: {}, description: 'd', createdAt: '2026-01-01' }
    const result = (await getHandler('operation-history:add')([payload])) as {
      success: false
      error: { code: string }
    }
    expect(result.error.code).toBe('IPC_PRECONDITION_FAILED')
  })

  it('operation-history:list 默认 limit=50', async () => {
    const allMock = vi.fn(() => [
      { id: 1, operation_type: 't', media_id: null, payload: '{}', description: 'd', created_at: '2026-01-01' }
    ])
    const db = { prepare: vi.fn(() => ({ all: allMock })) }
    registerMiscHandlers(makeCtx({ db }))
    const result = (await getHandler('operation-history:list')([undefined])) as {
      success: true
      data: { records: Array<{ id: number }> }
    }
    expect(allMock).toHaveBeenCalledWith(50)
    expect(result.data.records[0].id).toBe(1)
  })

  it('operation-history:list 自定义 limit 时透传', async () => {
    const allMock = vi.fn(() => [])
    const db = { prepare: vi.fn(() => ({ all: allMock })) }
    registerMiscHandlers(makeCtx({ db }))
    await getHandler('operation-history:list')([10])
    expect(allMock).toHaveBeenCalledWith(10)
  })

  it('operation-history:list 数据库未初始化时抛 preconditionFailed', async () => {
    registerMiscHandlers(makeCtx({ db: null }))
    const result = (await getHandler('operation-history:list')([undefined])) as {
      success: false
      error: { code: string }
    }
    expect(result.error.code).toBe('IPC_PRECONDITION_FAILED')
  })

  it('operation-history:remove 调用 DELETE 语句', async () => {
    const runMock = vi.fn()
    const db = { prepare: vi.fn(() => ({ run: runMock })) }
    registerMiscHandlers(makeCtx({ db }))
    const result = (await getHandler('operation-history:remove')([3])) as {
      success: true
      data: { removed: boolean }
    }
    expect(db.prepare).toHaveBeenCalledWith('DELETE FROM operation_history WHERE id = ?')
    expect(runMock).toHaveBeenCalledWith(3)
    expect(result.data.removed).toBe(true)
  })

  it('operation-history:clear 清空所有记录', async () => {
    const runMock = vi.fn()
    const db = { prepare: vi.fn(() => ({ run: runMock })) }
    registerMiscHandlers(makeCtx({ db }))
    const result = (await getHandler('operation-history:clear')()) as {
      success: true
      data: { cleared: boolean }
    }
    expect(db.prepare).toHaveBeenCalledWith('DELETE FROM operation_history')
    expect(result.data.cleared).toBe(true)
  })

  it('operation-history:clear 数据库未初始化时抛 preconditionFailed', async () => {
    registerMiscHandlers(makeCtx({ db: null }))
    const result = (await getHandler('operation-history:clear')()) as { success: false; error: { code: string } }
    expect(result.error.code).toBe('IPC_PRECONDITION_FAILED')
  })
})
