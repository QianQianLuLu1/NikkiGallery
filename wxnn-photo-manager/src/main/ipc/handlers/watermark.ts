import { ipcMain } from 'electron'
import type { HandlerContext } from '../handler-context'
// A-S9：IPC 参数校验工具
import {
  validateIntRange,
  validateFilePathArray,
  validateFilePath,
  validateNonSensitivePath
} from '../../utils/ipc-validate'
// 水印配置类型
import type { WatermarkConfig } from '../../types/file'

export function registerWatermarkHandlers(ctx: HandlerContext): void {
  // 水印
  ipcMain.handle(
    'watermark:apply',
    async (_, config: unknown, filePaths: string[], targetDir: string) => {
      try {
        // P0-A4：补齐参数校验，与 file:copy/file:move/file:export 保持一致的安全基线
        const v1 = validateFilePathArray(filePaths)
        if (!v1.valid) return { success: false, message: v1.message, processed: 0 }
        const v2 = validateFilePath(targetDir)
        if (!v2.valid) return { success: false, message: v2.message, processed: 0 }
        const s = validateNonSensitivePath(targetDir)
        if (!s.valid) return { success: false, message: s.message, processed: 0 }

        const result = await ctx.watermarkService.applyBatch(
          config as WatermarkConfig,
          filePaths,
          targetDir,
          (current: number, total: number) => {
            ctx.getMainWindow()?.webContents.send('watermark:progress', { current, total })
          }
        )
        return result
      } catch (error) {
        return { success: false, message: String(error), processed: 0 }
      }
    }
  )

  ipcMain.handle('watermark:saveTemplate', async (_, name: string, config: string) => {
    try {
      const db = ctx.dbManager.getDatabase()
      if (!db) throw new Error('数据库未初始化')
      const result = db
        .prepare(
          'INSERT INTO watermark_templates (name, config, is_builtin, created_at) VALUES (?, ?, 0, datetime("now"))'
        )
        .run(name, config)
      return { success: true, id: Number(result.lastInsertRowid) }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('watermark:loadTemplates', async () => {
    try {
      const db = ctx.dbManager.getDatabase()
      if (!db) return []
      return db.prepare('SELECT * FROM watermark_templates ORDER BY created_at DESC').all()
    } catch (_error) {
      return []
    }
  })

  ipcMain.handle('watermark:deleteTemplate', async (_, id: number) => {
    try {
      // A-S9：参数校验
      const v = validateIntRange(id, 1, Number.MAX_SAFE_INTEGER, 'id')
      if (!v.valid) return { success: false, message: v.message }

      const db = ctx.dbManager.getDatabase()
      if (!db) throw new Error('数据库未初始化')
      db.prepare('DELETE FROM watermark_templates WHERE id = ?').run(id)
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })
}
