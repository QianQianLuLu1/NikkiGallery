import React, { useMemo, useRef, useState, useCallback } from 'react'
import { toFileUrl } from '../../utils/file'
import { formatDate } from '../../utils/date'
import { MissingBadge } from '../common/MissingBadge'
import { MediaThumbPlaceholder } from './MediaThumbPlaceholder'
import { useContainerSize } from '../../hooks/useContainerSize'
import { useFailedImages } from '../../hooks/useFailedImages'
import { getResponsiveColumns } from '../../utils/responsive'
import type { MediaFile } from '../../stores/mediaStore'

interface TimelineViewProps {
  files: MediaFile[]
  onOpen: (file: MediaFile) => void
  onContextMenu: (event: React.MouseEvent, file: MediaFile) => void
}

const GROUP_HEADER_HEIGHT = 48
const GAP_Y = 16
const ITEM_HEIGHT = 180

export const TimelineView: React.FC<TimelineViewProps> = ({ files, onOpen, onContextMenu }) => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { width, height: containerHeight } = useContainerSize(wrapperRef)
  const [scrollTop, setScrollTop] = useState(0)
  // P1-U10：failedImages 状态管理 + files 变化时自动清空（原实现遗漏清空逻辑）
  const { failedImages, markFailed } = useFailedImages(files)

  const grouped = useMemo(() => {
    const map = new Map<string, MediaFile[]>()
    files.forEach((file) => {
      const date = formatDate(file.created_at)
      if (!map.has(date)) map.set(date, [])
      map.get(date)!.push(file)
    })
    return Array.from(map.entries()).map(([date, groupFiles]) => ({
      date,
      files: groupFiles
    }))
  }, [files])

  const handleScroll = useCallback(() => {
    setScrollTop(wrapperRef.current?.scrollTop || 0)
  }, [])

  const layout = useMemo(() => {
    const cols = getResponsiveColumns(width)
    let offset = 0
    return grouped.map((group) => {
      const rows = Math.ceil(group.files.length / cols)
      const groupHeight = GROUP_HEADER_HEIGHT + rows * ITEM_HEIGHT + (rows - 1) * GAP_Y + GAP_Y
      const start = offset
      offset += groupHeight
      return { ...group, cols, rows, start, height: groupHeight }
    })
  }, [grouped, width])

  const totalHeight = useMemo(() => {
    return layout.reduce((sum, g) => sum + g.height, 0)
  }, [layout])

  const visibleGroups = useMemo(() => {
    return layout.filter(
      (g) => g.start + g.height > scrollTop && g.start < scrollTop + containerHeight
    )
  }, [layout, scrollTop, containerHeight])

  return (
    <div
      ref={wrapperRef}
      className="flex-1 min-h-0 overflow-y-auto"
      onScroll={handleScroll}
      role="feed"
      aria-label="时间线"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleGroups.map((group) => (
          <div
            key={group.date}
            style={{
              position: 'absolute',
              top: group.start,
              left: 0,
              right: 0
            }}
          >
            <div className="flex items-center gap-4 mb-4" style={{ height: GROUP_HEADER_HEIGHT }}>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {group.date}
              </h3>
              <div className="flex-1 h-px" style={{ background: 'var(--divider)' }} />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {group.files.length} 项
              </span>
            </div>
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${group.cols}, minmax(0, 1fr))`
              }}
            >
              {group.files.map((file) => {
                const thumbUrl = toFileUrl(file.thumbnail || file.file_path)
                const hasError = failedImages.has(file.id)
                const isMissing = file.is_missing === true
                const showThumb = !!thumbUrl && !hasError
                return (
                  <div
                    key={file.id}
                    className="media-card aspect-square"
                    style={{
                      background: 'var(--bg-tertiary)',
                      height: ITEM_HEIGHT,
                      opacity: isMissing ? 0.45 : 1
                    }}
                    onClick={() => onOpen(file)}
                    onContextMenu={(e) => onContextMenu(e, file)}
                    role="article"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onOpen(file)
                      }
                    }}
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
                          onError={() => markFailed(file.id)}
                        />
                      ) : null}
                      <MediaThumbPlaceholder
                        fileType={file.file_type}
                        hasError={hasError}
                        visible={!showThumb}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
