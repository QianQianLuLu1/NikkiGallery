import React, { useMemo } from 'react'
import type { MediaFile } from '../../stores/mediaStore'
import { useGameParams } from '../../hooks/useGameParams'
import type { NikkiParams } from '../../types/decryption'
import { IconStar } from '../../icons'
import { InfoRowPanel, type InfoRow } from './InfoRowPanel'

interface NikkiInfoPanelProps {
  file: MediaFile
  variant?: 'light' | 'dark'
  showTitle?: boolean
}

function nikkiToRows(n: NikkiParams | undefined | null): InfoRow[] {
  if (!n) return []
  const rows: InfoRow[] = []

  // 巨大化
  rows.push({ label: '巨大化', value: n.giantState ? '已开启' : '未开启' })

  // 隐藏暖暖
  rows.push({ label: '隐藏暖暖', value: n.hidden ? '已隐藏' : '未隐藏' })

  // 位置
  if (n.loc) {
    rows.push({
      label: '位置',
      value: `(${n.loc.x.toFixed(1)}, ${n.loc.y.toFixed(1)}, ${n.loc.z.toFixed(1)})`
    })
  }

  // 旋转
  if (n.rot) {
    rows.push({
      label: '旋转',
      value: `Yaw ${n.rot.yaw.toFixed(1)}°, Pitch ${n.rot.pitch.toFixed(1)}°, Roll ${n.rot.roll.toFixed(1)}°`
    })
  }

  // 缩放
  if (n.scale) {
    rows.push({
      label: '缩放',
      value: `(${n.scale.x.toFixed(2)}, ${n.scale.y.toFixed(2)}, ${n.scale.z.toFixed(2)})`
    })
  }

  return rows
}

/** 格式化暖暖信息为可复制文本（供 NikkiInfoPanel 和 handleCopyAll 共用） */
export function formatNikkiForCopy(n: NikkiParams | null | undefined): string {
  const rows = nikkiToRows(n)
  if (rows.length === 0) return ''
  const lines = ['=== 暖暖信息 ===']
  for (const r of rows) {
    lines.push(`${r.label}: ${r.value}`)
  }
  return lines.join('\n')
}

export const NikkiInfoPanel: React.FC<NikkiInfoPanelProps> = ({
  file,
  variant = 'light',
  showTitle = true
}) => {
  const enabled = file.file_type === 'image' && !!file.album_type
  const { data, loading, error } = useGameParams(
    file.file_path,
    file.album_type,
    file.account_uid,
    enabled
  )

  const rows = useMemo(() => nikkiToRows(data?.nikki), [data?.nikki])

  if (!enabled) return null

  return (
    <InfoRowPanel
      icon={<IconStar size={14} className="flex-shrink-0" />}
      title="暖暖信息"
      rows={rows}
      loading={loading}
      error={error}
      variant={variant}
      showTitle={showTitle}
      loadingText="正在解析暖暖信息..."
      emptyText="此图片未包含暖暖信息"
    />
  )
}
