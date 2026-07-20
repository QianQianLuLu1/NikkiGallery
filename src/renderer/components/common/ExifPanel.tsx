import React, { useState, useMemo } from 'react'
import type { MediaFile } from '../../stores/mediaStore'
import { useExif, type ExifData } from '../../hooks/useExif'
import { IconCamera, IconCopyText, IconInfo } from '../../icons'

interface ExifPanelProps {
  file: MediaFile
  // 'light' 用于弹窗（白底）；'dark' 用于全屏预览（深色半透明）
  variant?: 'light' | 'dark'
  // 是否显示标题"拍摄参数"
  showTitle?: boolean
}

interface ExifRow {
  label: string
  value: string
}

// 将 EXIF 数据转为有序键值对（跳过空字段）
function exifToRows(exif: ExifData | null): ExifRow[] {
  if (!exif) return []
  const rows: ExifRow[] = []
  if (exif.camera) rows.push({ label: '相机型号', value: exif.camera })
  if (exif.lens) rows.push({ label: '镜头', value: exif.lens })
  if (exif.aperture) rows.push({ label: '光圈', value: exif.aperture })
  if (exif.shutter) rows.push({ label: '快门速度', value: exif.shutter })
  if (exif.iso) rows.push({ label: 'ISO', value: String(exif.iso) })
  if (exif.focalLength) rows.push({ label: '焦距', value: exif.focalLength })
  if (exif.dateTaken) {
    const d = new Date(exif.dateTaken)
    if (!isNaN(d.getTime())) {
      rows.push({ label: '拍摄时间', value: d.toLocaleString('zh-CN', { hour12: false }) })
    }
  }
  if (exif.gps) {
    rows.push({
      label: 'GPS',
      value: `${exif.gps.latitude.toFixed(6)}, ${exif.gps.longitude.toFixed(6)}`
    })
  }
  if (exif.width && exif.height) {
    rows.push({ label: '原始尺寸', value: `${exif.width} × ${exif.height}` })
  }
  return rows
}

// 把所有 EXIF 行格式化为可复制的纯文本
function formatExifText(rows: ExifRow[]): string {
  return rows.map((r) => `${r.label}: ${r.value}`).join('\n')
}

export const ExifPanel: React.FC<ExifPanelProps> = ({
  file,
  variant = 'light',
  showTitle = true
}) => {
  // 视频文件不读取 EXIF（exifr 主要面向图片，视频读取无意义）
  const enabled = file.file_type === 'image'
  const { exif, loading, error } = useExif(file.file_path, enabled)
  const [copied, setCopied] = useState(false)

  const rows = useMemo(() => exifToRows(exif), [exif])

  // 主题样式映射
  const isDark = variant === 'dark'
  const themeStyles = isDark
    ? {
        container: 'rounded-xl',
        title: 'text-white/90',
        row: 'border-white/10',
        label: 'text-white/55',
        value: 'text-white/95',
        empty: 'text-white/50',
        btn: 'text-white/80 hover:bg-white/10',
        copied: 'text-emerald-400'
      }
    : {
        container: '',
        title: '',
        row: 'border-black/5',
        label: '',
        value: '',
        empty: '',
        btn: '',
        copied: ''
      }

  const handleCopy = async () => {
    const text = formatExifText(rows)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 兜底：使用 textarea + execCommand
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
      } catch {
        // 复制失败静默处理
      } finally {
        document.body.removeChild(textarea)
      }
    }
  }

  // 视频文件：不展示 EXIF 区块
  if (!enabled) return null

  return (
    <div className={themeStyles.container}>
      {showTitle && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <IconCamera size={14} />
            <span
              className={`text-xs font-semibold ${themeStyles.title}`}
              style={!isDark ? { color: 'var(--text-secondary)' } : undefined}
            >
              拍摄参数
            </span>
          </div>
          {rows.length > 0 && (
            <button
              className={`text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors ${themeStyles.btn}`}
              onClick={handleCopy}
              title="复制完整相机参数"
              aria-label="复制相机参数"
            >
              {copied ? (
                <span className={themeStyles.copied}>已复制</span>
              ) : (
                <>
                  <IconCopyText size={12} />
                  <span>复制参数</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {loading && (
        <div
          className={`text-xs py-3 flex items-center gap-2 ${themeStyles.empty}`}
          style={!isDark ? { color: 'var(--text-tertiary)' } : undefined}
        >
          <div className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
          正在解析相机参数...
        </div>
      )}

      {!loading && error && (
        <div
          className={`text-xs py-3 ${themeStyles.empty}`}
          style={!isDark ? { color: 'var(--text-tertiary)' } : undefined}
        >
          EXIF 解析失败: {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div
          className={`text-xs py-3 flex items-center gap-1.5 ${themeStyles.empty}`}
          style={!isDark ? { color: 'var(--text-tertiary)' } : undefined}
        >
          <IconInfo size={12} />
          此图片未包含相机参数信息
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-1">
          {rows.map((row) => (
            <div
              key={row.label}
              className={`flex items-baseline gap-3 text-xs py-1 border-b last:border-b-0 ${themeStyles.row}`}
            >
              <span
                className={`flex-shrink-0 w-20 ${themeStyles.label}`}
                style={!isDark ? { color: 'var(--text-tertiary)' } : undefined}
              >
                {row.label}
              </span>
              <span
                className={`flex-1 break-all font-mono ${themeStyles.value}`}
                style={!isDark ? { color: 'var(--text-primary)' } : undefined}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
