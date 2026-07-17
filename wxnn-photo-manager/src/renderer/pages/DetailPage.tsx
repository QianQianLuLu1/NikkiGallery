import React, { useEffect, useState, useCallback } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useMediaStore, toFileUrl, updateMediaFileAndPersist, OUTFIT_PRESETS, getSceneTimeLabel } from '../stores/mediaStore'
import { useFilteredMediaFiles } from '../hooks/useFilteredMediaFiles'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { TagManager } from '../components/gallery/TagManager'
import { VideoPlayer } from '../components/video/VideoPlayer'
import { useGlobalToast } from './settings/sections'
import { useExif } from '../hooks/useExif'
import { EmptyState } from '../components/common/EmptyState'
import { ZoomableContainer } from '../components/common/ZoomableContainer'
import { formatFileSize } from '../utils/format'
import { formatDateTime } from '../utils/date'
import { IconChevronLeft, IconChevronRight, IconStar, IconTag, IconWarning } from '../icons'
import { CameraInfoPanel } from '../components/common/CameraInfoPanel'
import { PhotographyPanel } from '../components/common/PhotographyPanel'
import { NikkiInfoPanel } from '../components/common/NikkiInfoPanel'
import { OutfitPanel } from '../components/common/OutfitPanel'
import { InteractionPanel } from '../components/common/InteractionPanel'

export const DetailPage: React.FC = () => {
  const { selectedMediaId, navigateTo, openFullscreen } = useUIStore()
  const { mediaFiles, deleteMediaFiles } = useMediaStore()
  const filteredFiles = useFilteredMediaFiles()
  const media = mediaFiles.find((f) => f.id === selectedMediaId)
  // U-S6：使用 useExif hook 替代手写 EXIF 加载（删除重复的 ExifData interface 与 useEffect）
  const { exif } = useExif(media?.file_path, !!media)
  // F-G7：视频元数据状态（时长/分辨率/编码/帧率）
  const [videoMeta, setVideoMeta] = useState<{ duration?: number; width?: number; height?: number; codec?: string; frameRate?: number } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [showTagManager, setShowTagManager] = useState(false)
  // F-O1：套装标注编辑状态
  const [editingOutfit, setEditingOutfit] = useState(false)
  const [outfitInput, setOutfitInput] = useState('')

  const showMessage = useGlobalToast()

  const currentIndex = media ? filteredFiles.findIndex((f) => f.id === media.id) : -1

  const navigateToIndex = useCallback((index: number) => {
    const file = filteredFiles[index]
    if (file) useUIStore.setState({ selectedMediaId: file.id })
  }, [filteredFiles])

  // F-G7：视频文件加载元数据（时长/分辨率/编码/帧率），图片不加载
  useEffect(() => {
    if (!media || media.file_type !== 'video' || !window.electronAPI?.video?.metadata) {
      setVideoMeta(null)
      return
    }
    const token = { cancelled: false }
    window.electronAPI.video
      .metadata(media.file_path)
      .then((data) => {
        if (!token.cancelled && data?.success) {
          setVideoMeta({
            duration: data.duration,
            width: data.width,
            height: data.height,
            codec: data.codec,
            frameRate: data.frameRate
          })
        }
      })
      .catch(() => {
        if (!token.cancelled) setVideoMeta(null)
      })
    return () => {
      token.cancelled = true
    }
  }, [media])

  // 键盘导航：左右切换、Esc 返回、T 打开标签管理
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (showTagManager) {
        if (e.key === 'Escape') setShowTagManager(false)
        return
      }
      switch (e.key) {
        case 'ArrowLeft':
          if (currentIndex > 0) navigateToIndex(currentIndex - 1)
          break
        case 'ArrowRight':
          if (currentIndex < filteredFiles.length - 1) navigateToIndex(currentIndex + 1)
          break
        case 'Escape':
          navigateTo('gallery')
          break
        case 't':
        case 'T':
          if (media) setShowTagManager(true)
          break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showTagManager, media, filteredFiles, currentIndex, navigateToIndex, navigateTo])

  if (!media) {
    // U-S6：使用 EmptyState 统一空态
    return (
      <EmptyState
        title="未选择媒体文件"
        ctaLabel="返回图库"
        onCta={() => navigateTo('gallery')}
      />
    )
  }

  const fileUrl = toFileUrl(media.file_path)

  const handleDelete = async () => {
    if (!window.electronAPI) return
    try {
      const result = await window.electronAPI.file.delete([media.file_path])
      if (result.success) {
        await window.electronAPI.mediaAction.delete(Number(media.id))
        deleteMediaFiles([media.id])
        navigateTo('gallery')
      } else {
        showMessage(result.message || '删除失败', 'error')
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '删除失败', 'error')
    }
    setConfirm(false)
  }

  const handleSaveAs = async () => {
    if (!window.electronAPI) return
    try {
      const targetDir = await window.electronAPI.dialog.selectDirectory()
      if (!targetDir) return
      const result = await window.electronAPI.file.saveAs(media.file_path, targetDir)
      if (!result.success) {
        showMessage(result.message || '另存为失败', 'error')
      } else {
        showMessage('另存为成功', 'success')
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '另存为失败', 'error')
    }
  }

  const toggleFavorite = async () => {
    if (!window.electronAPI) return
    const next = !media.is_favorite
    // 乐观更新
    useMediaStore.getState().updateMediaFile(media.id, { is_favorite: next })
    try {
      const result = await updateMediaFileAndPersist(media.id, { is_favorite: next })
      if (!result.success) throw new Error(result.message)
    } catch (error) {
      // 失败回滚
      useMediaStore.getState().updateMediaFile(media.id, { is_favorite: media.is_favorite })
      showMessage(error instanceof Error ? error.message : '操作失败', 'error')
    }
  }

  const updateRating = async (rating: number) => {
    if (!window.electronAPI) return
    const prevRating = media.rating
    // 乐观更新
    useMediaStore.getState().updateMediaFile(media.id, { rating })
    try {
      const result = await updateMediaFileAndPersist(media.id, { rating })
      if (!result.success) throw new Error(result.message)
    } catch (error) {
      // 失败回滚
      useMediaStore.getState().updateMediaFile(media.id, { rating: prevRating })
      showMessage(error instanceof Error ? error.message : '评分失败', 'error')
    }
  }

  // F-O1：开始编辑套装标注
  const startEditOutfit = useCallback(() => {
    setOutfitInput(media.outfit || '')
    setEditingOutfit(true)
  }, [media.outfit])

  // F-O1：保存套装标注
  const handleSaveOutfit = async () => {
    if (!window.electronAPI || !media) return
    const trimmed = outfitInput.trim()
    if (trimmed.length > 100) {
      showMessage('套装名称不能超过 100 字符', 'error')
      return
    }
    const prevOutfit = media.outfit || ''
    useMediaStore.getState().updateMediaFile(media.id, { outfit: trimmed })
    setEditingOutfit(false)
    try {
      const result = await updateMediaFileAndPersist(media.id, { outfit: trimmed })
      if (!result.success) throw new Error(result.message)
    } catch (error) {
      // 失败回滚
      useMediaStore.getState().updateMediaFile(media.id, { outfit: prevOutfit })
      showMessage(error instanceof Error ? error.message : '保存套装失败', 'error')
    }
  }

  // F-O1：清除套装标注
  const handleClearOutfit = async () => {
    if (!window.electronAPI || !media) return
    const prevOutfit = media.outfit || ''
    useMediaStore.getState().updateMediaFile(media.id, { outfit: '' })
    setEditingOutfit(false)
    setOutfitInput('')
    try {
      const result = await updateMediaFileAndPersist(media.id, { outfit: '' })
      if (!result.success) throw new Error(result.message)
    } catch (error) {
      useMediaStore.getState().updateMediaFile(media.id, { outfit: prevOutfit })
      showMessage(error instanceof Error ? error.message : '清除套装失败', 'error')
    }
  }

  // T02：从库中移除丢失记录（不调用系统回收站，因为物理文件已不存在）
  const handleRemoveFromLibrary = async () => {
    if (!window.electronAPI || !media) return
    try {
      const result = await window.electronAPI.mediaAction.removeMissing(Number(media.id))
      if (!result.success) {
        showMessage(result.message || '移除失败', 'error')
        return
      }
      deleteMediaFiles([media.id])
      showMessage('已从库中移除丢失记录', 'success')
      navigateTo('gallery')
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '移除失败', 'error')
    }
  }

  return (
    <div className="h-full flex gap-5">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-4">
          <button className="btn-secondary" onClick={() => navigateTo('gallery')}>返回图库</button>
          <div className="flex items-center gap-2">
            {media.file_type === 'image' && (
              <button className="btn-secondary" onClick={() => navigateTo('editor')}>编辑</button>
            )}
            <button className="btn-secondary" onClick={() => setShowTagManager(true)}>
              <IconTag size={16} />
              标签
            </button>
            <button className="btn-secondary" onClick={handleSaveAs}>另存为</button>
            <button className="btn-danger" onClick={() => setConfirm(true)}>删除</button>
          </div>
        </div>

        {/* T02：丢失文件提示条 */}
        {media.is_missing === true && (
          <div className="mb-4 p-3 rounded-xl flex items-center justify-between gap-3" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--danger-hover)' }}>
              <IconWarning size={16} />
              <span>文件已被移动或删除，无法正常显示。建议从库中移除该记录。</span>
            </div>
            <button
              className="btn-secondary text-xs flex-shrink-0"
              style={{ background: 'var(--danger-hover)', color: 'white', borderColor: 'var(--danger-hover)' }}
              onClick={handleRemoveFromLibrary}
            >
              从库中移除
            </button>
          </div>
        )}

        <ZoomableImage
          src={fileUrl || ''}
          alt={media.file_name}
          isVideo={media.file_type === 'video'}
          onClick={() => {
            if (currentIndex >= 0) openFullscreen(currentIndex)
          }}
        />

        <div className="flex items-center justify-center gap-4 mt-4">
          <button
            className="icon-btn"
            disabled={currentIndex <= 0}
            onClick={() => navigateToIndex(currentIndex - 1)}
            aria-label="上一张"
          >
            <IconChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <button key={i} onClick={() => updateRating(i + 1)} aria-label={`评分 ${i + 1}`}>
                <IconStar size={20} filled={i < media.rating} />
              </button>
            ))}
          </div>
          <button
            className="icon-btn"
            disabled={currentIndex >= filteredFiles.length - 1}
            onClick={() => navigateToIndex(currentIndex + 1)}
            aria-label="下一张"
          >
            <IconChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="w-72 glass-card p-5 space-y-5 overflow-y-auto flex-shrink-0">
        <div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{media.file_name}</h3>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{media.file_path}</p>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>类型</span>
            <span style={{ color: 'var(--text-primary)' }}>{media.file_type === 'image' ? '图片' : '视频'} {media.file_ext.toUpperCase()}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>大小</span>
            <span style={{ color: 'var(--text-primary)' }}>{formatFileSize(media.file_size)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>分辨率</span>
            <span style={{ color: 'var(--text-primary)' }}>{media.width && media.height ? `${media.width}x${media.height}` : '-'}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>创建时间</span>
            <span style={{ color: 'var(--text-primary)' }}>{formatDateTime(media.created_at)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>收藏</span>
            <button onClick={toggleFavorite} style={{ color: media.is_favorite ? 'var(--favorite)' : 'var(--text-primary)' }}>
              {media.is_favorite ? '已收藏' : '未收藏'}
            </button>
          </div>
          {media.scene_time && media.scene_time !== 'unknown' && (
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>场景时段</span>
              <span style={{ color: 'var(--text-primary)' }}>{getSceneTimeLabel(media.scene_time)}</span>
            </div>
          )}
          {media.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {media.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* F-O1：套装标注编辑 */}
        <div className="space-y-3 text-sm pt-4" style={{ borderTop: '1px solid var(--divider)' }}>
          <div className="flex items-center justify-between">
            <h4 className="font-medium" style={{ color: 'var(--text-secondary)' }}>套装标注</h4>
            {!editingOutfit && (
              <button
                className="text-xs px-2 py-1 rounded-md transition-colors hover:opacity-80"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--accent)' }}
                onClick={startEditOutfit}
              >
                {media.outfit ? '编辑' : '添加'}
              </button>
            )}
          </div>
          {editingOutfit ? (
            <div className="space-y-2">
              <input
                type="text"
                value={outfitInput}
                onChange={(e) => setOutfitInput(e.target.value)}
                placeholder="输入套装名称或从下方选择"
                className="input-field w-full"
                autoFocus
                maxLength={100}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveOutfit()
                  if (e.key === 'Escape') setEditingOutfit(false)
                }}
              />
              <select
                value=""
                onChange={(e) => e.target.value && setOutfitInput(e.target.value)}
                className="input-field w-full text-sm"
              >
                <option value="">从预设中选择…</option>
                {OUTFIT_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>{preset}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button className="btn-primary text-xs flex-1" onClick={handleSaveOutfit}>保存</button>
                {media.outfit && (
                  <button className="btn-secondary text-xs" style={{ color: 'var(--danger)' }} onClick={handleClearOutfit}>清除</button>
                )}
                <button className="btn-secondary text-xs" onClick={() => setEditingOutfit(false)}>取消</button>
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: media.outfit ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
              {media.outfit || '未标注套装'}
            </p>
          )}
        </div>

        {exif && (
          <div className="space-y-3 text-sm pt-4" style={{ borderTop: '1px solid var(--divider)' }}>
            <h4 className="font-medium" style={{ color: 'var(--text-secondary)' }}>EXIF 信息</h4>
            {exif.camera && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>相机</span><span style={{ color: 'var(--text-primary)' }}>{exif.camera}</span></div>}
            {exif.lens && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>镜头</span><span style={{ color: 'var(--text-primary)' }}>{exif.lens}</span></div>}
            {exif.aperture && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>光圈</span><span style={{ color: 'var(--text-primary)' }}>{exif.aperture}</span></div>}
            {exif.shutter && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>快门</span><span style={{ color: 'var(--text-primary)' }}>{exif.shutter}</span></div>}
            {exif.iso && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>ISO</span><span style={{ color: 'var(--text-primary)' }}>{exif.iso}</span></div>}
            {exif.focalLength && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>焦距</span><span style={{ color: 'var(--text-primary)' }}>{exif.focalLength}</span></div>}
            {exif.dateTaken && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>拍摄时间</span><span style={{ color: 'var(--text-primary)' }}>{formatDateTime(exif.dateTaken)}</span></div>}
            {exif.gps && (
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--text-secondary)' }}>拍摄位置</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                    {exif.gps.latitude.toFixed(6)}, {exif.gps.longitude.toFixed(6)}
                  </span>
                  <button
                    className="px-2 py-0.5 text-xs rounded-md transition-colors hover:opacity-80"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--accent)' }}
                    onClick={() => {
                      // F-S10：在系统默认浏览器中打开地图查看拍摄位置
                      const url = `https://www.openstreetmap.org/?mlat=${exif.gps!.latitude}&mlon=${exif.gps!.longitude}#map=15/${exif.gps!.latitude}/${exif.gps!.longitude}`
                      if (window.electronAPI?.shell?.openExternal) {
                        void window.electronAPI.shell.openExternal(url)
                      } else {
                        window.open(url, '_blank', 'noopener')
                      }
                    }}
                    title="在地图中查看"
                  >
                    在地图中查看
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* F-G7：视频元数据展示（时长/分辨率/编码/帧率） */}
        {videoMeta && (
          <div className="space-y-3 text-sm pt-4" style={{ borderTop: '1px solid var(--divider)' }}>
            <h4 className="font-medium" style={{ color: 'var(--text-secondary)' }}>视频信息</h4>
            {videoMeta.duration ? (
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>时长</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {Math.floor(videoMeta.duration / 60)}:{String(Math.round(videoMeta.duration % 60)).padStart(2, '0')}
                </span>
              </div>
            ) : null}
            {videoMeta.width && videoMeta.height ? (
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>分辨率</span>
                <span style={{ color: 'var(--text-primary)' }}>{videoMeta.width} × {videoMeta.height}</span>
              </div>
            ) : null}
            {videoMeta.codec ? (
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>编码</span>
                <span style={{ color: 'var(--text-primary)' }}>{videoMeta.codec}</span>
              </div>
            ) : null}
            {videoMeta.frameRate ? (
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>帧率</span>
                <span style={{ color: 'var(--text-primary)' }}>{Math.round(videoMeta.frameRate)} fps</span>
              </div>
            ) : null}
          </div>
        )}

        {/* 游戏图片信息面板 */}
        <div className="space-y-3 text-sm pt-4" style={{ borderTop: '1px solid var(--divider)' }}>
          <PhotographyPanel file={media} />
          <CameraInfoPanel file={media} />
          <NikkiInfoPanel file={media} />
          <OutfitPanel file={media} />
          <InteractionPanel file={media} />
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        title="删除文件"
        message={`确定将 "${media.file_name}" 移至回收站吗？`}
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirm(false)}
      />

      {showTagManager && <TagManager mediaId={media.id} onClose={() => setShowTagManager(false)} />}
    </div>
  )
}

interface ZoomableImageProps {
  src: string
  alt: string
  isVideo: boolean
  onClick: () => void
}

// P1-U12：复用 ZoomableContainer 共享组件，仅保留内容渲染差异（图片/视频）
const ZoomableImage: React.FC<ZoomableImageProps> = ({ src, alt, isVideo, onClick }) => {
  return (
    <ZoomableContainer
      maxZoom={5}
      resetVariant="icon"
      onClick={onClick}
      containerClassName="flex-1 flex items-center justify-center rounded-2xl overflow-hidden relative"
      containerStyle={{ background: 'var(--bg-tertiary)' }}
      ariaLabel="查看大图，滚轮缩放，双击重置"
    >
      {isVideo ? (
        <VideoPlayer src={src} controls className="max-w-full max-h-full" />
      ) : (
        <img src={src || undefined} alt={alt} className="max-w-full max-h-full object-contain" draggable={false} />
      )}
    </ZoomableContainer>
  )
}
