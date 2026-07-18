import React, { useRef } from 'react'
import { BaseDialog } from './BaseDialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmVariant?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  confirmVariant = 'primary',
  onConfirm,
  onCancel
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  return (
    <BaseDialog
      open={open}
      onClose={onCancel}
      size="md"
      ariaLabelledby="confirm-title"
      initialFocusRef={confirmBtnRef}
    >
      <h3
        id="confirm-title"
        className="text-lg font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
      </h3>
      <p className="text-sm whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
        {message}
      </p>
      <div className="flex justify-end gap-3 pt-2">
        <button className="btn-secondary" onClick={onCancel}>
          {cancelText}
        </button>
        <button
          ref={confirmBtnRef}
          className={confirmVariant === 'danger' ? 'btn-danger' : 'btn-primary'}
          onClick={onConfirm}
        >
          {confirmText}
        </button>
      </div>
    </BaseDialog>
  )
}
