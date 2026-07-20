import React from 'react'
import { ErrorFallback } from './ErrorFallback'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  componentStack?: string
}

/**
 * P0-2 / P0-4：全局 ErrorBoundary
 * 捕获子组件渲染过程中的同步异常，避免白屏
 * 注意：ErrorBoundary 无法捕获事件处理器、异步代码、setInterval 中的错误，
 * 这些由 window.onerror 和 window.addEventListener('unhandledrejection') 兜底
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const componentStack = info.componentStack || undefined
    this.setState({ componentStack })

    // 上报到主进程 faults 日志
    try {
      window.electronAPI?.log?.reportRendererError({
        message: error.message,
        stack: error.stack,
        componentStack,
        source: 'ErrorBoundary'
      })
    } catch {
      // IPC 不可用时无法上报，忽略
    }
  }

  handleRetry = (): void => {
    // 重置状态并重新加载页面，确保所有内部状态清空
    this.setState({ hasError: false, error: undefined, componentStack: undefined })
    // 强制刷新页面，避免缓存导致错误重复
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
          componentStack={this.state.componentStack}
        />
      )
    }
    return this.props.children
  }
}
