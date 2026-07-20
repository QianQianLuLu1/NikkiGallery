import React from 'react'
import { IconClose } from '../../icons'

interface ShortcutsModalProps {
  onClose: () => void
}

const shortcuts = [
  ['F11', '切换全屏编辑模式'],
  ['Ctrl + S', '保存编辑结果'],
  ['Ctrl + Shift + S', '另存为'],
  ['Ctrl + Shift + C', '复制编辑参数'],
  ['Ctrl + Shift + V', '粘贴编辑参数'],
  ['Ctrl + Z', '撤销'],
  ['Ctrl + Shift + Z / Ctrl + Y', '重做'],
  ['?', '显示/隐藏快捷键面板'],
  ['空格 / 鼠标按住对比按钮', '对比原图']
]

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ onClose }) => {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'var(--overlay-bg)' }}
      onClick={onClose}
    >
      <div className="glass-card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
            编辑器快捷键
          </h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <IconClose size={18} />
          </button>
        </div>
        <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {shortcuts.map(([key, desc]) => (
            <div
              key={key}
              className="flex justify-between items-center py-1.5 border-b"
              style={{ borderColor: 'var(--divider)' }}
            >
              <span>{desc}</span>
              <kbd
                className="px-2 py-0.5 rounded text-xs font-mono"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              >
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
