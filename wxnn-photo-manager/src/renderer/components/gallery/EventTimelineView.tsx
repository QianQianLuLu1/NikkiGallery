import React, { useMemo, useRef, useState, useCallback } from 'react'
import { toFileUrl } from '../../utils/file'
import { IconEvent } from '../../icons'
import { MissingBadge } from '../common/MissingBadge'
import { MediaThumbPlaceholder } from './MediaThumbPlaceholder'
import { useContainerSize } from '../../hooks/useContainerSize'
import { useFailedImages } from '../../hooks/useFailedImages'
import { getResponsiveColumns } from '../../utils/responsive'
import type { MediaFile } from '../../stores/mediaStore'
import {
  getTimelineNodes,
  findVersionByDate,
  type TimelineNode
} from '../../../main/utils/game-events'

interface EventTimelineViewProps {
  files: MediaFile[]
  onOpen: (file: MediaFile) => void
  onContextMenu: (event: React.MouseEvent, file: MediaFile) => void
}

const NODE_HEADER_HEIGHT = 80 // 节点标题区高度（含版本号 / 日期 / 描述）
const GAP_Y = 16
const ITEM_HEIGHT = 180

// 将文件按所属版本/活动节点分组
function groupFilesByNode(files: MediaFile[]): Array<{ node: TimelineNode; files: MediaFile[] }> {
  const nodes = getTimelineNodes()
  if (nodes.length === 0) return []

  // 按文件的 created_at 找到所属版本节点
  const fileVersionMap = new Map<string, MediaFile[]>()
  for (const file of files) {
    const version = findVersionByDate(file.created_at)
    const key = version ? `version-${version.version}` : 'unknown'
    if (!fileVersionMap.has(key)) fileVersionMap.set(key, [])
    fileVersionMap.get(key)!.push(file)
  }

  // 按时间倒序排列节点（最新版本在顶部）
  const result: Array<{ node: TimelineNode; files: MediaFile[] }> = []
  const sortedNodes = [...nodes].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  )
  for (const node of sortedNodes) {
    const nodeFiles = fileVersionMap.get(node.key) || []
    if (nodeFiles.length > 0) {
      result.push({ node, files: nodeFiles })
    }
  }

  // 未匹配任何版本节点的文件归入"未知时期"
  const unknownFiles = fileVersionMap.get('unknown') || []
  if (unknownFiles.length > 0) {
    result.push({
      node: {
        type: 'event',
        key: 'unknown',
        name: '未知时期',
        startDate: '',
        description: '文件拍摄时间早于游戏开服或无法识别'
      },
      files: unknownFiles
    })
  }

  return result
}

export const EventTimelineView: React.FC<EventTimelineViewProps> = ({
  files,
  onOpen,
  onContextMenu
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { width, height: containerHeight } = useContainerSize(wrapperRef)
  const [scrollTop, setScrollTop] = useState(0)
  // P1-U10：failedImages 状态管理 + files 变化时自动清空（原实现遗漏清空逻辑）
  const { failedImages, markFailed } = useFailedImages(files)

  const grouped = useMemo(() => groupFilesByNode(files), [files])

  const handleScroll = useCallback(() => {
    setScrollTop(wrapperRef.current?.scrollTop || 0)
  }, [])

  const layout = useMemo(() => {
    const cols = getResponsiveColumns(width)
    let offset = 0
    return grouped.map((group) => {
      const rows = Math.ceil(group.files.length / cols)
      const groupHeight = NODE_HEADER_HEIGHT + rows * ITEM_HEIGHT + (rows - 1) * GAP_Y + GAP_Y
      const start = offset
      offset += groupHeight
      return { ...group, cols, rows, start, height: groupHeight }
    })
  }, [grouped, width])

  const totalHeight = useMemo(() => layout.reduce((sum, g) => sum + g.height, 0), [layout])

  const visibleGroups = useMemo(() => {
    return layout.filter(
      (g) => g.start + g.height > scrollTop && g.start < scrollTop + containerHeight
    )
  }, [layout, scrollTop, containerHeight])

  if (grouped.length === 0) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <div className="flex flex-col items-center gap-2">
          <IconEvent size={36} strokeWidth="1.5" />
          <p className="text-sm">暂无照片可按版本分组</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={wrapperRef}
      className="flex-1 min-h-0 overflow-y-auto"
      onScroll={handleScroll}
      role="feed"
      aria-label="活动时间轴"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleGroups.map((group) => (
          <div
            key={group.node.key}
            style={{ position: 'absolute', top: group.start, left: 0, right: 0 }}
          >
            {/* 节点标题区：版本徽章 + 名称 + 日期 + 张数 */}
            <div className="flex items-center gap-3 mb-4" style={{ height: NODE_HEADER_HEIGHT }}>
              <div
                className="flex items-center justify-center"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: group.node.type === 'version' ? 'var(--accent)' : 'var(--warning-bg)',
                  color:
                    group.node.type === 'version' ? 'var(--text-on-accent)' : 'var(--warning-text)',
                  flexShrink: 0
                }}
              >
                {group.node.type === 'version' ? (
                  <span className="text-xs font-bold">v{group.node.version}</span>
                ) : (
                  <IconEvent size={22} />
                )}
              </div>
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3
                    className="text-base font-semibold truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {group.node.name}
                  </h3>
                  {group.node.type === 'version' && (
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      版本更新
                    </span>
                  )}
                </div>
                <div
                  className="flex items-center gap-2 text-xs"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <span>{group.node.startDate || '—'}</span>
                  {group.node.description && (
                    <>
                      <span>·</span>
                      <span className="truncate">{group.node.description}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex-1 h-px" style={{ background: 'var(--divider)' }} />
              <span
                className="text-sm whitespace-nowrap"
                style={{ color: 'var(--text-secondary)' }}
              >
                {group.files.length} 项
              </span>
            </div>
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${group.cols}, minmax(0, 1fr))` }}
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
