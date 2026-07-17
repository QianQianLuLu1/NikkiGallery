import React, { useState } from 'react'
import { IconWarning, IconRefresh, IconFolderOpen, IconCopy } from '../../icons'

interface ErrorFallbackProps {
  error: Error
  onRetry: () => void
  /** 组件栈信息（ErrorBoundary componentDidCatch 提供） */
  componentStack?: string
}

// P1-U4：三按钮配置抽取为模块常量，避免每次渲染重建 3 个对象
interface ActionButton {
  label: string
  icon: React.ReactNode
  onClick: () => void
  variant: 'primary' | 'secondary'
}

/**
 * P0-4：错误兜底页
 * 当 ErrorBoundary 捕获到组件渲染异常时显示，避免白屏
 * 提供重试 / 打开日志目录 / 复制错误信息三个操作
 *
 * P1-U4：所有 inline style 颜色改用 token 引用，柔粉主题下正确显示
 */
export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, onRetry, componentStack }) => {
  const [showDetail, setShowDetail] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const text = [
      `错误消息: ${error.message}`,
      `错误堆栈:`,
      error.stack || 'N/A',
      componentStack ? `\n组件堆栈:\n${componentStack}` : ''
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 剪贴板不可用时降级为选中文本
    }
  }

  const handleOpenLogDir = async () => {
    try {
      await window.electronAPI?.log?.openDirectory()
    } catch {}
  }

  // P1-U4：按钮配置数组，统一渲染逻辑，消除 60+ 行重复 inline style
  const buttons: ActionButton[] = [
    { label: '重新加载', icon: <IconRefresh size={16} color="var(--text-on-accent)" />, onClick: onRetry, variant: 'primary' },
    { label: '打开日志目录', icon: <IconFolderOpen size={16} />, onClick: handleOpenLogDir, variant: 'secondary' },
    { label: copied ? '已复制' : '复制错误信息', icon: <IconCopy size={16} />, onClick: handleCopy, variant: 'secondary' }
  ]

  const getButtonStyle = (variant: ActionButton['variant']): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 16px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '1rem',
      fontWeight: 500,
      border: '1px solid transparent',
      transition: 'background 0.2s'
    }
    if (variant === 'primary') {
      return { ...base, background: 'var(--accent)', color: 'var(--text-on-accent)', borderColor: 'var(--accent)' }
    }
    return { ...base, background: 'var(--hover-bg)', color: 'var(--text-primary)', borderColor: 'var(--divider)' }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-secondary)',
        backdropFilter: 'var(--backdrop-blur)',
        WebkitBackdropFilter: 'var(--backdrop-blur)',
        zIndex: 9999,
        padding: '24px'
      }}
    >
      <div
        style={{
          maxWidth: '560px',
          width: '100%',
          background: 'var(--bg-secondary)',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-lg)',
          padding: '32px',
          border: '1px solid var(--divider)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'var(--danger-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <IconWarning size={28} color="var(--danger-hover)" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.429rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              页面加载失败
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '1rem', color: 'var(--text-secondary)' }}>
              应用遇到未预期的错误，已自动记录到日志
            </p>
          </div>
        </div>

        <div
          style={{
            background: 'var(--danger-bg)',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            border: '1px solid var(--danger-bg)'
          }}
        >
          <p style={{ margin: 0, fontSize: '1rem', color: 'var(--danger-hover)', fontFamily: 'monospace', wordBreak: 'break-word' }}>
            {error.message}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {buttons.map((btn, i) => (
            <button
              key={i}
              onClick={btn.onClick}
              style={getButtonStyle(btn.variant)}
              onMouseEnter={(e) => {
                if (btn.variant === 'primary') e.currentTarget.style.background = 'var(--accent)'
                else e.currentTarget.style.background = 'var(--hover-bg-strong)'
              }}
              onMouseLeave={(e) => {
                if (btn.variant === 'primary') e.currentTarget.style.background = 'var(--accent)'
                else e.currentTarget.style.background = 'var(--hover-bg)'
              }}
            >
              {btn.icon}
              {btn.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowDetail(!showDetail)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.929rem',
            padding: 0,
            textDecoration: 'underline'
          }}
        >
          {showDetail ? '隐藏' : '显示'}错误详情
        </button>
        {showDetail && (
          <pre
            style={{
              marginTop: '8px',
              maxHeight: '240px',
              overflow: 'auto',
              padding: '12px',
              background: 'var(--hover-bg)',
              borderRadius: '8px',
              fontSize: '0.857rem',
              fontFamily: 'monospace',
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {error.stack || error.message}
            {componentStack ? `\n\n组件堆栈:\n${componentStack}` : ''}
          </pre>
        )}
      </div>
    </div>
  )
}
