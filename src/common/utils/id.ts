/**
 * 通用 ID 生成工具
 *
 * 设计目标：消除 4+ 处内联的 `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` 模式，
 * 该模式在 operationHistoryStore / index.ts / task-scheduler / useToast 中各自实现且前缀不一致。
 *
 * 使用方式：
 *   import { generateId } from '@common/utils/id'
 *   generateId()              // 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
 *   generateId('toast')      // 'toast-1718000000000-a1b2c3d4'
 *   generateId('low')        // 'low-1718000000000-a1b2c3d4'
 */

/**
 * 生成唯一 ID
 *
 * 行为：
 *   - 优先使用 crypto.randomUUID()（Node 14.17+ 与现代浏览器均支持）
 *   - 兜底回退到 `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
 *   - 传入 prefix 时，格式为 `${prefix}-${timestamp}-${rand}`（兼容 toast-/low- 等历史场景）
 *
 * @param prefix 可选前缀，用于区分 ID 来源（如 'toast'、'low'、'task'）
 */
export function generateId(prefix?: string): string {
  if (prefix) {
    const rand = Math.random().toString(36).slice(2, 8)
    return `${prefix}-${Date.now()}-${rand}`
  }

  // 优先用原生 UUID（更随机，无碰撞风险）
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // 兜底：浏览器/老 Node 无 randomUUID 时
  const rand = Math.random().toString(36).slice(2, 8)
  return `${Date.now()}-${rand}`
}
