/**
 * 通用工具函数入口（src/common/utils/）
 *
 * 设计目标：主进程与渲染进程共享同一份纯函数实现，消除跨进程重复代码。
 * 所有函数均为纯函数（无副作用、不依赖 Node API / Electron API / DOM）。
 *
 * 导入约定：
 *   - 主进程：`import { formatSize } from '@common/utils'`
 *   - 渲染进程：`import { formatSize } from '@common/utils'`
 *   - 测试：`import { formatSize } from '@common/utils'`
 *
 * 添加新工具时：
 *   1. 在子文件中实现（如 `xxx.ts`），保持函数纯度
 *   2. 在本文件 re-export
 *   3. 更新 docs/AI开发规范.md 中的"公共工具清单"
 */

export * from './format'
export * from './id'
export * from './object'
export * from './string'
export * from './date'
export * from './path'
