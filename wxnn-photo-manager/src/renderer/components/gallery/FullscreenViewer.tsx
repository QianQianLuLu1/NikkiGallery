import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useUIStore, type SlideshowConfig } from '../../stores/uiStore'
import { useMediaStore, toFileUrl, type MediaFile } from '../../stores/mediaStore'
import { useToast } from '../../hooks/useToast'
import { useFavoriteToggle } from '../../hooks/useFavoriteToggle'
// DU3：幻灯片播放逻辑统一到 useSlideshow hook
import { useSlideshow } from '../../hooks/useSlideshow'
import { Toast } from '../common/Toast'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { ExifPanel } from '../common/ExifPanel'
import { VideoPlayer } from '../video/VideoPlayer'
import { IconFavorite, IconSaveAs, IconDelete, IconClose, IconChevronLeft, IconChevronRight, IconInfo, IconPause, IconPlay } from '../../icons'
import { CameraInfoPanel } from '../common/CameraInfoPanel'
import { PhotographyPanel } from '../common/PhotographyPanel'
import { NikkiInfoPanel } from '../common/NikkiInfoPanel'
import { OutfitPanel } from '../common/OutfitPanel'
import { InteractionPanel } from '../common/InteractionPanel'

interface FullscreenViewerProps {
  // C-O5：由父组件传入已计算的 filteredFiles，避免与 GalleryPage 各自调用 useFilteredMediaFiles 重复计算
  filteredFiles: MediaFile[]
}

export const FullscreenViewer: React.FC<FullscreenViewerProps> = ({ filteredFiles }) => {
  const fullscreenOpen = useUIStore((s) => s.fullscreenOpen)
  const fullscreenIndex = useUIStore((s) => s.fullscreenIndex)
  const closeFullscreen = useUIStore((s) => s.closeFullscreen)
  const deleteMediaFiles = useMediaStore((s) => s.deleteMediaFiles)
  const { messages, showMessage, dismiss } = useToast()
  // P1-C3：复用共享 hook，收藏/取消收藏接入撤销栈（与 useFileOperations 一致）
  // 修复 React error #310：此 hook 必须在下方 `if (!fullscreenOpen || !currentFile) return null` 之前调用，
  // 否则全屏打开/关闭两次渲染的 hooks 数量不一致会触发 "Rendered more hooks than during the previous render"
  const toggleFavorite = useFavoriteToggle(showMessage)
  const containerRef = useRef<HTMLDivElement>(null)
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void } | null>(null)
  const [showControls, setShowControls] = useState(true)
  const mouseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // P2-C13：原 playInterval 本地状态与 uiStore.slideshowConfig.interval 重复
  // 改为从 uiStore 读取 interval，通过 updateSlideshowConfig 持久化
  const playInterval = useUIStore((s) => s.slideshowConfig.interval)
  const setSlideshowConfig = useUIStore((s) => s.setSlideshowConfig)
  const setPlayInterval = useCallback((ms: SlideshowConfig['interval']) => {
    setSlideshowConfig({ interval: ms })
  }, [setSlideshowConfig])
  const [showIntervalMenu, setShowIntervalMenu] = useState(false)
  // EXIF 信息浮层显示开关（独立于 showControls，避免读 EXIF 时面板自动隐藏）
  const [showInfoPanel, setShowInfoPanel] = useState(false)

  const currentFile = filteredFiles[fullscreenIndex]

  const navigate = useCallback((delta: number) => {
    const newIndex = fullscreenIndex + delta
    if (newIndex >= 0 && newIndex < filteredFiles.length) {
      useUIStore.setState({ fullscreenIndex: newIndex })
      // 切换图片时关闭 EXIF 浮层，避免显示上一张的参数
      setShowInfoPanel(false)
    }
  }, [fullscreenIndex, filteredFiles.length])

  // DU3：幻灯片播放逻辑使用共享 hook（原 stopSlideshow/startSlideshow/toggleSlideshow 三函数合并）
  const slideshow = useSlideshow({
    interval: playInterval,
    onTick: useCallback(() => {
      const idx = useUIStore.getState().fullscreenIndex
      if (idx >= filteredFiles.length - 1) {
        // 播放到最后一张，停止（FullscreenViewer 不循环）
        slideshow.stop()
      } else {
        useUIStore.setState({ fullscreenIndex: idx + 1 })
      }
    }, [filteredFiles.length])
  })

  // F-S10：开始幻灯片播放（包装 slideshow.start，增加最少 2 张校验）
  const startSlideshow = useCallback(() => {
    if (filteredFiles.length <= 1) {
      showMessage('至少需要 2 张图片才能播放幻灯片', 'info')
      return
    }
    slideshow.start()
  }, [filteredFiles.length, showMessage, slideshow])

  const toggleSlideshow = useCallback(() => {
    if (slideshow.isPlaying) {
      slideshow.stop()
    } else {
      startSlideshow()
    }
  }, [slideshow, startSlideshow])

  // C-S10：handleDelete 用 useCallback 稳定化，并作为键盘事件 effect 的依赖
  // 原实现 handleDelete 为普通函数，键盘事件 effect 依赖数组缺失 handleDelete，
  // 导致键盘 Delete 调用旧版本（currentFile 引用过期）。
  const handleDelete = useCallback((file: MediaFile) => {
    setConfirm({
      open: true,
      title: '删除文件',
      message: `确定将 "${file.file_name}" 移至回收站吗？`,
      onConfirm: async () => {
        if (!window.electronAPI) return
        try {
          const result = await window.electronAPI.file.delete([file.file_path])
          if (result.success) {
            await window.electronAPI.mediaAction.delete(Number(file.id))
            deleteMediaFiles([file.id])
            // P1-C10：从 store 获取最新 index，避免闭包中 fullscreenIndex 过期
            // 同时基于当前 filteredFiles.length 计算剩余（props 可能未更新，但有 useEffect 兜底）
            const currentIndex = useUIStore.getState().fullscreenIndex
            const remaining = filteredFiles.length - 1
            if (remaining <= 0) {
              closeFullscreen()
            } else {
              // 当前 index 超出剩余范围时回退到上一张
              const newIndex = Math.min(currentIndex, remaining - 1)
              useUIStore.setState({ fullscreenIndex: newIndex })
            }
          } else {
            showMessage(result.message || '删除失败', 'error')
          }
        } catch (error) {
          showMessage(error instanceof Error ? error.message : '删除失败', 'error')
        }
        setConfirm(null)
      }
    })
  }, [filteredFiles.length, deleteMediaFiles, closeFullscreen, showMessage])

  // P3-1：关闭全屏时查找目标卡片 img，用于共享元素过渡（全屏图→缩略图缩小）
  const handleClose = useCallback(() => {
    if (currentFile) {
      const targetImg = document.querySelector(`img[data-media-id="${currentFile.id}"]`)
      useUIStore.setState({ fullscreenTargetImg: targetImg as HTMLElement | null })
    }
    closeFullscreen()
  }, [currentFile, closeFullscreen])

  // 修复 U-S10：触摸滑动导航（触屏设备全屏浏览）
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return
    const endX = e.changedTouches[0]?.clientX ?? start.x
    const endY = e.changedTouches[0]?.clientY ?? start.y
    const deltaX = endX - start.x
    const deltaY = endY - start.y
    // 仅在水平滑动距离 > 50px 且大于垂直滑动时触发导航（避免误触）
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      navigate(deltaX > 0 ? -1 : 1)
    }
  }, [navigate])

  useEffect(() => {
    if (!fullscreenOpen) return
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          slideshow.stop()
          handleClose()
          break
        case 'ArrowLeft':
          slideshow.stop()
          navigate(-1)
          break
        case 'ArrowRight':
          slideshow.stop()
          navigate(1)
          break
        case ' ':
          // F-S10：空格键切换幻灯片播放
          e.preventDefault()
          toggleSlideshow()
          break
        case 'Delete': if (currentFile) handleDelete(currentFile); break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [fullscreenOpen, navigate, currentFile, handleDelete, handleClose, slideshow, toggleSlideshow])

  // F-S10：关闭全屏时停止幻灯片（DU3：卸载清理由 useSlideshow hook 内部处理）
  useEffect(() => {
    if (!fullscreenOpen && slideshow.isPlaying) {
      slideshow.stop()
    }
  }, [fullscreenOpen, slideshow])

  // 鼠标移动防抖：300ms 无移动后隐藏控制栏
  useEffect(() => {
    if (!fullscreenOpen) {
      setShowControls(true)
      return
    }
    const reset = () => {
      setShowControls(true)
      if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current)
      mouseTimerRef.current = setTimeout(() => setShowControls(false), 3000)
    }
    reset()
    window.addEventListener('mousemove', reset)
    return () => {
      if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current)
      window.removeEventListener('mousemove', reset)
    }
  }, [fullscreenOpen])

  // P1-C10：越界兜底——fullscreenIndex 超出 filteredFiles 范围时（currentFile 为 undefined）自动关闭全屏
  // 场景：连续快速删除时 filteredFiles props 未及时更新，fullscreenIndex 可能指向已不存在的位置
  useEffect(() => {
    if (fullscreenOpen && !currentFile) {
      closeFullscreen()
    }
  }, [fullscreenOpen, currentFile, closeFullscreen])

  useEffect(() => {
    if (fullscreenOpen) {
      containerRef.current?.focus()
    }
  }, [fullscreenOpen, fullscreenIndex])

  if (!fullscreenOpen || !currentFile) return null

  const handleSaveAs = async (file: MediaFile) => {
    if (!window.electronAPI) return
    try {
      const targetDir = await window.electronAPI.dialog.selectDirectory()
      if (!targetDir) return
      const result = await window.electronAPI.file.saveAs(file.file_path, targetDir)
      showMessage(result.message, result.success ? 'success' : 'error')
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '另存为失败', 'error')
    }
  }

  const fileUrl = toFileUrl(currentFile.file_path)
  const title = `${currentFile.file_name} (${fullscreenIndex + 1} / ${filteredFiles.length})`

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[80] flex items-center justify-center outline-none"
      style={{ background: 'rgba(0,0,0,0.92)' }}
      onClick={handleClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label={`全屏查看：${currentFile.file_name}`}
      tabIndex={-1}
    >
      <div className="relative w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {currentFile.file_type === 'video' ? (
          <VideoPlayer
            src={fileUrl || ''}
            controls
            autoPlay
            className="max-w-full max-h-full"
            onCaptureFrame={(time) => {
              if (window.electronAPI) {
                window.electronAPI.video.captureFrame(currentFile.file_path, time)
              }
            }}
          />
        ) : (
          <img
            src={fileUrl || undefined}
            alt={currentFile.file_name}
            className="max-w-full max-h-full object-contain"
            draggable={false}
            data-fullscreen-img
            style={{ viewTransitionName: 'fullscreen-media' }}
          />
        )}

        {/* 顶部工具栏 */}
        <div
          className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-4 transition-opacity"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
            opacity: showControls ? 1 : 0,
            pointerEvents: showControls ? 'auto' : 'none'
          }}
        >
          {/* P2 修复：长标题（含文件名 + 序号）会挤压右侧按钮组，加 truncate + max-w 限制 */}
          <span className="text-white text-sm font-medium truncate max-w-[50%]">{title}</span>
          <div className="flex items-center gap-2">
            {/* F-S10：幻灯片播放控制 */}
            <div className="relative">
              <button
                className="icon-btn text-white"
                onClick={toggleSlideshow}
                title={slideshow.isPlaying ? '暂停幻灯片 (空格)' : '播放幻灯片 (空格)'}
                aria-label={slideshow.isPlaying ? '暂停幻灯片' : '播放幻灯片'}
              >
                {slideshow.isPlaying ? (
                  <IconPause size={18} />
                ) : (
                  <IconPlay size={18} />
                )}
              </button>
              <button
                className="icon-btn text-white text-xs ml-1"
                onClick={() => setShowIntervalMenu((v) => !v)}
                title="播放间隔"
                aria-label="播放间隔"
                style={{ minWidth: 'auto', padding: '4px 8px' }}
              >
                {(playInterval / 1000).toString()}s
              </button>
              {showIntervalMenu && (
                <div
                  className="absolute top-full right-0 mt-1 py-1 rounded-lg z-50 min-w-[80px]"
                  style={{ background: 'rgba(30, 41, 59, 0.95)', backdropFilter: 'var(--backdrop-blur)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {([1000, 2000, 3000, 5000, 8000] as const).map((ms) => (
                    <button
                      key={ms}
                      className="w-full px-3 py-1.5 text-xs text-white text-left hover:bg-white/10 transition-colors"
                      onClick={() => {
                        setPlayInterval(ms)
                        setShowIntervalMenu(false)
                      }}
                      style={playInterval === ms ? { color: 'var(--accent)', fontWeight: 600 } : undefined}
                    >
                      {ms / 1000} 秒
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="w-px h-5 bg-white/20" />
            <button className="icon-btn text-white" onClick={() => toggleFavorite(currentFile)} title={currentFile.is_favorite ? '取消收藏' : '收藏'} aria-label={currentFile.is_favorite ? '取消收藏' : '收藏'}>
              <IconFavorite size={18} filled={currentFile.is_favorite} color={currentFile.is_favorite ? 'var(--favorite)' : 'white'} />
            </button>
            {/* 图片相机参数浮层开关（视频文件不显示） */}
            {currentFile.file_type === 'image' && (
              <button
                className="icon-btn text-white"
                onClick={() => setShowInfoPanel((v) => !v)}
                title={showInfoPanel ? '隐藏图片信息' : '查看图片信息'}
                aria-label={showInfoPanel ? '隐藏图片信息' : '查看图片信息'}
                style={showInfoPanel ? { background: 'rgba(255,255,255,0.18)' } : undefined}
              >
                <IconInfo size={18} />
              </button>
            )}
            <button className="icon-btn text-white" onClick={() => handleSaveAs(currentFile)} title="另存为" aria-label="另存为">
              <IconSaveAs size={18} />
            </button>
            <button className="icon-btn text-white" onClick={() => handleDelete(currentFile)} title="删除" aria-label="删除">
              <IconDelete size={18} />
            </button>
            <button className="icon-btn text-white" onClick={handleClose} title="关闭 (Esc)" aria-label="关闭">
              <IconClose size={18} />
            </button>
          </div>
        </div>

        {/* 左右导航 */}
        {fullscreenIndex > 0 && (
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 icon-btn text-white"
            onClick={() => navigate(-1)}
            style={{ background: 'rgba(0,0,0,0.4)' }}
            aria-label="上一张"
          >
            <IconChevronLeft size={24} />
          </button>
        )}
        {fullscreenIndex < filteredFiles.length - 1 && (
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 icon-btn text-white"
            onClick={() => navigate(1)}
            style={{ background: 'rgba(0,0,0,0.4)' }}
            aria-label="下一张"
          >
            <IconChevronRight size={24} />
          </button>
        )}
      </div>

      <Toast messages={messages} onDismiss={dismiss} zIndex={90} />

      {/* EXIF 相机参数浮层（仅图片，点击信息按钮展开） */}
      {showInfoPanel && currentFile.file_type === 'image' && (
        <div
          className="absolute top-16 right-4 w-80 max-h-[calc(100vh-8rem)] overflow-y-auto z-[85] rounded-xl p-4"
          style={{
            background: 'rgba(20, 25, 35, 0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-white text-sm font-semibold flex items-center gap-1.5">
              <IconInfo size={14} />
              图片信息
            </span>
            <button
              className="text-white/70 hover:text-white transition-colors"
              onClick={() => setShowInfoPanel(false)}
              aria-label="关闭相机参数面板"
              title="关闭"
            >
              <IconClose size={14} />
            </button>
          </div>
          <ExifPanel file={currentFile} variant="dark" showTitle={false} />
          <div className="pt-3 mt-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <PhotographyPanel file={currentFile} variant="dark" showTitle={false} />
            <CameraInfoPanel file={currentFile} variant="dark" showTitle={false} />
            <NikkiInfoPanel file={currentFile} variant="dark" showTitle={false} />
            <OutfitPanel file={currentFile} variant="dark" showTitle={false} />
            <InteractionPanel file={currentFile} variant="dark" showTitle={false} />
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          open={confirm.open}
          title={confirm.title}
          message={confirm.message}
          confirmVariant="danger"
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
