import React, { useEffect, useState, useMemo } from 'react'
import { useUIStore, type GroupDimension } from '../../stores/uiStore'
import { useMediaStore } from '../../stores/mediaStore'
// P0-U1：场景分类/时段 label 直接复用 shared 字典，避免本地字典 key 与类型定义不匹配
import { getSceneCategoryLabel, getSceneTimeLabel } from '../../../shared/scene-category'
// P1-U4：复用共享字段映射函数，消除 dual-source-of-truth
import { getGroupFieldValue } from '../../utils/group-field'
// P2-U6：维度选项统一来自 shared/dimension，消除与 Sidebar 的重复定义
import { GROUP_DIMENSION_OPTIONS } from '../../../shared/dimension'

// P0-03：智能分组面板
// 与对标项目 Nikki Albums 的固定 19+3 相册类型不同，
// 本面板提供 5 维度动态分组（游戏相册类型/场景/时段/套装/文件类型），
// 配合"自定义分类"维度（由现有 categories 系统提供）共 6 维度

// 文件类型 label（仅 image/video 两类，shared 未定义，内联保持简单）
const FILE_TYPE_LABELS: Record<string, string> = {
  image: '图片',
  video: '视频'
}

// 获取维度下 key 的中文标签
// scene_category/scene_time 直接走 shared 字典，确保 key 与 SceneCategory/SceneTime 类型一致
function getGroupLabel(dimension: GroupDimension, key: string): string {
  if (dimension === 'album_type') return key // album_type 数据库已存中文
  if (dimension === 'scene_category') return getSceneCategoryLabel(key as any)
  if (dimension === 'scene_time') return getSceneTimeLabel(key as any)
  if (dimension === 'file_type') return FILE_TYPE_LABELS[key] || key
  if (dimension === 'outfit') return key // 套装名即用户输入
  return key
}

interface SmartGroupPanelProps {
  // 关闭面板回调（移动端或抽屉模式下使用）
  onClose?: () => void
}

export const SmartGroupPanel: React.FC<SmartGroupPanelProps> = ({ onClose }) => {
  const { groupDimension, selectedGroupKey, setGroupDimension, setSelectedGroupKey, currentView } =
    useUIStore()
  const { mediaFiles, currentProfileUid } = useMediaStore()
  const [remoteGroups, setRemoteGroups] = useState<Array<{ key: string; count: number }>>([])
  const [loading, setLoading] = useState(false)

  // 当维度变化时，从主进程拉取分组统计（基于全库，不受当前列表分页影响）
  // 视图不同时按 media_source 过滤：launcher-cache 视图只统计启动器缓存，其他视图只统计游戏内拍摄
  useEffect(() => {
    if (groupDimension === 'none') {
      setRemoteGroups([])
      return
    }
    let cancelled = false
    const fetchGroups = async () => {
      if (!window.electronAPI?.media?.getGroupCounts) return
      setLoading(true)
      try {
        const mediaSource: 'game' | 'launcher' | 'cloud' =
          currentView === 'launcher-cache' ? 'launcher' : 'game'
        const result = await window.electronAPI.media.getGroupCounts(
          groupDimension,
          currentProfileUid,
          mediaSource
        )
        if (!cancelled && result.success) {
          setRemoteGroups(result.groups)
        }
      } catch (err) {
        console.error('[SmartGroupPanel] 加载分组统计失败:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchGroups()
    return () => {
      cancelled = true
    }
  }, [groupDimension, currentProfileUid, currentView])

  // 基于当前已加载的 mediaFiles 计算分组统计（用于本地快速预览，与远程统计互补）
  // 当远程统计尚未返回或失败时，使用本地数据兜底
  const localGroupCounts = useMemo(() => {
    if (groupDimension === 'none') return new Map<string, number>()
    const counts = new Map<string, number>()
    for (const f of mediaFiles) {
      const key = getGroupFieldValue(f, groupDimension)
      // outfit 维度下空字符串不计入
      if (groupDimension === 'outfit' && !key) continue
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return counts
  }, [mediaFiles, groupDimension])

  // 合并远程统计与本地统计：优先使用远程（基于全库），无远程时回退本地
  const displayGroups = useMemo(() => {
    if (groupDimension === 'none') return []
    // 远程统计优先
    if (remoteGroups.length > 0) {
      return remoteGroups.map((g) => ({
        key: g.key,
        count: g.count,
        label: getGroupLabel(groupDimension, g.key)
      }))
    }
    // 本地兜底
    return Array.from(localGroupCounts.entries())
      .map(([key, count]) => ({ key, count, label: getGroupLabel(groupDimension, key) }))
      .sort((a, b) => b.count - a.count)
  }, [remoteGroups, localGroupCounts, groupDimension])

  // 当前维度下文件总数（用于"全部"项的 count 显示）
  const totalCount = useMemo(() => {
    return displayGroups.reduce((sum, g) => sum + g.count, 0)
  }, [displayGroups])

  // 维度切换处理
  const handleDimensionChange = (dim: GroupDimension) => {
    setGroupDimension(dim)
  }

  // 分组项点击处理：点击已选项则取消（回到"全部"），否则应用该分组
  const handleGroupClick = (key: string) => {
    setSelectedGroupKey(selectedGroupKey === key ? 'all' : key)
  }

  return (
    <div className="glass-panel rounded-2xl p-4 space-y-3">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          智能分组
        </h3>
        {onClose && (
          <button className="icon-btn" onClick={onClose} title="关闭" aria-label="关闭">
            ×
          </button>
        )}
      </div>

      {/* 维度选择器 */}
      <div className="flex flex-wrap gap-1.5">
        {GROUP_DIMENSION_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className="px-2.5 py-1 text-xs rounded-full transition-all hover:scale-105"
            style={{
              background: groupDimension === opt.value ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: groupDimension === opt.value ? 'white' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: groupDimension === opt.value ? 600 : 400
            }}
            onClick={() => handleDimensionChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 分组列表 */}
      {groupDimension !== 'none' && (
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {loading && (
            <div className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>
              加载中...
            </div>
          )}

          {/* "全部"项 */}
          <button
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors hover:bg-[var(--hover-bg)]"
            style={{
              background: selectedGroupKey === 'all' ? 'var(--accent)' : 'transparent',
              color: selectedGroupKey === 'all' ? 'white' : 'var(--text-primary)',
              border: 'none',
              cursor: 'pointer'
            }}
            onClick={() => setSelectedGroupKey('all')}
          >
            <span className="text-sm font-medium">全部</span>
            <span className="text-xs font-mono">{totalCount}</span>
          </button>

          {/* 各分组项 */}
          {displayGroups.map((g) => {
            const isSelected = selectedGroupKey === g.key
            return (
              <button
                key={g.key}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors hover:bg-[var(--hover-bg)]"
                style={{
                  background: isSelected ? 'var(--accent)' : 'transparent',
                  color: isSelected ? 'white' : 'var(--text-primary)',
                  border: 'none',
                  cursor: 'pointer'
                }}
                onClick={() => handleGroupClick(g.key)}
              >
                <span className="text-sm truncate flex-1 text-left">{g.label}</span>
                <span className="text-xs font-mono ml-2 flex-shrink-0">{g.count}</span>
              </button>
            )
          })}

          {!loading && displayGroups.length === 0 && (
            <div className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>
              暂无分组数据，请先扫描媒体文件
            </div>
          )}
        </div>
      )}

      {/* 维度说明 */}
      {groupDimension !== 'none' && (
        <div
          className="text-xs pt-2 border-t"
          style={{ color: 'var(--text-tertiary)', borderColor: 'var(--divider)' }}
        >
          {getDimensionDescription(groupDimension)}
        </div>
      )}
    </div>
  )
}

// 各维度的简短说明
function getDimensionDescription(dim: GroupDimension): string {
  switch (dim) {
    case 'album_type':
      return '基于游戏内父文件夹名自动识别（如 ScreenShot → 游戏截图），共 22 类'
    case 'scene_category':
      return '基于文件路径与场景识别算法自动分类'
    case 'scene_time':
      return '基于图像亮度直方图分析时段（日间/黄昏/夜间/黎明）'
    case 'outfit':
      return '基于手动套装标注分组，未标注的文件不计入分组'
    case 'file_type':
      return '按文件类型分组：图片 / 视频'
    default:
      return ''
  }
}

// P1-U4：getLocalFieldValue 已迁移至 utils/group-field.ts（getGroupFieldValue）
