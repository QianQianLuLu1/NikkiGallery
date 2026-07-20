/**
 * 游戏内照片场景分类（C-S2：从 main/utils 抽取到 shared，供主进程与渲染进程共享）
 *
 * 本文件为纯类型与常量模块，不依赖任何 Node API 或 Electron API，
 * 可安全被主进程与渲染进程同时导入。
 *
 * 根据文件所在父文件夹名称自动识别场景类型。
 */

export type SceneCategory =
  'thumbnail' | 'screenshot' | 'travel_journal' | 'world_tour' | 'collage' | 'other'

/**
 * F-O1：基于图像亮度直方图的场景时段分类
 * - day：日景（高亮度）
 * - night：夜景（低亮度）
 * - dawn：晨景（中等亮度，偏暖）
 * - dusk：暮景（中等亮度，偏冷）
 * - unknown：未分析/视频文件
 */
export type SceneTime = 'day' | 'night' | 'dawn' | 'dusk' | 'unknown'

export interface SceneCategoryConfig {
  key: SceneCategory
  label: string
  folderPattern: string
}

export interface SceneTimeConfig {
  key: SceneTime
  label: string
  description: string
}

// 按匹配优先级排序：越靠前的分类越精准
export const SCENE_CATEGORIES: SceneCategoryConfig[] = [
  { key: 'thumbnail', label: '缩略图', folderPattern: 'NikkiPhotos_LowQuality' },
  { key: 'screenshot', label: '截图', folderPattern: 'ScreenShot' },
  { key: 'travel_journal', label: '旅行手账', folderPattern: 'MagazinePhotos' },
  { key: 'world_tour', label: '世界巡游', folderPattern: 'ClockInPhoto' },
  { key: 'collage', label: '趣拼海报原图', folderPattern: 'Collage_CollagePhoto' },
  { key: 'other', label: '其他', folderPattern: '' }
]

// F-O1：场景时段配置（基于图像亮度直方图）
export const SCENE_TIMES: SceneTimeConfig[] = [
  { key: 'day', label: '日景', description: '高亮度，明亮场景' },
  { key: 'dawn', label: '晨景', description: '中等亮度，偏暖色调' },
  { key: 'dusk', label: '暮景', description: '中等亮度，偏冷色调' },
  { key: 'night', label: '夜景', description: '低亮度，暗色调场景' },
  { key: 'unknown', label: '未分析', description: '视频文件或分析失败' }
]

/**
 * F-O1：无限暖暖常见套装预设库
 * 用户可从中选择或自定义输入套装名
 */
export const OUTFIT_PRESETS: string[] = [
  // 经典套装
  '初心之吻',
  '星之海',
  '雪地精灵',
  '夜色诗篇',
  '晨光微露',
  '花漾少女',
  '云端漫步',
  '月光奏鸣曲',
  '樱花恋人',
  '琥珀之韵',
  // 华丽套装
  '璀璨星河',
  '蝴蝶效应',
  '海蓝之谜',
  '沙漠玫瑰',
  '极光幻影',
  '琉璃梦境',
  '翡翠之誓',
  '紫藤花语',
  '玫瑰园',
  '水晶誓约',
  // 季节限定
  '春之圆舞曲',
  '夏日微风',
  '秋叶翩跹',
  '冬雪皑皑',
  '新年华彩',
  // 主题套装
  '校园时光',
  '都市丽人',
  '古风雅韵',
  '未来科技',
  '童话物语',
  '海岛假日',
  '雪国列车',
  '云端歌者',
  '星屑魔法',
  '蔷薇骑士'
]

/**
 * 根据文件路径检测游戏场景分类
 * - 不区分大小写匹配完整路径中的文件夹名
 * - 返回最精准（优先级最高）的匹配分类
 * - 无匹配或路径异常时返回 'other'
 */
export function detectSceneCategory(filePath: string): SceneCategory {
  if (!filePath || typeof filePath !== 'string') return 'other'

  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase()

  for (const category of SCENE_CATEGORIES) {
    if (!category.folderPattern) continue
    const pattern = category.folderPattern.toLowerCase()
    if (normalizedPath.includes('/' + pattern + '/') || normalizedPath.endsWith('/' + pattern)) {
      return category.key
    }
  }

  return 'other'
}

/**
 * 获取分类的显示名称
 */
export function getSceneCategoryLabel(key: SceneCategory): string {
  return SCENE_CATEGORIES.find((c) => c.key === key)?.label ?? '其他'
}

/**
 * 获取所有场景分类键（按显示顺序）
 */
export function getSceneCategoryKeys(): SceneCategory[] {
  return SCENE_CATEGORIES.map((c) => c.key)
}

/**
 * F-O1：获取场景时段的显示名称
 */
export function getSceneTimeLabel(key: SceneTime): string {
  return SCENE_TIMES.find((c) => c.key === key)?.label ?? '未分析'
}

/**
 * F-O1：获取所有场景时段键（按显示顺序）
 */
export function getSceneTimeKeys(): SceneTime[] {
  return SCENE_TIMES.map((c) => c.key)
}

/**
 * T03：套装图鉴统计——每个套装的聚合信息
 * - count：该套装下未软删除的照片数
 * - latestCreatedAt：该套装最新一张的拍摄时间（ISO 字符串）
 * - coverFilePath：封面图原文件路径（取最新一张）
 * - coverThumbnail：封面缩略图（file:// 或 data: URL）
 */
export interface OutfitStat {
  outfit: string
  count: number
  latestCreatedAt: string
  coverFilePath: string
  coverThumbnail: string | null
}
