import { useMemo } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useMediaStore, type MediaFile } from '../stores/mediaStore'
// P1-U4：复用共享字段映射函数，消除 dual-source-of-truth
import { getGroupFieldValue } from '../utils/group-field'

// C-O5：module-level 缓存（故意为之，多组件共享过滤结果）
// GalleryPage / DetailPage / FullscreenViewer 各自调用 useFilteredMediaFiles 时，
// 若所有依赖引用均未变化，直接返回上次结果，避免重复执行过滤+排序计算。
// 注意：依赖项通过引用比较，所以下游 store 必须返回稳定引用（zustand selector 模式）。
interface FilterCache {
  mediaFiles: MediaFile[] | null
  filterType: string | null
  searchQuery: string | null
  sortBy: string | null
  sortOrder: string | null
  selectedSceneCategories: unknown[] | null
  selectedSceneTimes: unknown[] | null
  filterOutfit: string | null
  currentCategoryId: number | null
  filterDateRange: unknown[] | null
  filterRating: number | null
  currentView: string | null
  showMissingOnly: boolean | null
  groupDimension: string | null
  selectedGroupKey: string | null
  showDuplicates: boolean | null
  value: MediaFile[]
}

const cache: FilterCache = {
  mediaFiles: null,
  filterType: null,
  searchQuery: null,
  sortBy: null,
  sortOrder: null,
  selectedSceneCategories: null,
  selectedSceneTimes: null,
  filterOutfit: null,
  currentCategoryId: null,
  filterDateRange: null,
  filterRating: null,
  currentView: null,
  showMissingOnly: null,
  groupDimension: null,
  selectedGroupKey: null,
  showDuplicates: null,
  value: []
}

export function useFilteredMediaFiles(): MediaFile[] {
  // C-O4：用 selector 订阅具体字段，避免订阅整个 store
  const mediaFiles = useMediaStore((s) => s.mediaFiles)
  const filterType = useUIStore((s) => s.filterType)
  const searchQuery = useUIStore((s) => s.searchQuery)
  const sortBy = useUIStore((s) => s.sortBy)
  const sortOrder = useUIStore((s) => s.sortOrder)
  const selectedSceneCategories = useUIStore((s) => s.selectedSceneCategories)
  const selectedSceneTimes = useUIStore((s) => s.selectedSceneTimes)
  const filterOutfit = useUIStore((s) => s.filterOutfit)
  const currentCategoryId = useUIStore((s) => s.currentCategoryId)
  const filterDateRange = useUIStore((s) => s.filterDateRange)
  const filterRating = useUIStore((s) => s.filterRating)
  const currentView = useUIStore((s) => s.currentView)
  const showMissingOnly = useUIStore((s) => s.showMissingOnly)
  // P0-03：智能分组维度与当前选中的分组 key
  const groupDimension = useUIStore((s) => s.groupDimension)
  const selectedGroupKey = useUIStore((s) => s.selectedGroupKey)
  // P1-01：显示重复项开关
  const showDuplicates = useUIStore((s) => s.showDuplicates)

  return useMemo(() => {
    // 命中缓存：所有依赖引用均未变化时直接返回上次结果
    if (
      cache.mediaFiles === mediaFiles &&
      cache.filterType === filterType &&
      cache.searchQuery === searchQuery &&
      cache.sortBy === sortBy &&
      cache.sortOrder === sortOrder &&
      cache.selectedSceneCategories === selectedSceneCategories &&
      cache.selectedSceneTimes === selectedSceneTimes &&
      cache.filterOutfit === filterOutfit &&
      cache.currentCategoryId === currentCategoryId &&
      cache.filterDateRange === filterDateRange &&
      cache.filterRating === filterRating &&
      cache.currentView === currentView &&
      cache.showMissingOnly === showMissingOnly &&
      cache.groupDimension === groupDimension &&
      cache.selectedGroupKey === selectedGroupKey &&
      cache.showDuplicates === showDuplicates
    ) {
      return cache.value
    }

    let files = [...mediaFiles]

    // F-S10：收藏夹视图仅显示 is_favorite=true 的媒体
    if (currentView === 'favorites') {
      files = files.filter((f) => f.is_favorite)
    }

    // T02：仅看丢失文件开关
    if (showMissingOnly) {
      files = files.filter((f) => f.is_missing === true)
    }

    // P1-01：默认隐藏重复项（is_duplicate=1），用户开启 showDuplicates 时显示全部
    // 回收站视图不受此过滤影响（deletedOnly 由后端处理，前端 currentView='recycle-bin' 不在此过滤）
    if (!showDuplicates && currentView !== 'recycle-bin' && currentView !== 'duplicates') {
      files = files.filter((f) => !f.is_duplicate)
    }

    // P0-03：智能分组过滤
    // 维度：album_type / scene_category / scene_time / outfit / file_type
    // selectedGroupKey === 'all' 时显示该维度下全部文件（不应用分组过滤）
    if (groupDimension !== 'none' && selectedGroupKey !== 'all') {
      files = files.filter((f) => {
        const fieldValue = getGroupFieldValue(f, groupDimension)
        return fieldValue === selectedGroupKey
      })
    }

    if (filterType !== 'all') {
      files = files.filter((f) => f.file_type === filterType)
    }

    if (selectedSceneCategories.length > 0) {
      files = files.filter((f) => selectedSceneCategories.includes(f.scene_category))
    }

    // F-O1：场景时段筛选（基于图像亮度）
    if (selectedSceneTimes.length > 0) {
      files = files.filter((f) => f.scene_time && selectedSceneTimes.includes(f.scene_time))
    }

    // F-O1：套装筛选
    if (filterOutfit) {
      files = files.filter((f) => f.outfit === filterOutfit)
    }

    // 分类筛选
    if (currentCategoryId !== null) {
      files = files.filter((f) => f.category_id === currentCategoryId)
    }

    // 日期范围筛选
    const [startDate, endDate] = filterDateRange
    if (startDate || endDate) {
      files = files.filter((f) => {
        const fileDate = new Date(f.created_at)
        if (startDate && fileDate < startDate) return false
        if (endDate) {
          // endDate 取当天结束（23:59:59）
          const endOfDay = new Date(endDate)
          endOfDay.setHours(23, 59, 59, 999)
          if (fileDate > endOfDay) return false
        }
        return true
      })
    }

    // 评分筛选（显示评分 >= filterRating 的文件）
    if (filterRating !== null && filterRating > 0) {
      files = files.filter((f) => f.rating >= filterRating)
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      files = files.filter(
        (f) =>
          f.file_name.toLowerCase().includes(query) ||
          f.tags.some((t) => t.toLowerCase().includes(query)) ||
          // F-O1：搜索也匹配套装名
          (f.outfit ? f.outfit.toLowerCase().includes(query) : false)
      )
    }

    files.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'name':
          comparison = a.file_name.localeCompare(b.file_name)
          break
        case 'size':
          comparison = a.file_size - b.file_size
          break
        case 'resolution':
          comparison = (a.width || 0) * (a.height || 0) - (b.width || 0) * (b.height || 0)
          break
        case 'rating':
          comparison = a.rating - b.rating
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    // 写入缓存
    cache.mediaFiles = mediaFiles
    cache.filterType = filterType
    cache.searchQuery = searchQuery
    cache.sortBy = sortBy
    cache.sortOrder = sortOrder
    cache.selectedSceneCategories = selectedSceneCategories
    cache.selectedSceneTimes = selectedSceneTimes
    cache.filterOutfit = filterOutfit
    cache.currentCategoryId = currentCategoryId
    cache.filterDateRange = filterDateRange
    cache.filterRating = filterRating
    cache.currentView = currentView
    cache.showMissingOnly = showMissingOnly
    cache.groupDimension = groupDimension
    cache.selectedGroupKey = selectedGroupKey
    cache.showDuplicates = showDuplicates
    cache.value = files

    return files
  }, [
    mediaFiles,
    filterType,
    searchQuery,
    sortBy,
    sortOrder,
    selectedSceneCategories,
    selectedSceneTimes,
    filterOutfit,
    currentCategoryId,
    filterDateRange,
    filterRating,
    currentView,
    showMissingOnly,
    groupDimension,
    selectedGroupKey,
    showDuplicates
  ])
}

// P1-U4：getGroupFieldValue 已迁移至 utils/group-field.ts
