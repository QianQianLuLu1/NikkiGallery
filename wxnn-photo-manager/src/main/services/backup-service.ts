import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { promises as fsp } from 'fs'
import { app } from 'electron'
import type { DatabaseManager } from '../database/connection'
import type { TaskScheduler } from '../scheduler/task-scheduler'
import { logger } from '../utils/logger'

// 备份保留份数上限
const MAX_BACKUPS = 5
// 启动后延迟备份的毫秒数（避开启动高峰）
const STARTUP_BACKUP_DELAY_MS = 5000
// 自动备份最小间隔（7 天，避免频繁备份）
const AUTO_BACKUP_MIN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

export interface BackupRecord {
  filename: string
  filePath: string
  size: number
  createdAt: string // ISO 时间戳
}

class BackupService {
  private dbManager: DatabaseManager | null = null
  private backupDir: string = ''
  // 修复：保存启动备份定时器引用，退出时清理，避免定时器回调访问已关闭的数据库
  private startupBackupTimer: NodeJS.Timeout | null = null
  // 分级调度器（可选）：注入后启动备份通过低优先级队列执行，避免与用户操作争抢 IO
  private scheduler: TaskScheduler | null = null

  init(dbManager: DatabaseManager): void {
    this.dbManager = dbManager
    // 自定义目录：applyCustomDirectories 已调用 setDir 设置最终路径
    // 此处仅作兜底——若 setDir 未被调用，回退到默认 userData/backups
    if (!this.backupDir) {
      this.backupDir = path.join(app.getPath('userData'), 'backups')
    }
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true })
    }
  }

  /**
   * 自定义目录支持：设置备份目录路径
   * 必须在 init() 之前调用（由 applyCustomDirectories 触发）
   */
  setDir(dir: string): void {
    this.backupDir = dir
  }

  /**
   * 注入分级调度器。注入后启动备份会通过低优先级队列执行。
   * 不注入则保持原有直接执行行为（向后兼容）。
   */
  setScheduler(scheduler: TaskScheduler): void {
    this.scheduler = scheduler
  }

  // 启动后自动备份（延迟执行 + 间隔检查）
  // 分级调度改造：若已注入 scheduler，通过 enqueueLow 入队，等空闲时执行
  scheduleStartupBackup(): void {
    if (this.startupBackupTimer) clearTimeout(this.startupBackupTimer)
    this.startupBackupTimer = setTimeout(() => {
      this.startupBackupTimer = null
      const runBackup = async (): Promise<void> => {
        try {
          await this.autoBackupIfNeeded()
        } catch (err) {
          logger.error('[Backup] 启动自动备份失败:', err)
        }
      }
      if (this.scheduler) {
        void this.scheduler.enqueueLow(runBackup, { id: 'startup-backup' })
      } else {
        runBackup().catch(() => {})
      }
    }, STARTUP_BACKUP_DELAY_MS)
  }

  /** 退出时清理定时器，防止回调访问已关闭的数据库 */
  dispose(): void {
    if (this.startupBackupTimer) {
      clearTimeout(this.startupBackupTimer)
      this.startupBackupTimer = null
    }
  }

  // 检查是否需要自动备份（距上次备份超过 7 天才执行）
  private async autoBackupIfNeeded(): Promise<void> {
    const records = await this.listBackups()
    if (records.length > 0) {
      const latest = records[0] // listBackups 按时间倒序，第一条是最新的
      const elapsed = Date.now() - new Date(latest.createdAt).getTime()
      if (elapsed < AUTO_BACKUP_MIN_INTERVAL_MS) {
        logger.info(
          `[Backup] 距上次备份不足 7 天（${Math.floor(elapsed / 86400000)} 天），跳过自动备份`
        )
        return
      }
    }
    logger.info('[Backup] 执行启动自动备份')
    await this.createBackup()
  }

  // 创建数据库备份（使用 better-sqlite3 的 Online Backup API）
  // P1-04：accountUid 可选，提供时文件名加入 UID 后缀以便识别（整库备份，不丢失其他档案数据）
  async createBackup(
    accountUid?: string
  ): Promise<{ success: boolean; backup?: BackupRecord; message?: string }> {
    if (!this.dbManager) {
      return { success: false, message: '数据库未初始化' }
    }
    const db = this.dbManager.getDatabase()
    if (!db) {
      return { success: false, message: '数据库连接不可用' }
    }

    try {
      const timestamp = this.formatTimestamp(new Date())
      // P1-04：按档案备份时文件名加入 _{uid} 后缀
      const uidSuffix = accountUid ? `_${accountUid}` : ''
      const filename = `wxnn_photo_manager_${timestamp}${uidSuffix}.db`
      const backupPath = path.join(this.backupDir, filename)

      // better-sqlite3 的 backup 方法：将当前数据库在线备份到目标文件
      // 在线备份不会阻塞读写操作，WAL 模式下安全
      await this.backupDatabase(db, backupPath)

      const stats = await fsp.stat(backupPath)
      const record: BackupRecord = {
        filename,
        filePath: backupPath,
        size: stats.size,
        createdAt: stats.mtime.toISOString()
      }

      logger.info(`[Backup] 备份成功: ${filename} (${this.formatSize(stats.size)})`)

      // 清理超出上限的旧备份
      await this.pruneOldBackups()

      return { success: true, backup: record }
    } catch (error) {
      logger.error('[Backup] 创建备份失败:', error)
      return { success: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  // better-sqlite3 的 backup API 封装
  private backupDatabase(db: Database.Database, targetPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // better-sqlite3 的 db.backup() 返回 promise（async 接口）
        db.backup(targetPath)
          .then(() => resolve())
          .catch((err) => reject(err))
      } catch (err) {
        reject(err)
      }
    })
  }

  // 列出所有备份（按时间倒序）
  // P1-A10：改为 fsp 异步 API，避免同步 statSync 阻塞主进程
  async listBackups(): Promise<BackupRecord[]> {
    try {
      await fsp.access(this.backupDir)
    } catch {
      return []
    }

    const records: BackupRecord[] = []
    const files = await fsp.readdir(this.backupDir)

    for (const file of files) {
      if (!file.startsWith('wxnn_photo_manager_') || !file.endsWith('.db')) continue
      const filePath = path.join(this.backupDir, file)
      try {
        const stats = await fsp.stat(filePath)
        records.push({
          filename: file,
          filePath,
          size: stats.size,
          createdAt: stats.mtime.toISOString()
        })
      } catch {
        // 跳过无法读取的文件
      }
    }

    // 按时间倒序（最新在前）
    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return records
  }

  // 从备份恢复数据库（恢复后自动重启应用）
  // P0-A2：改为「先复制到临时文件 → 原子 rename 覆盖」三步式，避免中途失败导致数据损坏
  // P0-A3：恢复前用 better-sqlite3 只读打开备份文件执行 PRAGMA integrity_check 校验完整性
  // P1-A6：恢复成功后立即 app.relaunch() + app.exit()，避免 dbManager 处于关闭状态时 IPC 调用全部失败
  async restoreBackup(filename: string): Promise<{ success: boolean; message?: string }> {
    if (!this.dbManager) {
      return { success: false, message: '数据库未初始化' }
    }

    const backupPath = path.join(this.backupDir, filename)
    if (!fs.existsSync(backupPath)) {
      return { success: false, message: `备份文件不存在: ${filename}` }
    }

    try {
      // 获取当前数据库路径
      const dbPath = path.join(app.getPath('userData'), 'database', 'wxnn_photo_manager.db')

      // P0-A3：恢复前校验备份文件完整性
      // 用 better-sqlite3 以只读模式临时打开备份文件，执行 PRAGMA integrity_check
      // 若备份文件损坏（磁盘错误、不完整写入等），提前给出明确提示，避免恢复后应用无法启动
      const integrityCheck = this.verifyBackupIntegrity(backupPath)
      if (!integrityCheck.valid) {
        return { success: false, message: `备份文件已损坏，无法恢复: ${integrityCheck.reason}` }
      }

      // 关闭当前数据库连接
      this.dbManager.close()

      // P0-A2：原子化恢复——先复制到临时文件，再 rename 覆盖
      // 同盘 rename 是原子操作，即使中途失败也不会影响原数据库
      const tmpPath = `${dbPath}.restoring`
      try {
        fs.copyFileSync(backupPath, tmpPath)
        // 删除旧的 WAL 和 SHM 文件，避免旧的 WAL 日志干扰
        const walPath = `${dbPath}-wal`
        const shmPath = `${dbPath}-shm`
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath)
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath)
        // 原子 rename 覆盖目标数据库
        fs.renameSync(tmpPath, dbPath)
      } catch (restoreErr) {
        // 恢复失败时清理临时文件，原数据库不受影响
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
        } catch {
          /* 忽略清理失败 */
        }
        throw restoreErr
      }

      logger.info(`[Backup] 已从备份恢复: ${filename}，准备重启应用`)
      // P1-A6：恢复成功后立即重启应用，避免 dbManager 处于关闭状态时 IPC 调用全部失败
      // app.relaunch 会启动新实例，app.exit 触发 before-quit 清理流程（释放单实例锁）
      try {
        app.relaunch()
        app.exit(0)
      } catch (relaunchErr) {
        logger.error('[Backup] 重启应用失败，请手动重启:', relaunchErr)
        return { success: true, message: '恢复成功，但自动重启失败，请手动重启应用' }
      }
      // 理论上 app.exit(0) 后不会执行到这里，保留兜底返回
      return { success: true, message: '恢复成功，应用正在重启' }
    } catch (error) {
      logger.error('[Backup] 恢复备份失败:', error)
      return { success: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * P0-A3：校验备份文件完整性
   * 用 better-sqlite3 以只读模式临时打开备份文件，执行 PRAGMA integrity_check
   * 返回 { valid: true } 或 { valid: false, reason: string }
   */
  private verifyBackupIntegrity(backupPath: string): { valid: boolean; reason?: string } {
    let probe: Database.Database | null = null
    try {
      // 以只读模式打开，避免修改备份文件
      probe = new Database(backupPath, { readonly: true, fileMustExist: true })
      const result = probe.pragma('integrity_check', { simple: true })
      // integrity_check 返回 'ok' 字符串表示通过，返回数组表示有错误
      if (result === 'ok') {
        return { valid: true }
      }
      const reason = Array.isArray(result) ? result.join('; ') : String(result)
      logger.error(`[Backup] 备份文件完整性校验失败: ${backupPath} - ${reason}`)
      return { valid: false, reason }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logger.error(`[Backup] 备份文件无法打开或已损坏: ${backupPath} - ${reason}`)
      return { valid: false, reason }
    } finally {
      // 确保关闭临时连接，避免文件句柄泄漏
      if (probe) {
        try {
          probe.close()
        } catch {
          /* 忽略关闭失败 */
        }
      }
    }
  }

  // 删除指定备份
  // P1-A10：改为 fsp 异步 API
  async deleteBackup(filename: string): Promise<{ success: boolean; message?: string }> {
    const backupPath = path.join(this.backupDir, filename)
    try {
      await fsp.access(backupPath)
    } catch {
      return { success: false, message: `备份文件不存在: ${filename}` }
    }
    try {
      await fsp.unlink(backupPath)
      logger.info(`[Backup] 已删除备份: ${filename}`)
      return { success: true }
    } catch (error) {
      logger.error('[Backup] 删除备份失败:', error)
      return { success: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  // 清理超出上限的旧备份
  // P1-A10：改为 fsp 异步 API
  private async pruneOldBackups(): Promise<void> {
    const records = await this.listBackups()
    if (records.length <= MAX_BACKUPS) return

    const toDelete = records.slice(MAX_BACKUPS)
    for (const record of toDelete) {
      try {
        await fsp.unlink(record.filePath)
        logger.info(`[Backup] 清理旧备份: ${record.filename}`)
      } catch {
        // 跳过删除失败的文件
      }
    }
  }

  getBackupDirectory(): string {
    return this.backupDir
  }

  private formatTimestamp(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  }

  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`
  }
}

export const backupService = new BackupService()
