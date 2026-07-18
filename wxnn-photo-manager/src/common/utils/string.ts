/**
 * 通用字符串工具
 *
 * 设计目标：消除 6+ 处内联的 `const pad = (n: number) => String(n).padStart(2, '0')` 重复模式，
 * 该模式散落在 date.ts / backup-service / file-service / BatchRenameDialog / generate-dataset 中。
 *
 * 使用方式：
 *   import { pad } from '@common/utils/string'
 *   pad(5)              // '05'
 *   pad(123, 4)         // '0123'
 */

/**
 * 数字左侧补零到指定长度
 *
 * 行为：
 *   - 默认长度 2（用于月/日/时/分/秒）
 *   - 数字长度超过 len 时原样返回（不截断）
 *
 * @param n 待补零的数字
 * @param len 目标最小长度，默认 2
 */
export function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0')
}

/**
 * 截断字符串到指定长度，超出部分用省略号替换
 *
 * 行为：
 *   - 字符串长度 <= maxLen 时原样返回
 *   - 超出时保留前 (maxLen - 1) 字符 + '…'
 *
 * @param s 原字符串
 * @param maxLen 最大长度（含省略号），默认 20
 */
export function truncate(s: string, maxLen = 20): string {
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 1) + '…'
}
