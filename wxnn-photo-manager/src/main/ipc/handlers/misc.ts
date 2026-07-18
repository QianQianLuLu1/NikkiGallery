import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import type { HandlerContext } from '../handler-context'
import type { IpcResult } from '../../types/ipc'
import {
  validateFilePath,
  validateFilePathArray,
  validateHttpUrl,
  validateNonSensitivePath,
  validateStringLength
} from '../../utils/ipc-validate'
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
  if (!win) throw new Error('主窗口未初始化')
  return win
}

/**
 * P0-A1：从 Application.setupIPC() 迁移的杂项 IPC handler 集合。
 * 覆盖 scanner / decrypt / thumbnail / ui-theme / shell / settings / dialog / data / import / app 域。
 */
export function registerMiscHandlers(ctx: HandlerContext): void {
  // ---- scanner 域 ----
  ipcMain.handle(
    'scanner:start',
    async (
      _,
      options?: {
        path?: string
        incremental?: boolean
        customKnownPaths?: string[]
        fullScan?: boolean
      }
    ) => {
      // 修复 F1：校验失败也必须发送 scanner:complete，否则 ScanButton 的 onComplete
      // 兜底监听失效，且 UI 状态会误显示 'completed' 而非 'failed'
      // 违反"错误必须被处理，不能静默失败"硬约束
      const sendComplete = (result: { success: boolean; message?: string }) => {
        ctx.getMainWindow()?.webContents.send('scanner:complete', result)
      }
      // A-S9：参数校验——自定义路径必须是绝对路径
      if (options?.path !== undefined) {
        const v = validateFilePath(options.path)
        if (!v.valid) {
          const fail = { success: false, message: v.message }
          sendComplete(fail)
          return fail
        }
      }
      // F-O1：校验自定义游戏路径数组
      if (options?.customKnownPaths) {
        for (const p of options.customKnownPaths) {
          const v = validateFilePath(p)
          if (!v.valid) {
            const fail = { success: false, message: `游戏路径校验失败: ${v.message}` }
            sendComplete(fail)
            return fail
          }
        }
      }
      const result = await ctx.scannerManager.startScan(options)
      if (result.success && result.filesFound && result.filesFound > 0) {
        // 扫描完成后异步生成缩略图并读取尺寸
        // 分级调度：链式触发的缩略图生成作为低优先级任务入队，避免与用户操作争抢 CPU
        generateThumbnailsForUnprocessed(ctx, 'low').catch(console.error)
      }
      // 通知渲染进程扫描已结束，防止 IPC 返回前 UI 卡在"正在扫描"
      sendComplete(result)
      return result
    }
  )

  ipcMain.handle('scanner:stop', async () => {
    return ctx.scannerManager.stopScan()
  })

  ipcMain.handle('scanner:status', async () => {
    return ctx.scannerManager.getStatus()
  })

  // ---- decrypt 域 ----
  // 游戏参数解密
  ipcMain.handle(
    'decrypt:decodeFile',
    async (_event, filePath: string, albumType: string, uid?: string) => {
      // A4：补齐 filePath 校验
      const v = validateFilePath(filePath)
      if (!v.valid) return { success: false, message: v.message }
      const { decodeFileParams } = await import('../../services/decryption-service')
      // P0-A3：decodeFileParams 已改为 async（mutex 串行化 + 异步文件读取）
      const result = await decodeFileParams(filePath, albumType, uid)
      return {
        success: !result.error,
        data: result,
        message: result.error
      } as IpcResult<typeof result>
    }
  )

  // Group 2: 相机参数加密（将 JSON 加密为密文）
  ipcMain.handle('decrypt:encodeCameraParams', async (_event, jsonText: string) => {
    // A4：jsonText 加 1MB 上限
    if (typeof jsonText !== 'string' || jsonText.length === 0 || jsonText.length > 1024 * 1024) {
      return { success: false, message: 'jsonText 长度无效（限 1MB）' }
    }
    const { encodeCameraParams } = await import('../../services/decryption-service')
    const result = await encodeCameraParams(jsonText)
    return {
      success: result.success,
      data: result.data ? result.data.toString('base64') : undefined,
      message: result.error
    }
  })

  // Group 3: 染色分享码解码
  ipcMain.handle('decrypt:decodeClothDiy', async (_event, codeStr: string) => {
    // A4：codeStr 加 1MB 上限
    if (typeof codeStr !== 'string' || codeStr.length === 0 || codeStr.length > 1024 * 1024) {
      return { success: false, message: 'codeStr 长度无效（限 1MB）' }
    }
    const { decodeClothDiyShareCode } = await import('../../services/decryption-service')
    const result = await decodeClothDiyShareCode(codeStr)
    return {
      success: result.success,
      data: {
        timestamp: result.timestamp,
        uidBytes: result.uidBytes ? result.uidBytes.toString('hex') : undefined,
        networkData: result.networkData
      },
      message: result.error
    }
  })

  // Group 4: 家园建造分享码解码
  ipcMain.handle('decrypt:decodeHomeBuild', async (_event, codeStr: string) => {
    // A4：codeStr 加 1MB 上限
    if (typeof codeStr !== 'string' || codeStr.length === 0 || codeStr.length > 1024 * 1024) {
      return { success: false, message: 'codeStr 长度无效（限 1MB）' }
    }
    const { decodeHomeBuildShareCode } = await import('../../services/decryption-service')
    const result = await decodeHomeBuildShareCode(codeStr)
    return {
      success: result.success,
      data: {
        server: result.server,
        networkData: result.networkData
      },
      message: result.error
    }
  })

  // ---- thumbnail 域 ----
  // 缩略图生成
  ipcMain.handle(
    'thumbnail:generate',
    async (_, filePath: string, quality?: 'low' | 'standard' | 'high') => {
      // A3：与其他 handler 一致返回 { success: false, message } 而非 null
      const v = validateFilePath(filePath)
      if (!v.valid) return { success: false, message: v.message }
      return ctx.thumbnailGen.generate(filePath, quality)
    }
  )

  // ---- ui-theme 域 ----
  // 界面主题（统一主题接口，原 theme:get/set 系统亮暗接口已删除——暗色模式由界面主题派生）
  ipcMain.handle('ui-theme:get', async () => {
    return { theme: ctx.dbManager.getSetting('uiTheme', 'default') }
  })

  ipcMain.handle('ui-theme:set', async (_, theme: 'default' | 'soft-pink-luxury') => {
    if (theme !== 'default' && theme !== 'soft-pink-luxury') {
      return { success: false, message: '无效的主题' }
    }
    ctx.applyUITheme(theme)
    return { success: true }
  })

  // ---- shell 域 ----
  // 外部链接
  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    const v = validateHttpUrl(url)
    if (!v.valid) return { success: false, message: v.message }
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        message: `打开外部链接失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  })

  // T01：在资源管理器中打开目录
  ipcMain.handle('shell:openPath', async (_, dirPath: string) => {
    const v = validateFilePath(dirPath)
    if (!v.valid) return { success: false, message: v.message }
    // P1-A5：系统敏感目录黑名单迁移到 ipc-validate.ts，统一使用 validateNonSensitivePath
    const s = validateNonSensitivePath(dirPath)
    if (!s.valid) return { success: false, message: s.message }
    try {
      await shell.openPath(dirPath)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        message: `打开目录失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  })

  // 在资源管理器中打开文件所在位置并选中该文件
  // shell.showItemInFolder 是 Electron 内置 API，仅 Windows/macOS 支持
  ipcMain.handle('shell:showItemInFolder', async (_, filePath: string) => {
    const v = validateFilePath(filePath)
    if (!v.valid) return { success: false, message: v.message }
    try {
      shell.showItemInFolder(filePath)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        message: `打开文件所在位置失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  })

  // ---- settings 域 ----
  // 应用设置
  ipcMain.handle('settings:get', async (_, key: string, defaultValue?: unknown) => {
    const v = validateStringLength(key, 128, 'key')
    if (!v.valid) return defaultValue
    return ctx.dbManager.getSetting(key, defaultValue)
  })

  ipcMain.handle('settings:set', async (_, key: string, value: unknown) => {
    const v = validateStringLength(key, 128, 'key')
    if (!v.valid) return { success: false, message: v.message }
    // P1-D：校验 value 大小，防止恶意/异常调用写入超大 JSON
    try {
      const valueStr = JSON.stringify(value)
      if (valueStr.length > 1024 * 1024) {
        // 1MB 上限
        return { success: false, message: '设置值过大（上限 1MB）' }
      }
    } catch {
      return { success: false, message: '设置值无法序列化' }
    }
    ctx.dbManager.setSetting(key, value)
    return { success: true }
  })

  // ---- dialog 域 ----
  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(requireMainWindow(ctx), {
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // 增强对话框
  ipcMain.handle(
    'dialog:openFile',
    async (
      _,
      options?: {
        properties?: (
          | 'openFile'
          | 'openDirectory'
          | 'multiSelections'
          | 'showHiddenFiles'
          | 'createDirectory'
          | 'promptToCreate'
          | 'noResolveAliases'
          | 'treatPackageAsDirectory'
          | 'dontAddToRecent'
        )[]
        filters?: { name: string; extensions: string[] }[]
      }
    ) => {
      const result = await dialog.showOpenDialog(requireMainWindow(ctx), {
        properties: options?.properties || ['openFile'],
        filters: options?.filters
      })
      return result.canceled ? null : result.filePaths[0]
    }
  )

  ipcMain.handle(
    'dialog:saveFile',
    async (
      _,
      options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }
    ) => {
      const result = await dialog.showSaveDialog(requireMainWindow(ctx), {
        defaultPath: options?.defaultPath,
        filters: options?.filters
      })
      return result.canceled ? null : result.filePath
    }
  )

  ipcMain.handle(
    'dialog:showMessageBox',
    async (
      _,
      options: {
        type?: 'none' | 'info' | 'error' | 'question' | 'warning'
        title?: string
        message: string
        buttons?: string[]
      }
    ) => {
      const result = await dialog.showMessageBox(requireMainWindow(ctx), {
        type: options.type || 'info',
        title: options.title,
        message: options.message,
        buttons: options.buttons || ['确定']
      })
      return result.response
    }
  )

  // ---- data 域 ----
  // 数据管理
  ipcMain.handle('data:clear', async () => {
    try {
      const db = ctx.dbManager.getDatabase()
      if (!db) return { success: false, message: '数据库未初始化' }

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
        return { success: false, message: '用户取消操作' }
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
      return { success: true, message: '本地数据已清除' }
    } catch (error) {
      console.error('[Data] 清除数据失败:', error)
      return {
        success: false,
        message: `清除数据失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  })

  // ---- import 域 ----
  // T14：文件导入向导 IPC
  // 预览源目录中的待导入文件（仅元信息，不复制）
  ipcMain.handle('import:preview', async (_, sourceDir: string) => {
    const v = validateFilePath(sourceDir)
    if (!v.valid) return { success: false, files: [], message: v.message }
    return ctx.fileService.previewImport(sourceDir)
  })

  // 执行批量导入（复制到目标目录，支持命名规则与分类策略）
  ipcMain.handle(
    'import:run',
    async (
      _,
      sourcePaths: string[],
      targetBaseDir: string,
      options: {
        namingRule: 'keep' | 'date' | 'seq'
        categorize: 'flat' | 'byDate' | 'byMonth'
        conflictStrategy: 'skip' | 'rename' | 'overwrite'
        seqStart?: number
      }
    ) => {
      const v1 = validateFilePathArray(sourcePaths)
      if (!v1.valid)
        return { success: false, message: v1.message, imported: [], failed: [], skipped: [] }
      const v2 = validateFilePath(targetBaseDir)
      if (!v2.valid)
        return { success: false, message: v2.message, imported: [], failed: [], skipped: [] }
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
        return { success: false, message: String(error), imported: [], failed: [], skipped: [] }
      }
    }
  )

  // ---- app 域 ----
  // 重启应用（自定义目录切换后调用）
  // 修复：用 app.quit 触发 before-quit 清理流程，确保数据库 checkpoint 和子进程 kill
  ipcMain.handle('app:relaunch', async () => {
    app.relaunch()
    app.quit()
    return { success: true }
  })

  // U1：获取应用版本号，避免渲染层硬编码 v2.5.0
  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion()
  })

  // ---- operation-history 域 ----
  // 建议改#9：操作历史持久化 IPC（支持跨重启撤销）
  // 新增记录，返回自增 id
  ipcMain.handle(
    'operation-history:add',
    async (
      _,
      record: {
        operationType: string
        mediaId?: number
        payload: unknown
        description: string
        createdAt: string
      }
    ) => {
      try {
        if (!record.operationType || typeof record.operationType !== 'string') {
          return { success: false, message: 'operationType 无效' }
        }
        const db = ctx.dbManager.getDatabase()
        if (!db) throw new Error('数据库未初始化')
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
        return { success: true, id: Number(result.lastInsertRowid) }
      } catch (error) {
        logger.error('[OperationHistory] 新增记录失败:', error)
        return { success: false, message: String(error) }
      }
    }
  )

  // 查询最近 N 条记录（按时间正序，栈顶在末尾）
  ipcMain.handle('operation-history:list', async (_, limit: number = 50) => {
    try {
      const db = ctx.dbManager.getDatabase()
      if (!db) throw new Error('数据库未初始化')
      const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 50)
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
      return { success: true, records }
    } catch (error) {
      logger.error('[OperationHistory] 查询记录失败:', error)
      return { success: false, records: [], message: String(error) }
    }
  })

  // 删除指定 id 的记录（撤销成功后调用）
  ipcMain.handle('operation-history:remove', async (_, id: number) => {
    try {
      if (!Number.isInteger(id) || id <= 0) {
        return { success: false, message: 'id 无效' }
      }
      const db = ctx.dbManager.getDatabase()
      if (!db) throw new Error('数据库未初始化')
      db.prepare('DELETE FROM operation_history WHERE id = ?').run(id)
      return { success: true }
    } catch (error) {
      logger.error('[OperationHistory] 删除记录失败:', error)
      return { success: false, message: String(error) }
    }
  })

  // 清空所有操作历史
  ipcMain.handle('operation-history:clear', async () => {
    try {
      const db = ctx.dbManager.getDatabase()
      if (!db) throw new Error('数据库未初始化')
      db.prepare('DELETE FROM operation_history').run()
      return { success: true }
    } catch (error) {
      logger.error('[OperationHistory] 清空记录失败:', error)
      return { success: false, message: String(error) }
    }
  })
}
