import React, { useMemo } from 'react'
import type { MediaFile } from '../../stores/mediaStore'
import { useGameParams } from '../../hooks/useGameParams'
import type { InteractionParams, ObjectParams } from '../../types/decryption'
import { IconCategory } from '../../icons'
import { InfoRowPanel, type InfoRow } from './InfoRowPanel'

interface InteractionPanelProps {
  file: MediaFile
  variant?: 'light' | 'dark'
  showTitle?: boolean
}

function formatObj(o: ObjectParams): string {
  const loc = `位置(${o.loc.x.toFixed(1)}, ${o.loc.y.toFixed(1)}, ${o.loc.z.toFixed(1)})`
  const rot = `旋转(${o.rot.yaw.toFixed(1)}°, ${o.rot.pitch.toFixed(1)}°, ${o.rot.roll.toFixed(1)}°)`
  const scale = `缩放(${o.scale.x.toFixed(2)}, ${o.scale.y.toFixed(2)}, ${o.scale.z.toFixed(2)})`
  return `${loc} ${rot} ${scale}`
}

function interactionsToRows(d: InteractionParams | undefined | null): InfoRow[] {
  if (!d) return []
  const rows: InfoRow[] = []

  // 坐骑
  if (d.mount) {
    rows.push({ label: '坐骑', value: `#${d.mount.id} ${formatObj(d.mount)}` })
  } else {
    rows.push({ label: '坐骑', value: '无' })
  }

  // 载具
  if (d.carrier) {
    rows.push({ label: '载具', value: `#${d.carrier.id} ${formatObj(d.carrier)}` })
  } else {
    rows.push({ label: '载具', value: '无' })
  }

  // 交互物列表
  if (d.interactions.length > 0) {
    for (let i = 0; i < d.interactions.length; i++) {
      const obj = d.interactions[i]
      rows.push({ label: `交互物${i + 1}`, value: `#${obj.id} ${formatObj(obj)}` })
    }
  }

  return rows
}

/** 格式化交互物信息为可复制文本（供 InteractionPanel 和 handleCopyAll 共用） */
export function formatInteractionsForCopy(d: InteractionParams | null | undefined): string {
  const rows = interactionsToRows(d)
  if (rows.length === 0) return ''
  const lines = ['=== 交互物 ===']
  for (const r of rows) {
    lines.push(`${r.label}: ${r.value}`)
  }
  return lines.join('\n')
}

export const InteractionPanel: React.FC<InteractionPanelProps> = ({ file, variant = 'light', showTitle = true }) => {
  const enabled = file.file_type === 'image' && !!file.album_type
  const { data, loading, error } = useGameParams(
    file.file_path,
    file.album_type,
    file.account_uid,
    enabled
  )

  const rows = useMemo(() => interactionsToRows(data?.interactions), [data?.interactions])

  if (!enabled) return null

  return (
    <InfoRowPanel
      icon={<IconCategory size={14} className="flex-shrink-0" />}
      title="交互物"
      rows={rows}
      loading={loading}
      error={error}
      variant={variant}
      showTitle={showTitle}
      loadingText="正在解析交互物信息..."
      emptyText="此图片未包含交互物信息"
    />
  )
}
