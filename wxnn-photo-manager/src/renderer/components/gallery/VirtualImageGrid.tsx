import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useVirtualGrid } from '../../hooks/useVirtualScroll'
import { toFileUrl } from '../../stores/mediaStore'
import { formatFileSize } from '../../utils/format'
import { IconEdit, IconFavorite, IconDelete } from '../../icons'
import { MissingBadge } from '../common/MissingBadge'
import { MediaThumbPlaceholder } from './MediaThumbPlaceholder'
import { useFailedImages } from '../../hooks/useFailedImages'
import { getResponsiveColumns, DEFAULT_COLUMNS_BREAKPOINTS } from '../../utils/responsive'
import type { MediaFile } from '../../stores/mediaStore'

// 高分屏检测：DPR ≥ 2 时启用高清缩略图档位（512px）
// 模块加载时一次性检测，避免每次渲染都读取 devicePixelRatio
// 普通屏（DPR < 2）下完全不影响现有 low/standard 双档位逻辑
const HIGH_DPI_MODE = typeof window !== 'undefined' && window.devicePixelRatio >= 2

interface VirtualImageGridProps {
  items: MediaFile[]
  selectedIds: string[]
  onSelect: (id: string, index: number, event: React.MouseEvent | React.KeyboardEvent) => void
  onHover: (id: string | null) => void
  onContextMenu: (event: React.MouseEvent, file: MediaFile) => void
  onEdit?: (file: MediaFile) => void
  onFavorite?: (file: MediaFile) => void
  onDelete?: (file: MediaFile) => void
}

// P1-U11：抽取 MediaCardActions 消除 hover/touch 两套按钮组重复
// variant='hover' 用于桌面 hover 态（bg-black/50），variant='touch' 用于触屏常驻态（bg-black/40）
const MediaCardActions: React.FC<{
  file: MediaFile
  onEdit?: (file: MediaFile) => void
  onFavorite?: (file: MediaFile) => void
  onDelete?: (file: MediaFile) => void
  variant: 'hover' | 'touch'
}> = ({ file, onEdit, onFavorite, onDelete, variant }) => {
  const bgClass = variant === 'hover' ? 'bg-black/50' : 'bg-black/40'
  return (
    <div className="absolute top-2 right-2 flex gap-1">
      {onEdit && file.file_type === 'image' && (
        <button
          className={`w-7 h-7 rounded-md flex items-center justify-center ${bgClass} text-white hover:bg-black/70 transition-colors`}
          onClick={(e) => {
            e.stopPropagation()
            onEdit(file)
          }}
          title="编辑"
          aria-label="编辑"
        >
          <IconEdit size={14} />
        </button>
      )}
      {onFavorite && (
        <button
          className={`w-7 h-7 rounded-md flex items-center justify-center ${bgClass} text-white hover:bg-black/70 transition-colors`}
          onClick={(e) => {
            e.stopPropagation()
            onFavorite(file)
          }}
          title={file.is_favorite ? '取消收藏' : '收藏'}
          aria-label={file.is_favorite ? '取消收藏' : '收藏'}
        >
          <IconFavorite size={14} filled={file.is_favorite} />
        </button>
      )}
      {onDelete && (
        <button
          className={`w-7 h-7 rounded-md flex items-center justify-center ${bgClass} text-white hover:bg-red-500/80 transition-colors`}
          onClick={(e) => {
            e.stopPropagation()
            onDelete(file)
          }}
          title="删除"
          aria-label="删除"
        >
          <IconDelete size={14} />
        </button>
      )}
    </div>
  )
}

// 修复 U-S4：选中态查找改用 Set，O(1) 查找替代 O(n) 的 includes
// 修复 C-O3/C-O4：用 React.memo 包裹，仅在 props 变化时重渲染
const VirtualImageGridComponent: React.FC<VirtualImageGridProps> = (props) => {
  const { items, selectedIds, onSelect, onHover, onContextMenu, onEdit, onFavorite, onDelete } =
    props
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(4)
  const [itemSize, setItemSize] = useState(200)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  // P1-U10：failedImages 状态管理 + items 变化时自动清空
  const { failedImages, markFailed } = useFailedImages(items)
  // U-G16：触屏设备无 hover 事件，需始终显示快捷操作按钮
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const gap = 16

  // P1-03：缩略图分级加载——首屏用低质量（64px），滚动停止 300ms 后替换为标准质量（320px）
  // highQualityIds 记录已切换到标准质量的文件 id；滚动中不切换，避免抖动
  const [highQualityIds, setHighQualityIds] = useState<Set<string>>(new Set())
  const scrollTimerRef = useRef<number | null>(null)

  // P1-03：从标准缩略图路径推导低质量路径（缓存命名规则：${hash}.jpg → ${hash}_low.jpg）
  const toLowQualityUrl = useCallback((thumbnail: string | undefined): string | null => {
    if (!thumbnail) return null
    // 仅处理 .jpg 结尾的缩略图路径（缓存目录中的文件）
    if (thumbnail.endsWith('.jpg')) {
      return thumbnail.slice(0, -4) + '_low.jpg'
    }
    return null
  }, [])

  // 高清档位路径推导：${hash}.jpg → ${hash}_high.jpg
  // 仅从 standard 路径推导，排除 _low.jpg / _high.jpg 自身，避免链式错误
  const toHighQualityUrl = useCallback((thumbnail: string | undefined): string | null => {
    if (!thumbnail) return null
    if (
      thumbnail.endsWith('.jpg') &&
      !thumbnail.endsWith('_low.jpg') &&
      !thumbnail.endsWith('_high.jpg')
    ) {
      return thumbnail.slice(0, -4) + '_high.jpg'
    }
    return null
  }, [])

  // U-G16：挂载时检测触屏能力（matchMedia 优先，回退到 ontouchstart）
  useEffect(() => {
    const hoverNone = window.matchMedia?.('(hover: none)').matches
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    setIsTouchDevice(hoverNone || hasTouch)
  }, [])

  // 选中态 Set：O(1) 查找，全选 5000 张时每帧 30 项从 15 万次比较降为 30 次
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  useEffect(() => {
    const update = () => {
      const width = wrapperRef.current?.clientWidth || window.innerWidth
      const cols = getResponsiveColumns(width, DEFAULT_COLUMNS_BREAKPOINTS)
      setColumns(cols)
      setItemSize((width - (cols - 1) * gap) / cols)
    }
    update()
    window.addEventListener('resize', update)
    const observer = new ResizeObserver(update)
    if (wrapperRef.current) observer.observe(wrapperRef.current)
    return () => {
      window.removeEventListener('resize', update)
      observer.disconnect()
    }
  }, [])

  const { containerRef, visibleItems, totalHeight, offsetY, scrollToIndex } = useVirtualGrid({
    items,
    itemHeight: itemSize,
    gap,
    overscan: 2,
    columns
  })

  // P1-03：滚动停止 300ms 后，把当前可见项切换到标准质量
  // P2-C16：用 ref 保存最新 visibleItems，避免 triggerHighQualityUpgrade 依赖 visibleItems
  // 导致每次滚动 callback 重建（onScroll 回调频繁变化影响性能）
  const visibleItemsRef = useRef(visibleItems)
  visibleItemsRef.current = visibleItems
  const triggerHighQualityUpgrade = useCallback(() => {
    if (scrollTimerRef.current !== null) {
      window.clearTimeout(scrollTimerRef.current)
    }
    scrollTimerRef.current = window.setTimeout(() => {
      setHighQualityIds((prev) => {
        const next = new Set(prev)
        for (const { item } of visibleItemsRef.current) {
          const file = item as MediaFile
          if (file.thumbnail && !next.has(file.id)) {
            next.add(file.id)
          }
        }
        return next
      })
    }, 300)
  }, [])

  // 高分屏下后台预生成高清缩略图（512px）
  // 仅对可见项前 20 项触发，控制 IPC 并发；generator 内部 generatingLocks 保证重复调用命中缓存
  // 普通屏 HIGH_DPI_MODE=false，此 effect 直接 return，零开销
  useEffect(() => {
    if (!HIGH_DPI_MODE) return
    // 提取到局部变量，避免 forEach 闭包内 TS 无法窄化 window.electronAPI
    const generate = window.electronAPI?.thumbnail?.generate
    if (!generate) return
    const items = visibleItems.slice(0, 20)
    items.forEach(({ item }) => {
      const file = item as MediaFile
      if (!file.thumbnail) return
      // 后台触发，不 await，不阻塞渲染；失败静默（缓存未命中时下次会重试）
      generate(file.file_path, 'high').catch(() => {})
    })
  }, [visibleItems])

  // 清理滚动定时器
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current !== null) {
        window.clearTimeout(scrollTimerRef.current)
      }
    }
  }, [])

  // P1-03：首次加载或可见项变化时，延迟 300ms 升级到标准质量（模拟"滚动停止"）
  useEffect(() => {
    triggerHighQualityUpgrade()
  }, [triggerHighQualityUpgrade])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (items.length === 0) return
      let nextIndex: number
      switch (e.key) {
        case 'ArrowRight':
          nextIndex = Math.min(items.length - 1, focusedIndex + 1)
          break
        case 'ArrowLeft':
          nextIndex = Math.max(0, focusedIndex - 1)
          break
        case 'ArrowDown':
          nextIndex = Math.min(items.length - 1, focusedIndex + columns)
          break
        case 'ArrowUp':
          nextIndex = Math.max(0, focusedIndex - columns)
          break
        case 'Home':
          nextIndex = 0
          break
        case 'End':
          nextIndex = items.length - 1
          break
        default:
          if (e.key === 'Enter' || e.key === ' ') {
            if (focusedIndex >= 0 && focusedIndex < items.length) {
              onSelect(items[focusedIndex].id, focusedIndex, e)
            }
          }
          return
      }
      e.preventDefault()
      setFocusedIndex(nextIndex)
      scrollToIndex(Math.floor(nextIndex / columns))
    },
    [focusedIndex, items, columns, onSelect, scrollToIndex]
  )

  useEffect(() => {
    if (focusedIndex >= items.length) setFocusedIndex(-1)
  }, [items.length, focusedIndex])

  return (
    <div
      ref={wrapperRef}
      className="flex-1 min-h-0 overflow-hidden"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="grid"
      aria-label="图片网格"
    >
      <div
        ref={containerRef}
        className="h-full overflow-y-auto"
        onScroll={triggerHighQualityUpgrade}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              top: offsetY,
              left: 0,
              right: 0,
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              gap
            }}
            role="row"
          >
            {visibleItems.map(({ item, index }) => {
              const file = item as MediaFile
              const isSelected = selectedSet.has(file.id)
              const standardUrl = toFileUrl(file.thumbnail || file.file_path)
              // P1-03：未切换到标准质量时，优先用低质量 URL（更小，首屏加载快）
              const useHighQuality = highQualityIds.has(file.id)
              const lowUrl = toLowQualityUrl(file.thumbnail)
              // 高分屏下推导高清档位 URL；普通屏下恒为 null，完全不影响原逻辑
              const highUrl = HIGH_DPI_MODE ? toHighQualityUrl(file.thumbnail) : null
              // 选用优先级：
              // 1. 用户已切到高质量视图 → standardUrl
              // 2. 高分屏且 high 缓存可用 → highUrl
              // 3. 默认视图且 low 缓存可用 → lowUrl
              // 4. 兜底 → standardUrl
              const thumbUrl =
                useHighQuality || !lowUrl
                  ? standardUrl
                  : highUrl
                    ? toFileUrl(highUrl)
                    : toFileUrl(lowUrl)
              const isFocused = index === focusedIndex
              const hasError = failedImages.has(file.id)
              const isMissing = file.is_missing === true
              const showThumb = !!thumbUrl && !hasError
              return (
                <div
                  key={file.id}
                  className={`media-card aspect-square ${isSelected ? 'ring-2 ring-offset-2' : ''}`}
                  style={{
                    background: 'var(--bg-tertiary)',
                    ...(isSelected
                      ? ({ '--tw-ring-color': 'var(--accent)' } as React.CSSProperties)
                      : {}),
                    outline: isFocused ? '2px solid var(--accent)' : 'none',
                    outlineOffset: '2px',
                    opacity: isMissing ? 0.45 : 1
                  }}
                  onClick={(e) => onSelect(file.id, index, e)}
                  onMouseEnter={() => {
                    setHoveredId(file.id)
                    onHover(file.id)
                  }}
                  onMouseLeave={() => {
                    setHoveredId(null)
                    onHover(null)
                  }}
                  onContextMenu={(e) => onContextMenu(e, file)}
                  onFocus={() => setFocusedIndex(index)}
                  tabIndex={isFocused ? 0 : -1}
                  role="gridcell"
                  aria-selected={isSelected}
                >
                  <div
                    className="w-full h-full flex items-center justify-center relative overflow-hidden rounded-xl"
                    style={{ background: 'var(--bg-tertiary)' }}
                  >
                    {/* T02：丢失文件角标（P1-H：抽取为 MissingBadge 组件） */}
                    {isMissing && <MissingBadge />}
                    {showThumb ? (
                      <img
                        src={thumbUrl}
                        alt={file.file_name}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                        draggable={false}
                        data-media-id={file.id}
                        onError={() => {
                          // P1-03：低质量加载失败时回退到标准质量，标准失败才标记为错误
                          if (!useHighQuality && lowUrl) {
                            setHighQualityIds((prev) => new Set(prev).add(file.id))
                          } else {
                            markFailed(file.id)
                          }
                        }}
                      />
                    ) : null}
                    <MediaThumbPlaceholder
                      fileType={file.file_type}
                      hasError={hasError}
                      visible={!showThumb}
                    />

                    {hoveredId === file.id && (
                      <>
                        <div
                          className="absolute inset-0 flex flex-col justify-end p-3"
                          style={{
                            background: 'linear-gradient(transparent 50%, var(--overlay-bg-strong))'
                          }}
                        >
                          {/* P2 修复：原 truncate 单行截断长文件名，改用 ellipsis-2 两行省略显示更多文字 */}
                          <p className="text-white text-xs font-medium ellipsis-2">
                            {file.file_name}
                          </p>
                          <p className="text-white/70 text-xs">{formatFileSize(file.file_size)}</p>
                        </div>
                        <MediaCardActions
                          file={file}
                          onEdit={onEdit}
                          onFavorite={onFavorite}
                          onDelete={onDelete}
                          variant="hover"
                        />
                      </>
                    )}

                    {/* U-G16：触屏设备始终显示快捷操作按钮（无 hover 事件），desktop 仍走 hover 路径 */}
                    {isTouchDevice && hoveredId !== file.id && (
                      <MediaCardActions
                        file={file}
                        onEdit={onEdit}
                        onFavorite={onFavorite}
                        onDelete={onDelete}
                        variant="touch"
                      />
                    )}

                    {/* U-G16：触屏设备显示文件名条以便识别（避开右下角的时长徽章） */}
                    {isTouchDevice && hoveredId !== file.id && (
                      <div
                        className="absolute inset-x-0 bottom-0 left-0 right-8 p-2"
                        style={{ background: 'var(--overlay-gradient-bottom)' }}
                      >
                        <p className="text-white text-xs font-medium truncate">{file.file_name}</p>
                      </div>
                    )}

                    {/* U-G16：desktop 非悬停态显示收藏标记；触屏设备因收藏按钮已在操作组中显示，无需重复 */}
                    {file.is_favorite && hoveredId !== file.id && !isTouchDevice && (
                      <div className="absolute top-2 right-2">
                        <IconFavorite size={16} filled />
                      </div>
                    )}

                    {file.duration && (
                      <div
                        className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-xs font-medium text-white"
                        style={{ background: 'var(--overlay-bg-strong)' }}
                      >
                        {Math.floor(file.duration / 60)}:
                        {String(file.duration % 60).padStart(2, '0')}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export const VirtualImageGrid = React.memo(VirtualImageGridComponent)
