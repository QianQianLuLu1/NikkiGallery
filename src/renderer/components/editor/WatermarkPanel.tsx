import React, { useEffect, useState } from 'react'
import {
  type WatermarkConfig,
  type WatermarkText,
  type WatermarkImage,
  type WatermarkStyle
} from '../../utils/imageProcessor'
import { toFileUrl } from '../../utils/file'
import { SliderControl } from '../common/SliderControl'

interface WatermarkPanelProps {
  config: WatermarkConfig | null
  onChange: (config: WatermarkConfig | null) => void
  // 修复 U-S7：滑块释放时入历史栈，支持 Ctrl+Z 撤销水印调整
  onCommit?: () => void
}

interface WatermarkTemplate {
  id: number
  name: string
  config: string
}

const blendModes: { id: WatermarkImage['blendMode']; label: string }[] = [
  { id: 'normal', label: '正常' },
  { id: 'multiply', label: '正片叠底' },
  { id: 'screen', label: '滤色' },
  { id: 'overlay', label: '叠加' },
  { id: 'soft-light', label: '柔光' }
]

const positions: { id: WatermarkConfig['position']; label: string }[] = [
  { id: 'topLeft', label: '左上' },
  { id: 'topCenter', label: '中上' },
  { id: 'topRight', label: '右上' },
  { id: 'centerLeft', label: '左中' },
  { id: 'center', label: '居中' },
  { id: 'centerRight', label: '右中' },
  { id: 'bottomLeft', label: '左下' },
  { id: 'bottomCenter', label: '中下' },
  { id: 'bottomRight', label: '右下' }
]

const defaultText: WatermarkText = {
  content: 'WXNN Photo',
  font: 'sans-serif',
  size: 24,
  color: '#ffffff',
  opacity: 80,
  bold: false,
  italic: false,
  underline: false
}

const defaultImage: WatermarkImage = {
  path: '',
  width: 120,
  height: 120,
  opacity: 80,
  blendMode: 'normal'
}

const defaultConfig: WatermarkConfig = {
  text: { ...defaultText },
  position: 'bottomRight',
  customX: 0,
  customY: 0,
  rotation: 0,
  margin: 20,
  tile: false,
  tileSpacingX: 50,
  tileSpacingY: 50,
  style: 'normal'
}

interface StylePreset {
  id: WatermarkStyle
  name: string
  description: string
  config: Partial<WatermarkConfig>
}

const stylePresets: StylePreset[] = [
  {
    id: 'polaroid',
    name: '拍立得',
    description: '底部白色边框配文字',
    config: {
      text: {
        content: 'Polaroid',
        font: 'Microsoft YaHei',
        size: 28,
        color: '#333333',
        opacity: 90,
        bold: false,
        italic: false,
        underline: false
      },
      position: 'bottomCenter',
      rotation: 0,
      margin: 0,
      tile: false,
      style: 'polaroid'
    }
  },
  {
    id: 'date-label',
    name: '日期标签',
    description: '右上角半透明日期标签',
    config: {
      text: {
        content: '{date}',
        font: 'Microsoft YaHei',
        size: 18,
        color: '#ffffff',
        opacity: 95,
        bold: false,
        italic: false,
        underline: false
      },
      position: 'topRight',
      rotation: 0,
      margin: 20,
      tile: false,
      style: 'date-label'
    }
  },
  {
    id: 'signature',
    name: '签名水印',
    description: '右下角手写风格签名',
    config: {
      text: {
        content: 'Signature',
        font: 'serif',
        size: 32,
        color: '#ffffff',
        opacity: 75,
        bold: false,
        italic: true,
        underline: false
      },
      position: 'bottomRight',
      rotation: -8,
      margin: 24,
      tile: false,
      style: 'signature'
    }
  },
  {
    id: 'copyright',
    name: '版权水印',
    description: '居中半透明版权声明',
    config: {
      text: {
        content: '© All Rights Reserved',
        font: 'Microsoft YaHei',
        size: 36,
        color: '#ffffff',
        opacity: 45,
        bold: true,
        italic: false,
        underline: false
      },
      position: 'center',
      rotation: 0,
      margin: 0,
      tile: true,
      tileSpacingX: 360,
      tileSpacingY: 260,
      style: 'copyright'
    }
  }
]

export const WatermarkPanel: React.FC<WatermarkPanelProps> = ({ config, onChange, onCommit }) => {
  const current = config || { ...defaultConfig, text: { ...defaultText } }
  const [mode, setMode] = useState<'text' | 'image'>(current.image ? 'image' : 'text')
  const [templates, setTemplates] = useState<WatermarkTemplate[]>([])
  const [templateName, setTemplateName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!window.electronAPI?.watermark?.loadTemplates) return
    window.electronAPI.watermark.loadTemplates().then((rows) => {
      setTemplates((rows as WatermarkTemplate[]).map((r) => ({ ...r, config: String(r.config) })))
    })
  }, [])

  const updateConfig = (updates: Partial<WatermarkConfig>) => {
    onChange({ ...current, ...updates })
  }

  const updateText = (updates: Partial<WatermarkText>) => {
    updateConfig({ text: { ...(current.text || defaultText), ...updates } })
  }

  const updateImage = (updates: Partial<WatermarkImage>) => {
    updateConfig({ image: { ...(current.image || defaultImage), ...updates } })
  }

  const handleSelectImage = async () => {
    if (!window.electronAPI?.dialog?.openFile) return
    const filePath = await window.electronAPI.dialog.openFile({
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    if (!filePath) return
    updateImage({ path: filePath })
  }

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !window.electronAPI?.watermark?.saveTemplate) return
    setLoading(true)
    try {
      const result = await window.electronAPI.watermark.saveTemplate(
        templateName.trim(),
        JSON.stringify(current)
      )
      if (result.success) {
        setTemplateName('')
        const rows = await window.electronAPI.watermark.loadTemplates()
        setTemplates((rows as WatermarkTemplate[]).map((r) => ({ ...r, config: String(r.config) })))
      }
    } catch (error) {
      console.error('保存水印模板失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApplyTemplate = (tpl: WatermarkTemplate) => {
    try {
      const parsed = JSON.parse(tpl.config) as WatermarkConfig
      onChange(parsed)
      setMode(parsed.image ? 'image' : 'text')
    } catch {
      // ignore
    }
  }

  const handleDeleteTemplate = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.electronAPI?.watermark?.deleteTemplate) return
    try {
      await window.electronAPI.watermark.deleteTemplate(id)
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    } catch (error) {
      console.error('删除水印模板失败:', error)
    }
  }

  const applyStylePreset = (preset: StylePreset) => {
    const merged: WatermarkConfig = {
      ...defaultConfig,
      text: { ...defaultText },
      ...preset.config
    }
    onChange(merged)
    setMode('text')
  }

  return (
    <div className="space-y-5">
      {/* 模式切换 */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
        <button
          className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all"
          style={{
            background: mode === 'text' ? 'var(--accent)' : 'transparent',
            color: mode === 'text' ? 'white' : 'var(--text-secondary)'
          }}
          onClick={() => setMode('text')}
          aria-label="文字水印"
        >
          文字水印
        </button>
        <button
          className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all"
          style={{
            background: mode === 'image' ? 'var(--accent)' : 'transparent',
            color: mode === 'image' ? 'white' : 'var(--text-secondary)'
          }}
          onClick={() => setMode('image')}
          aria-label="图片水印"
        >
          图片水印
        </button>
      </div>

      {/* 样式预设 */}
      <div className="space-y-3">
        <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          样式预设
        </label>
        <div className="grid grid-cols-2 gap-2">
          {stylePresets.map((preset) => (
            <button
              key={preset.id}
              className="p-2 rounded-lg text-left text-xs transition-all hover:scale-[1.02]"
              style={{
                background: current.style === preset.id ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: current.style === preset.id ? 'white' : 'var(--text-secondary)',
                border:
                  current.style === preset.id
                    ? '1px solid var(--accent)'
                    : '1px solid var(--divider)'
              }}
              onClick={() => applyStylePreset(preset)}
              title={preset.description}
              aria-label={`应用${preset.name}样式`}
            >
              <span
                className="block font-medium"
                style={{ color: current.style === preset.id ? 'white' : 'var(--text-primary)' }}
              >
                {preset.name}
              </span>
              <span className="block mt-0.5 opacity-80">{preset.description}</span>
            </button>
          ))}
        </div>
      </div>

      {mode === 'text' ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              文字内容
            </label>
            <input
              type="text"
              value={current.text?.content || ''}
              onChange={(e) => updateText({ content: e.target.value })}
              className="input-field"
              placeholder="支持变量：{filename} {date} {time}"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                字体
              </label>
              <select
                value={current.text?.font || 'sans-serif'}
                onChange={(e) => updateText({ font: e.target.value })}
                className="input-field"
              >
                <option value="sans-serif">无衬线</option>
                <option value="serif">衬线</option>
                <option value="monospace">等宽</option>
                <option value="Microsoft YaHei">微软雅黑</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                颜色
              </label>
              <input
                type="color"
                value={current.text?.color || '#ffffff'}
                onChange={(e) => updateText({ color: e.target.value })}
                className="w-full h-10 rounded cursor-pointer"
              />
            </div>
          </div>

          <SliderControl
            label="大小"
            value={current.text?.size || 24}
            min={8}
            max={120}
            onChange={(v) => updateText({ size: v })}
            onCommit={onCommit}
          />
          <SliderControl
            label="透明度"
            value={current.text?.opacity || 80}
            min={0}
            max={100}
            onChange={(v) => updateText({ opacity: v })}
            onCommit={onCommit}
          />
          <SliderControl
            label="旋转"
            value={current.rotation}
            min={-180}
            max={180}
            onChange={(v) => updateConfig({ rotation: v })}
            onCommit={onCommit}
          />

          <div className="flex gap-2">
            <button
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${current.text?.bold ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => updateText({ bold: !current.text?.bold })}
              aria-label={current.text?.bold ? '取消加粗' : '加粗'}
            >
              {current.text?.bold ? '取消加粗' : '加粗'}
            </button>
            <button
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${current.text?.italic ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => updateText({ italic: !current.text?.italic })}
              aria-label={current.text?.italic ? '取消斜体' : '斜体'}
            >
              {current.text?.italic ? '取消斜体' : '斜体'}
            </button>
            <button
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${current.text?.underline ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => updateText({ underline: !current.text?.underline })}
              aria-label={current.text?.underline ? '取消下划线' : '下划线'}
            >
              {current.text?.underline ? '取消下划线' : '下划线'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              水印图片
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={current.image?.path || ''}
                readOnly
                placeholder="选择 PNG 透明图片"
                className="input-field flex-1 text-xs"
              />
              <button
                className="btn-secondary text-sm whitespace-nowrap"
                onClick={handleSelectImage}
              >
                选择
              </button>
            </div>
          </div>

          {current.image?.path && (
            <div
              className="rounded-lg overflow-hidden h-24 flex items-center justify-center"
              style={{ background: 'var(--bg-tertiary)' }}
            >
              <img
                src={toFileUrl(current.image.path) || undefined}
                alt="水印预览"
                className="max-w-full max-h-full object-contain"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <SliderControl
              label="宽度"
              value={current.image?.width || 120}
              min={20}
              max={800}
              onChange={(v) => updateImage({ width: v })}
              onCommit={onCommit}
            />
            <SliderControl
              label="高度"
              value={current.image?.height || 120}
              min={20}
              max={800}
              onChange={(v) => updateImage({ height: v })}
              onCommit={onCommit}
            />
          </div>

          <SliderControl
            label="透明度"
            value={current.image?.opacity || 80}
            min={0}
            max={100}
            onChange={(v) => updateImage({ opacity: v })}
            onCommit={onCommit}
          />
          <SliderControl
            label="旋转"
            value={current.rotation}
            min={-180}
            max={180}
            onChange={(v) => updateConfig({ rotation: v })}
            onCommit={onCommit}
          />

          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              混合模式
            </label>
            <select
              value={current.image?.blendMode || 'normal'}
              onChange={(e) =>
                updateImage({ blendMode: e.target.value as WatermarkImage['blendMode'] })
              }
              className="input-field"
            >
              {blendModes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* 位置九宫格 */}
      <div className="space-y-2">
        <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          位置
        </label>
        <div className="grid grid-cols-3 gap-1">
          {positions.map((pos) => (
            <button
              key={pos.id}
              className="py-2 rounded-md text-xs transition-all"
              style={{
                background: current.position === pos.id ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: current.position === pos.id ? 'white' : 'var(--text-secondary)'
              }}
              onClick={() => updateConfig({ position: pos.id })}
              aria-label={pos.label}
            >
              {pos.label}
            </button>
          ))}
        </div>
      </div>

      <SliderControl
        label="边距"
        value={current.margin}
        min={0}
        max={200}
        onChange={(v) => updateConfig({ margin: v })}
        onCommit={onCommit}
      />

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="tile"
          checked={current.tile}
          onChange={(e) => updateConfig({ tile: e.target.checked })}
        />
        <label htmlFor="tile" className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          平铺模式
        </label>
      </div>

      {current.tile && (
        <div className="grid grid-cols-2 gap-3">
          <SliderControl
            label="水平间距"
            value={current.tileSpacingX}
            min={10}
            max={500}
            onChange={(v) => updateConfig({ tileSpacingX: v })}
            onCommit={onCommit}
          />
          <SliderControl
            label="垂直间距"
            value={current.tileSpacingY}
            min={10}
            max={500}
            onChange={(v) => updateConfig({ tileSpacingY: v })}
            onCommit={onCommit}
          />
        </div>
      )}

      {/* 模板 */}
      <div className="space-y-3 pt-4" style={{ borderTop: '1px solid var(--divider)' }}>
        <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          水印模板
        </label>
        {templates.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-[var(--hover-bg)]"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                onClick={() => handleApplyTemplate(tpl)}
              >
                <span>{tpl.name}</span>
                <button
                  className="text-xs"
                  style={{ color: 'var(--danger)' }}
                  onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                  aria-label={`删除模板 ${tpl.name}`}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="模板名称"
            className="input-field flex-1 text-sm"
          />
          <button
            className="btn-secondary text-sm whitespace-nowrap"
            onClick={handleSaveTemplate}
            disabled={loading || !templateName.trim()}
            aria-label="保存水印模板"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
