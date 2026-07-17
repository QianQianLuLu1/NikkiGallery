import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useUIStore, type ViewMode, type FilterType, type SortBy } from '../../stores/uiStore'
import { ScanButton } from '../scanner/ScanButton'
import { IconGrid, IconList, IconTimeline, IconMasonry, IconSearch, IconChevronUp, IconStar, IconWarning, IconEvent, IconSlideshow, IconImport } from '../../icons'
import { ShareMenuButton } from '../common/ShareMenuButton'
import type { ShareChannelId } from '../common/ShareGuideDialog'

const filterTypes: { id: FilterType; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' }
]

const sortOptions: { id: SortBy; label: string }[] = [
  { id: 'date', label: '日期' },
  { id: 'name', label: '名称' },
  { id: 'size', label: '大小' },
  { id: 'resolution', label: '分辨率' },
  { id: 'rating', label: '评分' }
]

const viewModes: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: 'grid', label: '网格视图', icon: <IconGrid size={16} /> },
  { id: 'list', label: '列表视图', icon: <IconList size={16} /> },
  { id: 'timeline', label: '时间线视图', icon: <IconTimeline size={16} /> },
  { id: 'masonry', label: '瀑布流视图', icon: <IconMasonry size={16} /> },
  { id: 'event-timeline', label: '活动时间轴', icon: <IconEvent size={16} /> }
]

const ratingOptions = [
  { value: null, label: '全部' },
  { value: 1, label: '1星+' },
  { value: 2, label: '2星+' },
  { value: 3, label: '3星+' },
  { value: 4, label: '4星+' },
  { value: 5, label: '5星' }
]

interface GalleryToolbarProps {
  searchInput: string
  onSearchChange: (value: string) => void
  // T09：剪贴板分享入口（仅在已选择文件时由父组件传入）
  onShareClipboard?: (channelId: ShareChannelId) => void
  // T11：幻灯片播放入口，传入当前筛选文件总数与起始索引；不传则隐藏按钮
  onSlideshow?: () => void
  // T14：文件导入向导入口
  onImport?: () => void
}

export const GalleryToolbar: React.FC<GalleryToolbarProps> = ({ searchInput, onSearchChange, onShareClipboard, onSlideshow, onImport }) => {
  const {
    viewMode,
    sortBy,
    sortOrder,
    filterType,
    filterRating,
    filterDateRange,
    showMissingOnly,
    setViewMode,
    setSortBy,
    toggleSortOrder,
    setFilterType,
    setFilterRating,
    setFilterDateRange,
    setShowMissingOnly
  } = useUIStore()

  // 评分筛选下拉
  const [ratingOpen, setRatingOpen] = useState(false)
  const ratingRef = useRef<HTMLDivElement>(null)
  // 日期筛选弹窗
  const [dateOpen, setDateOpen] = useState(false)
  const dateRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ratingRef.current && !ratingRef.current.contains(e.target as Node)) setRatingOpen(false)
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) setDateOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const formatDate = useCallback((d: Date | null) => d ? d.toISOString().slice(0, 10) : '', [])
  const dateLabel = (filterDateRange[0] || filterDateRange[1])
    ? `${formatDate(filterDateRange[0])} ~ ${formatDate(filterDateRange[1])}`
    : '日期'

  return (
    <div className="gallery-toolbar flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        {filterTypes.map((type) => (
          <button
            key={type.id}
            className={`category-tag ${filterType === type.id ? 'active' : ''}`}
            onClick={() => setFilterType(type.id)}
          >
            {type.label}
          </button>
        ))}
        <div className="w-px h-6 mx-2" style={{ background: 'var(--divider)' }} />

        {/* 评分筛选 */}
        <div ref={ratingRef} className="relative">
          <button
            className={`category-tag ${filterRating !== null ? 'active' : ''}`}
            onClick={() => setRatingOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={ratingOpen}
          >
            <IconStar size={12} filled={filterRating !== null} />
            {filterRating !== null ? `${filterRating}星+` : '评分'}
          </button>
          {ratingOpen && (
            <div
              role="listbox"
              className="absolute top-full left-0 mt-1 glass-panel py-1 min-w-[100px] z-50"
              style={{ animation: 'scaleIn 150ms ease-out' }}
            >
              {ratingOptions.map((opt) => (
                <button
                  key={String(opt.value)}
                  role="option"
                  aria-selected={filterRating === opt.value}
                  className="w-full px-3 py-1.5 text-sm text-left transition-colors hover:bg-[var(--hover-bg)]"
                  style={{ color: filterRating === opt.value ? 'var(--accent)' : 'var(--text-primary)' }}
                  onClick={() => {
                    setFilterRating(opt.value)
                    setRatingOpen(false)
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 日期范围筛选 */}
        <div ref={dateRef} className="relative">
          <button
            className={`category-tag ${(filterDateRange[0] || filterDateRange[1]) ? 'active' : ''}`}
            onClick={() => setDateOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={dateOpen}
          >
            {dateLabel}
          </button>
          {dateOpen && (
            <div
              className="absolute top-full left-0 mt-1 glass-panel p-3 z-50 space-y-2"
              style={{ animation: 'scaleIn 150ms ease-out', minWidth: '220px' }}
            >
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>开始日期</label>
                <input
                  type="date"
                  value={formatDate(filterDateRange[0])}
                  onChange={(e) => {
                    const d = e.target.value ? new Date(e.target.value) : null
                    setFilterDateRange([d, filterDateRange[1]])
                  }}
                  className="input-field text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>结束日期</label>
                <input
                  type="date"
                  value={formatDate(filterDateRange[1])}
                  onChange={(e) => {
                    const d = e.target.value ? new Date(e.target.value) : null
                    setFilterDateRange([filterDateRange[0], d])
                  }}
                  className="input-field text-sm"
                />
              </div>
              <button
                className="btn-secondary w-full text-xs"
                onClick={() => {
                  setFilterDateRange([null, null])
                  setDateOpen(false)
                }}
              >
                清除日期
              </button>
            </div>
          )}
        </div>

        {/* T02：仅看丢失文件开关 */}
        <button
          className={`category-tag ${showMissingOnly ? 'active' : ''}`}
          onClick={() => setShowMissingOnly(!showMissingOnly)}
          style={showMissingOnly ? { background: 'var(--danger-bg)', color: 'var(--danger-hover)' } : {}}
          title="只显示文件已被外部删除的记录"
          aria-pressed={showMissingOnly}
        >
          <IconWarning size={12} />
          仅看丢失
        </button>

        <div className="w-px h-6 mx-2" style={{ background: 'var(--divider)' }} />
        {sortOptions.map((sort) => (
          <button
            key={sort.id}
            className={`category-tag ${sortBy === sort.id ? 'active' : ''}`}
            onClick={() => {
              if (sortBy === sort.id) {
                toggleSortOrder()
              } else {
                setSortBy(sort.id)
              }
            }}
          >
            {sort.label}
            {sortBy === sort.id && (
              <IconChevronUp
                size={12}
                strokeWidth="2.5"
                style={{ transform: sortOrder === 'desc' ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}
              />
            )}
          </button>
        ))}
        <div className="w-px h-6 mx-2" style={{ background: 'var(--divider)' }} />
        <div className="relative">
          <IconSearch
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-tertiary)' }}
          />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索文件名或标签..."
            className="search-input pl-9 pr-3 py-1.5 text-sm w-48 sm:w-64 lg:w-80"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {onImport && (
          <button
            className="icon-btn"
            onClick={onImport}
            title="导入文件"
            aria-label="导入文件"
          >
            <IconImport size={18} />
          </button>
        )}
        {onShareClipboard && (
          <ShareMenuButton onSelect={onShareClipboard} label="分享" title="复制到剪贴板并分享到微信/QQ/vivo" />
        )}
        {onSlideshow && (
          <button
            className="icon-btn"
            onClick={onSlideshow}
            title="幻灯片播放"
            aria-label="幻灯片播放"
          >
            <IconSlideshow size={18} />
          </button>
        )}
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
          {viewModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`icon-btn ${viewMode === mode.id ? 'active' : ''}`}
              onClick={() => setViewMode(mode.id)}
              title={mode.label}
              aria-label={mode.label}
              aria-pressed={viewMode === mode.id}
            >
              {mode.icon}
            </button>
          ))}
        </div>
        <div className="w-px h-6" style={{ background: 'var(--divider)' }} />
        <ScanButton />
      </div>
    </div>
  )
}
