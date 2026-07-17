import { ipcMain, dialog, shell } from 'electron'
import fs from 'fs'
import type { HandlerContext } from '../handler-context'
// A-S9：IPC 参数校验工具
import {
  validateIntRange,
  validateMediaId,
  validateMediaIdArray,
  validateStringLength,
  validateTagName
} from '../../utils/ipc-validate'
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
import {
  generatePhashForUnprocessed,
  markDuplicates
} from '../../services/thumbnail-phash-service'
// Slice 6：SQL 访问层抽离到 MediaRepository
import { MediaRepository } from '../../database/media-repository'
// Slice 6：GroupDimension / MediaSourceFilter 类型收窄白名单
import type {
  GroupDimension,
  MediaSourceFilter,
  MediaListOptions
} from '../../database/media-repository'

/**
 * P0-A1：注册 media 域 IPC handler
 * 从 Application.setupIPC() 拆分，通过 HandlerContext 注入依赖，避免直接访问 Application 实例
 *
 * Slice 6：所有 SQL 访问已迁移到 MediaRepository，本文件仅保留：
 *   - IPC 参数校验（A-S9）
 *   - 副作用编排（dialog 确认 / shell.trashItem / fs.access / notifyMediaUpdated）
 *   - 纯领域逻辑（findDuplicates 的 size+hash 分组、findSimilar 的 Union-Find 聚类）
 *   - 响应塑形（{ success, message, ... }）
 */
export function registerMediaHandlers(ctx: HandlerContext): void {
  // Slice 6：每次调用动态获取 Repository（db 可能在初始化/重连时变化）
  // 不在模块加载时缓存，避免 db 实例失效后引用旧连接
  const getRepo = (): MediaRepository => {
    const db = ctx.dbManager.getDatabase()
    if (!db) throw new Error('数据库未初始化')
    return new MediaRepository(db)
  }

  ipcMain.handle('media:updateRating', async (_, mediaId: number, rating: number) => {
    try {
      // A-S9：参数校验
      const vId = validateMediaId(mediaId)
      if (!vId.valid) return { success: false, message: vId.message }
      const vRating = validateIntRange(rating, 0, 5, 'rating')
      if (!vRating.valid) return { success: false, message: vRating.message }

      getRepo().updateRating(mediaId, rating)
      ctx.notifyMediaUpdated()
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // P0-D：删除 media:toggleFavorite 未使用 IPC（渲染层仅调用 media:updateFavorite）

  ipcMain.handle('media:updateFavorite', async (_, mediaId: number, isFavorite: boolean) => {
    try {
      // A-S9：参数校验
      const vId = validateMediaId(mediaId)
      if (!vId.valid) return { success: false, message: vId.message }
      if (typeof isFavorite !== 'boolean') return { success: false, message: 'isFavorite 必须是布尔值' }

      getRepo().updateFavorite(mediaId, isFavorite)
      ctx.notifyMediaUpdated()
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('media:updateTags', async (_, mediaId: number, tags: string[]) => {
    try {
      // A-S9：参数校验
      const vId = validateMediaId(mediaId)
      if (!vId.valid) return { success: false, message: vId.message }
      if (!Array.isArray(tags)) return { success: false, message: 'tags 必须是数组' }
      if (tags.length > 100) return { success: false, message: '标签数量超过上限 100' }
      for (const t of tags) {
        const v = validateTagName(t)
        if (!v.valid) return { success: false, message: v.message }
      }

      getRepo().updateTags(mediaId, tags)
      ctx.notifyMediaUpdated()
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('media:updateNotes', async (_, mediaId: number, notes: string) => {
    try {
      // A-S9：参数校验
      const vId = validateMediaId(mediaId)
      if (!vId.valid) return { success: false, message: vId.message }
      if (typeof notes !== 'string' || notes.length > 10000) {
        return { success: false, message: 'notes 长度必须在 0-10000 之间' }
      }

      getRepo().updateNotes(mediaId, notes)
      ctx.notifyMediaUpdated()
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('media:updateCategory', async (_, mediaId: number, categoryId: number | null) => {
    try {
      // A-S9：参数校验
      const vId = validateMediaId(mediaId)
      if (!vId.valid) return { success: false, message: vId.message }
      if (categoryId !== null) {
        const vCat = validateIntRange(categoryId, 1, Number.MAX_SAFE_INTEGER, 'categoryId')
        if (!vCat.valid) return { success: false, message: vCat.message }
      }

      getRepo().updateCategory(mediaId, categoryId)
      ctx.notifyMediaUpdated()
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // F-O1：更新套装标注
  ipcMain.handle('media:updateOutfit', async (_, mediaId: number, outfit: string) => {
    try {
      const vId = validateMediaId(mediaId)
      if (!vId.valid) return { success: false, message: vId.message }
      if (typeof outfit !== 'string' || outfit.length > 100) {
        return { success: false, message: 'outfit 长度必须在 0-100 之间' }
      }

      getRepo().updateOutfit(mediaId, outfit)
      ctx.notifyMediaUpdated()
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // F-O1：批量分析图像场景时段（基于亮度直方图）
  ipcMain.handle('media:analyzeSceneTime', async (_, mediaIds?: number[]) => {
    try {
      const repo = getRepo()
      // 查询待分析的图片记录：未指定 ID 时分析全部 scene_time='unknown' 的图片
      const rows = repo.getMediaForSceneAnalysis(mediaIds)

      if (rows.length === 0) {
        return { success: true, message: '没有需要分析的图片', analyzed: 0 }
      }

      const { analyzeSceneBrightness } = await import('../../utils/scene-brightness')

      let analyzed = 0
      const tasks = rows.map((row) => async () => {
        const sceneTime = await analyzeSceneBrightness(row.file_path)
        repo.updateSceneTime(row.id, sceneTime)
        analyzed++
      })
      await runWithConcurrency(tasks, 4)

      ctx.notifyMediaUpdated()
      return { success: true, message: `已分析 ${analyzed} 张图片的场景时段`, analyzed }
    } catch (error) {
      return { success: false, message: String(error), analyzed: 0 }
    }
  })

  ipcMain.handle('media:delete', async (_, mediaId: number) => {
    try {
      // A-S9：参数校验
      const vId = validateMediaId(mediaId)
      if (!vId.valid) return { success: false, message: vId.message }

      getRepo().hardDelete(mediaId)
      ctx.notifyMediaUpdated()
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // F-S6 回收站恢复机制：软删除/恢复/彻底删除/清空
  // 软删除：仅标记 is_deleted=1，文件保留在原位置，可在应用回收站内恢复
  // 彻底删除：调用 shell.trashItem 将文件移至系统回收站，再删除数据库记录（双重保障）
  // 注：media:delete 为物理删除数据库记录（配合文件永久删除场景），与 softDelete 语义不同，不合并
  ipcMain.handle('media:softDelete', async (_, mediaIds: number[]) => {
    try {
      // A-S9：参数校验
      const v = validateMediaIdArray(mediaIds)
      if (!v.valid) return { success: false, message: v.message }

      getRepo().softDeleteBatch(mediaIds)
      ctx.notifyMediaUpdated()
      return { success: true, message: `已将 ${mediaIds.length} 项移至回收站` }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('media:restore', async (_, mediaIds: number[]) => {
    try {
      // A-S9：参数校验
      const v = validateMediaIdArray(mediaIds)
      if (!v.valid) return { success: false, message: v.message }

      getRepo().restoreBatch(mediaIds)
      ctx.notifyMediaUpdated()
      return { success: true, message: `已恢复 ${mediaIds.length} 项` }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('media:permanentDelete', async (_, mediaIds: number[]) => {
    try {
      // A-S9：参数校验
      const v = validateMediaIdArray(mediaIds)
      if (!v.valid) return { success: false, message: v.message }

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
        return { success: false, message: '用户取消操作' }
      }

      const repo = getRepo()
      // 查询文件路径
      const rows = repo.getMediaPathsByIds(mediaIds)

      // F-S1 三阶段：①事务软删除标记 ②异步 trashItem ③事务物理删除已处理记录
      // 保证 DB 与文件系统一致：中断后 DB 仍有 is_deleted=1 记录，用户可重试

      // 阶段1：幂等软删除标记（回收站记录已 is_deleted=1，直接彻底删除场景也标记一次）
      repo.softDeleteForPermanentDelete(rows.map((r) => r.id))

      // 阶段2：逐个移至系统回收站，区分「成功」「文件已不存在」「失败」
      const idsToDelete: number[] = []
      const failedPaths: string[] = []
      for (const row of rows) {
        try {
          await shell.trashItem(row.file_path)
          idsToDelete.push(row.id)
        } catch (err) {
          // 区分文件不存在 vs 权限失败：文件不存在时清除记录，存在但失败时保留记录
          let exists = true
          try {
            await fs.promises.access(row.file_path, fs.constants.F_OK)
          } catch {
            exists = false
          }
          if (!exists) {
            // 文件已不在原位（外部删除或之前已移至回收站），直接清除记录
            idsToDelete.push(row.id)
          } else {
            // 文件存在但 trashItem 失败（权限/锁等），保留记录供用户手动处理
            failedPaths.push(row.file_path)
            console.warn(`[RecycleBin] 移至系统回收站失败: ${row.file_path}`, err)
          }
        }
      }

      // 阶段3：事务中物理删除已成功处理（移至回收站或文件已不存在）的记录
      repo.hardDeleteBatch(idsToDelete)

      ctx.notifyMediaUpdated()
      const msg = failedPaths.length > 0
        ? `已彻底删除 ${idsToDelete.length} 项（${failedPaths.length} 项移至回收站失败，已保留记录供手动处理）`
        : `已彻底删除 ${idsToDelete.length} 项`
      return { success: true, message: msg }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('media:emptyRecycleBin', async () => {
    try {
      const repo = getRepo()
      const rows = repo.getSoftDeletedMediaPaths()

      if (rows.length === 0) {
        return { success: true, message: '回收站为空，无需清理' }
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
        return { success: false, message: '用户取消操作' }
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
      repo.hardDeleteBatch(idsToDelete)
      ctx.notifyMediaUpdated()
      return { success: true, message: `已清空回收站（共 ${movedCount} 项）` }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // T02：清理丢失记录——文件已被外部删除（is_missing=1）的数据库记录直接清除
  // 不调用 shell.trashItem，因为物理文件已经不存在
  ipcMain.handle('media:cleanupMissing', async () => {
    try {
      const cleared = getRepo().cleanupMissingRecords()
      ctx.notifyMediaUpdated()
      return { success: true, message: `已清理 ${cleared} 条丢失记录`, cleared }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // T02：从库中移除单条 missing 记录（详情页使用）
  ipcMain.handle('media:removeMissing', async (_, mediaId: number) => {
    try {
      const v = validateMediaId(mediaId)
      if (!v.valid) return { success: false, message: v.message }
      const deleted = getRepo().removeMissingRecord(mediaId)
      if (!deleted) {
        return { success: false, message: '记录不存在或文件未标记为丢失' }
      }
      ctx.notifyMediaUpdated()
      return { success: true, message: '已从库中移除丢失记录' }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // T03：套装图鉴统计——聚合查询每个套装的张数 / 最新拍摄时间 / 缩略图
  ipcMain.handle('media:getOutfitStats', async () => {
    try {
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
      return { success: true, stats }
    } catch (error) {
      return { success: false, message: String(error), stats: [] }
    }
  })

  // F-S10：重复文件检测——基于完整 sha256 内容 hash 分组
  // 两轮筛选：1) file_size 预过滤（同 size 才可能重复）；2) 完整 sha256 hash 精确分组
  ipcMain.handle('media:findDuplicates', async () => {
    try {
      const rows = getRepo().getDuplicateCandidates()

      // 第一轮：按 file_size 分组，仅 size>0 的文件参与
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

      // 第二轮：对 size 重复的组逐个计算完整 sha256，再按 hash 分组
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
            // 文件读取失败（可能已被外部删除）跳过，避免阻塞整个扫描
            console.warn(`[Duplicates] hash 计算失败，跳过: ${row.file_path}`, err)
          }
        }
      }

      // 仅返回 hash 重复的组（长度 > 1）
      // 按 modified_at 降序排序（最新在前），便于"保留最新"等清理策略
      // P1-01：每组附加 bestItemId（基于评分推荐保留的 id）
      const duplicateGroups = Array.from(hashGroups.values())
        .filter((g) => g.length > 1)
        .map((group) => {
          const sorted = [...group].sort(
            (a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime()
          )
          return sorted
        })
        // 组间按"浪费空间"降序（组大小 ×(n-1)），最浪费的排前面
        .sort((a, b) => b[0].file_size * (b.length - 1) - a[0].file_size * (a.length - 1))

      const bestItemIds = duplicateGroups.map((g) => pickBestId(g))

      const totalFiles = duplicateGroups.reduce((sum, g) => sum + g.length, 0)
      const wastedBytes = duplicateGroups.reduce(
        (sum, g) => sum + g[0].file_size * (g.length - 1),
        0
      )
      return {
        success: true,
        duplicates: duplicateGroups,
        bestItemIds,
        totalGroups: duplicateGroups.length,
        totalFiles,
        wastedBytes,
        scannedFiles: rows.length
      }
    } catch (error) {
      return {
        success: false,
        message: String(error),
        duplicates: [],
        bestItemIds: [],
        totalGroups: 0,
        totalFiles: 0,
        wastedBytes: 0,
        scannedFiles: 0
      }
    }
  })

  // T05：基于 pHash 汉明距离的相似图片查找
  // 参数：threshold 汉明距离阈值（默认 5，≤5 视为相似）
  // 返回：与 findDuplicates 相同的结构，duplicates 为相似图簇的二维数组
  ipcMain.handle('media:findSimilar', async (_, options?: { threshold?: number }) => {
    try {
      const rows = getRepo().getPhashRows()

      const threshold = options?.threshold ?? 5
      if (threshold < 0 || threshold > 64) {
        return { success: false, message: '阈值必须在 0-64 之间', duplicates: [], totalGroups: 0, totalFiles: 0, wastedBytes: 0, scannedFiles: 0 }
      }

      if (rows.length < 2) {
        return { success: true, duplicates: [], totalGroups: 0, totalFiles: 0, wastedBytes: 0, scannedFiles: rows.length, threshold, hashedFiles: rows.length }
      }

      // 聚类：相似度图连通分量（Union-Find）
      // 对每对图片计算汉明距离，≤ threshold 则归为同一组
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

      // 按 root 分组
      const groupMap = new Map<number, number[]>()
      for (let i = 0; i < rows.length; i++) {
        const root = find(i)
        if (!groupMap.has(root)) groupMap.set(root, [])
        groupMap.get(root)!.push(i)
      }

      // 仅保留 >= 2 张的组（相似组）
      const similarGroups: Array<typeof rows> = []
      let totalFiles = 0
      let wastedBytes = 0
      for (const indices of groupMap.values()) {
        if (indices.length < 2) continue
        const groupRows = indices.map((i) => rows[i])
        // 组内按 modified_at 降序（最新在前）
        groupRows.sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime())
        similarGroups.push(groupRows)
        totalFiles += groupRows.length
        // 可释放空间 = 组内最小文件大小 × (n-1)（保留一张）
        const minSize = Math.min(...groupRows.map((r) => r.file_size))
        wastedBytes += minSize * (groupRows.length - 1)
      }

      // 组间按可释放空间降序
      similarGroups.sort((a, b) => {
        const wa = Math.min(...a.map((r) => r.file_size)) * (a.length - 1)
        const wb = Math.min(...b.map((r) => r.file_size)) * (b.length - 1)
        return wb - wa
      })

      // 转为前端期望的 DuplicateItem 结构（去除 phash 字段）
      // P1-01：每组附加 bestItemId（基于评分推荐保留的 id），便于 UI 标记"推荐保留"
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

      console.log(`[pHash] 相似检测：扫描 ${rows.length} 张，比较 ${comparedPairs} 对相似，分 ${similarGroups.length} 组`)

      return {
        success: true,
        duplicates: result.map((g) => g.items),
        bestItemIds: result.map((g) => g.bestItemId),
        totalGroups: similarGroups.length,
        totalFiles,
        wastedBytes,
        scannedFiles: rows.length,
        threshold,
        hashedFiles: rows.length
      }
    } catch (error) {
      return {
        success: false,
        message: String(error),
        duplicates: [],
        bestItemIds: [],
        totalGroups: 0,
        totalFiles: 0,
        wastedBytes: 0,
        scannedFiles: 0,
        threshold: options?.threshold ?? 5,
        hashedFiles: 0
      }
    }
  })

  // T05：手动触发 pHash 补算（前端"相似检测"页可调用）
  ipcMain.handle('media:generatePhash', async () => {
    try {
      const { processed, total } = await generatePhashForUnprocessed(ctx)
      return { success: true, message: 'pHash 补算完成', processed, total }
    } catch (error) {
      return { success: false, message: String(error), processed: 0, total: 0 }
    }
  })

  // P1-01：手动触发重复标记
  // 基于 pHash 极严格阈值（≤2）聚类，评分最高的设为 is_duplicate=0，其余设为 is_duplicate=1 + original_id
  // 返回 { success, markedDuplicates, totalGroups }
  ipcMain.handle('media:markDuplicates', async () => {
    try {
      const result = await markDuplicates(ctx)
      return { success: true, message: '重复标记完成', ...result }
    } catch (error) {
      return { success: false, message: String(error), markedDuplicates: 0, totalGroups: 0 }
    }
  })

  ipcMain.handle('media:list', async (_, options?: MediaListOptions) => {
    try {
      const result = getRepo().listMedia(options ?? {})

      return {
        success: true,
        files: result.rows.map((f) => ({
          ...f,
          id: String(f.id),
          is_favorite: Boolean(f.is_favorite),
          is_deleted: Boolean(f.is_deleted),
          is_missing: Boolean(f.is_missing),
          is_duplicate: Boolean(f.is_duplicate)
          // tags 已由 Repository 解析为 string[]，无需再调 parseTagsField
        })),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        hasMore: result.hasMore
      }
    } catch (error) {
      return { success: false, message: String(error), files: [] }
    }
  })

  // P0-03：智能媒体分组——按维度统计分组数量
  // 维度可选值：album_type | scene_category | scene_time | outfit | file_type
  // 返回 [{ key, count }, ...]，按 count 降序排列
  // accountUid 可选过滤条件（'all' 或不传表示全部档案）
  ipcMain.handle('media:getGroupCounts', async (_, dimension: string, accountUid?: string, mediaSource?: MediaSourceFilter) => {
    try {
      // 白名单防止 SQL 注入（Repository 方法签名已收窄为 GroupDimension，此处再做运行时校验）
      const VALID_DIMENSIONS: Record<string, GroupDimension> = {
        album_type: 'album_type',
        scene_category: 'scene_category',
        scene_time: 'scene_time',
        outfit: 'outfit',
        file_type: 'file_type'
      }
      const dim = VALID_DIMENSIONS[dimension]
      if (!dim) {
        return { success: false, message: `无效的分组维度: ${dimension}`, groups: [] }
      }

      const groups = getRepo().getGroupCounts(dim, accountUid, mediaSource)
      return { success: true, groups }
    } catch (error) {
      return { success: false, message: String(error), groups: [] }
    }
  })

  // ============ 分类持久化 ============
  ipcMain.handle('category:create', async (_, name: string, options?: { icon?: string; color?: string; parentId?: number }) => {
    try {
      // A-S9：参数校验
      const vName = validateStringLength(name, 64, 'name')
      if (!vName.valid) return { success: false, message: vName.message }
      if (options?.parentId !== undefined && options.parentId !== null) {
        const vParent = validateIntRange(options.parentId, 1, Number.MAX_SAFE_INTEGER, 'parentId')
        if (!vParent.valid) return { success: false, message: vParent.message }
      }

      const id = getRepo().createCategory(
        name,
        options?.icon || 'folder',
        options?.color || '#888888',
        options?.parentId || null
      )
      return { success: true, id }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('category:update', async (_, id: number, updates: { name?: string; icon?: string; color?: string; parent_id?: number | null }) => {
    try {
      // A-S9：参数校验
      const vId = validateIntRange(id, 1, Number.MAX_SAFE_INTEGER, 'id')
      if (!vId.valid) return { success: false, message: vId.message }
      if (!updates || typeof updates !== 'object') return { success: false, message: 'updates 必须是对象' }

      const allowedFields = ['name', 'icon', 'color', 'parent_id']
      const fields: string[] = []
      const values: unknown[] = []
      for (const [key, value] of Object.entries(updates)) {
        if (!allowedFields.includes(key)) continue
        if (key === 'name' && typeof value === 'string') {
          const v = validateStringLength(value, 64, 'name')
          if (!v.valid) return { success: false, message: v.message }
        }
        fields.push(`${key} = ?`)
        values.push(value)
      }
      if (fields.length === 0) {
        return { success: false, message: '没有可更新的字段' }
      }
      getRepo().updateCategoryFields(id, fields, values)
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('category:delete', async (_, id: number) => {
    try {
      // A-S9：参数校验
      const vId = validateIntRange(id, 1, Number.MAX_SAFE_INTEGER, 'id')
      if (!vId.valid) return { success: false, message: vId.message }

      // F-G9：删除分类前级联清理 media_files.category_id，避免悬空引用
      // （结合 A-G8 无外键约束，应用层必须手动处理）
      getRepo().deleteCategoryCascade(id)
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('category:reorder', async (_, orders: Array<{ id: number; sort_order: number; parent_id?: number }>) => {
    try {
      // A-S9：参数校验
      if (!Array.isArray(orders)) return { success: false, message: 'orders 必须是数组' }
      if (orders.length === 0) return { success: false, message: 'orders 不能为空' }
      if (orders.length > 500) return { success: false, message: 'orders 数量超过上限 500' }
      for (const o of orders) {
        const vId = validateIntRange(o.id, 1, Number.MAX_SAFE_INTEGER, 'id')
        if (!vId.valid) return { success: false, message: vId.message }
        const vOrder = validateIntRange(o.sort_order, 0, Number.MAX_SAFE_INTEGER, 'sort_order')
        if (!vOrder.valid) return { success: false, message: vOrder.message }
      }

      getRepo().reorderCategories(orders)
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('category:list', async () => {
    try {
      const rows = getRepo().listCategories()
      return {
        success: true,
        categories: rows.map((c) => ({ ...c, is_system: Boolean(c.is_system) }))
      }
    } catch (error) {
      return { success: false, message: String(error), categories: [] }
    }
  })

  // ============ P0-02：角色档案管理 ============
  // 角色档案包含 UID、昵称、头像，拍摄统计实时从 media_files 聚合查询
  // 与对标项目"多账号"的差异：本项目的角色档案是综合档案，含拍摄偏好统计

  ipcMain.handle('profile:list', async () => {
    try {
      const profiles = getRepo().listProfiles()
      return { success: true, profiles }
    } catch (error) {
      return { success: false, message: String(error), profiles: [] }
    }
  })

  ipcMain.handle('profile:add', async (_, uid: string, nickname: string, avatar?: string) => {
    try {
      // 参数校验
      const vUid = validateStringLength(uid, 32, 'uid')
      if (!vUid.valid) return { success: false, message: vUid.message }
      const vName = validateStringLength(nickname, 64, 'nickname')
      if (!vName.valid) return { success: false, message: vName.message }
      // UID 仅允许字母数字（兼容未来非纯数字 UID）
      if (!/^[A-Za-z0-9]+$/.test(uid)) {
        return { success: false, message: 'UID 仅允许字母和数字' }
      }

      getRepo().addProfile(uid, nickname, avatar ?? null)
      return { success: true }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (/UNIQUE constraint/i.test(msg)) {
        return { success: false, message: '该 UID 已存在' }
      }
      return { success: false, message: msg }
    }
  })

  ipcMain.handle('profile:update', async (_, uid: string, nickname?: string, avatar?: string) => {
    try {
      const vUid = validateStringLength(uid, 32, 'uid')
      if (!vUid.valid) return { success: false, message: vUid.message }

      const sets: string[] = []
      const params: unknown[] = []
      if (nickname !== undefined) {
        const vName = validateStringLength(nickname, 64, 'nickname')
        if (!vName.valid) return { success: false, message: vName.message }
        sets.push('nickname = ?')
        params.push(nickname)
      }
      if (avatar !== undefined) {
        sets.push('avatar = ?')
        params.push(avatar)
      }
      if (sets.length === 0) return { success: true }
      getRepo().updateProfileFields(uid, sets, params)
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('profile:delete', async (_, uid: string) => {
    try {
      if (uid === 'default') {
        return { success: false, message: '默认档案不可删除' }
      }
      const vUid = validateStringLength(uid, 32, 'uid')
      if (!vUid.valid) return { success: false, message: vUid.message }
      // 删除档案前，将该档案下的文件迁移到默认档案
      getRepo().deleteProfileAndReassign(uid)
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('profile:setCurrent', async (_, uid: string) => {
    // 当前档案 UID 持久化到 app_settings（由渲染进程通过 settings:set 也可设置）
    // 此 handler 提供便捷入口，并更新 last_active_at
    try {
      const vUid = validateStringLength(uid, 32, 'uid')
      if (!vUid.valid) return { success: false, message: vUid.message }
      getRepo().touchProfileActive(uid)
      ctx.dbManager.setSetting('currentProfileUid', uid)
      return { success: true }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // P1-04：跨档案转移文件——批量更新 media_files.account_uid
  ipcMain.handle('profile:transferFiles', async (_, mediaIds: number[], targetUid: string) => {
    try {
      if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
        return { success: false, message: '未选择要转移的文件' }
      }
      const vUid = validateStringLength(targetUid, 32, 'targetUid')
      if (!vUid.valid) return { success: false, message: vUid.message }
      const repo = getRepo()
      // 校验目标档案存在
      const profile = repo.getProfileByUid(targetUid)
      if (!profile) {
        return { success: false, message: `目标档案 ${targetUid} 不存在` }
      }
      repo.transferFilesToProfile(mediaIds, targetUid)
      return { success: true, message: `已转移 ${mediaIds.length} 个文件到档案 ${targetUid}` }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  ipcMain.handle('profile:getStats', async (_, uid: string) => {
    try {
      const vUid = validateStringLength(uid, 32, 'uid')
      if (!vUid.valid) return { success: false, message: vUid.message }
      const repo = getRepo()

      const baseStats = repo.getProfileBaseStats(uid)
      const outfitStats = repo.getProfileTopOutfits(uid)
      const sceneStats = repo.getProfileTopScenes(uid)
      const timeStats = repo.getProfileTimeDistribution(uid)

      return {
        success: true,
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
    } catch (error) {
      return { success: false, message: String(error), stats: null }
    }
  })

  // P1-01：查询当前已标记的重复分组（is_duplicate=1 的文件按 original_id 分组）
  // 返回 { success, groups: [{ originalId, original: DuplicateItem|null, duplicates: DuplicateItem[] }] }
  ipcMain.handle('duplicate:listGroups', async () => {
    try {
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

      const toDupItem = (r: typeof originalRows[number] | typeof dupRows[number]) => ({
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

      return { success: true, groups, totalGroups: groups.length }
    } catch (error) {
      return { success: false, message: String(error), groups: [], totalGroups: 0 }
    }
  })
}
