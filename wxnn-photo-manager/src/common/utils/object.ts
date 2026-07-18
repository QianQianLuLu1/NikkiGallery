/**
 * 通用对象工具：深拷贝等
 *
 * 设计目标：消除 FilterPanel / useEditHistory / filter.ts 中 4 处
 * `JSON.parse(JSON.stringify(...))` 重复模式。该模式对 Date/Map/Set 等会丢失类型信息。
 *
 * 使用方式：
 *   import { deepClone } from '@common/utils/object'
 *   const copy = deepClone(original)
 */

/**
 * 深拷贝一个值
 *
 * 行为：
 *   - 优先使用 structuredClone（Node 17+ 与现代浏览器原生支持，正确处理 Date/Map/Set/循环引用）
 *   - 兜底回退到 JSON.parse(JSON.stringify())（仅适合纯 JSON 数据）
 *
 * @param value 待克隆的值，任意类型
 */
export function deepClone<T>(value: T): T {
  // 优先用原生 structuredClone：处理 Date/Map/Set/ArrayBuffer/循环引用
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      // structuredClone 对函数、Symbol、WeakMap 等会抛错，回退到 JSON 方案
    }
  }

  // 兜底：JSON 方案（仅适合纯 JSON 数据，丢失 Date/Map 等类型信息）
  return JSON.parse(JSON.stringify(value)) as T
}
