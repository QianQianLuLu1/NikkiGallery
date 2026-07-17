/**
 * 媒体文件扩展名与 MIME 类型统一常量
 *
 * 解决 C-G1/C-O1：原先 scanner/index.ts、main/index.ts、thumbnail/generator.ts、
 * file-service.ts、watermark-service.ts 各自硬编码扩展名集合与 MIME 映射，
 * 集合内容存在差异（如 .tif vs .tiff、是否含 gif），且修改时容易遗漏。
 *
 * 本模块作为单一权威来源，所有媒体类型判定均应引用此处常量。
 */

/** 图片扩展名集合（含点号前缀，全小写） */
export const IMAGE_EXTENSIONS = new Set<string>([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif'
])

/** 视频扩展名集合（含点号前缀，全小写） */
export const VIDEO_EXTENSIONS = new Set<string>([
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv'
])

/** 全部媒体扩展名集合（图片 + 视频），用于路径白名单二次校验 */
export const MEDIA_EXTENSIONS = new Set<string>([
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS
])

/**
 * 视频导出格式白名单（无点号前缀）
 * 注意：导出格式与源文件可读格式不同——导出支持 gif（动图），但不支持 mkv/wmv（编码器限制）
 */
export const VIDEO_EXPORT_FORMATS = ['mp4', 'webm', 'gif', 'avi', 'mov'] as const

/** 扩展名（含点号）→ MIME 类型映射表 */
const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.wmv': 'video/x-ms-wmv'
}

/** MIME 类型 → 扩展名（无点号）映射表 */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv',
  'video/webm': 'webm',
  'video/x-ms-wmv': 'wmv'
}

/**
 * 根据扩展名（含点号，大小写不敏感）获取 MIME 类型
 * @param ext 扩展名，如 '.jpg'、'.MP4'
 * @returns MIME 类型，未知返回 'application/octet-stream'
 */
export function getMimeType(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] || 'application/octet-stream'
}

/**
 * 根据 MIME 类型获取扩展名（无点号）
 * @param mimeType MIME 类型，如 'image/jpeg'
 * @returns 扩展名（无点号），未知返回 'jpg'
 */
export function getExtFromMime(mimeType: string): string {
  return MIME_TO_EXT[mimeType] || 'jpg'
}

/** 判断扩展名（含点号）是否为图片 */
export function isImageExt(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext.toLowerCase())
}

/** 判断扩展名（含点号）是否为视频 */
export function isVideoExt(ext: string): boolean {
  return VIDEO_EXTENSIONS.has(ext.toLowerCase())
}

/** 判断扩展名（含点号）是否为受支持的媒体格式 */
export function isMediaExt(ext: string): boolean {
  return MEDIA_EXTENSIONS.has(ext.toLowerCase())
}

/**
 * P0-03：游戏相册类型映射（对齐 RanAxro/nikki_albums 的 22 个相册文件夹）
 *
 * 与对标项目 Nikki Albums 的固定 19+3 相册类型不同，本映射仅作为
 * 智能分组的"游戏相册类型"维度，未匹配的文件夹归入"其他"类型，
 * 配合其他 5 个维度（场景/时段/套装/文件类型/自定义）实现动态分组。
 *
 * 键：文件夹名小写（不区分大小写匹配）
 * 值：中文显示标签
 */
export const ALBUM_TYPE_MAP: Record<string, string> = {
  // ===== 游戏内主要相册文件夹（对齐 RanAxro albumsInfoMap） =====
  screenshot: '游戏截图',
  nikkiphotos_highquality: '高质量照片',
  nikkiphotos_lowquality: '低质量照片',
  videos: '游戏视频',
  magazinephotos: '杂志照',
  clockinphoto: '打卡照',
  cloudphotos: '云照片',
  cloudphotos_lowquality: '低质量云照片',
  // 拼图相册（RanAxro 实际路径是 Collage\CollagePhoto，父目录 Collage 作为签名）
  collage: '拼图',
  highquality: '高质量拼图',
  lowquality: '低质量拼图',
  collagephoto: '拼图照片',
  // 其他游戏内相册（对齐 RanAxro）
  customavatar: '自定义头像',
  customcard: '自定义名片',
  customhomeboardphoto: '主页照片',
  hometemplate: '主页模板',
  plantdyeing: '植物染色',
  diy: 'DIY',
  xsdkqrcode: '二维码',
  mallpic: '商城图',
  // 外部视频与游戏资源
  video: '外部视频',
  movies: '游戏视频资源',
  // ===== 拍照模式扩展类型（覆盖游戏可能的其他相册目录） =====
  profilephoto: '个人照',
  posephoto: '姿势照',
  groupphoto: '合影',
  storyphoto: '故事照',
  landscapephoto: '风景照',
  selfiephoto: '自拍',
  autophoto: '自动拍照',
  photostudio: '摄影棚',
  photoframe: '相框照',
  adventurephoto: '冒险照',
  diaryphoto: '日记照',
  activityphoto: '活动照',
  eventphoto: '事件照',
  festivalphoto: '节日照',
  missionphoto: '任务照',
  videoclip: '视频剪辑',
  custom: '自定义'
}

/** 未匹配 ALBUM_TYPE_MAP 时的兜底标签 */
export const ALBUM_TYPE_UNKNOWN = '其他'

/**
 * 根据文件父文件夹名获取相册类型标签
 * @param parentDirName 文件所在目录名（不区分大小写）
 * @returns 中文相册类型标签，未匹配返回 '其他'
 */
export function getAlbumTypeFromDirName(parentDirName: string): string {
  return ALBUM_TYPE_MAP[parentDirName.toLowerCase()] || ALBUM_TYPE_UNKNOWN
}
