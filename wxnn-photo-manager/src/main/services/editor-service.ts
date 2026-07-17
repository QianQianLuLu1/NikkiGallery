/**
 * 编辑器服务（P1-M：从 index.ts 的 editor:save handler 抽取）
 *
 * 职责：
 * - 处理图片编辑后的保存（含格式转换、质量压缩）
 * - 保存前自动备份原图（独立子目录 editor-snapshots，避免污染数据库备份列表）
 * - 写入失败时从备份恢复
 * - 记录编辑历史到 edit_history 表
 * - 备份 LRU 清理（保留最近 MAX_EDITOR_SNAPSHOTS 个，超出按 mtime 升序删除）
 *
 * 设计原则：
 * - 单一职责：仅处理编辑保存逻辑，不涉及 IPC 注册
 * - 依赖注入：通过构造函数接收 dbManager 实例
 * - 健壮性：备份→写入→恢复三段式保障，写入失败自动回滚
 */
import path from 'path'
import fs from 'fs'
import sharp from 'sharp'
import type Database from 'better-sqlite3'
import { backupService } from './backup-service'
import { parseDataUrlToBuffer } from '../utils/file-utils'
import { getExtFromMime } from '../utils/media-constants'
import type { DatabaseManager } from '../database/connection'

// P1-A6：编辑器备份 LRU 上限（原实现无清理，频繁编辑导致磁盘隐性泄漏）
const MAX_EDITOR_SNAPSHOTS = 50

export interface EditorSaveOptions {
  format?: string
  quality?: number
  params?: string
}

export interface EditorSaveResult {
  success: boolean
  message: string
  filePath?: string
}

export class EditorService {
  private dbManager: DatabaseManager | null = null
  // P1-A6：独立子目录路径缓存，init 时计算一次
  private snapshotDir: string = ''

  /** 初始化：注入 dbManager 实例（在 Application.initialize 中调用） */
  init(dbManager: DatabaseManager): void {
    this.dbManager = dbManager
    // P1-A6：编辑器备份使用独立子目录，避免污染 backupService 的数据库备份列表
    // pruneOldBackups 的正则 /^wxnn_photo_manager_.*\.db$/ 不匹配编辑器备份文件名，
    // 独立子目录让两类备份互不干扰，UI 备份列表也不会出现编辑器快照
    this.snapshotDir = path.join(backupService.getBackupDirectory(), 'editor-snapshots')
  }

  private getDb(): Database.Database | null {
    return this.dbManager?.getDatabase() ?? null
  }

  /**
   * P1-A6：清理超出上限的旧编辑器快照（LRU by mtime）
   * 保存成功后调用，避免频繁编辑导致磁盘空间隐性泄漏
   * 失败时仅记录日志，不影响主流程
   */
  private async pruneOldSnapshots(): Promise<void> {
    try {
      const entries = await fs.promises.readdir(this.snapshotDir)
      const snapshots: Array<{ name: string; mtime: number }> = []
      for (const name of entries) {
        // 仅清理本服务生成的快照文件（{mediaId}_{timestamp}.{ext} 格式）
        if (!/^\d+_\d+\.\w+$/.test(name)) continue
        const fullPath = path.join(this.snapshotDir, name)
        try {
          const stat = await fs.promises.stat(fullPath)
          snapshots.push({ name, mtime: stat.mtimeMs })
        } catch {
          // 文件已被外部删除时跳过
        }
      }
      if (snapshots.length <= MAX_EDITOR_SNAPSHOTS) return

      // 按 mtime 升序（最旧在前），删除超出上限的部分
      snapshots.sort((a, b) => a.mtime - b.mtime)
      const toDelete = snapshots.slice(0, snapshots.length - MAX_EDITOR_SNAPSHOTS)
      for (const item of toDelete) {
        try {
          await fs.promises.unlink(path.join(this.snapshotDir, item.name))
        } catch {
          // 单个删除失败不阻塞整体清理
        }
      }
      console.log(`[Editor] 清理 ${toDelete.length} 个旧快照，剩余 ${snapshots.length - toDelete.length} 个`)
    } catch (err) {
      console.warn('[Editor] 清理旧快照失败:', err)
    }
  }

  /**
   * 保存编辑后的图片
   * @param filePath 目标文件路径（必须是数据库中已索引的媒体文件）
   * @param dataUrl 编辑后的图片数据（data:image/...;base64,...）
   * @param options 格式/质量/参数
   */
  async save(filePath: string, dataUrl: string, options?: EditorSaveOptions): Promise<EditorSaveResult> {
    const normalizedFilePath = path.resolve(filePath)
    const db = this.getDb()
    if (!db) return { success: false, message: '数据库未初始化' }

    // 安全校验：filePath 必须是数据库中已索引的媒体文件路径，防止任意文件写入
    const mediaRow = db.prepare('SELECT id FROM media_files WHERE file_path = ? LIMIT 1').get(normalizedFilePath) as { id: number } | undefined
    if (!mediaRow) {
      return { success: false, message: '安全限制：只能保存到已索引的媒体文件路径' }
    }

    const { buffer, mimeType } = parseDataUrlToBuffer(dataUrl)
    const format = options?.format || getExtFromMime(mimeType)
    const quality = options?.quality ?? 92

    // P1-A6：备份到独立子目录 editor-snapshots，避免污染数据库备份列表
    // F-S7 修复：原实现不校验备份完整性，磁盘满时备份可能不完整，
    // 恢复时会用不完整备份覆盖原图导致原图永久损坏。现增加备份大小校验。
    const backupName = `${mediaRow.id}_${Date.now()}${path.extname(normalizedFilePath)}`
    const backupPath = path.join(this.snapshotDir, backupName)
    let backupCreated = false
    let originalSize = 0
    try {
      await fs.promises.mkdir(this.snapshotDir, { recursive: true })
      originalSize = (await fs.promises.stat(normalizedFilePath)).size
      await fs.promises.copyFile(normalizedFilePath, backupPath)
      // 校验备份完整性：备份文件大小必须与原文件一致
      const backupSize = (await fs.promises.stat(backupPath)).size
      if (backupSize !== originalSize) {
        console.warn(`[Editor] 备份大小不匹配（原 ${originalSize} vs 备份 ${backupSize}），删除不完整备份`)
        await fs.promises.unlink(backupPath).catch(() => {})
        backupCreated = false
      } else {
        backupCreated = true
      }
    } catch (backupError) {
      console.warn('[Editor] 备份原图失败，继续保存:', backupError)
    }

    // 写入新文件（sharp pipeline 处理格式转换与质量压缩）
    try {
      let pipeline = sharp(buffer)
      if (format === 'jpg' || format === 'jpeg') {
        pipeline = pipeline.jpeg({ quality, progressive: true, mozjpeg: true })
      } else if (format === 'png') {
        pipeline = pipeline.png({ quality: Math.min(quality, 100) })
      } else if (format === 'webp') {
        pipeline = pipeline.webp({ quality })
      }
      await pipeline.toFile(normalizedFilePath)
    } catch (writeError) {
      // 写入失败时尝试从备份恢复（恢复前再次校验备份完整性）
      if (backupCreated) {
        try {
          const backupSize = (await fs.promises.stat(backupPath)).size
          if (backupSize !== originalSize) {
            console.error(`[Editor] 备份大小已变化（原 ${originalSize} vs 当前 ${backupSize}），拒绝恢复以避免原图损坏`)
          } else {
            await fs.promises.copyFile(backupPath, normalizedFilePath)
            console.log('[Editor] 写入失败，已从备份恢复原图')
          }
        } catch (restoreError) {
          console.error('[Editor] 写入失败且恢复备份也失败:', restoreError)
        }
      }
      throw writeError
    }

    // P1-A6：保存成功后异步清理超出上限的旧快照（不阻塞主流程）
    void this.pruneOldSnapshots()

    // 记录编辑历史
    try {
      const params = options?.params || '{}'
      // Bug #09-F2：thumbnail 列名误导（实际从未被 SELECT 读取，是死字段）
      // 原实现写入 backupPath，但 backupPath 已在 backup_service 内部管理，无需在 edit_history 重复存储
      // 写入 null 避免误导未来读取者；彻底删除该列或实装真缩略图留待 v3 P2 重构
      db.prepare(
        'INSERT INTO edit_history (media_id, params, thumbnail, created_at) VALUES (?, ?, ?, datetime("now"))'
      ).run(mediaRow.id, params, null)
    } catch (historyError) {
      console.warn('[Editor] 记录编辑历史失败:', historyError)
    }

    return { success: true, message: '保存成功', filePath: normalizedFilePath }
  }
}

// 单例导出
export const editorService = new EditorService()
