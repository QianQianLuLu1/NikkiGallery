import React, { useEffect, useRef } from 'react'

export interface BatchApplyProgress {
  current: number
  total: number
  currentFileName: string
  failedCount: number
}

interface BatchApplyDialogProps {
  open: boolean
  progress: BatchApplyProgress | null
  done: boolean
  message: string
  onClose: () => void
}

export const BatchApplyDialog: React.FC<BatchApplyDialogProps> = ({
  open,
  progress,
  done,
  message,
  onClose
}) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (done) {
      // 完成后自动聚焦关闭按钮，便于键盘用户操作
      closeBtnRef.current?.focus()
    }
  }, [done])

  if (!open) return null

  const current = progress?.current ?? 0
  const total = progress?.total ?? 0
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  const failedCount = progress?.failedCount ?? 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-apply-title"
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'var(--overlay-bg)' }}
    >
      <div className="glass-card p-6 w-full max-w-md mx-4 space-y-4 modal-enter">
        <h3
          id="batch-apply-title"
          className="text-lg font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          批量应用编辑参数
        </h3>

        {!done && (
          <>
            <div className="space-y-2">
              <div
                className="flex items-center justify-between text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span>
                  正在处理：{current} / {total}
                </span>
                <span style={{ color: 'var(--accent)' }}>{percent}%</span>
              </div>
              <div
                className="w-full h-2 rounded-full overflow-hidden"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <div
                  className="h-full transition-all duration-200"
                  style={{ width: `${percent}%`, background: 'var(--accent)' }}
                />
              </div>
              <p
                className="text-xs truncate"
                style={{ color: 'var(--text-tertiary)' }}
                title={progress?.currentFileName}
              >
                {progress?.currentFileName || '准备中...'}
              </p>
              {failedCount > 0 && (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>
                  失败 {failedCount} 项
                </p>
              )}
            </div>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              正在将当前调整/滤镜/水印应用到选中的图片，每张图片保存前会自动备份原图，请勿关闭窗口。
            </p>
          </>
        )}

        {done && (
          <>
            <p className="text-sm whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
              {message}
            </p>
            <div className="flex justify-end pt-2">
              <button ref={closeBtnRef} className="btn-primary" onClick={onClose}>
                关闭
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
