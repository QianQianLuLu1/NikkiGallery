import type { BrowserWindow } from 'electron'
import type { DatabaseManager } from '../database/connection'
import type { ScannerManager } from '../scanner'
import type { ThumbnailGenerator } from '../thumbnail/generator'
import type { FileService } from '../services/file-service'
import type { VideoService } from '../services/video-service'
import type { WatermarkService } from '../services/watermark-service'

/**
 * P0-A1：IPC handler 依赖注入上下文
 * Application.setupIPC() 构造此对象传入各域 register 函数，避免 handler 直接访问 Application 实例
 */
export interface HandlerContext {
  dbManager: DatabaseManager
  scannerManager: ScannerManager
  thumbnailGen: ThumbnailGenerator
  fileService: FileService
  videoService: VideoService
  watermarkService: WatermarkService
  /** 获取主窗口（可能为 null） */
  getMainWindow: () => BrowserWindow | null
  /** 媒体数据变更通知（节流广播 + 缓存失效） */
  notifyMediaUpdated: () => void
  /** 失效 media:// 协议白名单缓存 */
  invalidateMediaPathCache: () => void
  /** 应用 UI 主题 */
  applyUITheme: (theme: 'default' | 'soft-pink-luxury') => void
  /** 缩略图批量生成标志（防止并发） */
  isThumbnailsGenerating: () => boolean
  setThumbnailsGenerating: (v: boolean) => void
}
