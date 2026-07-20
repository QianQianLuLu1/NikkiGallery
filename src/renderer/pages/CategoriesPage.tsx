import React, { useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import {
  useMediaStore,
  loadMediaFromDatabase,
  Category,
  SCENE_CATEGORIES,
  SCENE_TIMES,
  type SceneCategory,
  type SceneTime
} from '../stores/mediaStore'
import type { SceneCategoryConfig, SceneTimeConfig } from '../../shared/scene-category'
import { useUIStore } from '../stores/uiStore'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useGlobalToast } from './settings/sections'
import {
  IconChevronDown,
  IconChevronUp,
  IconMove,
  IconEdit,
  IconDelete,
  IconSearch
} from '../icons'

interface FlatCategory extends Category {
  depth: number
}

// P2-U5：ICON_OPTIONS 为唯一数据源，getIconEmoji 从中派生，消除重复映射
// P1-U15：label 改为 labelKey，渲染时通过 t() 翻译
const ICON_OPTIONS = [
  { value: 'folder', emoji: '📁', labelKey: 'categories.iconLabel.folder' },
  { value: 'image', emoji: '🖼️', labelKey: 'categories.iconLabel.image' },
  { value: 'video', emoji: '🎬', labelKey: 'categories.iconLabel.video' },
  { value: 'star', emoji: '⭐', labelKey: 'categories.iconLabel.star' },
  { value: 'heart', emoji: '❤️', labelKey: 'categories.iconLabel.heart' },
  { value: 'camera', emoji: '📷', labelKey: 'categories.iconLabel.camera' },
  { value: 'tag', emoji: '🏷️', labelKey: 'categories.iconLabel.tag' },
  { value: 'calendar', emoji: '📅', labelKey: 'categories.iconLabel.calendar' },
  { value: 'location', emoji: '📍', labelKey: 'categories.iconLabel.location' },
  { value: 'user', emoji: '👤', labelKey: 'categories.iconLabel.user' },
  { value: 'palette', emoji: '🎨', labelKey: 'categories.iconLabel.palette' },
  { value: 'sparkles', emoji: '✨', labelKey: 'categories.iconLabel.sparkles' }
]

const ICON_EMOJI_MAP: Record<string, string> = Object.fromEntries(
  ICON_OPTIONS.map((opt) => [opt.value, opt.emoji])
)

function getIconEmoji(icon?: string): string {
  return ICON_EMOJI_MAP[icon || ''] || '📁'
}

export const CategoriesPage: React.FC = () => {
  const { t } = useTranslation()
  const { categories, setCategories, setMediaFiles, mediaFiles } = useMediaStore()
  const {
    selectedSceneCategories,
    toggleSceneCategory,
    clearSceneCategories,
    selectAllSceneCategories,
    // F-O1：场景时段筛选
    selectedSceneTimes,
    toggleSceneTime,
    clearSceneTimes,
    selectAllSceneTimes,
    navigateTo
  } = useUIStore()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#888888')
  const [newIcon, setNewIcon] = useState('folder')
  const [newParentId, setNewParentId] = useState<number | ''>('')
  const [editing, setEditing] = useState<Category | null>(null)
  const [confirm, setConfirm] = useState<{ open: boolean; category: Category | null }>({
    open: false,
    category: null
  })
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  // P3-3：拖拽排序完成后的 FLIP 重排动画
  const [listRef] = useAutoAnimate({ duration: 250, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' })
  const [assignCategory, setAssignCategory] = useState<Category | null>(null)
  // U-O9：分类树折叠状态
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set())
  // U-O10：归类弹窗搜索与分页
  const [assignSearch, setAssignSearch] = useState('')
  const [assignPage, setAssignPage] = useState(0)
  const ASSIGN_PAGE_SIZE = 50
  const [selectedMedia, setSelectedMedia] = useState<Set<string>>(new Set())
  // F-O1：场景时段批量分析加载状态
  const [analyzing, setAnalyzing] = useState(false)
  const showMessage = useGlobalToast()
  // 修复 U-S8：assignCategory 内联模态添加焦点陷阱、Esc 关闭、aria 属性
  const assignModalRef = useFocusTrap<HTMLDivElement>({
    active: !!assignCategory,
    onEscape: () => setAssignCategory(null)
  })

  const refresh = async () => {
    const res = await loadMediaFromDatabase()
    if (res) {
      setCategories(res.categories)
      setMediaFiles(res.files)
    }
  }

  const sceneCategoryCounts = useMemo(() => {
    const counts: Record<SceneCategory, number> = {
      thumbnail: 0,
      screenshot: 0,
      travel_journal: 0,
      world_tour: 0,
      collage: 0,
      other: 0
    }
    for (const file of mediaFiles) {
      counts[file.scene_category] = (counts[file.scene_category] || 0) + 1
    }
    return counts
  }, [mediaFiles])

  // F-O1：场景时段统计（基于图像亮度分析结果）
  const sceneTimeCounts = useMemo(() => {
    const counts: Record<SceneTime, number> = {
      day: 0,
      night: 0,
      dawn: 0,
      dusk: 0,
      unknown: 0
    }
    for (const file of mediaFiles) {
      const t = file.scene_time || 'unknown'
      counts[t] = (counts[t] || 0) + 1
    }
    return counts
  }, [mediaFiles])

  const rootCategories = useMemo(() => {
    const buildTree = (parentId: number | null | undefined): Category[] => {
      return categories
        .filter((c) => (c.parent_id ?? null) === (parentId ?? null))
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c) => ({ ...c, children: buildTree(c.id) }))
    }
    return buildTree(null)
  }, [categories])

  const flattenTree = (tree: Category[], depth = 0, collapsed: Set<number>): FlatCategory[] => {
    return tree.flatMap((cat) => {
      const children = cat.children || []
      const self = { ...cat, depth }
      // U-O9：若该分类被折叠，不展开其子分类
      if (collapsed.has(cat.id)) return [self]
      return [self, ...flattenTree(children, depth + 1, collapsed)]
    })
  }

  const flatCategories = useMemo(
    () => flattenTree(rootCategories, 0, collapsedIds),
    [rootCategories, collapsedIds]
  )

  // U-O9：切换分类折叠状态
  const toggleCollapse = useCallback((id: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // U-O10：归类弹窗中过滤 + 分页后的媒体列表
  const filteredAssignMedia = useMemo(() => {
    if (!assignCategory) return []
    const keyword = assignSearch.trim().toLowerCase()
    const list = keyword
      ? mediaFiles.filter((m) => m.file_name.toLowerCase().includes(keyword))
      : mediaFiles
    return list
  }, [mediaFiles, assignSearch, assignCategory])

  const pagedAssignMedia = useMemo(() => {
    const start = assignPage * ASSIGN_PAGE_SIZE
    return filteredAssignMedia.slice(start, start + ASSIGN_PAGE_SIZE)
  }, [filteredAssignMedia, assignPage])

  const handleCreate = async () => {
    if (!newName.trim() || !window.electronAPI) return
    try {
      const result = await window.electronAPI.category.create(newName.trim(), {
        icon: newIcon,
        color: newColor,
        parentId: newParentId ? Number(newParentId) : undefined
      })
      if (result.success) {
        setNewName('')
        setNewColor('#888888')
        setNewIcon('folder')
        setNewParentId('')
        await refresh()
        showMessage('分类创建成功')
      } else {
        showMessage(result.message || '创建失败', 'error')
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '创建失败', 'error')
    }
  }

  const handleUpdate = async () => {
    if (!editing || !window.electronAPI) return
    try {
      const result = await window.electronAPI.category.update(editing.id, {
        name: editing.name,
        icon: editing.icon,
        color: editing.color
      })
      if (result.success) {
        setEditing(null)
        await refresh()
        showMessage('分类更新成功')
      } else {
        showMessage(result.message || '更新失败', 'error')
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '更新失败', 'error')
    }
  }

  const handleDelete = async (category: Category) => {
    if (!window.electronAPI) return
    try {
      const result = await window.electronAPI.category.delete(category.id)
      if (result.success) {
        setConfirm({ open: false, category: null })
        await refresh()
        showMessage('分类删除成功')
      } else {
        showMessage(result.message || '删除失败', 'error')
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '删除失败', 'error')
    }
  }

  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault()
    if (id === draggingId) return
    setDragOverId(id)
  }

  const handleDrop = async (e: React.DragEvent, targetId: number) => {
    e.preventDefault()
    setDragOverId(null)
    if (!draggingId || draggingId === targetId || !window.electronAPI) return

    const dragged = categories.find((c) => c.id === draggingId)
    const target = categories.find((c) => c.id === targetId)
    if (!dragged || !target) return

    // 阻止将父分类拖入自己的子分类中
    const isDescendant = (parentId: number, childId: number): boolean => {
      const child = categories.find((c) => c.id === childId)
      if (!child) return false
      if (child.parent_id === parentId) return true
      if (child.parent_id) return isDescendant(parentId, child.parent_id)
      return false
    }
    if (isDescendant(dragged.id, target.id)) {
      showMessage('不能将分类拖入其子分类中', 'error')
      setDraggingId(null)
      return
    }

    // 更新目标为父分类，并放到目标之后
    const orders = categories.map((c) => ({
      id: c.id,
      sort_order: c.sort_order,
      parent_id: c.parent_id
    }))

    const draggedOrder = orders.find((o) => o.id === draggingId)
    const targetOrder = orders.find((o) => o.id === targetId)
    if (!draggedOrder || !targetOrder) return

    draggedOrder.parent_id = target.id
    draggedOrder.sort_order = targetOrder.sort_order + 1

    // 重新计算同层级排序
    const siblings = orders
      .filter((o) => o.parent_id === target.id)
      .sort((a, b) => a.sort_order - b.sort_order)
    siblings.forEach((s, index) => {
      s.sort_order = index + 1
    })

    try {
      const result = await window.electronAPI.category.reorder(orders)
      if (result.success) {
        await refresh()
        showMessage('分类层级调整成功')
      } else {
        showMessage(result.message || '调整失败', 'error')
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '调整失败', 'error')
    }
    setDraggingId(null)
  }

  const handleAssignMedia = async () => {
    if (!assignCategory || !window.electronAPI) return
    try {
      const updates = mediaFiles
        .filter((m) => {
          const inCategory = m.category_id === assignCategory.id
          const selected = selectedMedia.has(m.id)
          return inCategory !== selected
        })
        .map((m) => ({
          id: m.id,
          categoryId: selectedMedia.has(m.id) ? assignCategory.id : null
        }))

      for (const item of updates) {
        const result = await window.electronAPI.mediaAction.updateCategory(
          Number(item.id),
          item.categoryId
        )
        if (!result.success) {
          showMessage(result.message || '归类失败', 'error')
          return
        }
      }

      await refresh()
      setAssignCategory(null)
      showMessage(`已更新 ${updates.length} 个文件的分类`)
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '归类失败', 'error')
    }
  }

  const handleReorder = async (id: number, direction: 'up' | 'down') => {
    if (!window.electronAPI) return
    const cat = categories.find((c) => c.id === id)
    if (!cat) return
    const siblings = categories
      .filter((c) => (c.parent_id ?? null) === (cat.parent_id ?? null))
      .sort((a, b) => a.sort_order - b.sort_order)
    const index = siblings.findIndex((c) => c.id === id)
    if (index < 0) return
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= siblings.length) return

    const orders = categories.map((c) => ({
      id: c.id,
      sort_order: c.sort_order,
      parent_id: c.parent_id
    }))

    const currentOrder = siblings[index].sort_order
    const swapOrder = siblings[swapIndex].sort_order
    const current = orders.find((o) => o.id === id)
    const swap = orders.find((o) => o.id === siblings[swapIndex].id)
    if (current && swap) {
      current.sort_order = swapOrder
      swap.sort_order = currentOrder
    }

    try {
      const result = await window.electronAPI.category.reorder(orders)
      if (result.success) {
        await refresh()
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '排序调整失败', 'error')
    }
  }

  const handleSceneCategoryClick = (e: React.MouseEvent, key: SceneCategory) => {
    toggleSceneCategory(key, e.ctrlKey || e.metaKey)
    navigateTo('gallery')
  }

  // F-O1：场景时段点击筛选（与游戏内场景分类一致的交互逻辑）
  const handleSceneTimeClick = (e: React.MouseEvent, key: SceneTime) => {
    toggleSceneTime(key, e.ctrlKey || e.metaKey)
    navigateTo('gallery')
  }

  // F-O1：批量分析场景时段（对图库中所有未分析的图片执行亮度分析）
  const handleAnalyzeSceneTime = async () => {
    if (!window.electronAPI?.mediaAction?.analyzeSceneTime || analyzing) return
    setAnalyzing(true)
    try {
      const result = await window.electronAPI.mediaAction.analyzeSceneTime()
      if (result.success) {
        showMessage(result.message || `已分析 ${result.analyzed ?? 0} 张图片的场景时段`, 'success')
        await refresh()
      } else {
        showMessage(result.message || '分析失败', 'error')
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '分析失败', 'error')
    } finally {
      setAnalyzing(false)
    }
  }

  const isAllSceneSelected =
    SCENE_CATEGORIES.length > 0 &&
    SCENE_CATEGORIES.every((c: SceneCategoryConfig) => selectedSceneCategories.includes(c.key))

  // F-O1：场景时段全选状态
  const isAllSceneTimeSelected =
    SCENE_TIMES.length > 0 &&
    SCENE_TIMES.every((c: SceneTimeConfig) => selectedSceneTimes.includes(c.key))

  return (
    <div className="space-y-6 max-w-3xl mx-auto h-full overflow-y-auto">
      <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        分类管理
      </h2>

      {/* 游戏内场景分类 */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            游戏内场景
          </h3>
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary text-xs px-3 py-1.5"
              onClick={isAllSceneSelected ? clearSceneCategories : selectAllSceneCategories}
            >
              {isAllSceneSelected ? '取消全选' : '全选游戏分类'}
            </button>
            {selectedSceneCategories.length > 0 && (
              <button className="btn-secondary text-xs px-3 py-1.5" onClick={clearSceneCategories}>
                清除筛选
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {SCENE_CATEGORIES.map((category: SceneCategoryConfig) => {
            const isSelected = selectedSceneCategories.includes(category.key)
            return (
              <button
                key={category.key}
                className={`category-tag ${isSelected ? 'active' : ''}`}
                onClick={(e) => handleSceneCategoryClick(e, category.key)}
                title="按住 Ctrl / Cmd 点击可多选"
              >
                <span>{category.label}</span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{
                    background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)'
                  }}
                >
                  {sceneCategoryCounts[category.key] || 0}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          提示：按住 Ctrl / Cmd 点击可同时选择多个场景分类；点击后自动跳转图库并应用筛选。
        </p>
      </div>

      {/* F-O1：场景时段筛选（基于图像亮度自动识别） */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              场景时段
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              基于图像亮度自动识别，可在「设置 → 扫描」中触发批量分析
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-primary text-xs px-3 py-1.5"
              onClick={handleAnalyzeSceneTime}
              disabled={analyzing}
            >
              {analyzing ? '分析中…' : '分析时段'}
            </button>
            <button
              className="btn-secondary text-xs px-3 py-1.5"
              onClick={isAllSceneTimeSelected ? clearSceneTimes : selectAllSceneTimes}
            >
              {isAllSceneTimeSelected ? '取消全选' : '全选时段'}
            </button>
            {selectedSceneTimes.length > 0 && (
              <button className="btn-secondary text-xs px-3 py-1.5" onClick={clearSceneTimes}>
                清除筛选
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {SCENE_TIMES.map((time: SceneTimeConfig) => {
            const isSelected = selectedSceneTimes.includes(time.key)
            return (
              <button
                key={time.key}
                className={`category-tag ${isSelected ? 'active' : ''}`}
                onClick={(e) => handleSceneTimeClick(e, time.key)}
                title={`${time.description}｜按住 Ctrl / Cmd 点击可多选`}
              >
                <span>{time.label}</span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{
                    background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)'
                  }}
                >
                  {sceneTimeCounts[time.key] || 0}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          提示：场景时段需先在「设置」中执行批量分析才会生成；分析仅针对图片，视频不参与。
        </p>
      </div>

      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          新建分类
        </h3>
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="分类名称"
            className="input-field flex-1 min-w-[140px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
          />
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-12 h-10 rounded cursor-pointer"
            title="选择颜色"
          />
          <select
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
            className="input-field text-sm"
            style={{ minWidth: '140px' }}
          >
            {ICON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.emoji} {t(opt.labelKey)}
              </option>
            ))}
          </select>
          <select
            value={newParentId}
            onChange={(e) => setNewParentId(e.target.value ? Number(e.target.value) : '')}
            className="input-field text-sm"
            style={{ minWidth: '140px' }}
          >
            <option value="">无父分类</option>
            {flatCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {'　'.repeat(cat.depth)}
                {cat.name}
              </option>
            ))}
          </select>
          <button className="btn-primary" onClick={handleCreate}>
            创建
          </button>
        </div>
      </div>

      <div ref={listRef} className="glass-card p-5 space-y-3">
        <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          分类列表（拖拽可调整层级，点击箭头折叠/展开）
        </h3>
        {flatCategories.map((cat) => {
          const hasChildren = !!(cat.children && cat.children.length > 0)
          const isCollapsed = collapsedIds.has(cat.id)
          return (
            <div
              key={cat.id}
              draggable={!cat.is_system}
              onDragStart={(e) => handleDragStart(e, cat.id)}
              onDragOver={(e) => handleDragOver(e, cat.id)}
              onDrop={(e) => handleDrop(e, cat.id)}
              className={`flex items-center justify-between p-3 rounded-xl transition-all ${draggingId === cat.id ? 'opacity-60 scale-[1.02] shadow-lg' : ''} ${dragOverId === cat.id ? 'ring-2 ring-[var(--accent)]' : ''}`}
              style={{
                background: 'var(--bg-tertiary)',
                marginLeft: `${cat.depth * 24}px`,
                // U-O9：非根分类添加左侧连接线
                borderLeft: cat.depth > 0 ? '2px solid var(--divider)' : 'none',
                paddingLeft: cat.depth > 0 ? '14px' : '12px'
              }}
              title={cat.is_system ? '系统分类不支持拖拽' : '拖拽到其他分类上可设置为子分类'}
            >
              {editing?.id === cat.id ? (
                <div className="flex items-center gap-3 flex-1">
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="input-field flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdate()
                    }}
                  />
                  <input
                    type="color"
                    value={editing.color}
                    onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                    className="w-10 h-9 rounded cursor-pointer"
                  />
                  <select
                    value={editing.icon || 'folder'}
                    onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                    className="input-field text-sm"
                    style={{ minWidth: '120px' }}
                  >
                    {ICON_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.emoji} {t(opt.labelKey)}
                      </option>
                    ))}
                  </select>
                  <button className="btn-primary text-sm" onClick={handleUpdate}>
                    保存
                  </button>
                  <button className="btn-secondary text-sm" onClick={() => setEditing(null)}>
                    取消
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 min-w-0">
                    {/* U-O9：折叠/展开按钮（仅有子分类时显示） */}
                    {hasChildren ? (
                      <button
                        className="icon-btn flex-shrink-0"
                        style={{ width: '24px', height: '24px' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleCollapse(cat.id)
                        }}
                        title={isCollapsed ? '展开子分类' : '折叠子分类'}
                        aria-label={isCollapsed ? '展开子分类' : '折叠子分类'}
                        aria-expanded={!isCollapsed}
                      >
                        <IconChevronDown
                          size={14}
                          strokeWidth={2.5}
                          style={{
                            transform: isCollapsed ? 'rotate(-90deg)' : 'none',
                            transition: 'transform 200ms ease-out'
                          }}
                        />
                      </button>
                    ) : (
                      <span className="flex-shrink-0" style={{ width: '24px', height: '24px' }} />
                    )}
                    <span className="text-lg flex-shrink-0" title={`图标: ${cat.icon || 'folder'}`}>
                      {getIconEmoji(cat.icon)}
                    </span>
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ background: cat.color }}
                    />
                    <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {cat.name}
                    </span>
                    {cat.is_system && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: 'var(--bg-secondary)' }}
                      >
                        系统
                      </span>
                    )}
                    <span
                      className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                    >
                      {mediaFiles.filter((m) => m.category_id === cat.id).length} 项
                    </span>
                    {hasChildren && isCollapsed && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: 'var(--hover-bg)', color: 'var(--text-tertiary)' }}
                      >
                        +{cat.children?.length || 0} 子分类
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!cat.is_system && (
                      <>
                        <button
                          className="icon-btn"
                          onClick={() => handleReorder(cat.id, 'up')}
                          title="上移"
                        >
                          <IconChevronUp size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          onClick={() => handleReorder(cat.id, 'down')}
                          title="下移"
                        >
                          <IconChevronDown size={16} />
                        </button>
                      </>
                    )}
                    <button
                      className="icon-btn"
                      onClick={() => {
                        setAssignCategory(cat)
                        setSelectedMedia(
                          new Set(
                            mediaFiles.filter((m) => m.category_id === cat.id).map((m) => m.id)
                          )
                        )
                        // U-O10：打开弹窗时重置搜索与分页
                        setAssignSearch('')
                        setAssignPage(0)
                      }}
                      title="归类媒体"
                    >
                      <IconMove size={16} />
                    </button>
                    <button className="icon-btn" onClick={() => setEditing(cat)} title="编辑">
                      <IconEdit size={16} />
                    </button>
                    {!cat.is_system && (
                      <button
                        className="icon-btn"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => setConfirm({ open: true, category: cat })}
                        title="删除"
                      >
                        <IconDelete size={16} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={confirm.open}
        title="删除分类"
        message={`确定删除分类 "${confirm.category?.name}" 吗？关联的媒体文件不会被删除。`}
        confirmVariant="danger"
        onConfirm={() => confirm.category && handleDelete(confirm.category)}
        onCancel={() => setConfirm({ open: false, category: null })}
      />

      {assignCategory && (
        <div
          ref={assignModalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="assign-category-title"
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'var(--overlay-bg)' }}
          onClick={() => setAssignCategory(null)}
        >
          <div
            className="glass-card p-5 w-full max-w-lg mx-4 max-h-[80vh] flex flex-col modal-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="assign-category-title"
              className="text-lg font-semibold mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              归类媒体
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              选择要归入「{assignCategory.name}」的媒体文件
            </p>
            {/* U-O10：搜索框 */}
            <div className="relative mb-3">
              <IconSearch
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <input
                type="text"
                value={assignSearch}
                onChange={(e) => {
                  setAssignSearch(e.target.value)
                  setAssignPage(0)
                }}
                placeholder="搜索文件名..."
                className="input-field pl-9 text-sm"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4" style={{ maxHeight: '50vh' }}>
              {filteredAssignMedia.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
                  {mediaFiles.length === 0 ? '暂无媒体文件' : '未找到匹配的文件'}
                </p>
              ) : (
                pagedAssignMedia.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-[var(--hover-bg)]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMedia.has(m.id)}
                      onChange={(e) => {
                        const next = new Set(selectedMedia)
                        if (e.target.checked) next.add(m.id)
                        else next.delete(m.id)
                        setSelectedMedia(next)
                      }}
                      className="w-4 h-4"
                    />
                    <span
                      className="text-sm truncate flex-1"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {m.file_name}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {m.file_type === 'image' ? '图片' : '视频'}
                    </span>
                  </label>
                ))
              )}
            </div>
            {/* U-O10：分页控件 */}
            {filteredAssignMedia.length > ASSIGN_PAGE_SIZE && (
              <div
                className="flex items-center justify-between mb-3 text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <span>
                  第 {assignPage * ASSIGN_PAGE_SIZE + 1}-
                  {Math.min((assignPage + 1) * ASSIGN_PAGE_SIZE, filteredAssignMedia.length)} 项，共{' '}
                  {filteredAssignMedia.length} 项
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="btn-secondary text-xs px-2 py-1"
                    onClick={() => setAssignPage((p) => Math.max(0, p - 1))}
                    disabled={assignPage === 0}
                  >
                    上一页
                  </button>
                  <span>
                    {assignPage + 1} / {Math.ceil(filteredAssignMedia.length / ASSIGN_PAGE_SIZE)}
                  </span>
                  <button
                    className="btn-secondary text-xs px-2 py-1"
                    onClick={() =>
                      setAssignPage((p) =>
                        Math.min(
                          Math.ceil(filteredAssignMedia.length / ASSIGN_PAGE_SIZE) - 1,
                          p + 1
                        )
                      )
                    }
                    disabled={
                      assignPage >= Math.ceil(filteredAssignMedia.length / ASSIGN_PAGE_SIZE) - 1
                    }
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setAssignCategory(null)}>
                取消
              </button>
              <button className="btn-primary" onClick={handleAssignMedia}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
