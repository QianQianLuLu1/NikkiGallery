import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { HandlerContext } from '../handler-context'
import { logger, logFault, getLogDirectory } from '../../utils/logger'
import {
  listFaults,
  getFaultDetail,
  openLogDirectory,
  exportLogsAsZip,
  clearAllLogs,
  getLogStats
} from '../../services/log-service'
import { registerSetDirHandler, registerResetDirHandler } from './set-dir-handler'

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
 * P0-A1：从 Application.setupIPC() 迁移的日志域 IPC handler 集合。
 */
export function registerLogHandlers(ctx: HandlerContext): void {
  // 日志管理 IPC
  // 获取故障列表（按时间倒序）
  ipcMain.handle('log:listFaults', async () => {
    try {
      const faults = await listFaults()
      return { success: true, faults }
    } catch (error) {
      logger.error('[Log] 获取故障列表失败:', error)
      return { success: false, faults: [], message: String(error) }
    }
  })

  // 获取单个故障详情
  ipcMain.handle('log:getFaultDetail', async (_, id: string) => {
    // 参数校验：id 必须是非空字符串
    if (typeof id !== 'string' || id.length === 0 || id.length > 100) {
      return { success: false, message: 'id 参数无效' }
    }
    try {
      const fault = await getFaultDetail(id)
      return { success: true, fault }
    } catch (error) {
      logger.error('[Log] 获取故障详情失败:', error)
      return { success: false, message: String(error) }
    }
  })

  // 打开日志目录（系统资源管理器）
  ipcMain.handle('log:openDirectory', async () => {
    return openLogDirectory()
  })

  // 获取日志目录路径
  ipcMain.handle('log:getDirectoryPath', async () => {
    return { success: true, path: getLogDirectory() }
  })

  // 获取日志统计信息
  ipcMain.handle('log:getStats', async () => {
    try {
      const stats = await getLogStats()
      return { success: true, ...stats }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // 导出全部日志为 zip 压缩包
  // 业务决策：先弹出保存对话框让用户选择保存位置，再调用 PowerShell 打包
  ipcMain.handle('log:exportZip', async () => {
    try {
      // 弹出保存对话框，让用户选择 zip 文件保存位置
      const defaultName = `wxnn-logs-${new Date().toISOString().slice(0, 10)}.zip`
      const result = await dialog.showSaveDialog(requireMainWindow(ctx), {
        defaultPath: defaultName,
        filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }]
      })
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true }
      }
      return exportLogsAsZip(result.filePath)
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // 清空所有日志文件
  ipcMain.handle('log:clear', async () => {
    try {
      const result = await clearAllLogs()
      if (result.success) {
        logger.info('[Log] 用户手动清空了所有日志文件')
      }
      return result
    } catch (error) {
      return { success: false, message: String(error), cleared: 0 }
    }
  })

  // P0-2：渲染进程错误上报到主进程 faults 日志
  // 接收三种来源的错误：ErrorBoundary / window.onerror / unhandledrejection
  ipcMain.handle('log:reportRendererError', async (_event, payload) => {
    try {
      const err = new Error(payload.message || 'Unknown renderer error')
      if (payload.stack) err.stack = payload.stack
      // 根据 source 映射到对应的 FaultType
      const faultTypeMap = {
        ErrorBoundary: 'rendererComponent',
        'window.onerror': 'rendererResource',
        unhandledrejection: 'rendererPromise'
      } as const
      const faultType = faultTypeMap[payload.source as keyof typeof faultTypeMap] || 'rendererError'
      const context: Record<string, unknown> = { source: payload.source }
      if (payload.componentStack) context.componentStack = payload.componentStack
      if (payload.filename) {
        context.location = `${payload.filename}:${payload.lineno || 0}:${payload.colno || 0}`
      }
      await logFault(faultType, err, context)
      return { success: true }
    } catch (err) {
      console.error('[IPC] log:reportRendererError 处理失败:', err)
      return { success: false, message: String(err) }
    }
  })

  // P1-A11：setDir/resetDir 改用工厂函数（原 45 行模板代码消除）
  registerSetDirHandler(ctx, 'log:setDir', 'logDir')
  registerResetDirHandler(ctx, 'log:resetDir', 'logDir')

  // 获取日志目录路径（供 UI 显示，避免 UI 硬编码）
  ipcMain.handle('log:getDir', async () => getLogDirectory())
}
