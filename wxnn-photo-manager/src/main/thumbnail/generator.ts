import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { app } from 'electron'
import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
// C-3：统一文件存在检查与视频扩展名判定
import { pathExists } from '../utils/file-utils'
import { isVideoExt } from '../utils/media-constants'
// P1-A7：统一从 ffmpeg-paths 导入，消除重复路径解析
import { ffmpegPath as ffmpegBinaryPath } from '../utils/ffmpeg-paths'
import { trackFfmpegCommand, untrackFfmpegCommand } from '../utils/process-registry'

// A-S7：缩略图缓存大小上限（默认 2GB），超出后按 LRU 淘汰最久未访问的
// T10：改为可配置，由 setCacheLimit 运行时调整
const DEFAULT_CACHE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024
// A-S8：内容 hash 读取文件前 1MB，兼顾唯一性与性能
const CONTENT_HASH_READ_SIZE = 1024 * 1024
// LRU 元数据持久化文件名
const CACHE_METADATA_FILENAME = 'cache-metadata.json'

export class ThumbnailGenerator {
  private cacheDir: string
  private maxWidth = 320
  private maxHeight = 320
  private quality = 85
  // P1-03：低质量缩略图参数（首屏快速预览，滚动停止后替换为标准质量）
  private lowMaxWidth = 64
  private lowMaxHeight = 64
  private lowQuality = 30
  // T10：缓存上限可配置，默认 2GB
  private cacheLimitBytes = DEFAULT_CACHE_LIMIT_BYTES

  // 修复 C-S3：并发生成同一文件的缩略图时存在竞态条件
  // 使用 Map<string, Promise> 作为互斥锁，相同 filePath 的并发请求复用同一个 Promise
  private generatingLocks: Map<string, Promise<string | null>> = new Map()

  // A-S8：内容 hash 内存缓存，避免每次都读文件
  // key: filePath，value: { hash, mtime, size }，mtime/size 变化时重新计算
  private contentHashCache: Map<string, { hash: string; mtime: number; size: number }> = new Map()

  // A-S7：LRU 访问时间记录，key: 内容 hash，value: 最后访问时间戳
  private accessTimes: Map<string, number> = new Map()
  private accessTimesLoaded = false
  private accessCounter = 0

  // F-S5：内存维护缓存总大小计数器，避免每次生成都全目录扫描
  // -1 表示未初始化，首次 enforceCacheLimit 会全扫描校准
  private totalCacheSize = -1
  // F-S5：后台定时清理任务句柄（每 5 分钟校准 + 按需清理）
  private lruTimer: NodeJS.Timeout | null = null
  private static readonly LRU_CHECK_INTERVAL_MS = 5 * 60 * 1000
  // F-S5：超阈值 10% 才触发清理，避免频繁扫描
  private static readonly LRU_TRIGGER_RATIO = 1.1

  constructor() {
    const userDataPath = app.getPath('userData')
    this.cacheDir = path.join(userDataPath, 'thumbnails')
    // 异步创建目录在首次 generate 时处理，避免构造器阻塞
  }

  /**
   * 自定义目录支持：设置缓存目录路径
   * 必须在首次 generate 之前调用（由 applyCustomDirectories 触发）
   * 切换目录后重置 accessTimesLoaded，强制重新加载新目录的 metadata
   */
  setDir(dir: string): void {
    this.cacheDir = dir
    this.accessTimesLoaded = false
    this.accessTimes.clear()
    // F-S5：目录变更后需重新校准计数器
    this.totalCacheSize = -1
  }

  getCacheDir(): string {
    return this.cacheDir
  }

  /**
   * T10：获取缓存统计信息（总大小 / 文件数 / 上限）
   */
  async getCacheStats(): Promise<{ totalSize: number; fileCount: number; limit: number; cacheDir: string }> {
    await this.ensureCacheDir()
    let totalSize = 0
    let fileCount = 0
    try {
      const entries = await fsp.readdir(this.cacheDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (entry.name === CACHE_METADATA_FILENAME) continue
        const stat = await fsp.stat(path.join(this.cacheDir, entry.name))
        totalSize += stat.size
        fileCount++
      }
    } catch {
      // 目录不存在或读取失败，返回 0
    }
    return { totalSize, fileCount, limit: this.cacheLimitBytes, cacheDir: this.cacheDir }
  }

  /**
   * T10：手动清理所有缩略图（保留 metadata 文件）
   * @returns 清理前的大小与文件数
   */
  async cleanAll(): Promise<{ clearedSize: number; clearedCount: number }> {
    await this.ensureCacheDir()
    let clearedSize = 0
    let clearedCount = 0
    try {
      const entries = await fsp.readdir(this.cacheDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (entry.name === CACHE_METADATA_FILENAME) continue
        const fullPath = path.join(this.cacheDir, entry.name)
        const stat = await fsp.stat(fullPath)
        await fsp.unlink(fullPath).catch(() => {})
        clearedSize += stat.size
        clearedCount++
      }
      // 清理后清空访问时间记录
      this.accessTimes.clear()
      await this.persistAccessTimes()
    } catch {
      // 忽略
    }
    return { clearedSize, clearedCount }
  }

  /**
   * T10：设置缓存上限，并立即检查是否需要淘汰
   */
  async setCacheLimit(limitBytes: number): Promise<{ applied: boolean; evicted: number }> {
    if (!Number.isFinite(limitBytes) || limitBytes < 100 * 1024 * 1024) {
      // 下限 100MB，防止误设过小导致频繁淘汰
      return { applied: false, evicted: 0 }
    }
    this.cacheLimitBytes = limitBytes
    const before = await this.getCacheStats()
    await this.enforceCacheLimit(true)
    const after = await this.getCacheStats()
    return {
      applied: true,
      evicted: before.fileCount - after.fileCount
    }
  }

  /**
   * 仅设置上限值，不触发 LRU 淘汰
   * 用于启动时从数据库加载持久化的上限值
   */
  setCacheLimitBytes(limitBytes: number): void {
    if (Number.isFinite(limitBytes) && limitBytes >= 100 * 1024 * 1024) {
      this.cacheLimitBytes = limitBytes
    }
  }

  /**
   * T10：启动后主动检查缓存大小（公开入口，供 index.ts 调用）
   */
  async enforceLimitNow(): Promise<{ evicted: number; totalSize: number; fileCount: number }> {
    await this.ensureCacheDir()
    await this.loadAccessTimes()
    const before = await this.getCacheStats()
    await this.enforceCacheLimit(true)
    const after = await this.getCacheStats()
    return {
      evicted: before.fileCount - after.fileCount,
      totalSize: after.totalSize,
      fileCount: after.fileCount
    }
  }

  /**
   * T10：退出前强制持久化访问时间，避免丢失最近访问记录
   */
  async flushAccessTimes(): Promise<void> {
    if (!this.accessTimesLoaded) return
    await this.persistAccessTimes()
  }

  private async ensureCacheDir(): Promise<void> {
    // C-3：统一文件存在检查
    if (!(await pathExists(this.cacheDir))) {
      await fsp.mkdir(this.cacheDir, { recursive: true })
    }
  }

  async generate(filePath: string, quality?: 'low' | 'standard'): Promise<string | null> {
    // F-S4 修复：低质量模式原直接调用 doGenerateLow 不经过 generatingLocks，
    // 多个并发请求同文件会重复生成。现纳入锁，key 区分 ${filePath}:low 与 ${filePath}:standard。
    const lockKey = quality === 'low' ? `${filePath}:low` : filePath
    const existing = this.generatingLocks.get(lockKey)
    if (existing) {
      return existing
    }

    const promise = (quality === 'low' ? this.doGenerateLow(filePath) : this.doGenerate(filePath)).finally(() => {
      // 生成完成后（无论成功或失败）清除锁
      this.generatingLocks.delete(lockKey)
    })

    this.generatingLocks.set(lockKey, promise)
    return promise
  }

  // P1-03：生成低质量缩略图（64px, q30）
  // 命名规则：${fileHash}_low.jpg，与标准版本 ${fileHash}.jpg 区分
  // 若低质量缓存命中直接返回；否则从标准缩略图缩放（若标准已存在），或从原文件生成
  private async doGenerateLow(filePath: string): Promise<string | null> {
    try {
      await this.ensureCacheDir()
      if (!(await pathExists(filePath))) return null

      const stats = await fsp.stat(filePath)
      const fileHash = await this.getFileHash(filePath, stats)
      const lowPath = path.join(this.cacheDir, `${fileHash}_low.jpg`)

      if (await pathExists(lowPath)) return lowPath

      const standardPath = path.join(this.cacheDir, `${fileHash}.jpg`)
      // 优先从标准缩略图缩放（更快），否则从原文件生成
      const sourcePath = (await pathExists(standardPath)) ? standardPath : filePath
      await sharp(sourcePath)
        .resize(this.lowMaxWidth, this.lowMaxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: this.lowQuality })
        .toFile(lowPath)
      return lowPath
    } catch (error) {
      console.error('[Thumbnail] 低质量缩略图生成失败:', error)
      return null
    }
  }

  private async doGenerate(filePath: string): Promise<string | null> {
    try {
      await this.ensureCacheDir()
      await this.loadAccessTimes()

      // C-3：统一文件存在检查
      if (!(await pathExists(filePath))) {
        console.error(`[Thumbnail] 文件不存在: ${filePath}`)
        return null
      }

      const stats = await fsp.stat(filePath)
      // A-S8：基于内容 hash（文件前 1MB 的 sha256），文件移动后缓存仍有效
      const fileHash = await this.getFileHash(filePath, stats)
      const thumbnailPath = path.join(this.cacheDir, `${fileHash}.jpg`)

      // A-S7：记录访问时间（LRU），无论缓存命中还是新生成都需更新
      this.accessTimes.set(fileHash, Date.now())
      this.accessCounter++

      // C-3：统一文件存在检查 + 视频扩展名判定
      if (await pathExists(thumbnailPath)) {
        // 缓存命中：访问时间已在内存更新，定期持久化
        await this.maybePersistAccessTimes()
        return thumbnailPath
      }

      const ext = path.extname(filePath).toLowerCase()
      const isVideo = isVideoExt(ext)

      if (isVideo) {
        await this.extractVideoFrame(filePath, thumbnailPath)
      } else {
        await sharp(filePath)
          .resize(this.maxWidth, this.maxHeight, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: this.quality, progressive: true })
          .toFile(thumbnailPath)
      }

      // P1-03：生成标准缩略图后同步生成低质量版本（64px, q30）
      // 从刚生成的标准缩略图缩放（更快），失败不阻断主流程
      const lowPath = path.join(this.cacheDir, `${fileHash}_low.jpg`)
      if (!(await pathExists(lowPath))) {
        try {
          await sharp(thumbnailPath)
            .resize(this.lowMaxWidth, this.lowMaxHeight, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .jpeg({ quality: this.lowQuality })
            .toFile(lowPath)
        } catch {
          // 低质量生成失败不影响标准缩略图返回
        }
      }

      // F-S5：累加新生成文件大小到内存计数器，避免全目录扫描
      // 首次生成时 totalCacheSize 为 -1，enforceCacheLimit 会全扫描校准
      try {
        const thumbStat = await fsp.stat(thumbnailPath)
        this.totalCacheSize = Math.max(0, this.totalCacheSize) + thumbStat.size
      } catch {
        // stat 失败忽略，enforceCacheLimit 会全扫描校准
      }
      // A-S7：新生成缩略图后检查缓存大小，超阈值 10% 时按 LRU 淘汰
      await this.enforceCacheLimit()
      await this.maybePersistAccessTimes()
      return thumbnailPath
    } catch (error) {
      console.error('[Thumbnail] 缩略图生成失败:', error)
      return null
    }
  }

  private extractVideoFrame(videoPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpegPath = ffmpegBinaryPath
      let settled = false

      // 30 秒超时保护：超时后必须 kill 子进程，避免 ffmpeg 累积泄漏
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        command.kill('SIGKILL')
        untrackFfmpegCommand(command)
        reject(new Error('ffmpeg 提取视频帧超时'))
      }, 30000)

      const command = ffmpeg(videoPath)
        .setFfmpegPath(ffmpegPath)
        .seekInput(0)
        .frames(1)
        .output(outputPath)
        .outputOptions('-vf', `scale=${this.maxWidth}:${this.maxHeight}:force_original_aspect_ratio=decrease`)
        // 合并为单一 end/error 监听，避免原实现重复注册导致的清理不一致
        .on('end', () => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          untrackFfmpegCommand(command)
          resolve()
        })
        .on('error', (err) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          untrackFfmpegCommand(command)
          reject(err)
        })

      trackFfmpegCommand(command)
      command.run()
    })
  }

  /**
   * A-S8：基于文件内容（前 1MB）计算 sha256 hash。
   * 文件移动后路径变化但内容不变，hash 仍相同，缓存可复用。
   * 使用内存缓存避免每次都读文件，mtime/size 变化时才重新计算。
   */
  private async getFileHash(filePath: string, stats: fs.Stats): Promise<string> {
    const mtime = stats.mtime.getTime()
    const size = stats.size
    const cached = this.contentHashCache.get(filePath)
    if (cached && cached.mtime === mtime && cached.size === size) {
      return cached.hash
    }

    try {
      const hash = crypto.createHash('sha256')
      const handle = await fsp.open(filePath, 'r')
      try {
        const buffer = Buffer.alloc(CONTENT_HASH_READ_SIZE)
        const { bytesRead } = await handle.read(buffer, 0, CONTENT_HASH_READ_SIZE, 0)
        hash.update(buffer.subarray(0, bytesRead))
      } finally {
        await handle.close()
      }
      const hashHex = hash.digest('hex').slice(0, 16)
      this.contentHashCache.set(filePath, { hash: hashHex, mtime, size })
      return hashHex
    } catch (err) {
      // 读取失败时降级为路径+mtime hash，保证功能可用
      console.warn(`[Thumbnail] 内容 hash 计算失败，降级为路径 hash: ${filePath}`, err)
      const fallback = crypto.createHash('sha256').update(`${filePath}:${mtime}`).digest('hex').slice(0, 16)
      return fallback
    }
  }

  /**
   * A-S7：加载 LRU 访问时间元数据（sidecar JSON），跨重启保留访问记录。
   * 建议改#10：对 JSON.parse 与字段类型加守卫，损坏文件不会让 for...of 抛错
   */
  private async loadAccessTimes(): Promise<void> {
    if (this.accessTimesLoaded) return
    this.accessTimesLoaded = true
    try {
      const metaPath = path.join(this.cacheDir, CACHE_METADATA_FILENAME)
      const raw = await fsp.readFile(metaPath, 'utf-8')
      const data = JSON.parse(raw)
      if (data && typeof data.accessTimes === 'object' && data.accessTimes !== null) {
        for (const [k, v] of Object.entries(data.accessTimes)) {
          // 仅接受值为有限数字的条目，过滤掉损坏/非法字段
          const num = Number(v)
          if (Number.isFinite(num)) {
            this.accessTimes.set(k, num)
          }
        }
      }
    } catch {
      // 元数据文件不存在或损坏，忽略，从空开始记录
    }
  }

  /**
   * A-S7：每 100 次访问持久化一次访问时间，避免频繁磁盘写入。
   */
  private async maybePersistAccessTimes(): Promise<void> {
    if (this.accessCounter % 100 !== 0) return
    await this.persistAccessTimes()
  }

  /**
   * T10：无条件持久化访问时间（用于 cleanAll / flushAccessTimes 等场景）
   */
  private async persistAccessTimes(): Promise<void> {
    try {
      const metaPath = path.join(this.cacheDir, CACHE_METADATA_FILENAME)
      const data = JSON.stringify({ accessTimes: Object.fromEntries(this.accessTimes) })
      await fsp.writeFile(metaPath, data, 'utf-8')
    } catch (err) {
      console.warn('[Thumbnail] 保存缓存元数据失败:', err)
    }
  }

  /**
   * A-S7：检查缓存总大小，超过 cacheLimitBytes 时按 LRU 淘汰最久未访问的缩略图。
   * F-S5：改为按需触发——仅当内存计数器超阈值 10% 或 force=true 时才全目录扫描，
   * 避免每次生成都 O(n) 扫描。后台定时任务每 5 分钟 force=true 校准计数器。
   */
  private async enforceCacheLimit(force = false): Promise<void> {
    // F-S5：未强制且未超阈值 10% 时跳过，避免每次生成都全目录扫描
    if (!force && this.totalCacheSize >= 0 && this.totalCacheSize <= this.cacheLimitBytes * ThumbnailGenerator.LRU_TRIGGER_RATIO) {
      return
    }
    try {
      const entries = await fsp.readdir(this.cacheDir, { withFileTypes: true })
      const filesInfo: Array<{ name: string; fullPath: string; size: number; accessTime: number }> = []
      let totalSize = 0

      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (entry.name === CACHE_METADATA_FILENAME) continue
        const fullPath = path.join(this.cacheDir, entry.name)
        const stat = await fsp.stat(fullPath)
        const hash = entry.name.replace(/\.jpg$/, '')
        // 访问时间优先取内存记录，缺失时降级为文件 mtime
        const accessTime = this.accessTimes.get(hash) ?? stat.mtime.getTime()
        filesInfo.push({ name: entry.name, fullPath, size: stat.size, accessTime })
        totalSize += stat.size
      }

      // F-S5：校准内存计数器为实际值
      this.totalCacheSize = totalSize

      if (totalSize <= this.cacheLimitBytes) return

      // 按 accessTime 升序，淘汰最久未访问的
      filesInfo.sort((a, b) => a.accessTime - b.accessTime)
      for (const f of filesInfo) {
        if (totalSize <= this.cacheLimitBytes) break
        await fsp.unlink(f.fullPath).catch(() => {})
        const hash = f.name.replace(/\.jpg$/, '')
        this.accessTimes.delete(hash)
        totalSize -= f.size
        console.log(`[Thumbnail] LRU 淘汰: ${f.name}`)
      }
      // F-S5：淘汰后更新计数器
      this.totalCacheSize = totalSize
    } catch (err) {
      console.warn('[Thumbnail] 缓存 LRU 清理失败:', err)
    }
  }

  /**
   * F-S5：启动后台定时校准 + 清理任务（每 5 分钟一次）
   * 应在 Application.initialize 中调用
   */
  startLruBackgroundTask(): void {
    if (this.lruTimer) return
    this.lruTimer = setInterval(() => {
      void this.enforceCacheLimit(true).catch(() => {})
    }, ThumbnailGenerator.LRU_CHECK_INTERVAL_MS)
  }

  /**
   * F-S5：停止后台定时任务（before-quit 调用，避免定时器在 db.close 后触发）
   */
  stopLruBackgroundTask(): void {
    if (this.lruTimer) {
      clearInterval(this.lruTimer)
      this.lruTimer = null
    }
  }
}
