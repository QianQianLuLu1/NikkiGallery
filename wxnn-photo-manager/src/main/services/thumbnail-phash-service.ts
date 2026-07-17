import sharp from 'sharp'
import type Database from 'better-sqlite3'
import type { HandlerContext } from '../ipc/handler-context'
import { runWithConcurrency } from '../utils/concurrency'
import { THUMBNAIL_CONCURRENCY } from '../utils/constants'
import { calculatePHash, hammingDistance } from '../utils/phash'
import { pickBestId } from '../utils/duplicate-scoring'

/**
 * P1-A1：抽取自 index.ts / misc.ts / media.ts 的 4 组重复函数
 *
 * 原 index.ts 的 Application 类与 misc.ts/media.ts 各持有一份逻辑相同的副本，
 * 此模块作为单一数据源，启动路径与 IPC 路径共用同一份实现，避免两份代码逐渐分叉。
 */

/** 单条媒体记录的缩略图/尺寸/pHash 处理（成功返回 true） */
export async function processThumbnailForRow(
  ctx: HandlerContext,
  row: { id: number; file_path: string; file_type: string },
  updateStmt: Database.Statement
): Promise<boolean> {
  try {
    let width: number | null = null
    let height: number | null = null
    let thumbnailPath: string | null = null
    let phash: string | null = null

    if (row.file_type === 'image') {
      // C-G7：原实现 sharp 加载原图 3 次（metadata/generate/phash）串行执行
      // 优化为 Promise.all 并行执行，总耗时 = max(三操作) 而非 sum
      // metadata 只读文件头极轻量；generate 和 calculatePHash 各自完整解码，并行后重叠 IO/CPU
      const [metadata, thumbResult, phashResult] = await Promise.all([
        sharp(row.file_path).metadata().catch(() => null),
        ctx.thumbnailGen.generate(row.file_path),
        calculatePHash(row.file_path)
      ])
      width = metadata?.width ?? null
      height = metadata?.height ?? null
      thumbnailPath = thumbResult
      // T05：同步计算 pHash（仅图片，视频不计算）
      phash = phashResult
    } else if (row.file_type === 'video') {
      // 视频文件使用 ffmpeg 提取第一帧缩略图
      thumbnailPath = await ctx.thumbnailGen.generate(row.file_path)
    }

    updateStmt.run(width, height, thumbnailPath, phash, row.id)
    return true
  } catch (error) {
    console.error(`[Thumbnail] 处理文件失败 ${row.file_path}:`, error)
    return false
  }
}

/**
 * 为数据库中尚未生成缩略图/尺寸的记录生成缩略图并读取尺寸
 * 通过 ctx 的 isThumbnailsGenerating/setThumbnailsGenerating 互斥，防止并发重复执行
 */
export async function generateThumbnailsForUnprocessed(ctx: HandlerContext): Promise<void> {
  // 待确认#4：运行标志互斥锁，防止启动自动扫描与手动触发并发重复执行
  // 必须在 try-finally 中释放，否则异常退出会导致标志位锁死，后续缩略图生成永远跳过
  if (ctx.isThumbnailsGenerating()) {
    console.log('[Thumbnail] 缩略图生成已在进行中，跳过本次触发')
    return
  }
  ctx.setThumbnailsGenerating(true)
  try {
    const db = ctx.dbManager.getDatabase()
    if (!db) return

    const rows = db.prepare(
      'SELECT id, file_path, file_type FROM media_files WHERE thumbnail IS NULL OR width IS NULL OR height IS NULL'
    ).all() as Array<{ id: number; file_path: string; file_type: string }>

    if (rows.length === 0) return

    // T05：UPDATE 语句新增 phash 字段
    const updateStmt = db.prepare(
      'UPDATE media_files SET width = ?, height = ?, thumbnail = ?, phash = ? WHERE id = ?'
    )

    const thumbnailTasks = rows.map((row) => () => processThumbnailForRow(ctx, row, updateStmt))
    await runWithConcurrency(thumbnailTasks, THUMBNAIL_CONCURRENCY)

    // 通知渲染进程刷新媒体列表
    ctx.getMainWindow()?.webContents.send('media:updated')
  } finally {
    // 必须释放：无论成功/失败/异常，都清除互斥标志
    ctx.setThumbnailsGenerating(false)
  }
}

/**
 * T05：为数据库中尚未计算 pHash 的图片记录补算感知哈希
 * 返回 { processed, total }：processed 成功条数，total 待补算总数
 * 补算完成后自动触发重复标记
 */
export async function generatePhashForUnprocessed(
  ctx: HandlerContext
): Promise<{ processed: number; total: number }> {
  try {
    const db = ctx.dbManager.getDatabase()
    if (!db) return { processed: 0, total: 0 }

    // 仅图片需要 pHash；已计算的跳过
    const rows = db.prepare(
      "SELECT id, file_path FROM media_files WHERE file_type = 'image' AND is_deleted = 0 AND phash IS NULL"
    ).all() as Array<{ id: number; file_path: string }>

    if (rows.length === 0) {
      // 没有新图片需要补算，但仍触发一次重复标记（基于已有 pHash）
      await markDuplicates(ctx)
      return { processed: 0, total: 0 }
    }
    console.log(`[pHash] 待补算 ${rows.length} 张图片`)

    const updateStmt = db.prepare('UPDATE media_files SET phash = ? WHERE id = ?')
    let processed = 0
    const tasks = rows.map((row) => async () => {
      const hash = await calculatePHash(row.file_path)
      if (hash) {
        updateStmt.run(hash, row.id)
        processed++
      }
    })
    await runWithConcurrency(tasks, THUMBNAIL_CONCURRENCY)
    console.log(`[pHash] 补算完成`)
    // P1-01：pHash 补算完成后触发重复标记
    await markDuplicates(ctx)
    return { processed, total: rows.length }
  } catch (error) {
    console.error('[pHash] 补算失败:', error)
    return { processed: 0, total: 0 }
  }
}

/**
 * P1-01：基于 pHash 极严格阈值（≤2）聚类，评分标记重复文件
 * 每组评分最高的设为 is_duplicate=0/original_id=NULL（推荐保留），
 * 其余设为 is_duplicate=1/original_id=最佳项id（图库默认隐藏）
 *
 * 设计权衡：
 * - 阈值选 2：极严格，仅识别"几乎相同"的图片（如游戏多次保存的同一照片），
 *   避免误判用户的相似但不同构图作品
 * - 全量重算：每次调用都重新聚类，保证删除/新增文件后标记正确
 * - 单文件独立：无重复的文件 is_duplicate=0/original_id=NULL
 */
export async function markDuplicates(
  ctx: HandlerContext
): Promise<{ markedDuplicates: number; totalGroups: number }> {
  try {
    const db = ctx.dbManager.getDatabase()
    if (!db) return { markedDuplicates: 0, totalGroups: 0 }

    const MARK_THRESHOLD = 2
    const rows = db.prepare(
      `SELECT id, file_size, width, height, modified_at, is_favorite, rating, phash
       FROM media_files
       WHERE is_deleted = 0 AND file_type = 'image' AND phash IS NOT NULL AND phash != ''`
    ).all() as Array<{
      id: number
      file_size: number
      width: number | null
      height: number | null
      modified_at: string
      is_favorite: number
      rating: number
      phash: string
    }>

    if (rows.length < 2) {
      // 单文件或无文件：清空所有重复标记
      db.prepare('UPDATE media_files SET is_duplicate = 0, original_id = NULL').run()
      return { markedDuplicates: 0, totalGroups: 0 }
    }

    // Union-Find 聚类
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

    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const dist = hammingDistance(rows[i].phash, rows[j].phash)
        if (dist >= 0 && dist <= MARK_THRESHOLD) {
          union(i, j)
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

    // 仅长度 >= 2 的组参与重复标记
    const duplicateGroups: number[][] = []
    for (const indices of groupMap.values()) {
      if (indices.length >= 2) duplicateGroups.push(indices)
    }

    // 先清空所有重复标记（删除/移动文件后旧标记会失效）
    db.prepare('UPDATE media_files SET is_duplicate = 0, original_id = NULL').run()

    if (duplicateGroups.length === 0) {
      console.log(`[Duplicate] 无重复组`)
      return { markedDuplicates: 0, totalGroups: 0 }
    }

    // 对每组评分，最佳项 id 设为 originalId，其余标记 is_duplicate=1
    const updateStmt = db.prepare(
      'UPDATE media_files SET is_duplicate = ?, original_id = ? WHERE id = ?'
    )
    let markedDuplicates = 0
    const updateMany = db.transaction(() => {
      for (const indices of duplicateGroups) {
        const groupItems = indices.map((i) => ({
          id: rows[i].id,
          file_size: rows[i].file_size,
          width: rows[i].width,
          height: rows[i].height,
          modified_at: rows[i].modified_at,
          is_favorite: rows[i].is_favorite === 1,
          rating: rows[i].rating
        }))
        const bestId = pickBestId(groupItems)
        if (bestId === null) continue
        for (const item of groupItems) {
          if (item.id === bestId) {
            // 推荐保留项：保持 is_duplicate=0
            updateStmt.run(0, null, item.id)
          } else {
            updateStmt.run(1, bestId, item.id)
            markedDuplicates++
          }
        }
      }
    })
    updateMany()

    console.log(`[Duplicate] 标记完成：${duplicateGroups.length} 组，${markedDuplicates} 个重复文件`)
    return { markedDuplicates, totalGroups: duplicateGroups.length }
  } catch (error) {
    console.error('[Duplicate] 标记失败:', error)
    return { markedDuplicates: 0, totalGroups: 0 }
  }
}
