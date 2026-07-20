/**
 * 通用格式化工具：文件大小、数字等
 *
 * 设计目标：主进程与渲染进程共享同一份实现，消除 backup-service / share-wifi-service /
 * renderer/utils/format.ts 三套并存格式化逻辑的不一致（如 TB 级返回 undefined）。
 *
 * 使用方式：
 *   import { formatSize } from '@common/utils/format'
 *   formatSize(1024)          // '1.00 KB'
 *   formatSize(0)             // '0 B'
 *   formatSize(NaN)           // '0 B'（健壮性：非有限数返回 '0 B'）
 */

/**
 * 将字节数格式化为人类可读字符串
 *
 * 行为：
 *   - 非 finite 或 <= 0 → '0 B'
 *   - 自动在 B/KB/MB/GB/TB 中选择最合适单位（1024 进制）
 *   - B 整数显示无小数；KB 起保留 2 位小数
 *
 * @param bytes 字节数
 * @param decimals 小数位数，默认 2（仅 KB 及以上生效）
 */
export function formatSize(bytes: number, decimals = 2): string {
  // 外部输入（用户/文件系统/API）可能传入 NaN/Infinity/负数，必须兜底
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  // B 档显示整数，其他档显示指定小数位
  const formatted = i === 0 ? Math.round(value).toString() : value.toFixed(decimals)
  return `${formatted} ${units[i]}`
}

/**
 * formatSize 的语义别名（保留与现有 renderer/utils/format.ts 同名导出，便于迁移）
 * 新代码建议直接使用 formatSize。
 */
export function formatFileSize(bytes: number, decimals = 2): string {
  return formatSize(bytes, decimals)
}
