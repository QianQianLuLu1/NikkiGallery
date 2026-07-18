/**
 * 通用日期/时间格式化工具
 *
 * 设计目标：消除 backup-service / file-service / generate-dataset 中的 YYYYMMDD_HHMMSS 重复实现，
 * 以及 VideoPlayer / VideoEditor 中的 formatTime 重复实现，统一参数类型为 Date | string | number。
 *
 * 使用方式：
 *   import { formatDate, formatCompactTimestamp, formatDuration } from '@common/utils/date'
 *   formatDate('2026-07-18T10:30:00Z')         // '2026-07-18'（按本地时区）
 *   formatCompactTimestamp(new Date())         // '20260718_103000'
 *   formatDuration(95)                        // '1:35'
 *   formatDuration(95, { withDecimal: true }) // '01:35.0'
 */

import { pad } from './string'

/**
 * 统一将任意输入转为 Date 对象
 * 内部辅助函数，避免每个格式化函数重复处理类型转换
 */
function toDate(input: Date | string | number): Date | null {
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input
  if (typeof input === 'number' || typeof input === 'string') {
    const d = new Date(input)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * 格式化为 YYYY-MM-DD（本地时区）
 *
 * @param input Date 对象 / ISO 字符串 / 时间戳
 * @returns 'YYYY-MM-DD' 格式字符串；输入无效时返回原字符串
 */
export function formatDate(input: Date | string | number): string {
  const d = toDate(input)
  if (!d) return typeof input === 'string' ? input : ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 格式化为本地化字符串（zh-CN）
 *
 * @param input Date 对象 / ISO 字符串 / 时间戳
 */
export function formatDateTime(input: Date | string | number): string {
  const d = toDate(input)
  if (!d) return typeof input === 'string' ? input : ''
  return d.toLocaleString('zh-CN')
}

/**
 * 格式化为完整时间戳 YYYY-MM-DD HH:MM:SS（本地时区）
 * 用于日志、故障记录等需要精确到秒的场景
 *
 * @param input Date 对象 / ISO 字符串 / 时间戳
 */
export function formatTimestamp(input: Date | string | number): string {
  const d = toDate(input)
  if (!d) return typeof input === 'string' ? input : ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * 格式化为紧凑时间戳 YYYYMMDD_HHMMSS（用于文件名、备份标识）
 * 用于 backup-service / file-service 等场景
 *
 * @param input Date 对象 / ISO 字符串 / 时间戳，默认当前时间
 */
export function formatCompactTimestamp(input: Date | string | number = new Date()): string {
  const d = toDate(input)
  if (!d) return ''
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/**
 * 格式化日期，输入为空时返回兜底字符串
 * 用于 DuplicatesPage / RecycleBinPage 等"可能无删除时间"的场景
 *
 * @param input 可空输入
 * @param fallback 输入为 null/undefined/空字符串时的兜底，默认 '—'
 */
export function formatDateOrDash(
  input: Date | string | number | null | undefined,
  fallback = '—'
): string {
  if (input === null || input === undefined || input === '') return fallback
  return formatDateTime(input)
}

/**
 * 格式化秒数为时长字符串
 * 用于 VideoPlayer / VideoEditor 的播放进度显示
 *
 * @param seconds 秒数
 * @param options.withDecimal 是否包含 1 位小数，默认 false
 *   - false: '1:35'（m:ss，超过 1 小时显示 H:MM:SS）
 *   - true:  '01:35.0'（mm:ss.s，固定 2 位分钟）
 */
export function formatDuration(seconds: number, options: { withDecimal?: boolean } = {}): string {
  const { withDecimal = false } = options

  // 外部输入可能为 NaN/Infinity（如视频未加载完时 duration=NaN）
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0

  if (withDecimal) {
    // mm:ss.s 格式（VideoEditor 风格）
    const totalSec = Math.floor(seconds)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    const tenths = Math.floor((seconds - totalSec) * 10)
    return `${pad(min)}:${pad(sec)}.${tenths}`
  }

  // m:ss 或 H:MM:SS 格式（VideoPlayer 风格）
  const totalSec = Math.floor(seconds)
  const hours = Math.floor(totalSec / 3600)
  const min = Math.floor((totalSec % 3600) / 60)
  const sec = totalSec % 60
  if (hours > 0) {
    return `${hours}:${pad(min)}:${pad(sec)}`
  }
  return `${min}:${pad(sec)}`
}
