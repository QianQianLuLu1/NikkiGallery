import { ipcMain } from 'electron'
import type { HandlerContext } from '../handler-context'
// A-S9：IPC 参数校验工具
import { validateFilePathArray } from '../../utils/ipc-validate'
// 日志管理
import { logger } from '../../utils/logger'
// T08：WiFi 局域网分享服务（单例）
import { wifiShareService } from '../../services/share-wifi-service'
// T09：剪贴板分享服务（CF_HDROP 格式）+ 渠道应用检测/启动
import {
  copyFilesToClipboard,
  getAppStatus,
  launchApp
} from '../../services/share-clipboard-service'

/**
 * P0-A1：从 Application.setupIPC() 迁移的分享域 IPC handler 集合。
 * 覆盖 WiFi 分享 / 剪贴板分享 / 渠道应用检测与启动。
 *
 * 说明：本域 handler 仅依赖模块级单例服务（wifiShareService / copyFilesToClipboard /
 * getAppStatus / launchApp），不直接访问 Application 实例成员。
 * 保留 ctx 参数以维持各 register 函数签名一致，便于 setupIPC() 统一调用。
 */
export function registerShareHandlers(_ctx: HandlerContext): void {
  // T08：WiFi 局域网分享
  // 启动服务：传入文件路径数组，返回分享 URL 和端口
  ipcMain.handle('share:startWifi', async (_, filePaths: string[]) => {
    const v = validateFilePathArray(filePaths)
    if (!v.valid) return { success: false, message: v.message }
    try {
      const session = await wifiShareService.start(filePaths)
      return {
        success: true,
        url: session.url,
        port: session.port,
        // P0-C：返回 PIN 码供 UI 展示给用户
        pin: session.pin,
        fileCount: session.files.length,
        timeoutMs: session.timeoutMs
      }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // 停止服务
  ipcMain.handle('share:stopWifi', async () => {
    try {
      wifiShareService.stop()
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // P0-D：删除 share:wifiStatus 未使用 IPC（已有 startWifi/stopWifi 满足需求）

  // T09：剪贴板分享
  // 复制文件到剪贴板（CF_HDROP 格式），返回复制结果与跳过数
  // Slice 7a：copyFilesToClipboard 已 async，需 await
  ipcMain.handle('share:copyFiles', async (_, filePaths: string[]) => {
    const v = validateFilePathArray(filePaths)
    if (!v.valid) return { success: false, message: v.message, count: 0, skipped: 0 }
    try {
      return await copyFilesToClipboard(filePaths)
    } catch (error) {
      logger.error('[Share] copyFiles 失败:', error)
      return { success: false, message: String(error), count: 0, skipped: 0 }
    }
  })

  // 检测渠道应用状态：已安装 + 正在运行（用于切换引导文案）
  // 修复：原 detectAppInstalled 实为检测"正在运行"，且 vivo 通配符 bug 导致恒 false
  // 现在拆分为 installed（注册表查询）+ running（tasklist 查询）两个维度
  ipcMain.handle('share:detectApp', async (_, channelId: string) => {
    try {
      const status = await getAppStatus(channelId)
      return {
        success: true,
        installed: status.installed,
        running: status.running,
        installPath: status.installPath
      }
    } catch (error) {
      logger.error('[Share] detectApp 失败:', error)
      return { success: false, installed: false, running: false, installPath: null }
    }
  })

  // 启动目标应用（已安装但未运行时，UI 提供"打开 XX"按钮）
  ipcMain.handle('share:launchApp', async (_, channelId: string) => {
    try {
      return await launchApp(channelId)
    } catch (error) {
      logger.error('[Share] launchApp 失败:', error)
      return { success: false, message: String(error) }
    }
  })
}
