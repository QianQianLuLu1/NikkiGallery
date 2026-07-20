import React, { useMemo } from 'react'
import type { MediaFile } from '../../stores/mediaStore'
import { useGameParams } from '../../hooks/useGameParams'
import type { DressingParams } from '../../types/decryption'
import {
  getClothTypeName,
  getClothStateName,
  getEurekaAttachmentPointName,
  getEurekaColorName
} from '../../utils/enum-mappings'
import { getClothName, getOutfitName } from '../../utils/cloth-name-lookup'
import { IconOutfit } from '../../icons'
import { InfoRowPanel, type InfoRow } from './InfoRowPanel'

interface OutfitPanelProps {
  file: MediaFile
  variant?: 'light' | 'dark'
  showTitle?: boolean
}

function dressingToRows(d: DressingParams | undefined | null): InfoRow[] {
  if (!d) return []
  const rows: InfoRow[] = []

  // 服装列表（含名称和状态标记）
  if (d.clothes.length > 0) {
    for (const c of d.clothes) {
      const typeName = getClothTypeName(c.clothType)
      const clothName = getClothName(c.id) ?? c.clothTypeName
      // state 非"无"时追加状态标记（焕新/进化）
      const stateName = getClothStateName(c.state)
      const statePart = stateName && stateName !== '无' ? ` [${stateName}]` : ''
      // 有名称时显示"名称 #ID"，无名称时仅显示"#ID"
      const value = clothName ? `${clothName} #${c.id}${statePart}` : `#${c.id}${statePart}`
      rows.push({ label: typeName, value })
    }
  }

  // 祝福闪光（含套装名、颜色和挂载点）
  if (d.eureka.length > 0) {
    const eurekaStr = d.eureka
      .map((e) => {
        const pointName = getEurekaAttachmentPointName(e.attachmentPoint)
        const pointPart = pointName && e.attachmentPoint !== 0 ? `[${pointName}]` : ''
        const colorName = getEurekaColorName(e.color)
        const colorPart = colorName && e.color !== 0 ? `[${colorName}]` : ''
        const outfitName = getOutfitName(e.outfit)
        const namePart = outfitName ? `${outfitName} ` : ''
        return `${namePart}#${e.id}${colorPart}${pointPart} (Lv.${e.level})`
      })
      .join('、')
    rows.push({ label: '祝福闪光', value: eurekaStr })
  }

  return rows
}

/** 格式化搭配信息为可复制文本（供 OutfitPanel 和 handleCopyAll 共用） */
export function formatOutfitForCopy(d: DressingParams | null | undefined): string {
  const rows = dressingToRows(d)
  if (rows.length === 0) return ''
  const lines = ['=== 搭配 ===']
  for (const r of rows) {
    lines.push(`${r.label}: ${r.value}`)
  }
  return lines.join('\n')
}

export const OutfitPanel: React.FC<OutfitPanelProps> = ({
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

  const rows = useMemo(() => dressingToRows(data?.dressing), [data?.dressing])

  if (!enabled) return null

  return (
    <InfoRowPanel
      icon={<IconOutfit size={14} className="flex-shrink-0" />}
      title="搭配"
      rows={rows}
      loading={loading}
      error={error}
      variant={variant}
      showTitle={showTitle}
      loadingText="正在解析搭配信息..."
      emptyText="此图片未包含搭配信息"
    />
  )
}
