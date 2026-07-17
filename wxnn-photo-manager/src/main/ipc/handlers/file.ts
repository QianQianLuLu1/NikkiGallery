import { ipcMain, dialog } from 'electron'
import type { HandlerContext } from '../handler-context'
import type { ExportOptions, ExifData } from '../../types/file'
// A-S9：IPC 参数校验工具
import {
  validateFilePathArray,
  validateFilePath,
  validateStringLength,
  validateNonSensitivePath
} from '../../utils/ipc-validate'
// 日志管理
import { logger } from '../../utils/logger'

// A11：SQLite 单条语句参数上限 999，超出将抛出 "too many SQL variables"
const MAX_SQL_IN_CLAUSE_SIZE = 999

export function registerFileHandlers(ctx: HandlerContext): void {
  // 文件操作
  ipcMain.handle('file:delete', async (_, filePaths: string[]) => {
    const v = validateFilePathArray(filePaths)
    if (!v.valid) return { success: false, message: v.message }
    return ctx.fileService.moveToRecycleBin(filePaths)
  })

  ipcMain.handle('file:copy', async (_, sourcePaths: string[], targetDir: string) => {
    const v1 = validateFilePathArray(sourcePaths)
    if (!v1.valid) return { success: false, message: v1.message }
    const v2 = validateFilePath(targetDir)
    if (!v2.valid) return { success: false, message: v2.message }
    // P1-A5：写操作 IPC 强制校验目标目录非系统敏感目录
    const s = validateNonSensitivePath(targetDir)
    if (!s.valid) return { success: false, message: s.message }
    return ctx.fileService.copyFiles(sourcePaths, targetDir)
  })

  ipcMain.handle('file:move', async (_, sourcePaths: string[], targetDir: string) => {
    const v1 = validateFilePathArray(sourcePaths)
    if (!v1.valid) return { success: false, message: v1.message }
    const v2 = validateFilePath(targetDir)
    if (!v2.valid) return { success: false, message: v2.message }
    // P1-A5：写操作 IPC 强制校验目标目录非系统敏感目录
    const s = validateNonSensitivePath(targetDir)
    if (!s.valid) return { success: false, message: s.message }
    return ctx.fileService.moveFiles(sourcePaths, targetDir)
  })

  ipcMain.handle('file:rename', async (_, oldPath: string, newName: string) => {
    const v1 = validateFilePath(oldPath)
    if (!v1.valid) return { success: false, message: v1.message }
    const v2 = validateStringLength(newName, 255, 'newName')
    if (!v2.valid) return { success: false, message: v2.message }
    // P1-A5：写操作 IPC 强制校验源文件路径非系统敏感目录
    const s = validateNonSensitivePath(oldPath)
    if (!s.valid) return { success: false, message: s.message }
    return ctx.fileService.renameFile(oldPath, newName)
  })

  // T12：批量重命名——文件系统操作 + 数据库 path/file_name 同步更新
  ipcMain.handle('file:batchRename', async (_, operations: { oldPath: string; newName: string }[]) => {
    if (!Array.isArray(operations) || operations.length === 0) {
      return { success: false, message: '操作列表为空', renamed: [], failed: [] }
    }
    // 校验每条操作
    for (const op of operations) {
      const v1 = validateFilePath(op.oldPath)
      if (!v1.valid) return { success: false, message: v1.message, renamed: [], failed: [] }
      const v2 = validateStringLength(op.newName, 255, 'newName')
      if (!v2.valid) return { success: false, message: v2.message, renamed: [], failed: [] }
    }
    const result = await ctx.fileService.batchRename(operations)
    // 数据库事务更新：将成功的重命名同步到 media_files 表
    if (result.renamed.length > 0) {
      const db = ctx.dbManager.getDatabase()
      if (db) {
        const updateStmt = db.prepare('UPDATE media_files SET file_path = ?, file_name = ? WHERE file_path = ?')
        const tx = db.transaction((rows: { oldPath: string; newPath: string; newFileName: string }[]) => {
          for (const r of rows) {
            updateStmt.run(r.newPath, r.newFileName, r.oldPath)
          }
        })
        try {
          tx(result.renamed)
        } catch (error) {
          logger.error('[File] 批量重命名数据库更新失败:', error)
        }
      }
    }
    return result
  })

  ipcMain.handle('file:export', async (_, filePaths: string[], targetDir: string, options?: ExportOptions) => {
    const v1 = validateFilePathArray(filePaths)
    if (!v1.valid) return { success: false, message: v1.message }
    // P1-02：useDefaultDir=true 时从 settings 读取默认导出路径
    let finalTargetDir = targetDir
    let finalOptions: ExportOptions = options ? { ...options } : {}
    if (options?.useDefaultDir) {
      const defaultDir = ctx.dbManager.getSetting<string | null>('export.defaultDir', null)
      if (!defaultDir) {
        return { success: false, message: '未配置默认导出路径，请先在设置中配置' }
      }
      finalTargetDir = defaultDir
      // 若未显式传 namingPattern，从 settings 读取默认命名规则
      if (!finalOptions.namingPattern) {
        const pattern = ctx.dbManager.getSetting<string | null>('export.namingPattern', null)
        if (pattern && pattern.trim()) {
          finalOptions.namingPattern = pattern.trim()
        }
      }
    }
    const v2 = validateFilePath(finalTargetDir)
    if (!v2.valid) return { success: false, message: v2.message }
    // P1-A5：写操作 IPC 强制校验导出目录非系统敏感目录
    const s = validateNonSensitivePath(finalTargetDir)
    if (!s.valid) return { success: false, message: s.message }

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
            const rows = db.prepare(
              `SELECT file_path, album_type, account_uid FROM media_files WHERE file_path IN (${placeholders})`
            ).all(...batch) as Array<{ file_path: string; album_type: string; account_uid: string }>
            for (const r of rows) {
              metadataMap.set(r.file_path, { album_type: r.album_type, account_uid: r.account_uid })
            }
          }
        }
      } catch (err) {
        // 元数据查询失败不阻断导出，仅日志记录
        console.warn('[file:export] 查询元数据失败，回退到无变量命名:', err)
      }
    }

    return ctx.fileService.exportFiles(filePaths, finalTargetDir, finalOptions, metadataMap)
  })

  // 文件另存为/永久删除/EXIF
  ipcMain.handle('file:saveAs', async (_, filePath: string, targetDir: string, newName?: string) => {
    const v1 = validateFilePath(filePath)
    if (!v1.valid) return { success: false, message: v1.message }
    const v2 = validateFilePath(targetDir)
    if (!v2.valid) return { success: false, message: v2.message }
    if (newName !== undefined) {
      const v3 = validateStringLength(newName, 255, 'newName')
      if (!v3.valid) return { success: false, message: v3.message }
    }
    return ctx.fileService.saveAs(filePath, targetDir, newName)
  })

  ipcMain.handle('file:deletePermanent', async (_, filePaths: string[]) => {
    const v = validateFilePathArray(filePaths)
    if (!v.valid) return { success: false, message: v.message }
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
      return { success: false, message: '用户取消操作' }
    }
    return ctx.fileService.deletePermanent(filePaths)
  })

  ipcMain.handle('file:getExif', async (_, filePath: string): Promise<ExifData> => {
    const v = validateFilePath(filePath)
    if (!v.valid) return {}
    return ctx.fileService.getExif(filePath)
  })
}
