import React from 'react'
import { BaseDialog } from '../common/BaseDialog'
import { WatermarkPanel } from '../editor/WatermarkPanel'
import { IconClose } from '../../icons'
import type { WatermarkConfig } from '../../utils/imageProcessor'

interface WatermarkDialogProps {
  open: boolean
  config: WatermarkConfig | null
  onChange: (config: WatermarkConfig | null) => void
  progress: { current: number; total: number } | null
  processing: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * P1-U2：迁移到 BaseDialog，移除手写的 useFocusTrap / 遮罩 / modal-enter 模板
 * 保留 processing 时禁用焦点陷阱与遮罩关闭的原行为
 */
export const WatermarkDialog: React.FC<WatermarkDialogProps> = ({
  open,
  config,
  onChange,
  progress,
  processing,
  onConfirm,
  onCancel
}) => {
  return (
    <BaseDialog
      open={open}
      onClose={onCancel}
      ariaLabelledby="watermark-dialog-title"
      size="lg"
      cardClassName="max-h-[85vh] overflow-y-auto"
      overlayBackground="var(--overlay-bg-strong)"
      trapFocus={!processing}
      closeOnOverlayClick={!processing}
    >
      <div className="flex items-center justify-between">
        <h3 id="watermark-dialog-title" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>批量添加水印</h3>
        <button className="icon-btn" onClick={onCancel} disabled={processing} aria-label="关闭">
          <IconClose size={16} />
        </button>
      </div>
      <WatermarkPanel config={config} onChange={onChange} />
      {progress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>处理进度</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                background: 'var(--accent)'
              }}
            />
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn-secondary" onClick={onCancel} disabled={processing}>取消</button>
        <button className="btn-primary" onClick={onConfirm} disabled={processing || !config}>
          {processing ? '处理中...' : '开始添加'}
        </button>
      </div>
    </BaseDialog>
  )
}
