import { ipcMain } from 'electron'
import { z } from 'zod'
import type { HandlerContext } from '../handler-context'
import { wrapHandler, wrapHandlerNoArgs, schemas, assertFileReadPath, assertFileWritePath } from '../validator'
import { AppError } from '../../../shared/errors/app-error'
// 水印配置类型
import type { WatermarkConfig } from '../../types/file'

export function registerWatermarkHandlers(ctx: HandlerContext): void {
  // 水印
  ipcMain.handle(
    'watermark:apply',
    wrapHandler(
      ctx,
      z.tuple([
        // config 由 WatermarkService 内部校验，IPC 层仅做基本存在性检查
        z.record(z.unknown()),
        schemas.filePathArray,
        schemas.filePath
      ]),
      async ([config, filePaths, targetDir]) => {
        for (const p of filePaths) assertFileReadPath(p)
        assertFileWritePath(targetDir)

        return ctx.watermarkService.applyBatch(
          config as WatermarkConfig,
          filePaths,
          targetDir,
          (current: number, total: number) => {
            ctx.getMainWindow()?.webContents.send('watermark:progress', { current, total })
          }
        )
      }
    )
  )

  ipcMain.handle(
    'watermark:saveTemplate',
    wrapHandler(
      ctx,
      z.tuple([
        schemas.shortString(128),
        // config 为 JSON 字符串，限长 256KB 避免恶意超大写入
        z.string().min(1, 'config 不能为空').max(256 * 1024, 'config 长度上限 256KB')
      ]),
      async ([name, config]) => {
        const db = ctx.dbManager.getDatabase()
        if (!db) throw AppError.preconditionFailed('数据库未初始化')
        const result = db
          .prepare(
            'INSERT INTO watermark_templates (name, config, is_builtin, created_at) VALUES (?, ?, 0, datetime("now"))'
          )
          .run(name, config)
        return { id: Number(result.lastInsertRowid) }
      }
    )
  )

  ipcMain.handle(
    'watermark:loadTemplates',
    wrapHandlerNoArgs(ctx, async () => {
      const db = ctx.dbManager.getDatabase()
      if (!db) return []
      return db.prepare('SELECT * FROM watermark_templates ORDER BY created_at DESC').all()
    })
  )

  ipcMain.handle(
    'watermark:deleteTemplate',
    wrapHandler(
      ctx,
      z.tuple([schemas.positiveIntId]),
      async ([id]) => {
        const db = ctx.dbManager.getDatabase()
        if (!db) throw AppError.preconditionFailed('数据库未初始化')
        db.prepare('DELETE FROM watermark_templates WHERE id = ?').run(id)
        return { deleted: true }
      }
    )
  )
}
