/**
 * P1-01：智能去重评分模块
 *
 * 评分维度（满分 100）：
 * - 分辨率（40 分）：宽×高归一化，分辨率越高画质越好
 * - 文件大小（30 分）：同分辨率下文件越大压缩损失越少
 * - 拍摄时间（20 分）：越新越好（用户更可能保留近期作品）
 * - 收藏加权（10 分）：is_favorite 或 rating > 0 加分
 *
 * 评分仅用于推荐保留版本，不改变文件本身。
 */

export interface ScoreInput {
  id: number
  file_size: number
  width: number | null
  height: number | null
  modified_at: string
  is_favorite: boolean
  rating: number
}

export interface ScoredItem<T extends ScoreInput = ScoreInput> {
  item: T
  score: number
  // 各维度归一化值（0-1），便于调试与展示
  dimensions: {
    resolution: number
    fileSize: number
    recency: number
    favorite: number
  }
}

/**
 * 对一组重复文件评分，返回每项的评分结果（按分数降序）
 */
export function scoreGroup<T extends ScoreInput>(group: T[]): ScoredItem<T>[] {
  if (group.length === 0) return []

  // 收集该组内各维度的最大值，用于归一化
  let maxResolution = 0
  let maxFileSize = 0
  let maxTimestamp = 0
  let minTimestamp = Number.POSITIVE_INFINITY
  for (const it of group) {
    const pixels = (it.width ?? 0) * (it.height ?? 0)
    if (pixels > maxResolution) maxResolution = pixels
    if (it.file_size > maxFileSize) maxFileSize = it.file_size
    const ts = new Date(it.modified_at).getTime()
    if (Number.isFinite(ts)) {
      if (ts > maxTimestamp) maxTimestamp = ts
      if (ts < minTimestamp) minTimestamp = ts
    }
  }
  const timestampRange = Math.max(1, maxTimestamp - minTimestamp)

  return group
    .map((item) => {
      const pixels = (item.width ?? 0) * (item.height ?? 0)
      const resolutionNorm = maxResolution > 0 ? pixels / maxResolution : 0
      const fileSizeNorm = maxFileSize > 0 ? item.file_size / maxFileSize : 0
      const ts = new Date(item.modified_at).getTime()
      const recencyNorm =
        Number.isFinite(ts) && timestampRange > 0
          ? (ts - minTimestamp) / timestampRange
          : 1
      const favoriteNorm = item.is_favorite || item.rating > 0 ? 1 : 0

      const score =
        resolutionNorm * 40 + fileSizeNorm * 30 + recencyNorm * 20 + favoriteNorm * 10

      return {
        item,
        score: Math.round(score * 10) / 10,
        dimensions: {
          resolution: resolutionNorm,
          fileSize: fileSizeNorm,
          recency: recencyNorm,
          favorite: favoriteNorm
        }
      }
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * 返回一组重复文件中评分最高的项 id（推荐保留）
 */
export function pickBestId<T extends ScoreInput>(group: T[]): number | null {
  if (group.length === 0) return null
  const scored = scoreGroup(group)
  return scored[0]?.item.id ?? null
}
