import { BrowserWindow, ipcMain, dialog } from 'electron'
import fs from 'fs'
import type { HandlerContext } from '../handler-context'
// A-S9：IPC 参数校验工具
import { validateFilePath, validateIntRange, validateFilterPreset } from '../../utils/ipc-validate'
// P1-M：编辑器服务（sharp pipeline 与备份/写入逻辑）
import { editorService } from '../../services/editor-service'

/**
 * 复刻 index.ts 中 this.getMainWindow() 的行为：
 * 优先取主窗口，回退到当前焦点窗口，均无则抛错。
 */
function requireMainWindow(ctx: HandlerContext): BrowserWindow {
  const win = ctx.getMainWindow() ?? BrowserWindow.getFocusedWindow()
  if (!win) throw new Error('主窗口未初始化')
  return win
}

export function registerEditorHandlers(ctx: HandlerContext): void {
  ipcMain.handle('editor:save', async (_, filePath: string, dataUrl: string, options?: { format?: string; quality?: number; params?: string }) => {
    try {
      // A-S9：参数校验
      const vPath = validateFilePath(filePath)
      if (!vPath.valid) return { success: false, message: vPath.message }
      if (typeof dataUrl !== 'string' || dataUrl.length === 0 || dataUrl.length > 200 * 1024 * 1024) {
        return { success: false, message: 'dataUrl 长度无效（限 200MB）' }
      }
      if (options?.quality !== undefined) {
        const vQ = validateIntRange(options.quality, 1, 100, 'quality')
        if (!vQ.valid) return { success: false, message: vQ.message }
      }

      // P1-M：sharp pipeline 已抽取到 editorService.save()
      // 职责分离：handler 仅做参数校验，业务逻辑（备份/写入/恢复/历史记录）由 service 处理
      const result = await editorService.save(filePath, dataUrl, options)
      return result
    } catch (error) {
      return { success: false, message: `保存失败: ${error instanceof Error ? error.message : String(error)}` }
    }
  })

  ipcMain.handle('editor:saveAs', async (_, dataUrl: string, options?: { directory?: string; fileName?: string; format?: string; quality?: number }) => {
    // A2：与 editor:save 一致的 200MB 上限校验
    if (typeof dataUrl !== 'string' || dataUrl.length === 0 || dataUrl.length > 200 * 1024 * 1024) {
      return { success: false, message: 'dataUrl 长度无效（限 200MB）' }
    }
    return ctx.fileService.saveDataUrl(dataUrl, options || {})
  })

  ipcMain.handle('editor:exportPreset', async (_, preset: { name: string; category: string; params: string }) => {
    try {
      const db = ctx.dbManager.getDatabase()
      if (!db) throw new Error('数据库未初始化')
      const result = db.prepare(
        'INSERT INTO filter_presets (name, category, params, is_builtin, created_at) VALUES (?, ?, ?, 0, datetime("now"))'
      ).run(preset.name, preset.category, preset.params)
      return { success: true, id: Number(result.lastInsertRowid) }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // P1-N：validateFilterPreset 已迁移到 utils/ipc-validate.ts（统一校验工具位置）

  // 滤镜预设 JSON 文件导出/导入
  ipcMain.handle('editor:exportPresetToFile', async (_, preset: { name: string; category: string; params: unknown }) => {
    try {
      const result = await dialog.showSaveDialog(requireMainWindow(ctx), {
        defaultPath: `${preset.name || 'filter-preset'}.json`,
        filters: [{ name: '滤镜预设', extensions: ['json'] }]
      })
      if (result.canceled) return { success: false, canceled: true }
      const data = JSON.stringify(preset, null, 2)
      await fs.promises.writeFile(result.filePath!, data, 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('editor:importPresetFromFile', async () => {
    try {
      const result = await dialog.showOpenDialog(requireMainWindow(ctx), {
        properties: ['openFile'],
        filters: [{ name: '滤镜预设', extensions: ['json'] }]
      })
      if (result.canceled) return { success: false, canceled: true }
      const content = await fs.promises.readFile(result.filePaths[0], 'utf-8')
      const preset = JSON.parse(content)
      const validation = validateFilterPreset(preset)
      if (!validation.valid) {
        return { success: false, message: validation.message }
      }
      return { success: true, preset, filePath: result.filePaths[0] }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('editor:loadPresets', async () => {
    try {
      const db = ctx.dbManager.getDatabase()
      if (!db) throw new Error('数据库未初始化')
      const rows = db.prepare('SELECT id, name, category, params, is_builtin, created_at FROM filter_presets ORDER BY created_at DESC').all() as Array<{
        id: number
        name: string
        category: string
        params: string
        is_builtin: number
        created_at: string
      }>
      return {
        success: true,
        presets: rows.map((r) => ({
          id: String(r.id),
          name: r.name,
          category: r.category,
          params: JSON.parse(r.params),
          isBuiltin: !!r.is_builtin,
          createdAt: r.created_at
        }))
      }
    } catch (error) {
      return { success: false, message: String(error), presets: [] }
    }
  })

  ipcMain.handle('editor:deletePreset', async (_, id: string | number) => {
    try {
      const db = ctx.dbManager.getDatabase()
      if (!db) throw new Error('数据库未初始化')
      db.prepare('DELETE FROM filter_presets WHERE id = ? AND is_builtin = 0').run(id)
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })
}
