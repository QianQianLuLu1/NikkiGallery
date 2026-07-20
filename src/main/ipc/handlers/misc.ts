import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { z } from 'zod'
import path from 'path'
import fs from 'fs'
import type { HandlerContext } from '../handler-context'
import {
  wrapHandler,
  wrapHandlerNoArgs,
  wrapHandlerRaw,
  schemas,
  assertFileReadPath,
  assertFileWritePath
} from '../validator'
import { AppError } from '../../../shared/errors/app-error'
import { logger } from '../../utils/logger'
// P1-A1：4 组函数抽取到共享服务模块，启动路径与 IPC 路径共用同一份实现
import { generateThumbnailsForUnprocessed } from '../../services/thumbnail-phash-service'

/**
 * 复刻 index.ts 中 this.getMainWindow() 的行为：
 * 优先取主窗口，回退到当前焦点窗口，均无则抛错。
 * ctx.getMainWindow() 返回 null 时不抛，这里负责补上抛错语义以保留原行为。
 */
function requireMainWindow(ctx: HandlerContext): BrowserWindow {
  const win = ctx.getMainWindow() ?? BrowserWindow.getFocusedWindow()
  if (!win) throw AppError.preconditionFailed('主窗口未初始化')
  return win
}

// 文件导入支持的命名规则 / 分类策略 / 冲突策略枚举
const importOptionsSchema = z.object({
  namingRule: z.enum(['keep', 'date', 'seq']),
  categorize: z.enum(['flat', 'byDate', 'byMonth']),
  conflictStrategy: z.enum(['skip', 'rename', 'overwrite']),
  seqStart: z.number().int().min(0).max(1_000_000).optional()
})

// scanner:start 参数 schema（提取到模块级避免每次调用重建）
const scannerStartSchema = z
  .object({
    path: schemas.filePath.optional(),
    incremental: z.boolean().optional(),
    customKnownPaths: z.array(schemas.filePath).max(64, '自定义路径数量上限 64').optional(),
    fullScan: z.boolean().optional()
  })
  .optional()

// 对话框 filters 公共 schema
const dialogFiltersSchema = z
  .array(
    z.object({
      name: z.string().max(64),
      extensions: z.array(z.string().max(16)).max(32)
    })
  )
  .max(16)
  .optional()

/**
 * P0-A1：从 Application.setupIPC() 迁移的杂项 IPC handler 集合。
 * 覆盖 scanner / decrypt / thumbnail / ui-theme / shell / settings / dialog / data / import / app 域。
 */
export function registerMiscHandlers(ctx: HandlerContext): void {
  // ---- scanner 域 ----
  // scanner:start 特殊：参数校验失败 / handler 抛错也必须广播 scanner:complete 事件，
  // 否则前端 ScanButton.onComplete 兜底失效。故使用 wrapHandlerRaw 自行编排广播逻辑。
  ipcMain.handle(
    'scanner:start',
    wrapHandlerRaw<{ filesFound?: number; message?: string; success: boolean }>(
      ctx,
      async (args, ctx) => {
        const sendComplete = (result: { success: boolean; message?: string }) => {
          ctx.getMainWindow()?.webContents.send('scanner:complete', result)
        }
        const parsed = scannerStartSchema.safeParse(args[0])
        if (!parsed.success) {
          const message = parsed.error.issues
            .map((i) => `[${i.path.join('.')}] ${i.message}`)
            .join('; ')
          sendComplete({ success: false, message: `参数校验失败: ${message}` })
          // 抛 AppError 由 wrapHandlerRaw 统一包装为失败响应
          throw AppError.validation(`参数校验失败: ${message}`)
        }
        const options = parsed.data
        try {
          const result = await ctx.scannerManager.startScan(options)
          if (result.success && result.filesFound && result.filesFound > 0) {
            // 扫描完成后异步生成缩略图并读取尺寸
            // 分级调度：链式触发的缩略图生成作为低优先级任务入队，避免与用户操作争抢 CPU
            generateThumbnailsForUnprocessed(ctx, 'low').catch(console.error)
          }
          // 通知渲染进程扫描已结束，防止 IPC 返回前 UI 卡在"正在扫描"
          sendComplete(result)
          return result
        } catch (error) {
          const message = `扫描失败: ${error instanceof Error ? error.message : String(error)}`
          sendComplete({ success: false, message })
          logger.error('[scanner:start] 失败:', error)
          throw AppError.internal(message)
        }
      }
    )
  )

  ipcMain.handle(
    'scanner:stop',
    wrapHandlerNoArgs(ctx, async () => ctx.scannerManager.stopScan())
  )

  ipcMain.handle(
    'scanner:status',
    wrapHandlerNoArgs(ctx, async () => ctx.scannerManager.getStatus())
  )

  // ---- decrypt 域 ----
  // 游戏参数解密
  ipcMain.handle(
    'decrypt:decodeFile',
    wrapHandler(
      ctx,
      z.tuple([
        schemas.filePath,
        z.string().min(1, 'albumType 不能为空').max(32, 'albumType 长度上限 32'),
        z.string().min(1).max(64).optional()
      ]),
      async ([filePath, albumType, uid]) => {
        assertFileReadPath(filePath)
        const { decodeFileParams } = await import('../../services/decryption-service')
        // P0-A3：decodeFileParams 已改为 async（mutex 串行化 + 异步文件读取）
        const result = await decodeFileParams(filePath, albumType, uid)
        return {
          ok: !result.error,
          data: result,
          message: result.error
        }
      }
    )
  )

  // Group 2: 相机参数加密（将 JSON 加密为密文）
  ipcMain.handle(
    'decrypt:encodeCameraParams',
    wrapHandler(
      ctx,
      z.tuple([z.string().min(1, 'jsonText 不能为空').max(1024 * 1024, 'jsonText 长度上限 1MB')]),
      async ([jsonText]) => {
        const { encodeCameraParams } = await import('../../services/decryption-service')
        const result = await encodeCameraParams(jsonText)
        return {
          ok: result.success,
          data: result.data ? result.data.toString('base64') : undefined,
          message: result.error
        }
      }
    )
  )

  // Group 3: 染色分享码解码
  ipcMain.handle(
    'decrypt:decodeClothDiy',
    wrapHandler(
      ctx,
      z.tuple([z.string().min(1, 'codeStr 不能为空').max(1024 * 1024, 'codeStr 长度上限 1MB')]),
      async ([codeStr]) => {
        const { decodeClothDiyShareCode } = await import('../../services/decryption-service')
        const result = await decodeClothDiyShareCode(codeStr)
        return {
          ok: result.success,
          data: {
            timestamp: result.timestamp,
            uidBytes: result.uidBytes ? result.uidBytes.toString('hex') : undefined,
            networkData: result.networkData
          },
          message: result.error
        }
      }
    )
  )

  // Group 4: 家园建造分享码解码
  ipcMain.handle(
    'decrypt:decodeHomeBuild',
    wrapHandler(
      ctx,
      z.tuple([z.string().min(1, 'codeStr 不能为空').max(1024 * 1024, 'codeStr 长度上限 1MB')]),
      async ([codeStr]) => {
        const { decodeHomeBuildShareCode } = await import('../../services/decryption-service')
        const result = await decodeHomeBuildShareCode(codeStr)
        return {
          ok: result.success,
          data: {
            server: result.server,
            networkData: result.networkData
          },
          message: result.error
        }
      }
    )
  )

  // ---- thumbnail 域 ----
  // 缩略图生成
  ipcMain.handle(
    'thumbnail:generate',
    wrapHandler(
      ctx,
      z.tuple([schemas.filePath, schemas.thumbnailQuality]),
      async ([filePath, quality]) => {
        assertFileReadPath(filePath)
        return ctx.thumbnailGen.generate(filePath, quality)
      }
    )
  )

  // ---- ui-theme 域 ----
  // 界面主题（统一主题接口，原 theme:get/set 系统亮暗接口已删除——暗色模式由界面主题派生）
  ipcMain.handle(
    'ui-theme:get',
    wrapHandlerNoArgs(ctx, async () => ({
      theme: ctx.dbManager.getSetting('uiTheme', 'default')
    }))
  )

  ipcMain.handle(
    'ui-theme:set',
    wrapHandler(ctx, z.tuple([schemas.uiTheme]), async ([theme]) => {
      ctx.applyUITheme(theme)
      return { applied: true }
    })
  )

  // ---- shell 域 ----
  // 外部链接
  ipcMain.handle(
    'shell:openExternal',
    wrapHandler(ctx, z.tuple([schemas.httpUrl]), async ([url]) => {
      try {
        await shell.openExternal(url)
        return { opened: true }
      } catch (error) {
        throw AppError.internal(
          `打开外部链接失败: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    })
  )

  // T01：在资源管理器中打开目录
  ipcMain.handle(
    'shell:openPath',
    wrapHandler(ctx, z.tuple([schemas.filePath]), async ([dirPath]) => {
      // P1-A5：路径白名单校验（同时包含敏感目录黑名单）
      assertFileReadPath(dirPath)
      try {
        await shell.openPath(dirPath)
        return { opened: true }
      } catch (error) {
        throw AppError.internal(
          `打开目录失败: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    })
  )

  // 在资源管理器中打开文件所在位置并选中该文件
  // shell.showItemInFolder 是 Electron 内置 API，仅 Windows/macOS 支持
  ipcMain.handle(
    'shell:showItemInFolder',
    wrapHandler(ctx, z.tuple([schemas.filePath]), async ([filePath]) => {
      assertFileReadPath(filePath)
      try {
        shell.showItemInFolder(filePath)
        return { opened: true }
      } catch (error) {
        throw AppError.internal(
          `打开文件所在位置失败: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    })
  )

  // ---- settings 域 ----
  // 应用设置
  // settings:get 保留原"返回 defaultValue"语义：当 key 不存在时直接返回 defaultValue
  // 用 wrapHandlerRaw 自行校验参数，handler 返回原始值由 wrapHandlerRaw 包装为 IpcResponse<T>
  ipcMain.handle(
    'settings:get',
    wrapHandlerRaw<unknown>(
      ctx,
      async (args, ctx) => {
        const parsed = z
          .tuple([
            z.string().min(1, 'key 不能为空').max(128, 'key 长度上限 128'),
            z.unknown().optional()
          ])
          .safeParse(args)
        if (!parsed.success) {
          throw AppError.validation(
            `参数校验失败: ${parsed.error.issues.map((i) => i.message).join('; ')}`
          )
        }
        const [key, defaultValue] = parsed.data
        return ctx.dbManager.getSetting(key, defaultValue)
      }
    )
  )

  ipcMain.handle(
    'settings:set',
    wrapHandler(
      ctx,
      z.tuple([z.string().min(1, 'key 不能为空').max(128, 'key 长度上限 128'), z.unknown()]),
      async ([key, value]) => {
        // P1-D：校验 value 大小，防止恶意/异常调用写入超大 JSON
        try {
          const valueStr = JSON.stringify(value)
          if (valueStr.length > 1024 * 1024) {
            throw AppError.validation('设置值过大（上限 1MB）')
          }
        } catch (err) {
          if (err instanceof AppError) throw err
          throw AppError.validation('设置值无法序列化')
        }
        ctx.dbManager.setSetting(key, value)
        return { saved: true }
      }
    )
  )

  // ---- dialog 域 ----
  // dialog:* 系列保留原"取消时返回 null"语义：handler 返回 string|null，由 wrapHandler 包装为 IpcResponse<string|null>
  ipcMain.handle(
    'dialog:selectDirectory',
    wrapHandlerNoArgs<string | null>(ctx, async () => {
      const result = await dialog.showOpenDialog(requireMainWindow(ctx), {
        properties: ['openDirectory']
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    })
  )

  // 增强对话框
  ipcMain.handle(
    'dialog:openFile',
    wrapHandler<string | null>(
      ctx,
      z.tuple([
        z
          .object({
            properties: z
              .array(
                z.enum([
                  'openFile',
                  'openDirectory',
                  'multiSelections',
                  'showHiddenFiles',
                  'createDirectory',
                  'promptToCreate',
                  'noResolveAliases',
                  'treatPackageAsDirectory',
                  'dontAddToRecent'
                ])
              )
              .optional(),
            filters: dialogFiltersSchema
          })
          .optional()
      ]),
      async ([options]) => {
        const result = await dialog.showOpenDialog(requireMainWindow(ctx), {
          properties: options?.properties || ['openFile'],
          filters: options?.filters
        })
        return result.canceled ? null : result.filePaths[0] ?? null
      }
    )
  )

  ipcMain.handle(
    'dialog:saveFile',
    wrapHandler<string | null>(
      ctx,
      z.tuple([
        z
          .object({
            defaultPath: z.string().max(1024).optional(),
            filters: dialogFiltersSchema
          })
          .optional()
      ]),
      async ([options]) => {
        const result = await dialog.showSaveDialog(requireMainWindow(ctx), {
          defaultPath: options?.defaultPath,
          filters: options?.filters
        })
        return result.canceled ? null : result.filePath ?? null
      }
    )
  )

  ipcMain.handle(
    'dialog:showMessageBox',
    wrapHandler<number>(
      ctx,
      z.tuple([
        z.object({
          type: z.enum(['none', 'info', 'error', 'question', 'warning']).optional(),
          title: z.string().max(256).optional(),
          message: z.string().min(1, 'message 不能为空').max(8 * 1024),
          buttons: z.array(z.string().max(64)).max(16).optional()
        })
      ]),
      async ([options]) => {
        const result = await dialog.showMessageBox(requireMainWindow(ctx), {
          type: options.type || 'info',
          title: options.title,
          message: options.message,
          buttons: options.buttons || ['确定']
        })
        return result.response
      }
    )
  )

  // ---- data 域 ----
  // 数据管理
  ipcMain.handle(
    'data:clear',
    wrapHandlerNoArgs(ctx, async () => {
      const db = ctx.dbManager.getDatabase()
      if (!db) throw AppError.preconditionFailed('数据库未初始化')

      // A-S3：高危操作二次确认（清空所有媒体数据不可恢复）
      const confirmResult = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['取消', '确认清空'],
        defaultId: 0,
        cancelId: 0,
        title: '确认清空数据',
        message: '此操作将清除所有媒体记录、扫描历史、自定义筛选器与水印模板，且不可恢复。',
        detail: '缩略图缓存也将被清空。是否继续？'
      })
      if (confirmResult.response !== 1) {
        throw AppError.canceled('用户取消操作')
      }

      const clearAll = db.transaction(() => {
        db.exec('DELETE FROM media_files')
        db.exec('DELETE FROM scan_history')
        db.exec('DELETE FROM filter_presets WHERE is_builtin = 0')
        db.exec('DELETE FROM watermark_templates WHERE is_builtin = 0')
        db.exec('DELETE FROM edit_history')
      })
      clearAll()

      // 清理缩略图缓存目录
      const thumbnailDir = ctx.thumbnailGen.getCacheDir()
      try {
        const entries = await fs.promises.readdir(thumbnailDir)
        await Promise.all(
          entries.map((entry) =>
            fs.promises.rm(path.join(thumbnailDir, entry), { recursive: true, force: true })
          )
        )
      } catch {
        // 目录不存在时忽略
      }

      ctx.notifyMediaUpdated()
      return { message: '本地数据已清除' }
    })
  )

  // ---- import 域 ----
  // T14：文件导入向导 IPC
  // 预览源目录中的待导入文件（仅元信息，不复制）
  ipcMain.handle(
    'import:preview',
    wrapHandler(ctx, z.tuple([schemas.filePath]), async ([sourceDir]) => {
      assertFileReadPath(sourceDir)
      return ctx.fileService.previewImport(sourceDir)
    })
  )

  // 执行批量导入（复制到目标目录，支持命名规则与分类策略）
  ipcMain.handle(
    'import:run',
    wrapHandler(
      ctx,
      z.tuple([schemas.filePathArray, schemas.filePath, importOptionsSchema]),
      async ([sourcePaths, targetBaseDir, options]) => {
        for (const p of sourcePaths) assertFileReadPath(p)
        assertFileWritePath(targetBaseDir)
        try {
          const result = await ctx.fileService.importFiles(
            sourcePaths,
            targetBaseDir,
            options,
            (current: number, total: number) => {
              ctx.getMainWindow()?.webContents.send('import:progress', { current, total })
            }
          )
          if (result.imported.length > 0) {
            // 通知媒体列表刷新（导入的文件需重新扫描入库）
            ctx.notifyMediaUpdated()
            logger.info(
              `[Import] 导入完成: 成功 ${result.imported.length} 个，跳过 ${result.skipped.length} 个，失败 ${result.failed.length} 个`
            )
          }
          return result
        } catch (error) {
          logger.error('[Import] 导入失败:', error)
          throw AppError.internal(
            `导入失败: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
    )
  )

  // ---- app 域 ----
  // 重启应用（自定义目录切换后调用）
  // 修复：用 app.quit 触发 before-quit 清理流程，确保数据库 checkpoint 和子进程 kill
  ipcMain.handle(
    'app:relaunch',
    wrapHandlerNoArgs(ctx, async () => {
      app.relaunch()
      app.quit()
      return { relaunching: true }
    })
  )

  // U1：获取应用版本号，避免渲染层硬编码 v2.5.0
  ipcMain.handle(
    'app:getVersion',
    wrapHandlerNoArgs(ctx, async () => app.getVersion())
  )

  // ---- operation-history 域 ----
  // 建议改#9：操作历史持久化 IPC（支持跨重启撤销）
  // 新增记录，返回自增 id
  ipcMain.handle(
    'operation-history:add',
    wrapHandler(
      ctx,
      z.tuple([
        z.object({
          operationType: z.string().min(1, 'operationType 不能为空').max(64),
          mediaId: z.number().int().positive().optional(),
          payload: z.unknown(),
          description: z.string().min(1).max(512),
          createdAt: z.string().min(1).max(64)
        })
      ]),
      async ([record]) => {
        const db = ctx.dbManager.getDatabase()
        if (!db) throw AppError.preconditionFailed('数据库未初始化')
        const result = db
          .prepare(
            'INSERT INTO operation_history (operation_type, media_id, payload, description, created_at) VALUES (?, ?, ?, ?, ?)'
          )
          .run(
            record.operationType,
            record.mediaId ?? null,
            JSON.stringify(record.payload),
            record.description,
            record.createdAt
          )
        return { id: Number(result.lastInsertRowid) }
      }
    )
  )

  // 查询最近 N 条记录（按时间正序，栈顶在末尾）
  ipcMain.handle(
    'operation-history:list',
    wrapHandler(
      ctx,
      z.tuple([z.number().int().min(1).max(50).optional()]),
      async ([limitOpt]) => {
        const db = ctx.dbManager.getDatabase()
        if (!db) throw AppError.preconditionFailed('数据库未初始化')
        const safeLimit = limitOpt ?? 50
        const rows = db
          .prepare(
            'SELECT id, operation_type, media_id, payload, description, created_at FROM operation_history ORDER BY created_at DESC LIMIT ?'
          )
          .all(safeLimit) as Array<{
          id: number
          operation_type: string
          media_id: number | null
          payload: string
          description: string
          created_at: string
        }>
        // 反转为正序（栈顶在末尾），与内存栈一致
        const records = rows.reverse().map((r) => ({
          id: r.id,
          operationType: r.operation_type,
          mediaId: r.media_id,
          payload: r.payload,
          description: r.description,
          createdAt: r.created_at
        }))
        return { records }
      }
    )
  )

  // 删除指定 id 的记录（撤销成功后调用）
  ipcMain.handle(
    'operation-history:remove',
    wrapHandler(ctx, z.tuple([schemas.positiveIntId]), async ([id]) => {
      const db = ctx.dbManager.getDatabase()
      if (!db) throw AppError.preconditionFailed('数据库未初始化')
      db.prepare('DELETE FROM operation_history WHERE id = ?').run(id)
      return { removed: true }
    })
  )

  // 清空所有操作历史
  ipcMain.handle(
    'operation-history:clear',
    wrapHandlerNoArgs(ctx, async () => {
      const db = ctx.dbManager.getDatabase()
      if (!db) throw AppError.preconditionFailed('数据库未初始化')
      db.prepare('DELETE FROM operation_history').run()
      return { cleared: true }
    })
  )
}
