import { BrowserWindow, ipcMain, dialog } from 'electron'
import { z } from 'zod'
import fs from 'fs'
import type { HandlerContext } from '../handler-context'
import { wrapHandler, wrapHandlerNoArgs, schemas } from '../validator'
import { AppError } from '../../../shared/errors/app-error'
// P1-M：编辑器服务（sharp pipeline 与备份/写入逻辑）
import { editorService } from '../../services/editor-service'

/**
 * 复刻 index.ts 中 this.getMainWindow() 的行为：
 * 优先取主窗口，回退到当前焦点窗口，均无则抛错。
 */
function requireMainWindow(ctx: HandlerContext): BrowserWindow {
  const win = ctx.getMainWindow() ?? BrowserWindow.getFocusedWindow()
  if (!win) throw AppError.preconditionFailed('主窗口未初始化')
  return win
}

// dataUrl 200MB 上限（base64 编码后的字符串长度）
const MAX_DATA_URL_LENGTH = 200 * 1024 * 1024

// 滤镜预设 schema：name + category + params（params 为字符串或对象）
const filterPresetSchema = z.object({
  name: z.string().min(1, 'name 不能为空').max(128, 'name 长度上限 128'),
  category: z.string().min(1, 'category 不能为空').max(64, 'category 长度上限 64'),
  params: z.union([z.string().max(64 * 1024), z.record(z.unknown())])
})

export function registerEditorHandlers(ctx: HandlerContext): void {
  ipcMain.handle(
    'editor:save',
    wrapHandler(
      ctx,
      z.tuple([
        schemas.filePath,
        z.string().min(1, 'dataUrl 不能为空').max(MAX_DATA_URL_LENGTH, 'dataUrl 长度上限 200MB'),
        z
          .object({
            format: z.string().max(32).optional(),
            quality: z.number().int().min(1).max(100).optional(),
            params: z.string().max(64 * 1024).optional()
          })
          .optional()
      ]),
      async ([filePath, dataUrl, options]) => {
        // P1-M：sharp pipeline 已抽取到 editorService.save()
        // 职责分离：handler 仅做参数校验，业务逻辑（备份/写入/恢复/历史记录）由 service 处理
        return editorService.save(filePath, dataUrl, options)
      }
    )
  )

  ipcMain.handle(
    'editor:saveAs',
    wrapHandler(
      ctx,
      z.tuple([
        z.string().min(1, 'dataUrl 不能为空').max(MAX_DATA_URL_LENGTH, 'dataUrl 长度上限 200MB'),
        z
          .object({
            directory: z.string().max(1024).optional(),
            fileName: z.string().max(255).optional(),
            format: z.string().max(32).optional(),
            quality: z.number().int().min(1).max(100).optional()
          })
          .optional()
      ]),
      async ([dataUrl, options]) => {
        return ctx.fileService.saveDataUrl(dataUrl, options || {})
      }
    )
  )

  ipcMain.handle(
    'editor:exportPreset',
    wrapHandler(
      ctx,
      z.tuple([filterPresetSchema]),
      async ([preset]) => {
        const db = ctx.dbManager.getDatabase()
        if (!db) throw AppError.preconditionFailed('数据库未初始化')
        const result = db
          .prepare(
            'INSERT INTO filter_presets (name, category, params, is_builtin, created_at) VALUES (?, ?, ?, 0, datetime("now"))'
          )
          .run(
            preset.name,
            preset.category,
            typeof preset.params === 'string' ? preset.params : JSON.stringify(preset.params)
          )
        return { id: Number(result.lastInsertRowid) }
      }
    )
  )

  // P1-N：validateFilterPreset 已迁移到 utils/ipc-validate.ts（统一校验工具位置）

  // 滤镜预设 JSON 文件导出/导入
  ipcMain.handle(
    'editor:exportPresetToFile',
    wrapHandler(
      ctx,
      z.tuple([filterPresetSchema]),
      async ([preset]) => {
        const result = await dialog.showSaveDialog(requireMainWindow(ctx), {
          defaultPath: `${preset.name || 'filter-preset'}.json`,
          filters: [{ name: '滤镜预设', extensions: ['json'] }]
        })
        if (result.canceled || !result.filePath) {
          throw AppError.canceled('用户取消保存')
        }
        const data = JSON.stringify(preset, null, 2)
        await fs.promises.writeFile(result.filePath, data, 'utf-8')
        return { filePath: result.filePath }
      }
    )
  )

  ipcMain.handle(
    'editor:importPresetFromFile',
    wrapHandlerNoArgs(ctx, async () => {
      const result = await dialog.showOpenDialog(requireMainWindow(ctx), {
        properties: ['openFile'],
        filters: [{ name: '滤镜预设', extensions: ['json'] }]
      })
      if (result.canceled || result.filePaths.length === 0) {
        throw AppError.canceled('用户取消选择')
      }
      const content = await fs.promises.readFile(result.filePaths[0], 'utf-8')
      let preset: unknown
      try {
        preset = JSON.parse(content)
      } catch (err) {
        throw AppError.validation(
          'JSON 解析失败',
          err instanceof Error ? { message: err.message } : undefined
        )
      }
      // 复用 schema 校验导入的预设结构
      const parsed = filterPresetSchema.safeParse(preset)
      if (!parsed.success) {
        throw AppError.validation(
          '预设格式无效',
          parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
        )
      }
      return { preset: parsed.data, filePath: result.filePaths[0] }
    })
  )

  ipcMain.handle(
    'editor:loadPresets',
    wrapHandlerNoArgs(ctx, async () => {
      const db = ctx.dbManager.getDatabase()
      if (!db) throw AppError.preconditionFailed('数据库未初始化')
      const rows = db
        .prepare(
          'SELECT id, name, category, params, is_builtin, created_at FROM filter_presets ORDER BY created_at DESC'
        )
        .all() as Array<{
        id: number
        name: string
        category: string
        params: string
        is_builtin: number
        created_at: string
      }>
      return {
        presets: rows.map((r) => ({
          id: String(r.id),
          name: r.name,
          category: r.category,
          params: JSON.parse(r.params),
          isBuiltin: !!r.is_builtin,
          createdAt: r.created_at
        }))
      }
    })
  )

  ipcMain.handle(
    'editor:deletePreset',
    wrapHandler(
      ctx,
      z.tuple([z.union([z.string().min(1).max(64), z.number().int().positive()])]),
      async ([id]) => {
        const db = ctx.dbManager.getDatabase()
        if (!db) throw AppError.preconditionFailed('数据库未初始化')
        db.prepare('DELETE FROM filter_presets WHERE id = ? AND is_builtin = 0').run(id)
        return { deleted: true }
      }
    )
  )
}
