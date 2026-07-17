import React, { useState, useMemo } from 'react'
import type { MediaFile } from '../../stores/mediaStore'
import { useGameParams } from '../../hooks/useGameParams'
import type { RichCameraParams } from '../../types/decryption'
import { getPoseName, getApertureName, getLightName, getFilterName } from '../../utils/enum-mappings'
import { IconCamera, IconInfo } from '../../icons'
import { InfoRowPanel, type ParamGroup } from './InfoRowPanel'

interface CameraInfoPanelProps {
  file: MediaFile
  variant?: 'light' | 'dark'
  showTitle?: boolean
}

type CameraData = NonNullable<ReturnType<typeof useGameParams>['data']>['camera']

function cameraToGroups(camera: CameraData): ParamGroup[] {
  if (!camera) return []

  const c = camera as RichCameraParams
  const groups: ParamGroup[] = []

  // 镜头与构图
  const lensRows = []
  lensRows.push({ label: '竖构图', value: c.portraitMode ? '是' : '否' })
  if (c.zoom !== undefined) lensRows.push({ label: '缩放', value: `${c.zoom.toFixed(2)}x` })
  if (c.focalLength !== undefined) lensRows.push({ label: '焦距', value: `${c.focalLength.toFixed(1)}mm` })
  if (c.rotation !== undefined) lensRows.push({ label: '镜头旋转', value: `${c.rotation.toFixed(1)}°` })
  if (c.cameraYaw !== undefined && c.cameraYaw !== 0) lensRows.push({ label: '镜头偏航', value: `${c.cameraYaw.toFixed(1)}°` })
  if (c.cameraPitch !== undefined && c.cameraPitch !== 0) lensRows.push({ label: '镜头俯仰', value: `${c.cameraPitch.toFixed(1)}°` })
  if (c.cameraLoc) lensRows.push({ label: '相机位置', value: `(${c.cameraLoc.x.toFixed(1)}, ${c.cameraLoc.y.toFixed(1)}, ${c.cameraLoc.z.toFixed(1)})` })
  if (lensRows.length > 0) groups.push({ title: '镜头与构图', rows: lensRows })

  // 光学与光效
  const opticRows = []
  if (c.apertureSection !== undefined) opticRows.push({ label: '光圈', value: getApertureName(c.apertureSection) ?? `F${c.apertureSection}` })
  if (c.bloomIntensity !== undefined) opticRows.push({ label: '光晕', value: `${(c.bloomIntensity * 100).toFixed(0)}%` })
  if (c.vignetteIntensity !== undefined) opticRows.push({ label: '柔光强度', value: `${(c.vignetteIntensity * 100).toFixed(0)}%` })
  if (c.bloomThreshold !== undefined) opticRows.push({ label: '柔光范围', value: `${(c.bloomThreshold * 100).toFixed(0)}%` })
  if (opticRows.length > 0) groups.push({ title: '光学与光效', rows: opticRows })

  // 画面调节
  const adjustRows = []
  if (c.brightness !== undefined) adjustRows.push({ label: '亮度', value: `${(c.brightness * 100).toFixed(0)}%` })
  if (c.exposure !== undefined) adjustRows.push({ label: '曝光', value: `${(c.exposure * 100).toFixed(0)}%` })
  if (c.contrast !== undefined) adjustRows.push({ label: '对比度', value: `${(c.contrast * 100).toFixed(0)}%` })
  if (c.saturation !== undefined) adjustRows.push({ label: '饱和度', value: `${(c.saturation * 100).toFixed(0)}%` })
  if (c.vibrance !== undefined) adjustRows.push({ label: '自然饱和度', value: `${(c.vibrance * 100).toFixed(0)}%` })
  if (c.highlights !== undefined) adjustRows.push({ label: '高光', value: `${(c.highlights * 100).toFixed(0)}%` })
  if (c.shadows !== undefined) adjustRows.push({ label: '阴影', value: `${(c.shadows * 100).toFixed(0)}%` })
  if (adjustRows.length > 0) groups.push({ title: '画面调节', rows: adjustRows })

  // 场景与特效
  const sceneRows = []
  if (c.light) sceneRows.push({ label: '灯光', value: `${getLightName(c.light.id)} (${(c.light.strength * 100).toFixed(0)}%)` })
  if (c.filter) sceneRows.push({ label: '滤镜', value: `${getFilterName(c.filter.id)} (${(c.filter.strength * 100).toFixed(0)}%)` })
  if (c.pose !== undefined && c.pose !== 0) sceneRows.push({ label: '动作场景', value: getPoseName(c.pose) ?? `#${c.pose}` })
  if (c.framedMoment !== undefined && c.framedMoment !== 0) sceneRows.push({ label: '定格', value: `#${c.framedMoment}` })
  if (c.momoHidden !== undefined && c.momoHidden !== null) {
    sceneRows.push({ label: '隐藏大喵', value: c.momoHidden === 'enabled' ? '已隐藏' : '未隐藏' })
  }
  if (sceneRows.length > 0) groups.push({ title: '场景与特效', rows: sceneRows })

  return groups
}

/** 格式化相机参数为可复制文本（供 CameraInfoPanel 和 handleCopyAll 共用） */
export function formatCameraForCopy(camera: CameraData): string {
  const groups = cameraToGroups(camera)
  const lines: string[] = ['=== 相机参数代码 ===']
  for (const g of groups) {
    lines.push(`\n[${g.title}]`)
    for (const r of g.rows) {
      lines.push(`${r.label}: ${r.value}`)
    }
  }
  const raw = (camera as RichCameraParams)?.rawParams
  if (raw) {
    lines.push('\n=== 原始参数 ===')
    lines.push(raw)
  }
  return lines.join('\n')
}

export const CameraInfoPanel: React.FC<CameraInfoPanelProps> = ({ file, variant = 'light', showTitle = true }) => {
  const enabled = file.file_type === 'image' && !!file.album_type
  const { data, loading, error } = useGameParams(
    file.file_path,
    file.album_type,
    file.account_uid,
    enabled
  )
  const [copied, setCopied] = useState(false)

  const groups = useMemo(() => cameraToGroups(data?.camera), [data?.camera])

  const handleCopy = async () => {
    if (!data?.camera) return
    const text = formatCameraForCopy(data.camera)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      } catch { /* ignore */ }
      finally { document.body.removeChild(textarea) }
    }
  }

  if (!enabled) return null

  return (
    <InfoRowPanel
      icon={<IconCamera size={14} className="flex-shrink-0" />}
      title="相机信息"
      groups={groups}
      loading={loading}
      error={error}
      variant={variant}
      showTitle={showTitle}
      loadingText="正在解析相机参数..."
      emptyText={<><IconInfo size={12} className="flex-shrink-0" />此图片未包含相机参数</>}
      errorPrefix="参数解析失败"
      onCopy={handleCopy}
      copied={copied}
      copyLabel="复制参数代码"
    />
  )
}
