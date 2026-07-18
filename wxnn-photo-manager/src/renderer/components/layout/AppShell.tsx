import React, { useMemo, useState } from 'react'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import { useUIStore, type ViewLevel } from '../../stores/uiStore'
import { useMediaStore } from '../../stores/mediaStore'
import { formatSize } from '../../utils/format'
// P2-5：常驻反馈按钮 + FeedbackDialog
import { FeedbackDialog } from '../common/FeedbackDialog'
import { IconMessage } from '../../icons'

// U-G11：各视图对应的状态文案与统计逻辑
const VIEW_STATUS_LABEL: Record<ViewLevel, string> = {
  gallery: '图库',
  detail: '详情',
  editor: '编辑器',
  categories: '分类管理',
  settings: '设置',
  'recycle-bin': '回收站',
  favorites: '收藏',
  duplicates: '重复文件检测',
  'launcher-cache': '缓存'
}

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentView, selectedMediaIds, selectedMediaId } = useUIStore()
  const { mediaFiles, recycleBinFiles, categories } = useMediaStore()
  // P2-5：反馈对话框状态
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const stats = useMemo(() => {
    let images = 0
    let videos = 0
    let size = 0
    let favorites = 0
    for (const f of mediaFiles) {
      if (f.file_type === 'image') images++
      else if (f.file_type === 'video') videos++
      size += f.file_size
      if (f.is_favorite) favorites++
    }
    return { images, videos, size, favorites }
  }, [mediaFiles])

  // 根据视图生成左右两侧状态文案
  const status = useMemo(() => {
    let leftText = VIEW_STATUS_LABEL[currentView] || ''
    let rightText = ''

    switch (currentView) {
      case 'gallery':
        leftText = `共 ${mediaFiles.length} 个文件（图片 ${stats.images} · 视频 ${stats.videos}）`
        rightText =
          selectedMediaIds.length > 0
            ? `已选择 ${selectedMediaIds.length} 项`
            : `占用 ${formatSize(stats.size)}`
        break
      case 'detail': {
        // U-G7：detail 视图显示当前文件索引 / 总数（如 "3 / 128"），而非"已选择 N 项"
        const idx = selectedMediaId ? mediaFiles.findIndex((f) => f.id === selectedMediaId) : -1
        rightText = idx >= 0 ? `${idx + 1} / ${mediaFiles.length}` : '准备就绪'
        break
      }
      case 'editor':
        rightText = '编辑模式（按 Esc 退出全屏）'
        break
      case 'categories':
        leftText = `共 ${categories.length} 个分类`
        rightText = `图片 ${stats.images} · 视频 ${stats.videos}`
        break
      case 'settings':
        rightText = '配置应用偏好'
        break
      case 'recycle-bin':
        leftText = `回收站 ${recycleBinFiles.length} 项`
        rightText = '文件可恢复或彻底删除'
        break
      case 'favorites':
        leftText = `收藏 ${stats.favorites} 项`
        rightText = `占用 ${formatSize(stats.size)}`
        break
      case 'duplicates':
        rightText = '扫描并清理重复文件'
        break
    }
    return { leftText, rightText }
  }, [
    currentView,
    mediaFiles,
    recycleBinFiles.length,
    categories.length,
    selectedMediaIds.length,
    selectedMediaId,
    stats
  ])

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-primary)' }}
    >
      <TitleBar />
      <div className="flex-1 flex pt-10 overflow-hidden sidebar-gradient">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-5">{children}</div>
          <div
            className="h-8 flex items-center justify-between px-4 text-xs status-bar"
            style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--divider)' }}
          >
            <span>{status.leftText}</span>
            <div className="flex items-center gap-3">
              <span>{status.rightText}</span>
              {/* P2-5：常驻反馈按钮，点击弹出 FeedbackDialog */}
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-all hover:scale-105"
                style={{
                  color: 'var(--text-tertiary)',
                  background: 'transparent'
                }}
                onClick={() => setFeedbackOpen(true)}
                title="问题反馈"
                aria-label="问题反馈"
              >
                <IconMessage size={12} />
                <span>反馈</span>
              </button>
            </div>
          </div>
        </main>
      </div>
      {/* P2-5：全局反馈对话框 */}
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  )
}

// P1-I：formatBytes 已统一到 utils/format.ts 的 formatSize
