import { ipcMain, dialog } from 'electron'
import { z } from 'zod'
import type { HandlerContext } from '../handler-context'
import type { ExportOptions, ExifData } from '../../types/file'
import { wrapHandler, schemas, assertFileReadPath, assertFileWritePath } from '../validator'
import { AppError } from '../../../shared/errors/app-error'
// 日志管理
import { logger } from '../../utils/logger'

// A11：SQLite 单条语句参数上限 999，超出将抛出 "too many SQL variables"
const MAX_SQL_IN_CLAUSE_SIZE = 999

/**
 * 文件操作域 IPC handler
 *
 * 安全基线：
 * - 所有路径参数由 zod schema 校验长度/格式
 * - 所有文件操作调用 assertFileReadPath/assertFileWritePath 完成白名单拦截
 * - 写操作（copy/move/export/rename）额外校验目标目录可写
 */
export function registerFileHandlers(ctx: HandlerContext): void {
  // 文件删除（移至回收站）
  ipcMain.handle(
    'file:delete',
    wrapHandler(ctx, z.tuple([schemas.filePathArray]), async ([filePaths]) => {
      for (const p of filePaths) assertFileReadPath(p)
      return ctx.fileService.moveToRecycleBin(filePaths)
    })
  )

  // 文件复制
  ipcMain.handle(
    'file:copy',
    wrapHandler(
      ctx,
      z.tuple([schemas.filePathArray, schemas.filePath]),
      async ([sourcePaths, targetDir]) => {
        for (const p of sourcePaths) assertFileReadPath(p)
        assertFileWritePath(targetDir)
        return ctx.fileService.copyFiles(sourcePaths, targetDir)
      }
    )
  )

  // 文件移动
  ipcMain.handle(
    'file:move',
    wrapHandler(
      ctx,
      z.tuple([schemas.filePathArray, schemas.filePath]),
      async ([sourcePaths, targetDir]) => {
        for (const p of sourcePaths) assertFileReadPath(p)
        assertFileWritePath(targetDir)
        return ctx.fileService.moveFiles(sourcePaths, targetDir)
      }
    )
  )

  // 文件重命名
  ipcMain.handle(
    'file:rename',
    wrapHandler(
      ctx,
      z.tuple([schemas.filePath, schemas.shortString(255)]),
      async ([oldPath, newName]) => {
        assertFileReadPath(oldPath)
        return ctx.fileService.renameFile(oldPath, newName)
      }
    )
  )

  // T12：批量重命名——文件系统操作 + 数据库 path/file_name 同步更新
  ipcMain.handle(
    'file:batchRename',
    wrapHandler(
      ctx,
      z.tuple([
        z
          .array(z.object({ oldPath: schemas.filePath, newName: schemas.shortString(255) }))
          .min(1, '操作列表为空')
          .max(MAX_SQL_IN_CLAUSE_SIZE, '操作数量超过上限')
      ]),
      async ([operations]) => {
        for (const op of operations) {
          assertFileReadPath(op.oldPath)
        }
        const result = await ctx.fileService.batchRename(operations)
        // 数据库事务更新：将成功的重命名同步到 media_files 表
        if (result.renamed.length > 0) {
          const db = ctx.dbManager.getDatabase()
          if (db) {
            const updateStmt = db.prepare(
              'UPDATE media_files SET file_path = ?, file_name = ? WHERE file_path = ?'
            )
            const tx = db.transaction(
              (rows: { oldPath: string; newPath: string; newFileName: string }[]) => {
                for (const r of rows) {
                  updateStmt.run(r.newPath, r.newFileName, r.oldPath)
                }
              }
            )
            try {
              tx(result.renamed)
            } catch (error) {
              logger.error('[File] 批量重命名数据库更新失败:', error)
            }
          }
        }
        return result
      }
    )
  )

  // 文件导出（支持默认目录与命名规则）
  ipcMain.handle(
    'file:export',
    wrapHandler(
      ctx,
      z.tuple([
        schemas.filePathArray,
        schemas.filePath,
        z
          .object({
            quality: z.number().min(0).max(100).optional(),
            format: z.enum(['jpg', 'jpeg', 'png', 'webp', 'original']).optional(),
            namingPattern: z.string().max(256).optional(),
            useDefaultDir: z.boolean().optional()
          })
          .optional()
      ]),
      async ([filePaths, targetDir, options]) => {
        for (const p of filePaths) assertFileReadPath(p)
        assertFileWritePath(targetDir)

        // P1-02：useDefaultDir=true 时从 settings 读取默认导出路径
        let finalTargetDir = targetDir
        let finalOptions: ExportOptions = options ? { ...options } : {}
        if (options?.useDefaultDir) {
          const defaultDir = ctx.dbManager.getSetting<string | null>('export.defaultDir', null)
          if (!defaultDir) {
            throw AppError.preconditionFailed('未配置默认导出路径，请先在设置中配置')
          }
          finalTargetDir = defaultDir
          assertFileWritePath(finalTargetDir)
          // 若未显式传 namingPattern，从 settings 读取默认命名规则
          if (!finalOptions.namingPattern) {
            const pattern = ctx.dbManager.getSetting<string | null>('export.namingPattern', null)
            if (pattern && pattern.trim()) {
              finalOptions.namingPattern = pattern.trim()
            }
          }
        }

        // P1-02：若启用命名规则，查询每个文件的 album_type + account_uid 元数据
        let metadataMap: Map<string, { album_type?: string; account_uid?: string }> | undefined
        if (finalOptions.namingPattern && finalOptions.namingPattern.trim()) {
          metadataMap = new Map()
          try {
            const db = ctx.dbManager.getDatabase()
            if (db) {
              // A11：分批查询避免超过 SQLite 单语句 999 参数上限
              for (let i = 0; i < filePaths.length; i += MAX_SQL_IN_CLAUSE_SIZE) {
                const batch = filePaths.slice(i, i + MAX_SQL_IN_CLAUSE_SIZE)
                const placeholders = batch.map(() => '?').join(',')
                const rows = db
                  .prepare(
                    `SELECT file_path, album_type, account_uid FROM media_files WHERE file_path IN (${placeholders})`
                  )
                  .all(...batch) as Array<{
                  file_path: string
                  album_type: string
                  account_uid: string
                }>
                for (const r of rows) {
                  metadataMap.set(r.file_path, {
                    album_type: r.album_type,
                    account_uid: r.account_uid
                  })
                }
              }
            }
          } catch (err) {
            // 元数据查询失败不阻断导出，仅日志记录
            logger.warn('[file:export] 查询元数据失败，回退到无变量命名:', err)
          }
        }

        return ctx.fileService.exportFiles(filePaths, finalTargetDir, finalOptions, metadataMap)
      }
    )
  )

  // 文件另存为
  ipcMain.handle(
    'file:saveAs',
    wrapHandler(
      ctx,
      z.tuple([
        schemas.filePath,
        schemas.filePath,
        schemas.shortString(255).optional()
      ]),
      async ([filePath, targetDir, newName]) => {
        assertFileReadPath(filePath)
        assertFileWritePath(targetDir)
        return ctx.fileService.saveAs(filePath, targetDir, newName)
      }
    )
  )

  // 永久删除（高危操作二次确认）
  ipcMain.handle(
    'file:deletePermanent',
    wrapHandler(ctx, z.tuple([schemas.filePathArray]), async ([filePaths]) => {
      for (const p of filePaths) assertFileReadPath(p)
      // A-S3：高危操作二次确认（永久删除文件不可恢复）
      const confirmResult = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['取消', '确认删除'],
        defaultId: 0,
        cancelId: 0,
        title: '确认永久删除',
        message: `即将永久删除 ${filePaths.length} 个文件，此操作不可恢复。`,
        detail: '文件将被直接删除（不进入回收站）。是否继续？'
      })
      if (confirmResult.response !== 1) {
        throw AppError.canceled('用户取消操作')
      }
      return ctx.fileService.deletePermanent(filePaths)
    })
  )

  // 获取 EXIF（返回空对象表示无数据，不抛错）
  ipcMain.handle(
    'file:getExif',
    wrapHandler(ctx, z.tuple([schemas.filePath]), async ([filePath]): Promise<ExifData> => {
      assertFileReadPath(filePath)
      return ctx.fileService.getExif(filePath)
    })
  )
}
