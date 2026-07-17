import React, { useContext, createContext } from 'react'
import { useToast, type ToastType, type ToastMessage } from '../../hooks/useToast'
import { Toast } from '../../components/common/Toast'
// P1-I：formatSize/formatTimestamp 统一到 utils，shared 仅作 re-export 保持外部接口不变
import { formatSize } from '../../utils/format'
import { formatTimestamp } from '../../utils/date'
// P1-U6：FAULT_TYPE_META 与 FaultType 抽取到 utils/fault-colors.ts，此处 re-export 保持外部接口不变
import { FAULT_TYPE_META, type FaultType } from '../../utils/fault-colors'

export { formatSize, formatTimestamp, FAULT_TYPE_META, type FaultType }

// ============ 全局 Toast Context ============
// P0-3：从 SettingsToastProvider 提升为 GlobalToastProvider，覆盖所有页面
// U6：内部 Context 同步重命名为 GlobalToastContext，与 Provider/Hook 语义一致
// 所有页面共享同一个 Toast 实例，避免每个页面各自渲染 Toast
type ShowMessageFn = (text: string, type?: ToastType, action?: ToastMessage['action']) => void
const GlobalToastContext = createContext<ShowMessageFn>(() => {})

/**
 * 全局 Toast Provider（P0-3 改进，原 SettingsToastProvider）
 * 应在 App.tsx 根节点包裹，让 Gallery / Detail / Editor / Categories / RecycleBin / Duplicates 等所有页面都能使用 Toast
 */
export const GlobalToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { messages, showMessage, dismiss } = useToast()
  return (
    <GlobalToastContext.Provider value={showMessage}>
      {children}
      <Toast messages={messages} onDismiss={dismiss} />
    </GlobalToastContext.Provider>
  )
}

/** 全局 Toast Hook，任意页面可调用获取 showMessage */
export function useGlobalToast(): ShowMessageFn {
  return useContext(GlobalToastContext)
}

// 暴露内部 Context 供同目录 Section 组件直接消费（避免重复创建 Context）
export { GlobalToastContext }

// ============ 共享类型与工具 ============

export interface FaultRecord {
  id: string
  timestamp: string
  type: FaultType
  summary: string
  detail: string
  context?: Record<string, unknown>
  file: string
  // P0-1 新增环境信息字段（旧日志可能缺失，UI 兜底显示"未知"）
  appVersion?: string
  electronVersion?: string
  nodeVersion?: string
  platform?: string
  osVersion?: string
  pid?: number
  uptime?: number
}

// T01：数据库备份记录（与主进程 BackupRecord 接口保持一致）
export interface BackupRecord {
  filename: string
  filePath: string
  size: number
  createdAt: string
}

// T13：崩溃 dump 文件元信息（与主进程 CrashRecord 接口保持一致）
// P2-1：新增 crashReason / topFrame 字段
export interface CrashRecord {
  filename: string
  filePath: string
  size: number
  mtime: string
  processType: string
  crashReason?: string
  topFrame?: string
}

// 三级页面容器：统一标题 + 内容区
export const SectionShell: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <div className="glass-card p-5 space-y-4">
    <div>
      <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{title}</h3>
      {description && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{description}</p>}
    </div>
    {children}
  </div>
)
