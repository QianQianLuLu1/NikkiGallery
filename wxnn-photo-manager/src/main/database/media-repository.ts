import type Database from 'better-sqlite3'

/**
 * Slice 6：MediaRepository — media.ts SQL 访问层抽离
 *
 * 设计目标：
 *   1. 将 media.ts 中 34 个 IPC handler 内联的 SQL 全部集中到此 Repository
 *   2. Repository 仅负责 SQL 访问（prepare/run/all/get/transaction），不含 IPC、不含副作用
 *      （dialog/shell.trashItem/fs.access/notifyMediaUpdated 均留在 handler）
 *   3. Repository 是测试接缝（seam）：可对内存数据库（new Database(':memory:')）实例化
 *      并验证 SQL 行为，无需 mock Electron API
 *   4. 行为等价：所有 SQL 字符串、placeholder 顺序、事务边界、缓存读写均与原 media.ts 一致
 *
 * 分区：
 *   - Media files：media_files 表的 21 个 media:* handler 的 SQL
 *   - Categories：categories 表的 5 个 category:* handler 的 SQL
 *   - Profiles：character_profiles + media_files.account_uid 的 7 个 profile:* handler 的 SQL
 *   - Duplicates：duplicate:listGroups 的 SQL（查询 media_files 的 is_duplicate/original_id）
 *
 * 缓存策略：
 *   - media_count 缓存读取由 Repository.listMedia 内部处理（直接 SQL 访问 app_settings）
 *   - 缓存写入由 Application.notifyMediaUpdated() 负责（保持原状，跨文件改动最小化）
 *   - 默认视图（仅 is_deleted=0）命中缓存；非默认视图实时 COUNT
 */

// ============================================================================
// Row Types — 与 media_files / categories / character_profiles 表结构对应
// 数值型布尔字段（is_favorite/is_deleted/is_missing/is_duplicate/is_system）保持
// raw DB 值（0/1），由 IPC handler 在响应塑形时转为 boolean
// ============================================================================

/** media_files 完整行（listMedia 返回，tags 已解析为 string[]） */
export interface MediaRow {
  id: number
  file_path: string
  file_name: string
  file_type: 'image' | 'video'
  file_ext: string
  file_size: number
  width: number | null
  height: number | null
  duration: number | null
  created_at: string
  modified_at: string
  thumbnail: string | null
  tags: string[]
  category_id: number | null
  rating: number
  is_favorite: number
  notes: string
  scene_category: string | null
  scene_time: string
  outfit: string
  account_uid: string
  album_type: string
  is_deleted: number
  deleted_at: string | null
  is_missing: number
  is_duplicate: number
  original_id: number | null
  media_source: string
}

/** 用于 findDuplicates 的候选行（含宽高、收藏、评分用于评分函数） */
export interface DuplicateCandidateRow {
  id: number
  file_path: string
  file_name: string
  file_type: string
  file_size: number
  modified_at: string
  width: number | null
  height: number | null
  is_favorite: number
  rating: number
}

/** 用于 findSimilar 的 pHash 行 */
export interface PhashRow {
  id: number
  file_path: string
  file_name: string
  file_type: string
  file_size: number
  modified_at: string
  width: number | null
  height: number | null
  is_favorite: number
  rating: number
  phash: string
}

/** 套装图鉴聚合统计行 */
export interface OutfitAggRow {
  outfit: string
  count: number
  latest_created: string
  latest_modified: string
}

/** 套装最新一张媒体（用于封面） */
export interface OutfitLatestRow {
  file_path: string
  thumbnail: string | null
}

/** 重复分组查询行（is_duplicate=1 的文件） */
export interface DuplicateGroupRow {
  id: number
  file_path: string
  file_name: string
  file_type: string
  file_size: number
  modified_at: string
  width: number | null
  height: number | null
  is_favorite: number
  rating: number
  original_id: number
}

/** 重复分组推荐保留项行（无 original_id 字段） */
export interface OriginalRow {
  id: number
  file_path: string
  file_name: string
  file_type: string
  file_size: number
  modified_at: string
  width: number | null
  height: number | null
  is_favorite: number
  rating: number
}

/** 简化的 id+path 行（用于 trashItem / 场景分析等） */
export interface IdPathRow {
  id: number
  file_path: string
}

/** 分类表行 */
export interface CategoryRow {
  id: number
  name: string
  icon: string
  color: string
  sort_order: number
  parent_id: number | null
  is_system: number
}

/** 角色档案行 */
export interface ProfileRow {
  uid: string
  nickname: string
  avatar: string | null
  created_at: string
  last_active_at: string | null
}

/** 角色档案基础统计 */
export interface ProfileBaseStats {
  total_count: number
  image_count: number
  video_count: number
  total_size: number
  earliest_time: string | null
  latest_time: string | null
}

/** Top N 偏好统计行（outfit / scene_category / scene_time 通用） */
export interface ProfileTopStatRow {
  key: string
  cnt: number
}

/** 分组统计行（getGroupCounts 返回） */
export interface GroupCountRow {
  key: string
  count: number
}

// ============================================================================
// Options & Result Types
// ============================================================================

export type MediaSortOrder = 'asc' | 'desc'
export type MediaSourceFilter = 'game' | 'launcher' | 'cloud' | 'all'
export type GroupDimension = 'album_type' | 'scene_category' | 'scene_time' | 'outfit' | 'file_type'

export interface MediaListOptions {
  page?: number
  pageSize?: number
  includeDeleted?: boolean
  deletedOnly?: boolean
  sortBy?: string
  sortOrder?: string
  accountUid?: string
  albumType?: string
  hideDuplicates?: boolean
  mediaSource?: MediaSourceFilter
}

export interface MediaListResult {
  rows: MediaRow[]
  /** 仅在 usePagination=true 时返回 */
  total?: number
  page?: number
  pageSize?: number
  hasMore?: boolean
}

// ============================================================================
// MediaRepository
// ============================================================================

export class MediaRepository {
  constructor(private readonly db: Database.Database) {}

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /** 生成 N 个 ? 占位符，用于 IN (...) 子句 */
  private placeholders(count: number): string {
    return Array.from({ length: count }, () => '?').join(',')
  }

  /**
   * 安全解析 media_files.tags 字段（可能是 JSON 字符串、数组或 null），失败回退空数组
   * 单条损坏的 tags 不应让整个 media:list IPC 抛错
   */
  private parseTagsField(tags: unknown): string[] {
    if (Array.isArray(tags)) return tags
    if (typeof tags !== 'string' || tags.length === 0) return []
    try {
      const parsed = JSON.parse(tags)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  /**
   * media:list 的 WHERE 子句构建
   * 返回 { whereClause, whereParams, isDefaultView }
   * isDefaultView：仅含 is_deleted=0（无其他过滤参数），用于 media_count 缓存命中判断
   */
  private buildListWhereClause(options: MediaListOptions): {
    whereClause: string
    whereParams: unknown[]
    isDefaultView: boolean
  } {
    const includeDeleted = options.includeDeleted === true
    const deletedOnly = options.deletedOnly === true
    const accountUid = options.accountUid
    const albumType = options.albumType
    // hideDuplicates 在回收站视图（deletedOnly）下不应用，避免软删除的重复项消失
    const hideDuplicates = options.hideDuplicates === true && !deletedOnly
    const mediaSource = options.mediaSource

    const conditions: string[] = []
    if (deletedOnly) {
      conditions.push('is_deleted = 1')
    } else if (!includeDeleted) {
      conditions.push('is_deleted = 0')
    }
    if (accountUid && accountUid !== 'all') {
      conditions.push('account_uid = ?')
    }
    if (albumType && albumType !== 'all') {
      conditions.push('album_type = ?')
    }
    if (hideDuplicates) {
      conditions.push('is_duplicate = 0')
    }
    if (mediaSource && mediaSource !== 'all') {
      conditions.push('media_source = ?')
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
    const whereParams: unknown[] = []
    if (accountUid && accountUid !== 'all') whereParams.push(accountUid)
    if (albumType && albumType !== 'all') whereParams.push(albumType)
    if (mediaSource && mediaSource !== 'all') whereParams.push(mediaSource)

    // 默认视图：conditions 仅含 'is_deleted = 0'（无其他过滤参数）
    const isDefaultView = conditions.length === 1 && conditions[0] === 'is_deleted = 0'

    return { whereClause, whereParams, isDefaultView }
  }

  // ==========================================================================
  // Media files: Single-row mutations
  // ==========================================================================

  /** media:updateRating */
  updateRating(mediaId: number, rating: number): void {
    this.db.prepare('UPDATE media_files SET rating = ? WHERE id = ?').run(rating, mediaId)
  }

  /** media:updateFavorite */
  updateFavorite(mediaId: number, isFavorite: boolean): void {
    this.db.prepare('UPDATE media_files SET is_favorite = ? WHERE id = ?').run(isFavorite ? 1 : 0, mediaId)
  }

  /** media:updateTags */
  updateTags(mediaId: number, tags: string[]): void {
    this.db.prepare('UPDATE media_files SET tags = ? WHERE id = ?').run(JSON.stringify(tags), mediaId)
  }

  /** media:updateNotes */
  updateNotes(mediaId: number, notes: string): void {
    this.db.prepare('UPDATE media_files SET notes = ? WHERE id = ?').run(notes, mediaId)
  }

  /** media:updateCategory */
  updateCategory(mediaId: number, categoryId: number | null): void {
    this.db.prepare('UPDATE media_files SET category_id = ? WHERE id = ?').run(categoryId, mediaId)
  }

  /** media:updateOutfit */
  updateOutfit(mediaId: number, outfit: string): void {
    this.db.prepare('UPDATE media_files SET outfit = ? WHERE id = ?').run(outfit, mediaId)
  }

  /** media:analyzeSceneTime — 单条 scene_time 更新 */
  updateSceneTime(mediaId: number, sceneTime: string): void {
    this.db.prepare('UPDATE media_files SET scene_time = ? WHERE id = ?').run(sceneTime, mediaId)
  }

  // ==========================================================================
  // Media files: Batch mutations (delete / restore / softDelete)
  // ==========================================================================

  /** media:delete — 物理删除单条数据库记录 */
  hardDelete(mediaId: number): void {
    this.db.prepare('DELETE FROM media_files WHERE id = ?').run(mediaId)
  }

  /** media:softDelete — 批量软删除（标记 is_deleted=1 + deleted_at） */
  softDeleteBatch(mediaIds: number[]): void {
    if (mediaIds.length === 0) return
    const placeholders = this.placeholders(mediaIds.length)
    this.db.prepare(
      `UPDATE media_files SET is_deleted = 1, deleted_at = datetime('now') WHERE id IN (${placeholders}) AND is_deleted = 0`
    ).run(...mediaIds)
  }

  /** media:restore — 批量恢复（清除软删除标记） */
  restoreBatch(mediaIds: number[]): void {
    if (mediaIds.length === 0) return
    const placeholders = this.placeholders(mediaIds.length)
    this.db.prepare(
      `UPDATE media_files SET is_deleted = 0, deleted_at = NULL WHERE id IN (${placeholders}) AND is_deleted = 1`
    ).run(...mediaIds)
  }

  /**
   * media:permanentDelete 阶段1 — 幂等软删除标记
   * 回收站记录已 is_deleted=1，直接彻底删除场景也标记一次
   * 逐条 UPDATE（与原实现一致），事务包裹
   */
  softDeleteForPermanentDelete(mediaIds: number[]): void {
    if (mediaIds.length === 0) return
    const stmt = this.db.prepare(
      'UPDATE media_files SET is_deleted = 1, deleted_at = datetime("now") WHERE id = ?'
    )
    const tx = this.db.transaction(() => {
      for (const id of mediaIds) stmt.run(id)
    })
    tx()
  }

  /**
   * media:permanentDelete 阶段3 / media:emptyRecycleBin — 物理删除数据库记录
   * 事务包裹，与原实现一致
   */
  hardDeleteBatch(mediaIds: number[]): void {
    if (mediaIds.length === 0) return
    const placeholders = this.placeholders(mediaIds.length)
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM media_files WHERE id IN (${placeholders})`).run(...mediaIds)
    })
    tx()
  }

  /** media:cleanupMissing — 清理所有 is_missing=1 的记录，返回删除条数 */
  cleanupMissingRecords(): number {
    const result = this.db.prepare('DELETE FROM media_files WHERE is_missing = 1').run()
    return result.changes
  }

  /** media:removeMissing — 删除单条 missing 记录，返回是否删除成功 */
  removeMissingRecord(mediaId: number): boolean {
    const result = this.db.prepare('DELETE FROM media_files WHERE id = ? AND is_missing = 1').run(mediaId)
    return result.changes > 0
  }

  // ==========================================================================
  // Media files: Queries
  // ==========================================================================

  /**
   * media:list — 分页查询媒体列表
   * 包含 media_count 缓存读取逻辑（默认视图命中缓存，非默认视图实时 COUNT）
   */
  listMedia(options: MediaListOptions): MediaListResult {
    const page = options.page
    const pageSize = options.pageSize
    const usePagination = typeof page === 'number' && typeof pageSize === 'number' && pageSize > 0

    const { whereClause, whereParams, isDefaultView } = this.buildListWhereClause(options)

    const selectColumns =
      'id, file_path, file_name, file_type, file_ext, file_size, width, height, duration, created_at, modified_at, thumbnail, tags, category_id, rating, is_favorite, notes, scene_category, scene_time, outfit, account_uid, album_type, is_deleted, deleted_at, is_missing, is_duplicate, original_id, media_source'

    // 排序白名单防止 SQL 注入
    const VALID_SORT_COLUMNS: Record<string, string> = {
      created_at: 'created_at',
      modified_at: 'modified_at',
      file_name: 'file_name',
      file_size: 'file_size',
      rating: 'rating'
    }
    const deletedOnly = options.deletedOnly === true
    const sortColumn = options.sortBy && VALID_SORT_COLUMNS[options.sortBy]
      ? VALID_SORT_COLUMNS[options.sortBy]
      : (deletedOnly ? 'deleted_at' : 'created_at')
    const sortDirection = options.sortOrder === 'asc' ? 'ASC' : 'DESC'
    const orderBy = `ORDER BY ${sortColumn} ${sortDirection}`

    let rawRows: Array<Omit<MediaRow, 'tags'> & { tags: unknown }>
    if (usePagination) {
      const offset = page! * pageSize!
      rawRows = this.db.prepare(
        `SELECT ${selectColumns} FROM media_files ${whereClause} ${orderBy} LIMIT ? OFFSET ?`
      ).all(...whereParams, pageSize, offset) as Array<Omit<MediaRow, 'tags'> & { tags: unknown }>
    } else {
      rawRows = this.db.prepare(
        `SELECT ${selectColumns} FROM media_files ${whereClause} ${orderBy}`
      ).all(...whereParams) as Array<Omit<MediaRow, 'tags'> & { tags: unknown }>
    }

    // 解析 tags JSON 字段
    const rows: MediaRow[] = rawRows.map((r) => ({
      ...r,
      tags: this.parseTagsField(r.tags)
    }))

    const result: MediaListResult = { rows }

    if (usePagination) {
      let total: number
      if (isDefaultView) {
        // 默认视图：尝试 media_count 缓存
        const cached = this.getMediaCountCache()
        if (cached !== null) {
          total = cached
        } else {
          total = this.countMedia(whereClause, whereParams)
          this.setMediaCountCache(total)
        }
      } else {
        total = this.countMedia(whereClause, whereParams)
      }
      result.total = total
      result.page = page
      result.pageSize = pageSize
      // hasMore 必须同时满足"还有下一页"和"本页已满"
      // 仅用 total 计算时，若 media_count 缓存已更新但前端列表尚未刷新（100ms 节流窗口），
      // 会出现 hasMore=true 但实际 rows.length<pageSize 的不一致提示
      result.hasMore = rows.length === pageSize && (page! + 1) * pageSize! < total
    }

    return result
  }

  /** COUNT 查询（使用与 listMedia 相同的 WHERE 子句） */
  private countMedia(whereClause: string, whereParams: unknown[]): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) as count FROM media_files ${whereClause}`
    ).get(...whereParams) as { count: number }
    return row.count
  }

  /** 读取 media_count 缓存（app_settings.media_count），未缓存返回 null */
  private getMediaCountCache(): number | null {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get('media_count') as
      | { value: string }
      | undefined
    if (!row) return null
    try {
      const parsed = JSON.parse(row.value)
      // 与原 ctx.dbManager.getSetting('media_count', -1) 行为一致：缓存值 >= 0 视为命中
      if (typeof parsed === 'number' && parsed >= 0) return parsed
      return null
    } catch {
      return null
    }
  }

  /** 写入 media_count 缓存（与 Application.notifyMediaUpdated 共享同一 app_settings 行） */
  setMediaCountCache(count: number): void {
    this.db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
      'media_count',
      JSON.stringify(count)
    )
  }

  /**
   * Slice 7c-fix：刷新 media_count 缓存为当前未软删除记录数
   * 统一收口 media_count 的写入逻辑，消除 Application.notifyMediaUpdated 的直接 SQL 双写路径
   */
  refreshMediaCountCache(): void {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM media_files WHERE is_deleted = 0').get() as
      | { count: number }
      | undefined
    if (row) {
      this.setMediaCountCache(row.count)
    }
  }

  /** media:analyzeSceneTime — 查询待分析的图片记录 */
  getMediaForSceneAnalysis(mediaIds?: number[]): IdPathRow[] {
    if (mediaIds && mediaIds.length > 0) {
      const placeholders = this.placeholders(mediaIds.length)
      return this.db.prepare(
        `SELECT id, file_path FROM media_files WHERE id IN (${placeholders}) AND file_type = ?`
      ).all(...mediaIds, 'image') as IdPathRow[]
    }
    return this.db.prepare(
      "SELECT id, file_path FROM media_files WHERE scene_time = 'unknown' AND file_type = 'image' AND is_deleted = 0"
    ).all() as IdPathRow[]
  }

  /** media:permanentDelete / media:emptyRecycleBin — 查询文件路径 */
  getMediaPathsByIds(mediaIds: number[]): IdPathRow[] {
    if (mediaIds.length === 0) return []
    const placeholders = this.placeholders(mediaIds.length)
    return this.db.prepare(
      `SELECT id, file_path FROM media_files WHERE id IN (${placeholders})`
    ).all(...mediaIds) as IdPathRow[]
  }

  /** media:emptyRecycleBin — 查询所有软删除记录 */
  getSoftDeletedMediaPaths(): IdPathRow[] {
    return this.db.prepare(
      'SELECT id, file_path FROM media_files WHERE is_deleted = 1'
    ).all() as IdPathRow[]
  }

  /** media:getOutfitStats — 聚合查询每个套装的张数 / 最新拍摄时间 */
  getOutfitAggStats(): OutfitAggRow[] {
    return this.db.prepare(
      `SELECT outfit, COUNT(*) as count, MAX(created_at) as latest_created, MAX(modified_at) as latest_modified
       FROM media_files
       WHERE is_deleted = 0 AND outfit IS NOT NULL AND outfit != ''
       GROUP BY outfit
       ORDER BY count DESC, latest_created DESC`
    ).all() as OutfitAggRow[]
  }

  /** media:getOutfitStats — 取每个套装最新一张作为封面 */
  getLatestOutfitMedia(outfit: string): OutfitLatestRow | undefined {
    return this.db.prepare(
      'SELECT file_path, thumbnail FROM media_files WHERE outfit = ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1'
    ).get(outfit) as OutfitLatestRow | undefined
  }

  /** media:findDuplicates — 查询所有未软删除文件的元数据（用于 size+hash 分组） */
  getDuplicateCandidates(): DuplicateCandidateRow[] {
    return this.db.prepare(
      `SELECT id, file_path, file_name, file_type, file_size, modified_at, width, height, is_favorite, rating
       FROM media_files WHERE is_deleted = 0`
    ).all() as DuplicateCandidateRow[]
  }

  /** media:findSimilar — 查询所有已计算 pHash 的未软删除图片 */
  getPhashRows(): PhashRow[] {
    return this.db.prepare(
      `SELECT id, file_path, file_name, file_type, file_size, modified_at, width, height, is_favorite, rating, phash
       FROM media_files
       WHERE is_deleted = 0 AND phash IS NOT NULL AND phash != ''`
    ).all() as PhashRow[]
  }

  /** media:getGroupCounts — 按维度统计分组数量 */
  getGroupCounts(
    dimension: GroupDimension,
    accountUid: string | undefined,
    mediaSource: MediaSourceFilter | undefined
  ): GroupCountRow[] {
    const conditions: string[] = ['is_deleted = 0']
    const params: unknown[] = []
    if (accountUid && accountUid !== 'all') {
      conditions.push('account_uid = ?')
      params.push(accountUid)
    }
    if (mediaSource && mediaSource !== 'all') {
      conditions.push('media_source = ?')
      params.push(mediaSource)
    }
    // outfit 维度需过滤空值（无套装标注的文件不计入分组）
    if (dimension === 'outfit') {
      conditions.push("outfit IS NOT NULL AND outfit != ''")
    }
    const whereFilter = conditions.join(' AND ')

    const rows = this.db.prepare(
      `SELECT ${dimension} as key, COUNT(*) as cnt FROM media_files WHERE ${whereFilter} GROUP BY ${dimension} ORDER BY cnt DESC`
    ).all(...params) as Array<{ key: string; cnt: number }>

    return rows.map((r) => ({ key: r.key, count: r.cnt }))
  }

  // ==========================================================================
  // Duplicates (is_duplicate / original_id 查询)
  // ==========================================================================

  /** duplicate:listGroups — 查询所有 is_duplicate=1 的文件 */
  getDuplicateGroupRows(): DuplicateGroupRow[] {
    return this.db.prepare(
      `SELECT id, file_path, file_name, file_type, file_size, modified_at, width, height, is_favorite, rating, original_id
       FROM media_files
       WHERE is_duplicate = 1 AND is_deleted = 0 AND original_id IS NOT NULL
       ORDER BY original_id, modified_at DESC`
    ).all() as DuplicateGroupRow[]
  }

  /** duplicate:listGroups — 查询每组 original_id 对应的推荐保留文件 */
  getOriginalsByIds(originalIds: number[]): OriginalRow[] {
    if (originalIds.length === 0) return []
    const placeholders = this.placeholders(originalIds.length)
    return this.db.prepare(
      `SELECT id, file_path, file_name, file_type, file_size, modified_at, width, height, is_favorite, rating
       FROM media_files WHERE id IN (${placeholders})`
    ).all(...originalIds) as OriginalRow[]
  }

  // ==========================================================================
  // Categories
  // ==========================================================================

  /** category:create — 返回新分类 id */
  createCategory(name: string, icon: string, color: string, parentId: number | null): number {
    const maxOrderRow = this.db.prepare('SELECT MAX(sort_order) as maxOrder FROM categories').get() as
      | { maxOrder: number | null }
      | undefined
    const maxOrder = maxOrderRow?.maxOrder || 0
    const result = this.db.prepare(
      'INSERT INTO categories (name, icon, color, sort_order, parent_id, is_system, created_at) VALUES (?, ?, ?, ?, ?, 0, datetime("now"))'
    ).run(name, icon, color, maxOrder + 1, parentId)
    return Number(result.lastInsertRowid)
  }

  /** category:update — 动态字段更新（fields 与 values 由 handler 构建白名单后传入） */
  updateCategoryFields(id: number, fields: string[], values: unknown[]): void {
    if (fields.length === 0) return
    const setClause = fields.join(', ')
    this.db.prepare(`UPDATE categories SET ${setClause} WHERE id = ?`).run(...values, id)
  }

  /** category:delete — 级联清理 media_files.category_id + 删除分类（事务） */
  deleteCategoryCascade(id: number): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE media_files SET category_id = NULL WHERE category_id = ?').run(id)
      this.db.prepare('DELETE FROM categories WHERE id = ? AND is_system = 0').run(id)
    })
    tx()
  }

  /** category:reorder — 批量更新 sort_order + parent_id（事务） */
  reorderCategories(orders: Array<{ id: number; sort_order: number; parent_id?: number }>): void {
    const stmt = this.db.prepare('UPDATE categories SET sort_order = ?, parent_id = ? WHERE id = ?')
    const tx = this.db.transaction((items: typeof orders) => {
      for (const order of items) {
        stmt.run(order.sort_order, order.parent_id ?? null, order.id)
      }
    })
    tx(orders)
  }

  /** category:list — 查询全部分类（按 sort_order 排序） */
  listCategories(): CategoryRow[] {
    return this.db.prepare(
      'SELECT id, name, icon, color, sort_order, parent_id, is_system FROM categories ORDER BY sort_order'
    ).all() as CategoryRow[]
  }

  // ==========================================================================
  // Profiles (character_profiles + media_files.account_uid)
  // ==========================================================================

  /** profile:list — 查询全角色档案（按 created_at 升序） */
  listProfiles(): ProfileRow[] {
    return this.db.prepare(
      'SELECT uid, nickname, avatar, created_at, last_active_at FROM character_profiles ORDER BY created_at ASC'
    ).all() as ProfileRow[]
  }

  /** profile:add — 新增角色档案 */
  addProfile(uid: string, nickname: string, avatar: string | null): void {
    this.db.prepare(
      "INSERT INTO character_profiles (uid, nickname, avatar, created_at) VALUES (?, ?, ?, datetime('now'))"
    ).run(uid, nickname, avatar)
  }

  /** profile:update — 动态字段更新（sets 与 params 由 handler 构建白名单后传入） */
  updateProfileFields(uid: string, sets: string[], params: unknown[]): void {
    if (sets.length === 0) return
    const setClause = sets.join(', ')
    this.db.prepare(`UPDATE character_profiles SET ${setClause} WHERE uid = ?`).run(...params, uid)
  }

  /** profile:delete — 删除档案前将该档案下的文件迁移到默认档案（事务） */
  deleteProfileAndReassign(uid: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare("UPDATE media_files SET account_uid = 'default' WHERE account_uid = ?").run(uid)
      this.db.prepare('DELETE FROM character_profiles WHERE uid = ?').run(uid)
    })
    tx()
  }

  /** profile:setCurrent — 更新 last_active_at */
  touchProfileActive(uid: string): void {
    this.db.prepare("UPDATE character_profiles SET last_active_at = datetime('now') WHERE uid = ?").run(uid)
  }

  /** profile:transferFiles — 校验目标档案存在 */
  getProfileByUid(uid: string): { uid: string } | undefined {
    return this.db.prepare('SELECT uid FROM character_profiles WHERE uid = ?').get(uid) as
      | { uid: string }
      | undefined
  }

  /** profile:transferFiles — 批量更新 media_files.account_uid（事务） */
  transferFilesToProfile(mediaIds: number[], targetUid: string): void {
    if (mediaIds.length === 0) return
    const placeholders = this.placeholders(mediaIds.length)
    const tx = this.db.transaction(() => {
      this.db.prepare(
        `UPDATE media_files SET account_uid = ? WHERE id IN (${placeholders})`
      ).run(targetUid, ...mediaIds)
    })
    tx()
  }

  /** profile:getStats — 基础统计（总数 / 图片数 / 视频数 / 总大小 / 最早最晚时间） */
  getProfileBaseStats(uid: string): ProfileBaseStats {
    const row = this.db.prepare(
      `SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN file_type = 'image' THEN 1 ELSE 0 END) as image_count,
        SUM(CASE WHEN file_type = 'video' THEN 1 ELSE 0 END) as video_count,
        COALESCE(SUM(file_size), 0) as total_size,
        MIN(created_at) as earliest_time,
        MAX(created_at) as latest_time
      FROM media_files
      WHERE account_uid = ? AND is_deleted = 0`
    ).get(uid) as ProfileBaseStats
    return row
  }

  /** profile:getStats — Top 5 套装偏好 */
  getProfileTopOutfits(uid: string, limit = 5): ProfileTopStatRow[] {
    return this.db.prepare(
      `SELECT outfit as key, COUNT(*) as cnt
      FROM media_files
      WHERE account_uid = ? AND is_deleted = 0 AND outfit IS NOT NULL AND outfit != ''
      GROUP BY outfit
      ORDER BY cnt DESC
      LIMIT ?`
    ).all(uid, limit) as ProfileTopStatRow[]
  }

  /** profile:getStats — Top 5 场景偏好 */
  getProfileTopScenes(uid: string, limit = 5): ProfileTopStatRow[] {
    return this.db.prepare(
      `SELECT scene_category as key, COUNT(*) as cnt
      FROM media_files
      WHERE account_uid = ? AND is_deleted = 0 AND scene_category IS NOT NULL
      GROUP BY scene_category
      ORDER BY cnt DESC
      LIMIT ?`
    ).all(uid, limit) as ProfileTopStatRow[]
  }

  /** profile:getStats — 时段偏好分布（日间/黄昏/夜间占比） */
  getProfileTimeDistribution(uid: string): ProfileTopStatRow[] {
    return this.db.prepare(
      `SELECT scene_time as key, COUNT(*) as cnt
      FROM media_files
      WHERE account_uid = ? AND is_deleted = 0
      GROUP BY scene_time`
    ).all(uid) as ProfileTopStatRow[]
  }

  // ==========================================================================
  // Transaction accessor（供 handler 在多阶段事务场景使用）
  // ==========================================================================

  /** 暴露 db.transaction，供 handler 编排跨阶段事务（如 permanentDelete 的三阶段） */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }
}
