import { ipcMain, dialog, shell } from 'electron'
import fs from 'fs'
import { z } from 'zod'
import type { HandlerContext } from '../handler-context'
import { wrapHandler, wrapHandlerNoArgs, schemas, assertFileReadPath } from '../validator'
import { AppError } from '../../../shared/errors/app-error'
// C-3：统一文件工具函数
import { calculateFileHash } from '../../utils/file-utils'
// T03：套装图鉴统计类型
import type { OutfitStat } from '../../utils/scene-category'
// T05：感知哈希计算与相似度查询
import { hammingDistance } from '../../utils/phash'
// P1-01：智能去重评分模块
import { pickBestId } from '../../utils/duplicate-scoring'
// 并发控制
import { runWithConcurrency } from '../../utils/concurrency'
// P1-A1：4 组函数抽取到共享服务模块，启动路径与 IPC 路径共用同一份实现
import { generatePhashForUnprocessed, markDuplicates } from '../../services/thumbnail-phash-service'
// Slice 6：SQL 访问层抽离到 MediaRepository
import { MediaRepository } from '../../database/media-repository'
// Slice 6：GroupDimension / MediaSourceFilter 类型收窄白名单
import type {
  GroupDimension,
  MediaSourceFilter,
  MediaListOptions
} from '../../database/media-repository'

/**
 * 媒体域 IPC handler
 *
 * 所有 SQL 访问通过 MediaRepository，handler 仅做：
 * - zod 参数校验（由 wrapHandler 完成）
 * - 副作用编排（dialog 确认 / shell.trashItem / fs.access / notifyMediaUpdated）
 * - 纯领域逻辑（findDuplicates 的 size+hash 分组、findSimilar 的 Union-Find 聚类）
 */
export function registerMediaHandlers(ctx: HandlerContext): void {
  // 每次调用动态获取 Repository（db 可能在初始化/重连时变化）
  // 数据库写操作进程拆分：传入 workerBridge 与 dbPath，写方法走独立 utilityProcess
  const getRepo = (): MediaRepository => {
    const db = ctx.dbManager.getDatabase()
    if (!db) throw AppError.preconditionFailed('数据库未初始化')
    return new MediaRepository(db, ctx.dbManager.getWorkerBridge(), ctx.dbManager.getDbPath())
  }

  ipcMain.handle(
    'media:updateRating',
    wrapHandler(
      ctx,
      z.tuple([schemas.mediaId, schemas.rating]),
      async ([mediaId, rating]) => {
        await getRepo().updateRating(mediaId, rating)
        ctx.notifyMediaUpdated()
        return { updated: true }
      }
    )
  )

  ipcMain.handle(
    'media:updateFavorite',
    wrapHandler(
      ctx,
      z.tuple([schemas.mediaId, z.boolean()]),
      async ([mediaId, isFavorite]) => {
        await getRepo().updateFavorite(mediaId, isFavorite)
        ctx.notifyMediaUpdated()
        return { updated: true }
      }
    )
  )

  ipcMain.handle(
    'media:updateTags',
    wrapHandler(
      ctx,
      z.tuple([schemas.mediaId, z.array(schemas.shortString(MAX_TAG_NAME_LENGTH_INTERNAL)).max(100, '标签数量超过上限 100')]),
      async ([mediaId, tags]) => {
        await getRepo().updateTags(mediaId, tags)
        ctx.notifyMediaUpdated()
        return { updated: true }
      }
    )
  )

  ipcMain.handle(
    'media:updateNotes',
    wrapHandler(
      ctx,
      z.tuple([schemas.mediaId, z.string().max(10000, 'notes 长度必须在 0-10000 之间')]),
      async ([mediaId, notes]) => {
        await getRepo().updateNotes(mediaId, notes)
        ctx.notifyMediaUpdated()
        return { updated: true }
      }
    )
  )

  ipcMain.handle(
    'media:updateCategory',
    wrapHandler(
      ctx,
      z.tuple([schemas.mediaId, schemas.positiveIntId.nullable()]),
      async ([mediaId, categoryId]) => {
        await getRepo().updateCategory(mediaId, categoryId)
        ctx.notifyMediaUpdated()
        return { updated: true }
      }
    )
  )

  // F-O1：更新套装标注
  ipcMain.handle(
    'media:updateOutfit',
    wrapHandler(
      ctx,
      z.tuple([schemas.mediaId, z.string().max(100, 'outfit 长度必须在 0-100 之间')]),
      async ([mediaId, outfit]) => {
        await getRepo().updateOutfit(mediaId, outfit)
        ctx.notifyMediaUpdated()
        return { updated: true }
      }
    )
  )

  // F-O1：批量分析图像场景时段（基于亮度直方图）
  ipcMain.handle(
    'media:analyzeSceneTime',
    wrapHandler(
      ctx,
      z.tuple([schemas.mediaIdArray.optional()]),
      async ([mediaIds]) => {
        const repo = getRepo()
        // 查询待分析的图片记录：未指定 ID 时分析全部 scene_time='unknown' 的图片
        const rows = repo.getMediaForSceneAnalysis(mediaIds)

        if (rows.length === 0) {
          return { message: '没有需要分析的图片', analyzed: 0 }
        }

        const { analyzeSceneBrightness } = await import('../../utils/scene-brightness')

        let analyzed = 0
        const tasks = rows.map((row) => async () => {
          const sceneTime = await analyzeSceneBrightness(row.file_path)
          await repo.updateSceneTime(row.id, sceneTime)
          analyzed++
        })
        await runWithConcurrency(tasks, 4)

        ctx.notifyMediaUpdated()
        return { message: `已分析 ${analyzed} 张图片的场景时段`, analyzed }
      }
    )
  )

  ipcMain.handle(
    'media:delete',
    wrapHandler(ctx, z.tuple([schemas.mediaId]), async ([mediaId]) => {
      await getRepo().hardDelete(mediaId)
      ctx.notifyMediaUpdated()
      return { deleted: true }
    })
  )

  // F-S6 回收站：软删除
  ipcMain.handle(
    'media:softDelete',
    wrapHandler(ctx, z.tuple([schemas.mediaIdArray]), async ([mediaIds]) => {
      await getRepo().softDeleteBatch(mediaIds)
      ctx.notifyMediaUpdated()
      return { message: `已将 ${mediaIds.length} 项移至回收站` }
    })
  )

  // F-S6 回收站：恢复
  ipcMain.handle(
    'media:restore',
    wrapHandler(ctx, z.tuple([schemas.mediaIdArray]), async ([mediaIds]) => {
      await getRepo().restoreBatch(mediaIds)
      ctx.notifyMediaUpdated()
      return { message: `已恢复 ${mediaIds.length} 项` }
    })
  )

  // F-S6 回收站：彻底删除（高危操作二次确认 + 三阶段事务）
  ipcMain.handle(
    'media:permanentDelete',
    wrapHandler(ctx, z.tuple([schemas.mediaIdArray]), async ([mediaIds]) => {
      // A-S3：高危操作二次确认（彻底删除不可恢复）
      const confirmResult = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['取消', '确认删除'],
        defaultId: 0,
        cancelId: 0,
        title: '确认彻底删除',
        message: `即将彻底删除 ${mediaIds.length} 项媒体，此操作不可恢复。`,
        detail: '文件将被移至系统回收站，记录将从数据库永久清除。是否继续？'
      })
      if (confirmResult.response !== 1) {
        throw AppError.canceled('用户取消操作')
      }

      const repo = getRepo()
      // 查询文件路径
      const rows = repo.getMediaPathsByIds(mediaIds)

      // F-S1 三阶段：①事务软删除标记 ②异步 trashItem ③事务物理删除已处理记录
      // 保证 DB 与文件系统一致：中断后 DB 仍有 is_deleted=1 记录，用户可重试

      // 阶段1：幂等软删除标记
      await repo.softDeleteForPermanentDelete(rows.map((r) => r.id))

      // 阶段2：逐个移至系统回收站，区分「成功」「文件已不存在」「失败」
      const idsToDelete: number[] = []
      const failedPaths: string[] = []
      for (const row of rows) {
        try {
          await shell.trashItem(row.file_path)
          idsToDelete.push(row.id)
        } catch (err) {
          // 区分文件不存在 vs 权限失败
          let exists = true
          try {
            await fs.promises.access(row.file_path, fs.constants.F_OK)
          } catch {
            exists = false
          }
          if (!exists) {
            idsToDelete.push(row.id)
          } else {
            failedPaths.push(row.file_path)
            console.warn(`[RecycleBin] 移至系统回收站失败: ${row.file_path}`, err)
          }
        }
      }

      // 阶段3：事务中物理删除已成功处理的记录
      await repo.hardDeleteBatch(idsToDelete)

      ctx.notifyMediaUpdated()
      const msg =
        failedPaths.length > 0
          ? `已彻底删除 ${idsToDelete.length} 项（${failedPaths.length} 项移至回收站失败，已保留记录供手动处理）`
          : `已彻底删除 ${idsToDelete.length} 项`
      return { message: msg, deletedCount: idsToDelete.length, failedCount: failedPaths.length }
    })
  )

  // F-S6 回收站：清空回收站
  ipcMain.handle(
    'media:emptyRecycleBin',
    wrapHandlerNoArgs(ctx, async () => {
      const repo = getRepo()
      const rows = repo.getSoftDeletedMediaPaths()

      if (rows.length === 0) {
        return { message: '回收站为空，无需清理', movedCount: 0 }
      }

      // A-S3：高危操作二次确认（清空回收站不可恢复）
      const confirmResult = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['取消', '确认清空'],
        defaultId: 0,
        cancelId: 0,
        title: '确认清空回收站',
        message: `回收站中有 ${rows.length} 项媒体，清空后不可恢复。`,
        detail: '文件将被移至系统回收站，记录将从数据库永久清除。是否继续？'
      })
      if (confirmResult.response !== 1) {
        throw AppError.canceled('用户取消操作')
      }

      let movedCount = 0
      const idsToDelete: number[] = []
      for (const row of rows) {
        try {
          await shell.trashItem(row.file_path)
          movedCount++
        } catch (err) {
          console.warn(`[RecycleBin] 移至系统回收站失败: ${row.file_path}`, err)
        }
        idsToDelete.push(row.id)
      }
      await repo.hardDeleteBatch(idsToDelete)
      ctx.notifyMediaUpdated()
      return { message: `已清空回收站（共 ${movedCount} 项）`, movedCount }
    })
  )

  // T02：清理丢失记录
  ipcMain.handle(
    'media:cleanupMissing',
    wrapHandlerNoArgs(ctx, async () => {
      const cleared = await getRepo().cleanupMissingRecords()
      ctx.notifyMediaUpdated()
      return { message: `已清理 ${cleared} 条丢失记录`, cleared }
    })
  )

  // T02：从库中移除单条 missing 记录
  ipcMain.handle(
    'media:removeMissing',
    wrapHandler(ctx, z.tuple([schemas.mediaId]), async ([mediaId]) => {
      const deleted = await getRepo().removeMissingRecord(mediaId)
      if (!deleted) {
        throw AppError.notFound('记录不存在或文件未标记为丢失')
      }
      ctx.notifyMediaUpdated()
      return { message: '已从库中移除丢失记录' }
    })
  )

  // T03：套装图鉴统计
  ipcMain.handle(
    'media:getOutfitStats',
    wrapHandlerNoArgs(ctx, async () => {
      const repo = getRepo()
      const rows = repo.getOutfitAggStats()

      // 取每个套装最新一张的缩略图路径作为封面
      const stats: OutfitStat[] = []
      for (const row of rows) {
        const latest = repo.getLatestOutfitMedia(row.outfit)
        stats.push({
          outfit: row.outfit,
          count: row.count,
          latestCreatedAt: row.latest_created,
          coverFilePath: latest?.file_path || '',
          coverThumbnail: latest?.thumbnail || null
        })
      }
      return { stats }
    })
  )

  // F-S10：重复文件检测——基于完整 sha256 内容 hash 分组
  ipcMain.handle(
    'media:findDuplicates',
    wrapHandlerNoArgs(ctx, async () => {
      const rows = getRepo().getDuplicateCandidates()

      // 第一轮：按 file_size 分组
      const sizeGroups = new Map<number, typeof rows>()
      for (const row of rows) {
        if (row.file_size <= 0) continue
        const group = sizeGroups.get(row.file_size)
        if (group) {
          group.push(row)
        } else {
          sizeGroups.set(row.file_size, [row])
        }
      }

      // 第二轮：对 size 重复的组逐个计算完整 sha256
      interface DuplicateItem {
        id: number
        file_path: string
        file_name: string
        file_type: string
        file_size: number
        modified_at: string
        width: number | null
        height: number | null
        is_favorite: boolean
        rating: number
      }
      const hashGroups = new Map<string, DuplicateItem[]>()
      for (const group of sizeGroups.values()) {
        if (group.length < 2) continue
        for (const row of group) {
          try {
            const hash = await calculateFileHash(row.file_path)
            const item: DuplicateItem = {
              id: row.id,
              file_path: row.file_path,
              file_name: row.file_name,
              file_type: row.file_type,
              file_size: row.file_size,
              modified_at: row.modified_at,
              width: row.width,
              height: row.height,
              is_favorite: row.is_favorite === 1,
              rating: row.rating
            }
            const hashGroup = hashGroups.get(hash)
            if (hashGroup) {
              hashGroup.push(item)
            } else {
              hashGroups.set(hash, [item])
            }
          } catch (err) {
            console.warn(`[Duplicates] hash 计算失败，跳过: ${row.file_path}`, err)
          }
        }
      }

      const duplicateGroups = Array.from(hashGroups.values())
        .filter((g) => g.length > 1)
        .map((group) => {
          const sorted = [...group].sort(
            (a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime()
          )
          return sorted
        })
        .sort((a, b) => b[0].file_size * (b.length - 1) - a[0].file_size * (a.length - 1))

      const bestItemIds = duplicateGroups.map((g) => pickBestId(g))

      const totalFiles = duplicateGroups.reduce((sum, g) => sum + g.length, 0)
      const wastedBytes = duplicateGroups.reduce(
        (sum, g) => sum + g[0].file_size * (g.length - 1),
        0
      )
      return {
        duplicates: duplicateGroups,
        bestItemIds,
        totalGroups: duplicateGroups.length,
        totalFiles,
        wastedBytes,
        scannedFiles: rows.length
      }
    })
  )

  // T05：基于 pHash 汉明距离的相似图片查找
  ipcMain.handle(
    'media:findSimilar',
    wrapHandler(
      ctx,
      z.tuple([
        z
          .object({ threshold: z.number().int().min(0).max(64).optional() })
          .optional()
      ]),
      async ([options]) => {
        const rows = getRepo().getPhashRows()

        const threshold = options?.threshold ?? 5

        if (rows.length < 2) {
          return {
            duplicates: [],
            totalGroups: 0,
            totalFiles: 0,
            wastedBytes: 0,
            scannedFiles: rows.length,
            threshold,
            hashedFiles: rows.length
          }
        }

        // 聚类：相似度图连通分量（Union-Find）
        const parent = new Int32Array(rows.length)
        for (let i = 0; i < rows.length; i++) parent[i] = i
        const find = (x: number): number => {
          while (parent[x] !== x) {
            parent[x] = parent[parent[x]]
            x = parent[x]
          }
          return x
        }
        const union = (a: number, b: number): void => {
          const ra = find(a)
          const rb = find(b)
          if (ra !== rb) parent[ra] = rb
        }

        let comparedPairs = 0
        for (let i = 0; i < rows.length; i++) {
          for (let j = i + 1; j < rows.length; j++) {
            const dist = hammingDistance(rows[i].phash, rows[j].phash)
            if (dist >= 0 && dist <= threshold) {
              union(i, j)
              comparedPairs++
            }
          }
        }

        const groupMap = new Map<number, number[]>()
        for (let i = 0; i < rows.length; i++) {
          const root = find(i)
          if (!groupMap.has(root)) groupMap.set(root, [])
          groupMap.get(root)!.push(i)
        }

        const similarGroups: Array<typeof rows> = []
        let totalFiles = 0
        let wastedBytes = 0
        for (const indices of groupMap.values()) {
          if (indices.length < 2) continue
          const groupRows = indices.map((i) => rows[i])
          groupRows.sort(
            (a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime()
          )
          similarGroups.push(groupRows)
          totalFiles += groupRows.length
          const minSize = Math.min(...groupRows.map((r) => r.file_size))
          wastedBytes += minSize * (groupRows.length - 1)
        }

        similarGroups.sort((a, b) => {
          const wa = Math.min(...a.map((r) => r.file_size)) * (a.length - 1)
          const wb = Math.min(...b.map((r) => r.file_size)) * (b.length - 1)
          return wb - wa
        })

        const result = similarGroups.map((group) => {
          const items = group.map((r) => ({
            id: r.id,
            file_path: r.file_path,
            file_name: r.file_name,
            file_type: r.file_type,
            file_size: r.file_size,
            modified_at: r.modified_at,
            width: r.width,
            height: r.height,
            is_favorite: Boolean(r.is_favorite),
            rating: r.rating
          }))
          const bestId = pickBestId(items)
          return { items, bestItemId: bestId }
        })

        console.log(
          `[pHash] 相似检测：扫描 ${rows.length} 张，比较 ${comparedPairs} 对相似，分 ${similarGroups.length} 组`
        )

        return {
          duplicates: result.map((g) => g.items),
          bestItemIds: result.map((g) => g.bestItemId),
          totalGroups: similarGroups.length,
          totalFiles,
          wastedBytes,
          scannedFiles: rows.length,
          threshold,
          hashedFiles: rows.length
        }
      }
    )
  )

  // T05：手动触发 pHash 补算
  ipcMain.handle(
    'media:generatePhash',
    wrapHandlerNoArgs(ctx, async () => {
      const { processed, total } = await generatePhashForUnprocessed(ctx)
      return { message: 'pHash 补算完成', processed, total }
    })
  )

  // P1-01：手动触发重复标记
  ipcMain.handle(
    'media:markDuplicates',
    wrapHandlerNoArgs(ctx, async () => {
      const result = await markDuplicates(ctx)
      return { message: '重复标记完成', ...result }
    })
  )

  // 媒体列表
  ipcMain.handle(
    'media:list',
    wrapHandler(
      ctx,
      z.tuple([
        z
          .object({
            page: z.number().int().positive().optional(),
            pageSize: z.number().int().positive().max(500).optional(),
            includeDeleted: z.boolean().optional(),
            deletedOnly: z.boolean().optional(),
            sortBy: z.string().max(64).optional(),
            sortOrder: z.string().max(16).optional(),
            accountUid: z.string().max(64).optional(),
            albumType: z.string().max(32).optional(),
            hideDuplicates: z.boolean().optional()
          })
          .optional()
      ]),
      async ([options]) => {
        const result = getRepo().listMedia(options ?? {})
        return {
          files: result.rows.map((f) => ({
            ...f,
            id: String(f.id),
            is_favorite: Boolean(f.is_favorite),
            is_deleted: Boolean(f.is_deleted),
            is_missing: Boolean(f.is_missing),
            is_duplicate: Boolean(f.is_duplicate)
          })),
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          hasMore: result.hasMore
        }
      }
    )
  )

  // P0-03：智能媒体分组——按维度统计分组数量
  ipcMain.handle(
    'media:getGroupCounts',
    wrapHandler(
      ctx,
      z.tuple([
        z.enum(['album_type', 'scene_category', 'scene_time', 'outfit', 'file_type']),
        z.string().max(64).optional(),
        z.enum(['game', 'launcher', 'cloud', 'all']).optional()
      ]),
      async ([dimension, accountUid, mediaSource]) => {
        const groups = getRepo().getGroupCounts(
          dimension as GroupDimension,
          accountUid,
          mediaSource as MediaSourceFilter | undefined
        )
        return { groups }
      }
    )
  )

  // ============ 分类持久化 ============
  ipcMain.handle(
    'category:create',
    wrapHandler(
      ctx,
      z.tuple([
        schemas.shortString(64),
        z
          .object({
            icon: z.string().max(64).optional(),
            color: z.string().max(32).optional(),
            parentId: schemas.positiveIntId.optional()
          })
          .optional()
      ]),
      async ([name, options]) => {
        const id = await getRepo().createCategory(
          name,
          options?.icon || 'folder',
          options?.color || '#888888',
          options?.parentId || null
        )
        return { id }
      }
    )
  )

  ipcMain.handle(
    'category:update',
    wrapHandler(
      ctx,
      z.tuple([
        schemas.positiveIntId,
        z.object({
          name: schemas.shortString(64).optional(),
          icon: z.string().max(64).optional(),
          color: z.string().max(32).optional(),
          parent_id: schemas.positiveIntId.nullable().optional()
        })
      ]),
      async ([id, updates]) => {
        const allowedFields = ['name', 'icon', 'color', 'parent_id']
        const fields: string[] = []
        const values: unknown[] = []
        for (const [key, value] of Object.entries(updates)) {
          if (!allowedFields.includes(key)) continue
          fields.push(`${key} = ?`)
          values.push(value)
        }
        if (fields.length === 0) {
          throw AppError.validation('没有可更新的字段')
        }
        await getRepo().updateCategoryFields(id, fields, values)
        return { updated: true }
      }
    )
  )

  ipcMain.handle(
    'category:delete',
    wrapHandler(ctx, z.tuple([schemas.positiveIntId]), async ([id]) => {
      // F-G9：删除分类前级联清理 media_files.category_id
      await getRepo().deleteCategoryCascade(id)
      return { deleted: true }
    })
  )

  ipcMain.handle(
    'category:reorder',
    wrapHandler(
      ctx,
      z.tuple([
        z
          .array(
            z.object({
              id: schemas.positiveIntId,
              sort_order: z.number().int().min(0),
              parent_id: schemas.positiveIntId.nullable().optional()
            })
          )
          .min(1, 'orders 不能为空')
          .max(500, 'orders 数量超过上限 500')
      ]),
      async ([orders]) => {
        await getRepo().reorderCategories(orders)
        return { reordered: true }
      }
    )
  )

  ipcMain.handle(
    'category:list',
    wrapHandlerNoArgs(ctx, async () => {
      const rows = getRepo().listCategories()
      return {
        categories: rows.map((c) => ({ ...c, is_system: Boolean(c.is_system) }))
      }
    })
  )

  // ============ P0-02：角色档案管理 ============
  ipcMain.handle(
    'profile:list',
    wrapHandlerNoArgs(ctx, async () => {
      const profiles = getRepo().listProfiles()
      return { profiles }
    })
  )

  ipcMain.handle(
    'profile:add',
    wrapHandler(
      ctx,
      z.tuple([schemas.uid, schemas.shortString(64), z.string().max(1024).optional()]),
      async ([uid, nickname, avatar]) => {
        try {
          await getRepo().addProfile(uid, nickname, avatar ?? null)
          return { added: true }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          if (/UNIQUE constraint/i.test(msg)) {
            throw AppError.conflict('该 UID 已存在')
          }
          throw error
        }
      }
    )
  )

  ipcMain.handle(
    'profile:update',
    wrapHandler(
      ctx,
      z.tuple([
        schemas.uid,
        schemas.shortString(64).optional(),
        z.string().max(1024).optional()
      ]),
      async ([uid, nickname, avatar]) => {
        const sets: string[] = []
        const params: unknown[] = []
        if (nickname !== undefined) {
          sets.push('nickname = ?')
          params.push(nickname)
        }
        if (avatar !== undefined) {
          sets.push('avatar = ?')
          params.push(avatar)
        }
        if (sets.length === 0) return { updated: true }
        await getRepo().updateProfileFields(uid, sets, params)
        return { updated: true }
      }
    )
  )

  ipcMain.handle(
    'profile:delete',
    wrapHandler(ctx, z.tuple([schemas.uid]), async ([uid]) => {
      if (uid === 'default') {
        throw AppError.forbidden('默认档案不可删除')
      }
      // 删除档案前，将该档案下的文件迁移到默认档案
      await getRepo().deleteProfileAndReassign(uid)
      return { deleted: true }
    })
  )

  ipcMain.handle(
    'profile:setCurrent',
    wrapHandler(ctx, z.tuple([schemas.uid]), async ([uid]) => {
      await getRepo().touchProfileActive(uid)
      ctx.dbManager.setSetting('currentProfileUid', uid)
      return { updated: true }
    })
  )

  // P1-04：跨档案转移文件
  ipcMain.handle(
    'profile:transferFiles',
    wrapHandler(
      ctx,
      z.tuple([schemas.mediaIdArray, schemas.uid]),
      async ([mediaIds, targetUid]) => {
        const repo = getRepo()
        const profile = repo.getProfileByUid(targetUid)
        if (!profile) {
          throw AppError.notFound(`目标档案 ${targetUid} 不存在`)
        }
        await repo.transferFilesToProfile(mediaIds, targetUid)
        return { message: `已转移 ${mediaIds.length} 个文件到档案 ${targetUid}`, transferred: mediaIds.length }
      }
    )
  )

  ipcMain.handle(
    'profile:getStats',
    wrapHandler(ctx, z.tuple([schemas.uid]), async ([uid]) => {
      const repo = getRepo()
      const baseStats = repo.getProfileBaseStats(uid)
      const outfitStats = repo.getProfileTopOutfits(uid)
      const sceneStats = repo.getProfileTopScenes(uid)
      const timeStats = repo.getProfileTimeDistribution(uid)

      return {
        stats: {
          totalCount: baseStats.total_count ?? 0,
          imageCount: baseStats.image_count ?? 0,
          videoCount: baseStats.video_count ?? 0,
          totalSize: baseStats.total_size ?? 0,
          earliestTime: baseStats.earliest_time,
          latestTime: baseStats.latest_time,
          topOutfits: outfitStats,
          topScenes: sceneStats,
          timeDistribution: timeStats
        }
      }
    })
  )

  // P1-01：查询当前已标记的重复分组
  ipcMain.handle(
    'duplicate:listGroups',
    wrapHandlerNoArgs(ctx, async () => {
      const repo = getRepo()
      const dupRows = repo.getDuplicateGroupRows()

      // 按 original_id 聚合
      const groupMap = new Map<number, typeof dupRows>()
      for (const row of dupRows) {
        const arr = groupMap.get(row.original_id)
        if (arr) arr.push(row)
        else groupMap.set(row.original_id, [row])
      }

      // 查询每组 original_id 对应的"推荐保留"文件
      const originalIds = Array.from(groupMap.keys())
      const originalRows = repo.getOriginalsByIds(originalIds)
      const originalMap = new Map(originalRows.map((r) => [r.id, r]))

      const toDupItem = (r: (typeof originalRows)[number] | (typeof dupRows)[number]) => ({
        id: r.id,
        file_path: r.file_path,
        file_name: r.file_name,
        file_type: r.file_type,
        file_size: r.file_size,
        modified_at: r.modified_at,
        width: r.width,
        height: r.height,
        is_favorite: Boolean(r.is_favorite),
        rating: r.rating
      })

      const groups = originalIds.map((oid) => ({
        originalId: oid,
        original: originalMap.has(oid) ? toDupItem(originalMap.get(oid)!) : null,
        duplicates: (groupMap.get(oid) || []).map(toDupItem)
      }))

      return { groups, totalGroups: groups.length }
    })
  )
}

// 标签长度内部常量（与 utils/constants 的 MAX_TAG_NAME_LENGTH 保持一致，但避免循环依赖）
const MAX_TAG_NAME_LENGTH_INTERNAL = 64
