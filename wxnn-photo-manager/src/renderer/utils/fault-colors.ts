/**
 * P1-U6：故障类型颜色与元信息常量
 * 从 pages/settings/shared.tsx 抽取，便于崩溃诊断相关组件共享。
 *
 * 颜色策略：
 * - uncaughtException / rendererComponent 复用主题语义色 var(--danger-hover)/var(--danger-bg)，
 *   随主题切换自动适配。
 * - 其他故障类型使用固定识别色（橙/紫/黄/蓝/灰/青/深灰），
 *   作为故障分类的视觉编码，不随主题变化（类似交通信号灯的红黄绿）。
 */
export type FaultType =
  | 'uncaughtException'
  | 'unhandledRejection'
  | 'rendererCrash'
  | 'rendererError'
  | 'ipcError'
  | 'manual'
  | 'rendererComponent'
  | 'rendererPromise'
  | 'rendererResource'
  | 'exitDiagnosis'

export interface FaultMeta {
  label: string
  color: string
  bg: string
}

export const FAULT_TYPE_META: Record<FaultType, FaultMeta> = {
  uncaughtException: { label: '主进程异常', color: 'var(--danger-hover)', bg: 'var(--danger-bg)' },
  unhandledRejection: { label: 'Promise 未处理', color: '#ea580c', bg: 'rgba(234, 88, 12, 0.12)' },
  rendererCrash: { label: '渲染进程崩溃', color: '#9333ea', bg: 'rgba(147, 51, 234, 0.12)' },
  rendererError: { label: '渲染层错误', color: '#ca8a04', bg: 'rgba(202, 138, 4, 0.12)' },
  ipcError: { label: 'IPC 处理错误', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.12)' },
  manual: { label: '手动记录', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.12)' },
  rendererComponent: { label: '组件渲染异常', color: 'var(--danger-hover)', bg: 'var(--danger-bg)' },
  rendererPromise: { label: '渲染层 Promise', color: '#ea580c', bg: 'rgba(234, 88, 12, 0.12)' },
  rendererResource: { label: '资源加载失败', color: '#0891b2', bg: 'rgba(8, 145, 178, 0.12)' },
  exitDiagnosis: { label: '退出诊断', color: '#475569', bg: 'rgba(71, 85, 105, 0.12)' }
}
