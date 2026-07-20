import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { toFileUrl } from '../../utils/file'
import { MissingBadge } from '../common/MissingBadge'
import { MediaThumbPlaceholder } from './MediaThumbPlaceholder'
import { useFailedImages } from '../../hooks/useFailedImages'
import type { MediaFile } from '../../stores/mediaStore'

interface MasonryViewProps {
  files: MediaFile[]
  selectedIds: string[]
  onSelect: (id: string, index: number, event: React.MouseEvent) => void
  onContextMenu: (event: React.MouseEvent, file: MediaFile) => void
}

const GAP = 16
const MIN_COL_WIDTH = 220
const OVERSCAN = 400 // 上下额外渲染的像素数，避免滚动时出现空白

interface ItemLayout {
  index: number
  file: MediaFile
  x: number
  y: number
  width: number
  height: number
}

function getColumns(width: number): number {
  if (width <= 0) return 1
  return Math.max(1, Math.floor((width + GAP) / (MIN_COL_WIDTH + GAP)))
}

// 修复 U-F2/U-S3：原实现使用 CSS columnCount 渲染全部文件，万级文件导致 DOM 爆炸
// 新实现：JavaScript 计算 masonry 布局 + 虚拟滚动，仅渲染可视区域内的文件
export const MasonryView: React.FC<MasonryViewProps> = ({
  files,
  selectedIds,
  onSelect,
  onContextMenu
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const [width, setWidth] = useState(800)
  // P1-U3：与其他 4 个视图统一使用 useFailedImages 管理加载失败状态
  const { failedImages, markFailed } = useFailedImages(files)

  // 监听容器尺寸和滚动
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      setScrollTop(el.scrollTop)
      setContainerHeight(el.clientHeight)
      setWidth(el.clientWidth)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    el.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', update)
    }
  }, [])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (el) setScrollTop(el.scrollTop)
  }, [])

  // 计算 masonry 布局：贪心算法，每个文件放入当前最短的列
  const { layouts, totalHeight } = useMemo(() => {
    const cols = getColumns(width)
    if (cols <= 0 || files.length === 0) return { layouts: [], totalHeight: 0 }

    const colWidth = (width - (cols - 1) * GAP) / cols
    const colHeights = new Array(cols).fill(0)
    const result: ItemLayout[] = []

    files.forEach((file, index) => {
      const aspect = file.width && file.height ? file.height / file.width : 1
      // 限制高度范围，避免极端宽高比破坏布局
      const clampedAspect = Math.max(0.3, Math.min(3, aspect))
      const itemHeight = colWidth * clampedAspect

      // 找到最短的列
      let minCol = 0
      for (let c = 1; c < cols; c++) {
        if (colHeights[c] < colHeights[minCol]) minCol = c
      }

      const x = minCol * (colWidth + GAP)
      const y = colHeights[minCol]

      result.push({ index, file, x, y, width: colWidth, height: itemHeight })
      colHeights[minCol] = y + itemHeight + GAP
    })

    const maxH = Math.max(...colHeights, 0)
    return { layouts: result, totalHeight: maxH }
  }, [files, width])

  // 虚拟滚动：仅渲染可视区域内的文件
  const visibleLayouts = useMemo(() => {
    if (containerHeight === 0) return []
    const viewTop = scrollTop - OVERSCAN
    const viewBottom = scrollTop + containerHeight + OVERSCAN
    return layouts.filter((item) => {
      return item.y + item.height >= viewTop && item.y <= viewBottom
    })
  }, [layouts, scrollTop, containerHeight])

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto h-full pb-4"
      onScroll={handleScroll}
      role="feed"
      aria-label="瀑布流视图"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleLayouts.map((item) => {
          const { file, index, x, y, width: itemWidth, height: itemHeight } = item
          const thumbUrl = toFileUrl(file.thumbnail || file.file_path)
          const isSelected = selectedIds.includes(file.id)
          const isMissing = file.is_missing === true
          const hasError = failedImages.has(file.id)
          const showThumb = !!thumbUrl && !hasError
          return (
            <div
              key={file.id}
              className={`media-card ${isSelected ? 'ring-2 ring-offset-2' : ''}`}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: itemWidth,
                height: itemHeight,
                background: 'var(--bg-tertiary)',
                opacity: isMissing ? 0.45 : 1,
                ...(isSelected
                  ? ({ '--tw-ring-color': 'var(--accent)' } as React.CSSProperties)
                  : {})
              }}
              onClick={(e) => onSelect(file.id, index, e)}
              onContextMenu={(e) => onContextMenu(e, file)}
            >
              <div
                className="relative w-full h-full overflow-hidden rounded-xl"
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
                    onError={() => markFailed(file.id)}
                  />
                ) : null}
                <MediaThumbPlaceholder
                  fileType={file.file_type}
                  hasError={hasError}
                  visible={!showThumb}
                />
              </div>
              <div
                className="absolute bottom-0 left-0 right-0 p-2 text-xs truncate"
                style={{
                  color: 'var(--text-secondary)',
                  background: 'var(--overlay-gradient-bottom)'
                }}
              >
                {file.file_name}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
