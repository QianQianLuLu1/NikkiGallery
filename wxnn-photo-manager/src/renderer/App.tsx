import React, { useEffect, useState, useCallback } from 'react'
import { AppShell } from './components/layout/AppShell'
import { FullscreenViewer } from './components/gallery/FullscreenViewer'
import { GalleryPage } from './pages/GalleryPage'
import { DetailPage } from './pages/DetailPage'
import { EditorPage } from './pages/EditorPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { SettingsPage } from './pages/SettingsPage'
import { RecycleBinPage } from './pages/RecycleBinPage'
import { DuplicatesPage } from './pages/DuplicatesPage'
import { useUIStore, type ViewLevel } from './stores/uiStore'
import { useThemeStore, applyThemeClass } from './stores/themeStore'
import { type UITheme } from './styles/themes'
import { useRefreshMedia } from './hooks/useRefreshMedia'
import { useFilteredMediaFiles } from './hooks/useFilteredMediaFiles'
import { useGlobalUndo } from './hooks/useGlobalUndo'
import { useOperationHistoryStore } from './stores/operationHistoryStore'
// P1-F5：注册操作历史数据库写入失败回调，在 React 树内桥接到 Toast
import {
  addOperationHistoryErrorHandler,
  removeOperationHistoryErrorHandler
} from './stores/operationHistoryStore'
// P0-3：全局 Toast Provider，覆盖所有页面（不仅限设置页）
import { GlobalToastProvider, useGlobalToast } from './pages/settings/sections'

// 修复 U-S2：原 PageTransition 使用 key={currentView} 强制重挂载，
// 导致视图切换丢失滚动位置与组件内部状态、重复触发 loadMediaFromDatabase。
// 改为 keep-alive 模式：已访问过的页面保持挂载，仅用 display:none 隐藏非活动页面。
const ALL_VIEWS: ViewLevel[] = [
  'gallery',
  'detail',
  'editor',
  'categories',
  'settings',
  'recycle-bin',
  'favorites',
  'duplicates',
  'launcher-cache'
]

// C 阶段：界面层级映射，用于毛玻璃分层应用
// 一级界面不强化毛玻璃，二/三/四级界面逐级降低不透明度让模糊更可见
const VIEW_LEVEL_MAP: Record<ViewLevel, number> = {
  gallery: 1,
  categories: 1,
  settings: 1,
  'recycle-bin': 1,
  favorites: 1,
  duplicates: 1,
  'launcher-cache': 1,
  detail: 2,
  editor: 3
}

/**
 * P1-F5：操作历史数据库错误桥接组件
 * 在 GlobalToastProvider 内部渲染（不输出 DOM），将 store 的错误回调注册到 Toast
 * zustand store 在 React 树外无法调用 useGlobalToast，通过此桥接组件注入
 */
const OperationHistoryErrorBridge: React.FC = () => {
  const showMessage = useGlobalToast()
  useEffect(() => {
    // P1-U8：使用 add/remove 订阅模式，支持多订阅者
    const handler = (msg: string) => showMessage(msg, 'error')
    addOperationHistoryErrorHandler(handler)
    return () => removeOperationHistoryErrorHandler(handler)
  }, [showMessage])
  return null
}

const App: React.FC = () => {
  const currentView = useUIStore((state) => state.currentView)
  const refreshMedia = useRefreshMedia()
  const theme = useThemeStore((state) => state.theme)
  // C-O5：在 App 顶层计算一次 filteredFiles 并传给 FullscreenViewer
  // （hook 内部有 module-level 缓存，GalleryPage/DetailPage 各自调用时不会重复计算）
  const filteredFiles = useFilteredMediaFiles()
  // F-S8：注册全局撤销快捷键（Ctrl+Z / Cmd+Z）
  useGlobalUndo()

  // 建议改#9：应用启动时从数据库加载操作历史，支持跨重启撤销
  useEffect(() => {
    void useOperationHistoryStore.getState().loadFromDatabase()
  }, [])

  // 跟踪已访问过的视图，未访问的视图不挂载（避免 EditorPage 等在启动时空挂载）
  const [visitedViews, setVisitedViews] = useState<Set<ViewLevel>>(new Set([currentView]))
  useEffect(() => {
    setVisitedViews((prev) => {
      if (prev.has(currentView)) return prev
      const next = new Set(prev)
      next.add(currentView)
      return next
    })
  }, [currentView])

  // P2-U14：动画结束后移除 page-enter 类，释放 will-change 和 transform 残留
  // 否则合成层持续存在，破坏子元素 backdrop-filter 的实时采样，导致"动画结束后依然模糊"
  // 改用 onAnimationEnd 替代 setTimeout(280ms)，避免动画时长调整时需同步修改定时器
  const [enteringView, setEnteringView] = useState<ViewLevel | null>(null)
  useEffect(() => {
    setEnteringView(currentView)
  }, [currentView])

  useEffect(() => {
    refreshMedia()
  }, [refreshMedia])

  // 启动时应用持久化的主题类，防止 SSR/FOUC 后样式闪烁
  useEffect(() => {
    applyThemeClass(theme)
  }, [theme])

  // 启动时应用字体与显示偏好（字号、紧凑模式、动效减弱）
  useEffect(() => {
    const applyDisplayPrefs = async () => {
      if (!window.electronAPI?.settings?.get) return
      try {
        const html = document.documentElement
        // 字号
        const size = (await window.electronAPI.settings.get('display.fontSize', 'normal')) as string
        html.classList.remove(
          'font-size-small',
          'font-size-normal',
          'font-size-large',
          'font-size-xlarge'
        )
        html.classList.add(`font-size-${size || 'normal'}`)
        // 紧凑模式
        const compact = (await window.electronAPI.settings.get(
          'display.compactMode',
          false
        )) as boolean
        html.classList.toggle('compact-mode', compact)
        // 动效减弱
        const motion = (await window.electronAPI.settings.get(
          'display.reduceMotion',
          false
        )) as boolean
        html.classList.toggle('reduce-motion', motion)
      } catch {
        // 预览版无 IPC，静默忽略
      }
    }
    applyDisplayPrefs()
  }, [])

  // 与主进程设置保持同步（设置数据库为最终持久化源）
  useEffect(() => {
    const sync = async () => {
      if (!window.electronAPI?.uiTheme?.get) return
      try {
        const res = await window.electronAPI.uiTheme.get()
        const remoteTheme = (res.theme as UITheme) || 'default'
        if (remoteTheme !== theme) {
          useThemeStore.getState().setTheme(remoteTheme)
        }
      } catch {
        // 预览版无 IPC，静默忽略
      }
    }
    sync()
  }, [])

  const renderView = useCallback((view: ViewLevel): React.ReactNode => {
    switch (view) {
      case 'gallery':
        return <GalleryPage />
      case 'detail':
        return <DetailPage />
      case 'editor':
        return <EditorPage />
      case 'categories':
        return <CategoriesPage />
      case 'settings':
        return <SettingsPage />
      case 'recycle-bin':
        return <RecycleBinPage />
      case 'favorites':
        // F-S10：收藏夹视图复用 GalleryPage，由其内部根据 currentView 筛选 is_favorite
        return <GalleryPage />
      case 'launcher-cache':
        // 启动器缓存视图复用 GalleryPage，mediaStore 根据 currentView 自动过滤 media_source='launcher'
        return <GalleryPage />
      case 'duplicates':
        // F-S10：重复文件检测独立视图
        return <DuplicatesPage />
      default:
        return <GalleryPage />
    }
  }, [])

  return (
    // P0-3：GlobalToastProvider 提升到 App 根节点，所有页面共享 Toast 实例
    <GlobalToastProvider>
      {/* P1-F5：桥接 operationHistoryStore 的数据库错误到 Toast（在 Provider 内才能调用 useGlobalToast） */}
      <OperationHistoryErrorBridge />
      <AppShell>
        {/* keep-alive：已访问的页面保持挂载，仅隐藏非活动页面，保留滚动位置与组件状态 */}
        {ALL_VIEWS.map((view) => {
          if (!visitedViews.has(view)) return null
          const isActive = view === currentView
          // P2-U14：动画结束后移除 page-enter 类，避免 will-change 和 transform 残留
          const showEnter = isActive && enteringView === view
          return (
            <div
              key={view}
              className={showEnter ? 'h-full page-enter' : 'h-full'}
              style={{ display: isActive ? 'block' : 'none' }}
              data-view-level={VIEW_LEVEL_MAP[view]}
              onAnimationEnd={() => {
                if (enteringView === view) setEnteringView(null)
              }}
            >
              {renderView(view)}
            </div>
          )
        })}
      </AppShell>
      <FullscreenViewer filteredFiles={filteredFiles} />
    </GlobalToastProvider>
  )
}

export default App
