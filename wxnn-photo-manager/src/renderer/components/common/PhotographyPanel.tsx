import React, { useMemo } from 'react'
import type { MediaFile } from '../../stores/mediaStore'
import { useGameParams } from '../../hooks/useGameParams'
import type { PhotographyInfo } from '../../types/decryption'
import { getWeatherName, getPuzzleName, getInteractiveName } from '../../utils/enum-mappings'
import { getLocationName } from '../../utils/location-map'
import { IconInfo } from '../../icons'
import { InfoRowPanel, type InfoRow } from './InfoRowPanel'

interface PhotographyPanelProps {
  file: MediaFile
  variant?: 'light' | 'dark'
  showTitle?: boolean
}

function photographyToRows(p: PhotographyInfo | undefined | null): InfoRow[] {
  if (!p) return []
  const rows: InfoRow[] = []

  // 是否编辑
  if (p.edit.enabled) {
    const details: string[] = []
    if (p.edit.hasSticker) details.push('贴纸')
    if (p.edit.hasText) details.push('文字')
    rows.push({ label: '是否编辑', value: details.length > 0 ? `已编辑（${details.join('、')}）` : '已编辑' })
  } else {
    rows.push({ label: '是否编辑', value: '未编辑' })
  }

  // 拍摄日期
  if (p.date) rows.push({ label: '拍摄日期', value: `第 ${p.date.day} 天` })

  // 拍摄时间
  if (p.time) {
    const h = String(p.time.hour).padStart(2, '0')
    const m = String(p.time.minute).padStart(2, '0')
    const s = String(Math.floor(p.time.second)).padStart(2, '0')
    rows.push({ label: '拍摄时间', value: `${h}:${m}:${s}` })
  }

  // 拍摄地点（优先使用 name，其次查 location-map，最后回退到原始坐标）
  if (p.location) {
    if (p.location.name) {
      rows.push({ label: '拍摄地点', value: p.location.name })
    } else {
      const { x, y, z } = p.location.pos
      const mappedName = getLocationName(x, y, z)
      rows.push({ label: '拍摄地点', value: mappedName ?? `(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})` })
    }
  }

  // 天气
  if (p.weather !== null && p.weather !== undefined) {
    const weatherName = getWeatherName(p.weather)
    rows.push({ label: '天气', value: weatherName ?? `类型 ${p.weather}` })
  }

  // 照片墙
  if (p.photoWall.length > 0) {
    rows.push({ label: '照片墙', value: `已加入 (${p.photoWall.length} 张)` })
  } else {
    rows.push({ label: '照片墙', value: '未加入' })
  }

  // 拍摄任务
  if (p.tasks.length > 0) {
    const taskNames = p.tasks.map(t => {
      switch (t.type) {
        case 'puzzle': {
          const puzzleName = getPuzzleName(t.tag)
          return puzzleName ?? `错位摄影(#${t.tag})`
        }
        case 'risk': return '惊险拍摄'
        case 'interactive': {
          const interactiveName = getInteractiveName(t.tag)
          return interactiveName ?? `拍摄任务(#${t.tag})`
        }
        default: return t.type
      }
    })
    rows.push({ label: '拍摄任务', value: taskNames.join('、') })
  } else {
    rows.push({ label: '拍摄任务', value: '无任务' })
  }

  return rows
}

/** 格式化拍摄信息为可复制文本（供 PhotographyPanel 和 handleCopyAll 共用） */
export function formatPhotographyForCopy(p: PhotographyInfo | null | undefined): string {
  const rows = photographyToRows(p)
  if (rows.length === 0) return ''
  const lines = ['=== 拍摄信息 ===']
  for (const r of rows) {
    lines.push(`${r.label}: ${r.value}`)
  }
  return lines.join('\n')
}

export const PhotographyPanel: React.FC<PhotographyPanelProps> = ({ file, variant = 'light', showTitle = true }) => {
  const enabled = file.file_type === 'image' && !!file.album_type
  const { data, loading, error } = useGameParams(
    file.file_path,
    file.album_type,
    file.account_uid,
    enabled
  )

  const rows = useMemo(() => photographyToRows(data?.photography), [data?.photography])

  if (!enabled) return null

  return (
    <InfoRowPanel
      icon={<IconInfo size={14} className="flex-shrink-0" />}
      title="拍摄信息"
      rows={rows}
      loading={loading}
      error={error}
      variant={variant}
      showTitle={showTitle}
      loadingText="正在解析拍摄信息..."
      emptyText="此图片未包含拍摄信息"
    />
  )
}
