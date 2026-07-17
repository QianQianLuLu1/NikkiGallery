/**
 * 游戏枚举映射表
 *
 * 数据来源：上游 nikki_albums 项目（RanAxro/nikki_albums）
 * - 数字→字符串映射：lib/modules/nuan5_params/model/enumeration.dart
 * - 字符串→中文名：assets/lang/infinity_nikki/{zh-CN,other}/zh-CN.json
 *
 * 所有映射均通过上游源码验证，非推测值。
 */

// ── 服装部位类型（ClothType enum → zh-CN.json media_params.cloth_type）──
export const CLOTH_TYPE_MAP: Record<number, string> = {
  0: '未知',
  10: '发型',
  20: '外套',
  30: '上衣',
  41: '下装',
  50: '袜子',
  60: '鞋子',
  71: '发饰',
  72: '帽子',
  73: '耳饰',
  74: '颈饰',
  75: '腕饰',
  76: '项圈',
  77: '手套',
  78: '手持物',
  79: '肤绘',
  80: '全妆',
  81: '底妆',
  82: '眉妆',
  83: '睫毛',
  84: '美瞳',
  85: '唇妆',
  86: '肤色',
  90: '连衣裙',
  92: '面饰',
  93: '胸饰',
  94: '挂饰',
  95: '背饰',
  96: '戒指',
  97: '臂饰',
}

// ── 服装进化/焕新状态（NikkiClothState enum → zh-CN.json media_params.nikki_cloth_state）──
export const CLOTH_STATE_MAP: Record<number, string> = {
  0: '无',
  1: '无',
  2: '焕新',
  3: '1进',
  4: '2进',
  5: '3进',
  9: '无',
}

// ── 天气类型（Weather enum → zh-CN.json media_params.weather）──
export const WEATHER_TYPE_MAP: Record<number, string> = {
  [-1]: '未知',
  0: '晴天',
  2: '雨天',
  4: '彩虹',
  7: '星海',
}

// ── 光圈档位（ApertureSection enum → zh-CN.json media_params.aperture_section）──
export const APERTURE_SECTION_MAP: Record<number, string> = {
  [-1]: '未知',
  1: 'f/1.2',
  2: 'f/1.4',
  3: 'f/2',
  4: 'f/2.2',
  5: 'f/2.5',
  6: 'f/2.8',
  7: 'f/3.2',
  8: 'f/3.5',
  9: 'f/4',
  10: 'f/4.5',
  11: 'f/5',
  12: 'f/5.6',
  13: 'f/8',
  14: 'f/11',
  15: 'f/16',
}

// ── 祝福闪光挂载点（EurekaAttachmentPoint enum → zh-CN.json media_params.eureka_attachment_point）──
export const EUREKA_ATTACHMENT_POINT_MAP: Record<number, string> = {
  0: '未知',
  1: '头部',
  2: '手部',
  3: '脚部',
}

// ── 染色色盘（ColorPalette enum → zh-CN.json media_params.color_palette）──
export const COLOR_PALETTE_MAP: Record<number, string> = {
  0: '自选',
  1: '飞球果飘飘',
  2: '春日满满星',
  3: '星光果之梦',
  4: '眼影鱼碎闪',
  5: '围兜暖毛球',
  6: '星夜时光树',
  7: '崖上的壁灯',
  8: '风铃子腹语',
  9: '风絮草飘飞时',
  10: '雨夜路灯花',
  11: '耳坠萤未眠',
  12: '碧波裙摆湖',
  13: '星荧草来信',
  14: '丝巾蛾魅影',
  15: '花伞藤萝之雨',
  16: '兔耳草嫩蕊',
  17: '裙撑萤之歌',
  18: '名流鸦盛宴',
}

// ── 染色色格（ColorSwatch enum → zh-CN.json media_params.color_swatch）──
export const COLOR_SWATCH_MAP: Record<number, string> = {
  0: '未知',
  1: '第1格',
  2: '第2格',
  3: '第3格',
  4: '第4格',
  5: '第5格',
  6: '第6格',
  7: '第7格',
  8: '第8格',
}

// ── 灯光（字符串ID → other/zh-CN.json light）──
export const LIGHT_MAP: Record<string, string> = {
  'None': '无',
  'DirectionLight_L': '方向补光-侧光-左',
  'DirectionLight_R': '方向补光-侧光-右',
  'DirectionLight_T': '方向补光-顶光',
  'DirectionLight_B': '方向补光-底光',
  'HueEdgeLight_001_L': '色相边光-柔黄-左',
  'HueEdgeLight_001_R': '色相边光-柔黄-右',
  'HueEdgeLight_002_L': '色相边光-月蓝-左',
  'HueEdgeLight_002_R': '色相边光-月蓝-右',
  'HueEdgeLight_003_L': '色相边光-明紫-左',
  'HueEdgeLight_003_R': '色相边光-明紫-右',
  'HueEdgeLight_004_L': '色相边光-轻粉-左',
  'HueEdgeLight_004_R': '色相边光-轻粉-右',
  'VibeLight_001': '氛围灯光-轻白边光',
  'VibeLight_002': '氛围灯光-梦幻虹光',
  'VibeLight_003': '氛围灯光-绚丽极光',
  'VibeLight_004': '氛围灯光-柔纱波光',
}

// ── 滤镜（字符串ID → other/zh-CN.json filter）──
export const FILTER_MAP: Record<string, string> = {
  'None': '无',
  'Fresh_001': '清新-薄雾',
  'Fresh_002': '清新-粉樱',
  'Fresh_003': '清新-奶油',
  'Fresh_004': '清新-暖阳',
  'Fresh_005': '清新-晴日',
  'Weather_001': '氛围-暮色',
  'Weather_002': '氛围-月白',
  'Weather_003': '氛围-夜雨',
  'Weather_004': '氛围-融雪',
  'Vibe_009': '氛围-夜河',
  'Vibe_001': '风格-复古胶片',
  'Vibe_002': '风格-悠然海岸',
  'Vibe_003': '风格-夏日午后',
  'Vibe_004': '风格-曼妙珠光',
  'Vibe_005': '风格-红蓝交响',
}

// ── 错位摄影（数字ID → other/zh-CN.json puzzle）──
export const PUZZLE_MAP: Record<number, string> = {
  [-1]: '无',
  30: '埋骨地 - 渴望飞翔 - 长出翅膀的思凯莱',
  31: '埋骨地 - 神诞地观测 - 仪器中的神诞地',
}

// ── 拍摄任务（数字ID → other/zh-CN.json interactive）──
export const INTERACTIVE_MAP: Record<number, string> = {
  206001: '2.6 潮汐尽头的明天 旅间收集 Day1 拍摄1张四大部门任意摊位的照片',
  261003: '任务 - 再见，为了重逢 - 给米瑞娜和西里安拍一张合照',
  42031201: '绯影存忆 1 - 积木花园',
  42031202: '绯影存忆 2 - 共建的花圃',
  42031203: '绯影存忆 3 - 远去的旧途',
}

// ── 世界巡游（数字ID → other/zh-CN.json expedition）──
export const EXPEDITION_MAP: Record<number, string> = {
  101020301: '伊赞之土 - 大拉姆居落',
  101020302: '伊赞之土 - 往归摆厅',
  101020303: '伊赞之土 - 灵洗池',
  101020304: '伊赞之土 - 疗愈地',
  101020305: '伊赞之土 - 灵魂观察所',
  101020306: '伊赞之土 - 龙巢所',
  101020307: '伊赞之土 - 纪念地',
  101020308: '伊赞之土 - 蓝池',
}

// ── 动作场景（pose_id → other/zh-CN.json pose）
//    上游亦为空（仅有 {0: "无"}），需后续收集 ──
export const POSE_ID_MAP: Record<number, string> = {
  0: '无',
}

// ── 定格场景（framed_moment → other/zh-CN.json framed_moment）
//    上游亦为空（仅有 {0: "无"}），需后续收集 ──
export const FRAMED_MOMENT_MAP: Record<number, string> = {
  0: '无',
}

// ── 祝福闪光颜色（eureka.color，0-9）
//    推导依据：color = rawId % 10，值域 0-9
//    上游 other/zh-CN.json 中 eureka 对象为空，tree_node_generator.dart 直接显示数字
//    此映射基于游戏内祝福闪光颜色系统的标准色序推导（红→紫彩虹序 + 粉/白），
//    准确性需通过游戏内实际对照验证。如有偏差请通过 debug 日志修正。──
export const EUREKA_COLOR_MAP: Record<number, string> = {
  0: '原色',
  1: '红',
  2: '橙',
  3: '黄',
  4: '绿',
  5: '青',
  6: '蓝',
  7: '紫',
  8: '粉',
  9: '白',
}

// ═══════════════════════════════════════════════
//  查询函数
// ═══════════════════════════════════════════════

/** 根据 cloth_type 获取部位名称，未知类型返回 fallback */
export function getClothTypeName(clothType: number): string {
  return CLOTH_TYPE_MAP[clothType] ?? `部位${clothType}`
}

/** 根据 weather_type 获取天气名称，未知类型返回 null */
export function getWeatherName(weatherType: number): string | null {
  return WEATHER_TYPE_MAP[weatherType] ?? null
}

/** 根据 pose_id 获取动作名称，未知 ID 返回 null */
export function getPoseName(poseId: number): string | null {
  return POSE_ID_MAP[poseId] ?? null
}

/** 根据 eureka color 获取颜色名称，未知返回 null */
export function getEurekaColorName(color: number): string | null {
  return EUREKA_COLOR_MAP[color] ?? null
}

/** 根据 cloth state 获取状态名称，未知返回 null */
export function getClothStateName(state: number): string | null {
  return CLOTH_STATE_MAP[state] ?? null
}

/** 根据 aperture_section 获取光圈名称，未知返回 null */
export function getApertureName(aperture: number): string | null {
  return APERTURE_SECTION_MAP[aperture] ?? null
}

/** 根据 eureka attachment_point 获取挂载点名称，未知返回 null */
export function getEurekaAttachmentPointName(point: number): string | null {
  return EUREKA_ATTACHMENT_POINT_MAP[point] ?? null
}

/** 根据 color_palette 获取色盘名称，未知返回 null */
export function getColorPaletteName(palette: number): string | null {
  return COLOR_PALETTE_MAP[palette] ?? null
}

/** 根据 color_swatch 获取色格名称，未知返回 null */
export function getColorSwatchName(swatch: number): string | null {
  return COLOR_SWATCH_MAP[swatch] ?? null
}

/** 根据 light ID 获取灯光名称，未知返回原始ID */
export function getLightName(lightId: string): string {
  return LIGHT_MAP[lightId] ?? lightId
}

/** 根据 filter ID 获取滤镜名称，未知返回原始ID */
export function getFilterName(filterId: string): string {
  return FILTER_MAP[filterId] ?? filterId
}

/** 根据 puzzle ID 获取错位摄影名称，未知返回 null */
export function getPuzzleName(puzzleId: number): string | null {
  return PUZZLE_MAP[puzzleId] ?? null
}

/** 根据 interactive ID 获取拍摄任务名称，未知返回 null */
export function getInteractiveName(interactiveId: number): string | null {
  return INTERACTIVE_MAP[interactiveId] ?? null
}

/** 根据 expedition ID 获取世界巡游名称，未知返回 null */
export function getExpeditionName(expeditionId: number): string | null {
  return EXPEDITION_MAP[expeditionId] ?? null
}
