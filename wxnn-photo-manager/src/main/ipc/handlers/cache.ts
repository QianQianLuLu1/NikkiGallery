import { ipcMain } from 'electron'
import type { HandlerContext } from '../handler-context'
import { logger } from '../../utils/logger'
import { registerSetDirHandler, registerResetDirHandler } from './set-dir-handler'

/**
 * P0-A1：从 Application.setupIPC() 迁移的缩略图缓存域 IPC handler 集合。
 */
export function registerCacheHandlers(ctx: HandlerContext): void {
  // T10：缩略图缓存管理
  // 获取缓存统计（总大小 / 文件数 / 上限 / 目录）
  ipcMain.handle('cache:getStats', async () => {
    try {
      const stats = await ctx.thumbnailGen.getCacheStats()
      return { success: true, ...stats }
    } catch (error) {
      logger.error('[Cache] getStats 失败:', error)
      return { success: false, message: String(error) }
    }
  })

  // 手动清理所有缩略图
  ipcMain.handle('cache:clean', async () => {
    try {
      const result = await ctx.thumbnailGen.cleanAll()
      return { success: true, ...result }
    } catch (error) {
      logger.error('[Cache] clean 失败:', error)
      return { success: false, message: String(error), clearedSize: 0, clearedCount: 0 }
    }
  })

  // 调整缓存上限（字节），立即触发 LRU 淘汰
  ipcMain.handle('cache:setLimit', async (_, limitBytes: number) => {
    if (typeof limitBytes !== 'number' || !Number.isFinite(limitBytes)) {
      return { success: false, message: 'limitBytes 无效', applied: false, evicted: 0 }
    }
    try {
      const result = await ctx.thumbnailGen.setCacheLimit(limitBytes)
      // 修复：持久化到数据库，原实现重启后丢失用户设置
      ctx.dbManager.setSetting('thumbnailCacheLimitBytes', limitBytes)
      return { success: true, ...result }
    } catch (error) {
      logger.error('[Cache] setLimit 失败:', error)
      return { success: false, message: String(error), applied: false, evicted: 0 }
    }
  })

  // 手动触发 LRU 淘汰检查
  ipcMain.handle('cache:enforceLimit', async () => {
    try {
      const result = await ctx.thumbnailGen.enforceLimitNow()
      return { success: true, ...result }
    } catch (error) {
      logger.error('[Cache] enforceLimit 失败:', error)
      return { success: false, message: String(error), evicted: 0, totalSize: 0, fileCount: 0 }
    }
  })

  // P1-A11：setDir/resetDir 改用工厂函数（原 45 行模板代码消除）
  registerSetDirHandler(ctx, 'cache:setDir', 'thumbnailCacheDir')
  registerResetDirHandler(ctx, 'cache:resetDir', 'thumbnailCacheDir')

  // 获取缓存目录路径（供 UI 显示，避免 UI 硬编码）
  ipcMain.handle('cache:getDir', async () => ctx.thumbnailGen.getCacheDir())
}
