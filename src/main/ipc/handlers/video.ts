import { ipcMain } from 'electron'
import fs from 'fs'
import { z } from 'zod'
import type { HandlerContext } from '../handler-context'
import { wrapHandler, schemas, assertFileReadPath, assertFileWritePath } from '../validator'
import { AppError } from '../../../shared/errors/app-error'
// C-3：统一媒体常量
import { VIDEO_EXPORT_FORMATS } from '../../utils/media-constants'
// P1-05：Live Photo 导出服务（单例）
import { livePhotoService } from '../../services/livephoto-service'
// 日志管理
import { logger } from '../../utils/logger'

export function registerVideoHandlers(ctx: HandlerContext): void {
  ipcMain.handle(
    'video:thumbnail',
    wrapHandler(ctx, z.tuple([schemas.filePath]), async ([filePath]) => {
      assertFileReadPath(filePath)
      const thumbnail = await ctx.thumbnailGen.generate(filePath)
      return { thumbnail, hasThumbnail: !!thumbnail }
    })
  )

  ipcMain.handle(
    'video:metadata',
    wrapHandler(ctx, z.tuple([schemas.filePath]), async ([filePath]) => {
      assertFileReadPath(filePath)
      const stats = await fs.promises.stat(filePath)
      const metadata = await ctx.videoService.getMetadata(filePath)
      return {
        path: filePath,
        size: stats.size,
        duration: metadata.duration ?? 0,
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
        codec: metadata.codec ?? '',
        frameRate: metadata.frameRate ?? 0
      }
    })
  )

  ipcMain.handle(
    'video:export',
    wrapHandler(
      ctx,
      z.tuple([
        schemas.filePath,
        schemas.filePath,
        z.enum(VIDEO_EXPORT_FORMATS as unknown as [string, ...string[]])
      ]),
      async ([filePath, targetDir, format]) => {
        assertFileReadPath(filePath)
        assertFileWritePath(targetDir)
        if (!VIDEO_EXPORT_FORMATS.includes(format as (typeof VIDEO_EXPORT_FORMATS)[number])) {
          throw AppError.validation(`不支持的视频格式: ${format}`)
        }
        return ctx.videoService.exportVideo(filePath, targetDir, format)
      }
    )
  )

  ipcMain.handle(
    'video:captureFrame',
    wrapHandler(
      ctx,
      z.tuple([
        schemas.filePath,
        z.number().min(0).max(24 * 3600 * 1000),
        schemas.filePath.optional()
      ]),
      async ([filePath, currentTime, targetDir]) => {
        assertFileReadPath(filePath)
        if (targetDir !== undefined) {
          assertFileWritePath(targetDir)
        }
        return ctx.videoService.captureFrame(filePath, currentTime, targetDir)
      }
    )
  )

  // F-S9：视频裁剪
  ipcMain.handle(
    'video:trim',
    wrapHandler(
      ctx,
      z.tuple([
        schemas.filePath,
        z.number().min(0).max(24 * 3600),
        z.number().min(0).max(24 * 3600),
        schemas.filePath
      ]),
      async ([filePath, startTime, endTime, targetDir]) => {
        assertFileReadPath(filePath)
        assertFileWritePath(targetDir)
        if (endTime <= startTime) {
          throw AppError.validation('结束时间必须大于开始时间')
        }
        return ctx.videoService.trimVideo(filePath, startTime, endTime, targetDir)
      }
    )
  )

  // F-S9：视频调速
  ipcMain.handle(
    'video:changeSpeed',
    wrapHandler(
      ctx,
      z.tuple([
        schemas.filePath,
        z.number().min(0.25).max(4.0),
        schemas.filePath
      ]),
      async ([filePath, speed, targetDir]) => {
        assertFileReadPath(filePath)
        assertFileWritePath(targetDir)
        return ctx.videoService.changeSpeed(filePath, speed, targetDir)
      }
    )
  )

  // P1-05：导出 Live Photo
  ipcMain.handle(
    'video:exportLivePhoto',
    wrapHandler(
      ctx,
      z.tuple([schemas.filePath, schemas.filePath]),
      async ([filePath, targetDir]) => {
        assertFileReadPath(filePath)
        assertFileWritePath(targetDir)
        try {
          return await livePhotoService.exportLivePhoto(filePath, targetDir)
        } catch (error) {
          logger.error('[IPC] video:exportLivePhoto 失败:', error)
          throw error
        }
      }
    )
  )
}
