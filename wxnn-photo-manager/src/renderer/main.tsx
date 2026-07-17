import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { installGlobalErrorHandler } from './utils/global-error-handler'
import './styles/globals.css'
// P2-01：i18n 初始化（必须在 React 渲染前执行，初始化后 i18n 实例即可用）
import './i18n'

// P0-2：在 React 渲染之前安装全局错误监听器，捕获 window.onerror 和 unhandledrejection
installGlobalErrorHandler()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* P0-4：全局 ErrorBoundary 捕获组件渲染异常，避免白屏 */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
