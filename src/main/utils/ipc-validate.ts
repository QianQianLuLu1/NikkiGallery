/**
 * IPC 参数校验工具
 * 解决 A-S9：原全部 IPC 处理器直接信任渲染进程参数，无任何校验
 * 提供：
 * - 路径白名单校验（仅允许已索引媒体或用户选择目录）
 * - 数值范围校验
 * - 数组长度上限校验
 * - 字符串长度/字符校验
 * P1-A5：新增路径遍历校验（.. 段检测）和系统敏感目录黑名单
 */
import path from 'path'
// P2-A3：引用 constants 常量替代硬编码数字
import {
  MAX_PATH_ARRAY_SIZE,
  MAX_MEDIA_ID_ARRAY_SIZE,
  MAX_TAG_NAME_LENGTH,
  MAX_FILE_PATH_LENGTH
} from './constants'

/**
 * P1-A5：系统敏感目录黑名单
 * 从 index.ts 迁移过来，统一在 ipc-validate.ts 维护
 * 用于 shell:openPath 和所有写操作 IPC 的安全校验
 */
export const SYSTEM_SENSITIVE_DIRS: readonly string[] = [
  'C:\\Windows\\System32',
  'C:\\Windows\\SysWOW64',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData'
]

/**
 * 校验文件路径数组：每个元素必须是绝对路径且长度合理
 * 防止注入异常路径或超大数组导致主进程卡死
 *
 * P1-A7：移除 hasPathTraversal 检查——path.resolve 会展开所有 .. 段，
 * 该函数对绝大多数输入恒返回 false，仅提供虚假安全感。
 * 写操作的路径安全由 validateNonSensitivePath 黑名单兜底。
 */
export function validateFilePathArray(
  filePaths: unknown,
  maxCount = MAX_PATH_ARRAY_SIZE
): { valid: boolean; message?: string } {
  if (!Array.isArray(filePaths)) {
    return { valid: false, message: '参数必须是字符串数组' }
  }
  if (filePaths.length === 0) {
    return { valid: false, message: '路径数组不能为空' }
  }
  if (filePaths.length > maxCount) {
    return { valid: false, message: `路径数量超过上限 ${maxCount}` }
  }
  for (const p of filePaths) {
    if (typeof p !== 'string' || p.length === 0 || p.length > MAX_FILE_PATH_LENGTH) {
      return { valid: false, message: `路径必须是 1-${MAX_FILE_PATH_LENGTH} 字符的字符串` }
    }
    if (!path.isAbsolute(p)) {
      return { valid: false, message: `路径必须是绝对路径: ${p}` }
    }
  }
  return { valid: true }
}

/**
 * 校验单个文件路径
 */
export function validateFilePath(filePath: unknown): { valid: boolean; message?: string } {
  if (
    typeof filePath !== 'string' ||
    filePath.length === 0 ||
    filePath.length > MAX_FILE_PATH_LENGTH
  ) {
    return { valid: false, message: `路径必须是 1-${MAX_FILE_PATH_LENGTH} 字符的字符串` }
  }
  if (!path.isAbsolute(filePath)) {
    return { valid: false, message: `路径必须是绝对路径: ${filePath}` }
  }
  return { valid: true }
}

/**
 * P1-A5：校验路径不在系统敏感目录内
 * 用于 shell:openPath 和所有写操作 IPC（file:copy/file:move/file:export 等）
 * 与 validateFilePath 配合使用：先校验路径合法，再校验非敏感
 */
export function validateNonSensitivePath(filePath: string): { valid: boolean; message?: string } {
  const normalized = path.resolve(filePath).toLowerCase()
  // P1-A8：精确目录边界检查，避免前缀误匹配（如 'C:\Program Filesabc' 不应被 'C:\Program Files' 误拦）
  if (
    SYSTEM_SENSITIVE_DIRS.some((d) => {
      const dl = d.toLowerCase()
      return normalized === dl || normalized.startsWith(dl + path.sep)
    })
  ) {
    return { valid: false, message: '出于安全考虑，不允许操作系统敏感目录' }
  }
  return { valid: true }
}

/**
 * 校验数值范围
 */
export function validateNumberRange(
  value: unknown,
  min: number,
  max: number,
  name = 'value'
): { valid: boolean; message?: string } {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { valid: false, message: `${name} 必须是有限数字` }
  }
  if (value < min || value > max) {
    return { valid: false, message: `${name} 必须在 ${min}-${max} 范围内` }
  }
  return { valid: true }
}

/**
 * 校验整数范围
 */
export function validateIntRange(
  value: unknown,
  min: number,
  max: number,
  name = 'value'
): { valid: boolean; message?: string } {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { valid: false, message: `${name} 必须是整数` }
  }
  if (value < min || value > max) {
    return { valid: false, message: `${name} 必须在 ${min}-${max} 范围内` }
  }
  return { valid: true }
}

/**
 * 校验字符串长度
 */
export function validateStringLength(
  value: unknown,
  max = MAX_FILE_PATH_LENGTH,
  name = 'string'
): { valid: boolean; message?: string } {
  if (typeof value !== 'string') {
    return { valid: false, message: `${name} 必须是字符串` }
  }
  if (value.length === 0 || value.length > max) {
    return { valid: false, message: `${name} 长度必须在 1-${max} 之间` }
  }
  return { valid: true }
}

/**
 * 校验 mediaId（正整数）
 */
export function validateMediaId(mediaId: unknown): { valid: boolean; message?: string } {
  return validateIntRange(mediaId, 1, Number.MAX_SAFE_INTEGER, 'mediaId')
}

/**
 * 校验 mediaId 数组
 */
export function validateMediaIdArray(
  mediaIds: unknown,
  maxCount = MAX_MEDIA_ID_ARRAY_SIZE
): { valid: boolean; message?: string } {
  if (!Array.isArray(mediaIds)) {
    return { valid: false, message: 'mediaIds 必须是数组' }
  }
  if (mediaIds.length === 0) {
    return { valid: false, message: 'mediaIds 不能为空' }
  }
  if (mediaIds.length > maxCount) {
    return { valid: false, message: `mediaIds 数量超过上限 ${maxCount}` }
  }
  for (const id of mediaIds) {
    const r = validateMediaId(id)
    if (!r.valid) return r
  }
  return { valid: true }
}

/**
 * 校验标签名：禁止控制字符、过长字符串
 */
export function validateTagName(tagName: unknown): { valid: boolean; message?: string } {
  if (typeof tagName !== 'string') {
    return { valid: false, message: '标签名必须是字符串' }
  }
  if (tagName.length === 0 || tagName.length > MAX_TAG_NAME_LENGTH) {
    return { valid: false, message: `标签名长度必须在 1-${MAX_TAG_NAME_LENGTH} 之间` }
  }
  // 禁止控制字符
  if (/[\x00-\x1f\x7f]/.test(tagName)) {
    return { valid: false, message: '标签名包含非法控制字符' }
  }
  return { valid: true }
}

/**
 * 校验 URL：仅允许 http/https
 */
export function validateHttpUrl(url: unknown): { valid: boolean; message?: string } {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
    return { valid: false, message: 'URL 长度必须在 1-2048 之间' }
  }
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, message: `不允许的协议: ${parsed.protocol}` }
    }
    return { valid: true }
  } catch {
    return { valid: false, message: '无效的 URL' }
  }
}

/**
 * P1-N：从 index.ts 迁移过来的滤镜预设结构校验
 * 校验导入的 JSON 是否符合 FilterPreset 结构
 */
export function validateFilterPreset(preset: unknown): { valid: boolean; message?: string } {
  if (typeof preset !== 'object' || preset === null) {
    return { valid: false, message: '预设格式无效，应为 JSON 对象' }
  }
  const p = preset as Record<string, unknown>
  if (typeof p.name !== 'string' || p.name.trim() === '') {
    return { valid: false, message: '缺少有效的 name 字段' }
  }
  if (typeof p.category !== 'string' || p.category.trim() === '') {
    return { valid: false, message: '缺少有效的 category 字段' }
  }
  if (typeof p.params !== 'object' || p.params === null) {
    return { valid: false, message: '缺少有效的 params 对象' }
  }
  return { valid: true }
}
