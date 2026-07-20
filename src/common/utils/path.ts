/**
 * 通用路径字符串工具（纯字符串操作，不依赖 Node `path` 模块）
 *
 * 设计目标：渲染进程无法 import Node `path`，但需要简单的路径拆分/拼接。
 * 主进程优先用 Node `path`，仅在跨进程共享的纯字符串场景使用本模块。
 *
 * 使用方式：
 *   import { getDirName, joinPath, getExtName } from '@common/utils/path'
 *   getDirName('C:\\foo\\bar.txt')   // 'C:\\foo'
 *   joinPath('C:\\foo', 'bar.txt')   // 'C:\\foo\\bar.txt'
 *   getExtName('photo.JPG')          // '.jpg'
 */

/**
 * 从文件路径中提取目录部分
 *
 * 行为：兼容 Windows `\` 与 POSIX `/`，取最后一个分隔符之前的内容
 *
 * @param filePath 文件路径
 * @returns 目录部分；无分隔符时返回 ''
 */
export function getDirName(filePath: string): string {
  // 同时处理 \ 和 /，避免 Windows/POSIX 路径混用导致拆分错误
  const lastSep = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  if (lastSep === -1) return ''
  return filePath.substring(0, lastSep)
}

/**
 * 拼接目录与文件名（纯字符串）
 *
 * 行为：
 *   - 目录末尾已有分隔符时不重复添加
 *   - 自动选择与目录一致的分隔符（目录无分隔符时默认 `\`）
 *
 * @param dir 目录
 * @param name 文件名
 */
export function joinPath(dir: string, name: string): string {
  if (!dir) return name
  // 根据目录已有的分隔符选择，避免混用
  const sep = dir.includes('/') && !dir.includes('\\') ? '/' : '\\'
  return dir.endsWith(sep) ? `${dir}${name}` : `${dir}${sep}${name}`
}

/**
 * 从文件路径中提取扩展名（小写）
 *
 * 行为：
 *   - 返回小写，便于类型匹配（如 'photo.JPG' → '.jpg'）
 *   - 无扩展名时返回 ''
 *
 * @param filePath 文件路径
 */
export function getExtName(filePath: string): string {
  const baseName = filePath.split(/[\\/]/).pop() || ''
  const dotIdx = baseName.lastIndexOf('.')
  if (dotIdx <= 0) return '' // 无扩展名或以 . 开头的隐藏文件
  return baseName.substring(dotIdx).toLowerCase()
}

/**
 * 从文件路径中提取文件名（含扩展名）
 *
 * @param filePath 文件路径
 */
export function getBaseName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || ''
}
