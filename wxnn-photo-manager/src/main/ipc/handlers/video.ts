import { ipcMain } from 'electron'
import fs from 'fs'
import type { HandlerContext } from '../handler-context'
// A-S9：IPC 参数校验工具
import { validateFilePath, validateNumberRange, validateNonSensitivePath } from '../../utils/ipc-validate'
// C-3：统一媒体常量
import { VIDEO_EXPORT_FORMATS } from '../../utils/media-constants'
// P1-05：Live Photo 导出服务（单例）
import { livePhotoService } from '../../services/livephoto-service'
// 日志管理
import { logger } from '../../utils/logger'

export function registerVideoHandlers(ctx: HandlerContext): void {
  ipcMain.handle('video:thumbnail', async (_, filePath: string) => {
    try {
      // A-S9：参数校验
      const v = validateFilePath(filePath)
      if (!v.valid) return { success: false, message: v.message }

      const thumbnail = await ctx.thumbnailGen.generate(filePath)
      return { success: !!thumbnail, thumbnail }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('video:metadata', async (_, filePath: string) => {
    try {
      // A-S9：参数校验
      const v = validateFilePath(filePath)
      if (!v.valid) return { success: false, message: v.message }

      const stats = await fs.promises.stat(filePath)
      const metadata = await ctx.videoService.getMetadata(filePath)
      return {
        success: true,
        path: filePath,
        size: stats.size,
        duration: metadata.duration ?? 0,
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
        codec: metadata.codec ?? '',
        frameRate: metadata.frameRate ?? 0
      }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('video:export', async (_, filePath: string, targetDir: string, format: string) => {
    // A-S9：参数校验
    const v1 = validateFilePath(filePath)
    if (!v1.valid) return { success: false, message: v1.message }
    const v2 = validateFilePath(targetDir)
    if (!v2.valid) return { success: false, message: v2.message }
    // P0-A5：补齐敏感目录校验，与 file:export 保持一致的安全基线
    const s2 = validateNonSensitivePath(targetDir)
    if (!s2.valid) return { success: false, message: s2.message }
    if (!VIDEO_EXPORT_FORMATS.includes(format as typeof VIDEO_EXPORT_FORMATS[number])) {
      return { success: false, message: `不支持的视频格式: ${format}` }
    }
    return ctx.videoService.exportVideo(filePath, targetDir, format)
  })

  ipcMain.handle('video:captureFrame', async (_, filePath: string, currentTime: number, targetDir?: string) => {
    // A-S9：参数校验
    const v1 = validateFilePath(filePath)
    if (!v1.valid) return { success: false, message: v1.message }
    const vTime = validateNumberRange(currentTime, 0, 24 * 3600 * 1000, 'currentTime')
    if (!vTime.valid) return { success: false, message: vTime.message }
    if (targetDir !== undefined) {
      const v2 = validateFilePath(targetDir)
      if (!v2.valid) return { success: false, message: v2.message }
      // P0-A5：补齐敏感目录校验
      const s2 = validateNonSensitivePath(targetDir)
      if (!s2.valid) return { success: false, message: s2.message }
    }
    return ctx.videoService.captureFrame(filePath, currentTime, targetDir)
  })

  // F-S9：视频裁剪
  ipcMain.handle('video:trim', async (_, filePath: string, startTime: number, endTime: number, targetDir: string) => {
    const v1 = validateFilePath(filePath)
    if (!v1.valid) return { success: false, message: v1.message }
    const v2 = validateFilePath(targetDir)
    if (!v2.valid) return { success: false, message: v2.message }
    // P0-A5：补齐敏感目录校验
    const s2 = validateNonSensitivePath(targetDir)
    if (!s2.valid) return { success: false, message: s2.message }
    const vStart = validateNumberRange(startTime, 0, 24 * 3600, 'startTime')
    if (!vStart.valid) return { success: false, message: vStart.message }
    const vEnd = validateNumberRange(endTime, 0, 24 * 3600, 'endTime')
    if (!vEnd.valid) return { success: false, message: vEnd.message }
    if (endTime <= startTime) {
      return { success: false, message: '结束时间必须大于开始时间' }
    }
    return ctx.videoService.trimVideo(filePath, startTime, endTime, targetDir)
  })

  // F-S9：视频调速
  ipcMain.handle('video:changeSpeed', async (_, filePath: string, speed: number, targetDir: string) => {
    const v1 = validateFilePath(filePath)
    if (!v1.valid) return { success: false, message: v1.message }
    const v2 = validateFilePath(targetDir)
    if (!v2.valid) return { success: false, message: v2.message }
    // P0-A5：补齐敏感目录校验
    const s2 = validateNonSensitivePath(targetDir)
    if (!s2.valid) return { success: false, message: s2.message }
    const vSpeed = validateNumberRange(speed, 0.25, 4.0, 'speed')
    if (!vSpeed.valid) return { success: false, message: vSpeed.message }
    return ctx.videoService.changeSpeed(filePath, speed, targetDir)
  })

  // P1-05：导出 Live Photo（JPG + MOV 配对文件，含 ContentIdentifier UUID）
  ipcMain.handle('video:exportLivePhoto', async (_, filePath: string, targetDir: string) => {
    const v1 = validateFilePath(filePath)
    if (!v1.valid) return { success: false, message: v1.message }
    const v2 = validateFilePath(targetDir)
    if (!v2.valid) return { success: false, message: v2.message }
    // P0-A5：补齐敏感目录校验
    const s2 = validateNonSensitivePath(targetDir)
    if (!s2.valid) return { success: false, message: s2.message }
    try {
      return await livePhotoService.exportLivePhoto(filePath, targetDir)
    } catch (error) {
      logger.error('[IPC] video:exportLivePhoto 失败:', error)
      return { success: false, message: error instanceof Error ? error.message : String(error) }
    }
  })
}
