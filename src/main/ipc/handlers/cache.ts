import { ipcMain } from 'electron'
import { z } from 'zod'
import type { HandlerContext } from '../handler-context'
import { logger } from '../../utils/logger'
import { wrapHandler, wrapHandlerNoArgs, schemas } from '../validator'
import { AppError } from '../../../shared/errors/app-error'
import { registerSetDirHandler, registerResetDirHandler } from './set-dir-handler'

/**
 * P0-A1：从 Application.setupIPC() 迁移的缩略图缓存域 IPC handler 集合。
 */
export function registerCacheHandlers(ctx: HandlerContext): void {
  // T10：缩略图缓存管理
  // 获取缓存统计（总大小 / 文件数 / 上限 / 目录）
  ipcMain.handle(
    'cache:getStats',
    wrapHandlerNoArgs(ctx, async () => {
      try {
        return await ctx.thumbnailGen.getCacheStats()
      } catch (error) {
        logger.error('[Cache] getStats 失败:', error)
        throw AppError.internal(
          `获取缓存统计失败: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    })
  )

  // 手动清理所有缩略图
  ipcMain.handle(
    'cache:clean',
    wrapHandlerNoArgs(ctx, async () => {
      try {
        return await ctx.thumbnailGen.cleanAll()
      } catch (error) {
        logger.error('[Cache] clean 失败:', error)
        throw AppError.internal(
          `清理缓存失败: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    })
  )

  // 调整缓存上限（字节），立即触发 LRU 淘汰
  ipcMain.handle(
    'cache:setLimit',
    wrapHandler(ctx, z.tuple([schemas.cacheLimitBytes]), async ([limitBytes]) => {
      try {
        const result = await ctx.thumbnailGen.setCacheLimit(limitBytes)
        // 修复：持久化到数据库，原实现重启后丢失用户设置
        ctx.dbManager.setSetting('thumbnailCacheLimitBytes', limitBytes)
        return result
      } catch (error) {
        logger.error('[Cache] setLimit 失败:', error)
        throw AppError.internal(
          `设置缓存上限失败: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    })
  )

  // 手动触发 LRU 淘汰检查
  ipcMain.handle(
    'cache:enforceLimit',
    wrapHandlerNoArgs(ctx, async () => {
      try {
        return await ctx.thumbnailGen.enforceLimitNow()
      } catch (error) {
        logger.error('[Cache] enforceLimit 失败:', error)
        throw AppError.internal(
          `触发 LRU 淘汰失败: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    })
  )

  // P1-A11：setDir/resetDir 改用工厂函数（原 45 行模板代码消除）
  registerSetDirHandler(ctx, 'cache:setDir', 'thumbnailCacheDir')
  registerResetDirHandler(ctx, 'cache:resetDir', 'thumbnailCacheDir')

  // 获取缓存目录路径（供 UI 显示，避免 UI 硬编码）
  ipcMain.handle(
    'cache:getDir',
    wrapHandlerNoArgs(ctx, async () => ctx.thumbnailGen.getCacheDir())
  )
}
