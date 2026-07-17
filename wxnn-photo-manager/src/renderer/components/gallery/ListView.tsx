import React, { useCallback, useMemo } from 'react'
import { toFileUrl } from '../../utils/file'
import { formatFileSize } from '../../utils/format'
import { formatDate } from '../../utils/date'
import { IconStar } from '../../icons'
import { MissingBadge } from '../common/MissingBadge'
import { MediaThumbPlaceholder } from './MediaThumbPlaceholder'
import { useVirtualScroll } from '../../hooks/useVirtualScroll'
import { useFailedImages } from '../../hooks/useFailedImages'
import type { MediaFile } from '../../stores/mediaStore'

interface ListViewProps {
  files: MediaFile[]
  selectedIds: string[]
  onSelect: (id: string, index: number, event: React.MouseEvent | React.KeyboardEvent) => void
  onToggleSelection: (id: string) => void
  onContextMenu: (event: React.MouseEvent, file: MediaFile) => void
}

const ITEM_HEIGHT = 72
const GAP = 8

// C-O3/C-O7：用 React.memo 包裹，避免父组件状态变化触发重渲染
const ListViewComponent: React.FC<ListViewProps> = ({
  files,
  selectedIds,
  onSelect,
  onToggleSelection,
  onContextMenu
}) => {
  // P1-U10：failedImages 状态管理 + files 变化时自动清空
  const { failedImages, markFailed } = useFailedImages(files)

  // C-O4 配套：选中态 Set，O(1) 查找替代 O(n) 的 includes
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const {
    containerRef,
    startIndex,
    endIndex,
    totalHeight,
    offsetY
  } = useVirtualScroll({
    itemCount: files.length,
    itemHeight: ITEM_HEIGHT,
    gap: GAP,
    overscan: 5
  })

  const handleClick = useCallback((file: MediaFile, index: number, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      onToggleSelection(file.id)
    } else {
      onSelect(file.id, index, e)
    }
  }, [onSelect, onToggleSelection])

  const handleKeyDown = useCallback((file: MediaFile, index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(file.id, index, e)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = containerRef.current?.querySelector(`[data-list-index="${index + 1}"]`) as HTMLElement | null
      next?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = containerRef.current?.querySelector(`[data-list-index="${index - 1}"]`) as HTMLElement | null
      prev?.focus()
    }
  }, [containerRef, onSelect])

  const visibleFiles = files.slice(startIndex, endIndex + 1)

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-auto"
      role="list"
      aria-label="文件列表"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: offsetY,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: GAP
          }}
        >
          {visibleFiles.map((file, localIndex) => {
            const index = startIndex + localIndex
            const thumbUrl = toFileUrl(file.thumbnail || file.file_path)
            const isSelected = selectedSet.has(file.id)
            const hasError = failedImages.has(file.id)
            const isMissing = file.is_missing === true
            const showThumb = !!thumbUrl && !hasError
            return (
              <div
                key={file.id}
                data-list-index={index}
                className="flex items-center gap-4 p-3 rounded-xl transition-all duration-200 hover:translate-x-1"
                style={{
                  background: isSelected ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: isSelected ? 'white' : 'var(--text-primary)',
                  height: ITEM_HEIGHT,
                  opacity: isMissing ? 0.5 : 1
                }}
                onClick={(e) => handleClick(file, index, e)}
                onContextMenu={(e) => onContextMenu(e, file)}
                onKeyDown={(e) => handleKeyDown(file, index, e)}
                tabIndex={0}
                role="listitem"
                aria-selected={isSelected}
              >
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 relative overflow-hidden"
                  style={{ background: isSelected ? 'var(--text-on-overlay)' : 'var(--bg-tertiary)', opacity: isSelected ? 0.18 : 1 }}
                >
                  {/* T02：丢失文件角标（P1-H：抽取为 MissingBadge 组件） */}
                  {isMissing && <MissingBadge size="sm" />}
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
                    size={20}
                    variant="overlay"
                    visible={!showThumb}
                    strokeWidth="2"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{file.file_name}</p>
                  {/* U-G15：选中态提升次级文字对比度（opacity-70 → opacity-95 满足 WCAG AA 4.5:1） */}
                  <p className="text-xs" style={{ opacity: isSelected ? 0.95 : 0.7 }}>{formatDate(file.created_at)}</p>
                </div>
                <div className="text-xs text-right" style={{ opacity: isSelected ? 0.95 : 0.7 }}>
                  <p>{file.width && file.height ? `${file.width}x${file.height}` : '-'}</p>
                  <p>{formatFileSize(file.file_size)}</p>
                </div>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <IconStar key={i} size={12} filled={i < file.rating} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export const ListView = React.memo(ListViewComponent)
