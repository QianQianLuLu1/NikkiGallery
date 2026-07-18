import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'
import { detectSceneCategory } from '../utils/scene-category'

export class DatabaseManager {
  private db: Database.Database | null = null
  private dbPath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    const dbDir = path.join(userDataPath, 'database')
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    this.dbPath = path.join(dbDir, 'wxnn_photo_manager.db')
  }

  async initialize(): Promise<void> {
    // 修复：数据库打开可能因文件锁/损坏失败，提供更清晰的错误信息
    try {
      this.db = new Database(this.dbPath)
    } catch (err) {
      // 检查是否 WAL/SHM 文件损坏（删除后重试一次）
      const walPath = this.dbPath + '-wal'
      const shmPath = this.dbPath + '-shm'
      try {
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath)
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath)
        this.db = new Database(this.dbPath)
      } catch (retryErr) {
        // 仍失败：抛出原始错误 + 重试错误，方便诊断
        throw new Error(
          `数据库打开失败（已尝试清理 WAL/SHM）：${err instanceof Error ? err.message : String(err)}\n` +
            `重试错误：${retryErr instanceof Error ? retryErr.message : String(retryErr)}`
        )
      }
    }
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    // PRAGMA 性能优化（修复 A-G5：原实现缺少性能相关 PRAGMA）
    // synchronous=NORMAL：WAL 模式下安全且性能更好（默认 FULL 每次提交都 fsync）
    // cache_size=-20000：20MB 内存缓存（负值表示 KB）
    // temp_store=MEMORY：临时表与排序使用内存
    // mmap_size=268435456：256MB 内存映射 I/O，加速读取
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('cache_size = -20000')
    this.db.pragma('temp_store = MEMORY')
    this.db.pragma('mmap_size = 268435456')
    // 显式设置 WAL 自动 checkpoint（1000 页 ≈ 4MB），避免 WAL 文件无限膨胀
    // 修复：原实现未设置，进程异常退出时 WAL 残留可能影响下次启动
    try {
      this.db.pragma('wal_autocheckpoint = 1000')
    } catch {}
    await this.runMigrations()

    // 数据库性能优化（2026-07-18）：启用增量自动清理 + 查询计划统计维护
    // auto_vacuum = INCREMENTAL：删除数据时增量回收空闲页，避免文件无限膨胀
    // 注意：auto_vacuum 只能在数据库创建时设置；旧库（mode=0）标记为 INCREMENTAL 后，
    //       需未来某次手动 VACUUM 才能真正切换模式。此处不主动 VACUUM，避免阻塞启动
    try {
      const autoVacuumMode = this.db.pragma('auto_vacuum', { simple: true })
      if (autoVacuumMode === 0) {
        this.db.pragma('auto_vacuum = INCREMENTAL')
      }
    } catch (err) {
      console.warn('[DB] auto_vacuum 设置失败（已忽略）:', err)
    }

    // PRAGMA optimize：让 SQLite 自动分析索引使用统计，优化查询计划器
    // 官方推荐的轻量维护操作，毫秒级完成，不阻塞业务
    try {
      this.db.pragma('optimize')
    } catch (err) {
      console.warn('[DB] PRAGMA optimize 失败（已忽略）:', err)
    }
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    // P0-A2：创建 schema_migrations 表，用于跟踪命名迁移（仅执行一次的迁移）
    // 幂等创建：旧库首次升级时自动创建，已有库无影响
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `)

    // 创建媒体文件主表（仅含 v2.0 初始列，新增列通过 ALTER TABLE 迁移添加）
    // 修复：旧版（v2.1）数据库已有 media_files 表但缺少 is_missing/missing_count/phash 等新列，
    // 若 CREATE TABLE 中包含新列 + 立即 CREATE INDEX 引用新列，因 IF NOT EXISTS 跳过建表，
    // 索引创建会因列不存在崩溃。正确顺序：先建表（仅初始列）→ ALTER 添加新列 → 创建索引
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS media_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_ext TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        duration REAL,
        created_at TEXT NOT NULL,
        modified_at TEXT NOT NULL,
        source_path TEXT NOT NULL,
        thumbnail TEXT,
        tags TEXT DEFAULT '[]',
        category_id INTEGER,
        rating INTEGER DEFAULT 0,
        is_favorite INTEGER DEFAULT 0,
        notes TEXT DEFAULT '',
        indexed_at TEXT NOT NULL
      );
    `)

    // 创建分类表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        icon TEXT,
        color TEXT,
        sort_order INTEGER DEFAULT 0,
        parent_id INTEGER,
        is_system INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
      -- 修复 A-S3：parent_id 列被分类树查询使用
      CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
    `)

    // 创建扫描记录表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scan_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_type TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        files_found INTEGER DEFAULT 0,
        files_new INTEGER DEFAULT 0,
        status TEXT DEFAULT 'running'
      );
    `)

    // 创建设置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)

    // 滤镜预设表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS filter_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        params TEXT NOT NULL,
        is_builtin INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `)

    // 水印模板表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS watermark_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        config TEXT NOT NULL,
        is_builtin INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `)

    // 编辑历史表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS edit_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id INTEGER NOT NULL,
        params TEXT NOT NULL,
        thumbnail TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE
      );
      -- 修复 A-S3：media_id 列被编辑历史查询使用
      CREATE INDEX IF NOT EXISTS idx_edit_history_media_id ON edit_history(media_id);
    `)

    // F-S8：全局操作历史表（用于全局撤销 Ctrl+Z）
    // 建议改#9：持久化操作记录，支持跨重启撤销
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operation_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type TEXT NOT NULL,
        media_id INTEGER,
        payload TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_operation_history_created_at ON operation_history(created_at);
      CREATE INDEX IF NOT EXISTS idx_operation_history_media_id ON operation_history(media_id);
      -- P2-J：新增 operation_type 索引，支持按类型筛选撤销历史（避免全表扫描）
      CREATE INDEX IF NOT EXISTS idx_operation_history_type ON operation_history(operation_type);
    `)
    // 建议改#9：旧库迁移——添加 description 列
    try {
      this.db.exec(`ALTER TABLE operation_history ADD COLUMN description TEXT NOT NULL DEFAULT '';`)
    } catch {
      // 字段已存在时忽略
    }
    // F-G8：启动时清理 30 天前的操作历史记录，防止 operation_history 表无限增长
    // 原因：撤销栈过深无实际价值（用户极少回退 30 天前的操作），但表膨胀会拖慢查询与备份
    try {
      this.db.exec(`DELETE FROM operation_history WHERE created_at < datetime('now', '-30 days');`)
    } catch (err) {
      // 清理失败不阻塞启动，仅记录
      console.warn('[DB] F-G8 清理 operation_history 失败:', err)
    }

    // P0-B：删除 tags + media_tags 僵尸表
    // 原因：渲染进程零调用 tag:list/add/remove IPC，实际仅使用 media_files.tags JSON 字段
    // 双存储机制存在数据不一致风险，删除僵尸表统一为 JSON 字段单存储
    // 兼容性：保留 DROP TABLE IF EXISTS 以清理已存在的旧表
    this.db.exec(`
      DROP TABLE IF EXISTS media_tags;
      DROP TABLE IF EXISTS tags;
    `)

    // 插入默认系统分类
    const defaultCategories = [
      { name: '人物', icon: 'people', color: '#FF6B6B', sort_order: 1, is_system: 1 },
      { name: '地点', icon: 'location', color: '#4ECDC4', sort_order: 2, is_system: 1 },
      { name: '场景', icon: 'scene', color: '#45B7D1', sort_order: 3, is_system: 1 },
      { name: '截图', icon: 'screenshot', color: '#96CEB4', sort_order: 4, is_system: 1 },
      { name: '录屏', icon: 'recording', color: '#FFEAA7', sort_order: 5, is_system: 1 },
      { name: '最近', icon: 'recent', color: '#DDA0DD', sort_order: 6, is_system: 1 },
      { name: '收藏', icon: 'favorite', color: '#FD79A8', sort_order: 7, is_system: 1 }
    ]

    const insertCategory = this.db.prepare(`
      INSERT OR IGNORE INTO categories (name, icon, color, sort_order, is_system, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `)

    for (const cat of defaultCategories) {
      insertCategory.run(cat.name, cat.icon, cat.color, cat.sort_order, cat.is_system)
    }

    // 迁移：确保 media_files 表包含 scene_category 字段，并为旧数据补充分类
    this.migrateSceneCategory()

    // 迁移：添加软删除字段（F-S6 回收站恢复机制）
    // is_deleted=0 表示正常，=1 表示已移入应用回收站
    // deleted_at 记录软删除时间，用于回收站排序
    this.migrateSoftDelete()

    // F-O1：游戏特色功能增强
    // scene_time：基于图像亮度直方图的场景时段分类（day/night/dawn/dusk/unknown）
    this.migrateSceneTime()
    // outfit：手动套装标注（无限暖暖套装名）
    this.migrateOutfit()
    // T02：文件完整性校验字段（is_missing + missing_count）
    this.migrateMissingStatus()
    // T05：感知哈希字段（phash），用于相似图片查找
    this.migratePhash()
    // P0-02：角色档案管理——account_uid 字段 + character_profiles 表
    this.migrateAccountUid()
    this.createCharacterProfilesTable()
    // P0-03：智能媒体分组——album_type 字段
    this.migrateAlbumType()
    // P1-01：智能去重——is_duplicate + original_id 字段
    // is_duplicate=1 表示该文件是某重复组的"非推荐保留"项；original_id 指向推荐保留的文件 id
    this.migrateDuplicateFields()
    // 区分游戏内拍摄（game）与启动器缓存（launcher）
    this.migrateMediaSource()

    // 所有 ADD COLUMN 迁移完成后，统一创建索引（避免列未存在时索引创建失败）
    // 修复：原实现此块无 try/catch，任一 CREATE INDEX 抛错会导致 runMigrations 抛出
    // 进而触发 initialize 失败 → 僵尸进程。改为逐条独立创建，单条失败不影响其他索引
    const indexStatements = [
      'CREATE INDEX IF NOT EXISTS idx_media_files_type ON media_files(file_type)',
      'CREATE INDEX IF NOT EXISTS idx_media_files_category ON media_files(category_id)',
      'CREATE INDEX IF NOT EXISTS idx_media_files_favorite ON media_files(is_favorite)',
      'CREATE INDEX IF NOT EXISTS idx_media_files_modified ON media_files(modified_at)',
      'CREATE INDEX IF NOT EXISTS idx_media_files_thumbnail ON media_files(thumbnail)',
      'CREATE INDEX IF NOT EXISTS idx_media_files_source_path ON media_files(source_path)',
      'CREATE INDEX IF NOT EXISTS idx_media_files_scene_category ON media_files(scene_category)',
      'CREATE INDEX IF NOT EXISTS idx_media_files_scene_time ON media_files(scene_time)',
      'CREATE INDEX IF NOT EXISTS idx_media_files_outfit ON media_files(outfit)',
      'CREATE INDEX IF NOT EXISTS idx_media_files_is_deleted ON media_files(is_deleted)',
      'CREATE INDEX IF NOT EXISTS idx_media_files_is_missing ON media_files(is_missing)',
      'CREATE INDEX IF NOT EXISTS idx_media_files_phash ON media_files(phash)',
      // P0-02：account_uid 索引，支持按角色档案快速过滤
      'CREATE INDEX IF NOT EXISTS idx_media_files_account_uid ON media_files(account_uid)',
      // P0-03：album_type 索引，支持按游戏相册类型快速分组
      'CREATE INDEX IF NOT EXISTS idx_media_files_album_type ON media_files(album_type)',
      // P1-01：is_duplicate 索引，支持图库默认隐藏重复项（WHERE is_duplicate = 0）
      'CREATE INDEX IF NOT EXISTS idx_media_files_is_duplicate ON media_files(is_duplicate)',
      // P1-01：original_id 索引，支持按推荐保留项反查同组重复
      'CREATE INDEX IF NOT EXISTS idx_media_files_original_id ON media_files(original_id)',
      // media_source 索引，支持按来源（game/launcher）快速过滤
      'CREATE INDEX IF NOT EXISTS idx_media_files_media_source ON media_files(media_source)',
      // 数据库性能优化（2026-07-18）：新增 5 个联合索引，覆盖高频 WHERE 组合查询
      // 依据 media-repository.ts 中实际 SQL 模式设计，与现有单列索引共存互不冲突
      // 图库默认列表查询：is_deleted=0 AND account_uid=? AND album_type=?
      'CREATE INDEX IF NOT EXISTS idx_media_files_default_view ON media_files(is_deleted, account_uid, album_type)',
      // 角色档案统计：account_uid=? AND is_deleted=0 AND file_type=?
      'CREATE INDEX IF NOT EXISTS idx_media_files_profile_stats ON media_files(account_uid, is_deleted, file_type)',
      // 重复分组查询：is_duplicate=1 AND is_deleted=0 AND original_id IS NOT NULL
      'CREATE INDEX IF NOT EXISTS idx_media_files_duplicate_group ON media_files(is_duplicate, is_deleted, original_id)',
      // 套装聚合统计：is_deleted=0 AND outfit IS NOT NULL AND outfit != ''
      'CREATE INDEX IF NOT EXISTS idx_media_files_outfit_agg ON media_files(is_deleted, outfit)',
      // 场景时段分析：scene_time=? AND file_type=? AND is_deleted=0
      'CREATE INDEX IF NOT EXISTS idx_media_files_scene_analysis ON media_files(scene_time, file_type, is_deleted)'
    ]
    for (const stmt of indexStatements) {
      try {
        this.db.exec(stmt)
      } catch (err) {
        // 索引创建失败不应阻塞启动（可能是某列未成功添加，或索引已存在）
        // 仅记录到 stderr，不抛出
        console.warn(
          `[DB] 索引创建失败（已忽略）: ${stmt}`,
          err instanceof Error ? err.message : err
        )
      }
    }
  }

  /**
   * P0-A2：检查命名迁移是否已应用
   * 用于"仅执行一次"的迁移（如数据回填、全表修复），避免每次启动重复执行
   */
  isMigrationApplied(name: string): boolean {
    if (!this.db) return true // DB 未初始化时视为已应用，避免误执行
    const row = this.db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get(name)
    return !!row
  }

  /**
   * P0-A2：标记命名迁移为已应用
   * 必须在迁移成功完成后调用，确保迁移只执行一次
   */
  markMigrationApplied(name: string): void {
    if (!this.db) return
    this.db
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, datetime('now'))"
      )
      .run(name)
  }

  /**
   * 安全添加列：区分"列已存在"（忽略）和其他错误（记录但继续）
   * 修复：原实现 catch {} 静默吞掉所有错误，包括磁盘满、DB 锁等严重错误
   * 这些错误会导致列未添加，但后续 CREATE INDEX 引用该列时再抛错，难以诊断
   */
  private safeAddColumn(tableName: string, columnDef: string): void {
    if (!this.db) return
    try {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef};`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // "duplicate column name" 是正常情况（列已存在），静默忽略
      if (/duplicate column name/i.test(msg)) {
        return
      }
      // 其他错误（磁盘满、DB 锁、I/O 错误）记录但不抛出，避免阻塞启动
      // 后续 CREATE INDEX 会跳过该列
      console.warn(
        `[DB] 添加列失败（已忽略）: ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`,
        msg
      )
    }
  }

  /**
   * T02：添加 is_missing 和 missing_count 字段
   * is_missing=1 表示文件已被外部移动/删除；missing_count 记录连续缺失次数
   * 连续两次扫描缺失才标记为 missing，一次出现即恢复
   */
  private migrateMissingStatus(): void {
    if (!this.db) return
    this.safeAddColumn('media_files', 'is_missing INTEGER NOT NULL DEFAULT 0')
    this.safeAddColumn('media_files', 'missing_count INTEGER NOT NULL DEFAULT 0')
  }

  /**
   * T05：添加 phash 字段（感知哈希，64 字符 0/1 串）
   * 用于相似图片查找；旧数据 phash 为 NULL，扫描后异步回填
   */
  private migratePhash(): void {
    if (!this.db) return
    this.safeAddColumn('media_files', 'phash TEXT')
  }

  /**
   * P0-02：添加 account_uid 字段（角色档案 UID）
   * 用于多角色档案管理，扫描时根据路径中的 UID 段自动填充
   * 旧数据 account_uid 默认为 'default'，归入默认档案
   */
  private migrateAccountUid(): void {
    if (!this.db) return
    this.safeAddColumn('media_files', "account_uid TEXT NOT NULL DEFAULT 'default'")
  }

  /**
   * P0-03：添加 album_type 字段（游戏相册类型）
   * 扫描时根据父文件夹名映射填充（如 ScreenShot → '游戏截图'）
   * 旧数据 album_type 默认为 '其他'，下一次扫描时按需更新
   */
  private migrateAlbumType(): void {
    if (!this.db) return
    this.safeAddColumn('media_files', "album_type TEXT NOT NULL DEFAULT '其他'")
  }

  /**
   * P1-01：添加 is_duplicate + original_id 字段（智能去重）
   * is_duplicate=1 表示该文件是某重复组的"非推荐保留"项，图库默认隐藏
   * original_id 指向同组中推荐保留的文件 id（NULL 表示独立文件或推荐保留项本身）
   * 由 markDuplicates() 在 pHash 补算后基于评分填充
   */
  private migrateDuplicateFields(): void {
    if (!this.db) return
    this.safeAddColumn('media_files', 'is_duplicate INTEGER NOT NULL DEFAULT 0')
    this.safeAddColumn('media_files', 'original_id INTEGER')
  }

  /**
   * 添加 media_source 字段：区分游戏内拍摄（game）与启动器缓存（launcher）
   * 扫描时根据路径特征填充：路径含 "Launcher\cache" 判为 launcher，其余为 game
   * 主页图库默认仅显示 game，启动器缓存单独区域展示
   */
  private migrateMediaSource(): void {
    if (!this.db) return
    this.safeAddColumn('media_files', "media_source TEXT NOT NULL DEFAULT 'game'")
  }

  /**
   * P0-02：创建角色档案表
   * 存储角色基础信息（UID、昵称、头像），拍摄统计实时从 media_files 聚合查询
   */
  private createCharacterProfilesTable(): void {
    if (!this.db) return
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS character_profiles (
        uid TEXT PRIMARY KEY,
        nickname TEXT NOT NULL DEFAULT '',
        avatar TEXT,
        created_at TEXT NOT NULL,
        last_active_at TEXT
      );
      -- F-G9：为 nickname 添加索引，支持按昵称搜索角色档案（避免全表扫描）
      CREATE INDEX IF NOT EXISTS idx_character_profiles_nickname ON character_profiles(nickname);
    `)
    // 插入默认档案（若不存在）
    this.db
      .prepare(
        "INSERT OR IGNORE INTO character_profiles (uid, nickname, created_at) VALUES ('default', '默认档案', datetime('now'))"
      )
      .run()
  }

  /**
   * F-O1：添加 scene_time 字段（基于图像内容的时段分类）
   */
  private migrateSceneTime(): void {
    if (!this.db) return
    this.safeAddColumn('media_files', "scene_time TEXT DEFAULT 'unknown'")
  }

  /**
   * F-O1：添加 outfit 字段（手动套装标注）
   */
  private migrateOutfit(): void {
    if (!this.db) return
    this.safeAddColumn('media_files', "outfit TEXT DEFAULT ''")
  }

  private migrateSoftDelete(): void {
    if (!this.db) return
    this.safeAddColumn('media_files', 'is_deleted INTEGER NOT NULL DEFAULT 0')
    this.safeAddColumn('media_files', 'deleted_at TEXT')
  }

  private migrateSceneCategory(): void {
    if (!this.db) return

    // 1. 添加字段（safeAddColumn 区分"列已存在"和其他错误）
    this.safeAddColumn('media_files', 'scene_category TEXT')

    // 2. 创建索引（索引创建已统一在 runMigrations 末尾处理，此处不再重复）

    // P0-A2：数据回填改为版本化一次性迁移，避免每次启动都查询 WHERE scene_category IS NULL
    // 旧库首次升级时 schema_migrations 表为空，isMigrationApplied 返回 false，执行一次回填
    // 之后启动直接跳过，节省每次启动的 SELECT 扫描
    if (this.isMigrationApplied('scene_category_backfill_v1')) {
      return
    }

    try {
      // 待确认#1：为尚未写入 scene_category 的旧记录，根据路径自动检测并回填
      // 仅检测 IS NULL 的记录，避免每次启动都对 'other' 记录重复检测
      // 'other' 既是默认值也是 detectSceneCategory 的合法返回值，重复检测无意义且浪费性能
      const rows = this.db
        .prepare('SELECT id, file_path FROM media_files WHERE scene_category IS NULL')
        .all() as Array<{ id: number; file_path: string }>

      if (rows.length > 0) {
        const updateStmt = this.db.prepare('UPDATE media_files SET scene_category = ? WHERE id = ?')
        const updateMany = this.db.transaction(
          (items: Array<{ id: number; file_path: string }>) => {
            for (const row of items) {
              const category = detectSceneCategory(row.file_path)
              updateStmt.run(category, row.id)
            }
          }
        )
        updateMany(rows)
        console.log(`[Database] 已迁移 ${rows.length} 条记录的 scene_category`)
      }

      // 标记迁移已完成，后续启动不再执行回填
      this.markMigrationApplied('scene_category_backfill_v1')
    } catch (error) {
      console.error('[Database] scene_category 迁移失败:', error)
      // 失败时不标记，下次启动重试
    }
  }

  query(sql: string, params?: unknown[]): unknown[] {
    if (!this.db) throw new Error('Database not initialized')
    return this.db.prepare(sql).all(params || [])
  }

  execute(sql: string, params?: unknown[]): Database.RunResult {
    if (!this.db) throw new Error('Database not initialized')
    return this.db.prepare(sql).run(params || [])
  }

  /**
   * 读取设置项。
   * C-O14：原实现 `return JSON.parse(row.value) as T` 直接断言无运行时校验，
   * 数据库中存的 JSON 可能与 T 不匹配（如历史数据格式变化后字段类型/结构变化），
   * 调用方拿到类型不匹配的值会运行时崩溃。
   * 现在添加基础运行时校验：解析失败、类型不符时回退到 defaultValue。
   */
  getSetting<T>(key: string, defaultValue: T): T {
    if (!this.db) return defaultValue
    try {
      const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
        { value: string } | undefined
      if (!row) return defaultValue
      const parsed = JSON.parse(row.value)
      // 运行时类型校验：基于 defaultValue 的类型检查 parsed 是否兼容
      // 不做深度结构校验（避免引入 zod 等依赖），仅做基础类型守卫
      if (!this.isSettingTypeCompatible(parsed, defaultValue)) {
        console.warn(`[Database] 设置项 "${key}" 类型不符，回退到默认值`)
        return defaultValue
      }
      return parsed as T
    } catch {
      return defaultValue
    }
  }

  /**
   * 基础类型兼容性检查：判断 parsed 是否与 defaultValue 的类型一致。
   * 仅做浅层类型守卫，不递归校验对象内部结构。
   * - null/undefined：与任何类型兼容（视为"未设置"）
   * - 基础类型（string/number/boolean）：typeof 必须一致
   * - 数组：parsed 必须是数组
   * - 对象：parsed 必须是非 null 对象且非数组
   */
  private isSettingTypeCompatible(parsed: unknown, defaultValue: unknown): boolean {
    if (parsed === null || parsed === undefined) return true
    const defaultType = typeof defaultValue
    const parsedType = typeof parsed
    // 基础类型：typeof 必须一致
    if (defaultType === 'string' || defaultType === 'number' || defaultType === 'boolean') {
      return parsedType === defaultType
    }
    // 数组
    if (Array.isArray(defaultValue)) {
      return Array.isArray(parsed)
    }
    // 对象（defaultValue 是非 null 对象且非数组）
    if (defaultType === 'object') {
      return parsedType === 'object' && !Array.isArray(parsed)
    }
    // 其他类型（如函数、symbol 等不存在的场景）放行
    return true
  }

  setSetting<T>(key: string, value: T): void {
    if (!this.db) return
    this.db
      .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
      .run(key, JSON.stringify(value))
  }

  getDatabase(): Database.Database | null {
    return this.db
  }

  close(): void {
    if (this.db) {
      // 数据库性能优化（2026-07-18）：退出时再次执行 optimize，确保本次会话的统计信息落盘
      // 必须在 WAL checkpoint 之前执行，避免 optimize 触发的写入被 checkpoint 漏掉
      try {
        this.db.pragma('optimize')
      } catch (err) {
        console.warn('[Database] 退出时 PRAGMA optimize 失败（已忽略）:', err)
      }
      // 退出前执行 WAL checkpoint，将 WAL 日志写回主数据库文件，防止异常退出丢数据
      // 修复 A-F4/C-S6：原实现直接 close()，WAL 文件未 checkpoint，异常退出可能丢数据
      // P1-A8：wal_checkpoint(TRUNCATE) 会阻塞等待所有读者结束，万级日志下可能超 2s
      //        导致 before-quit 强制退出但 WAL 仍未合并。改用 PASSIVE 不阻塞，
      //        尽力 checkpoint 当前可 checkpoint 的页，剩余部分由下次启动时 SQLite 自动恢复
      try {
        this.db.pragma('wal_checkpoint(PASSIVE)')
      } catch (error) {
        console.error('[Database] WAL checkpoint 失败:', error)
      }
      this.db.close()
      this.db = null
    }
  }

  /**
   * P1-A8：获取 WAL 文件大小（字节），用于 before-quit 动态调整超时
   * 返回 0 表示文件不存在或读取失败（如未启用 WAL、文件已被 checkpoint）
   */
  getWalFileSize(): number {
    if (!this.dbPath) return 0
    try {
      // WAL 文件路径 = 数据库路径 + '-wal'
      const walPath = this.dbPath + '-wal'
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs') as typeof import('fs')
      const stat = fs.statSync(walPath)
      return stat.size
    } catch {
      // WAL 文件不存在或不可访问
      return 0
    }
  }
}
