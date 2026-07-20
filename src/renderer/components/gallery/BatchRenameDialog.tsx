import React, { useState, useMemo, useRef, useCallback } from 'react'
import { BaseDialog } from '../common/BaseDialog'
import type { MediaFile } from '../../stores/mediaStore'

interface BatchRenameDialogProps {
  open: boolean
  files: MediaFile[]
  onClose: () => void
  onConfirm: (operations: { oldPath: string; newName: string }[]) => void
}

// T12：模板变量说明
const TEMPLATE_VARS: { token: string; label: string; description: string }[] = [
  { token: '{date}', label: '日期', description: '拍摄日期 YYYYMMDD' },
  { token: '{time}', label: '时间', description: '拍摄时间 HHmmss' },
  { token: '{scene}', label: '场景', description: '场景分类' },
  { token: '{outfit}', label: '套装', description: '套装名，无标注为 unknown' },
  { token: '{seq}', label: '序号', description: '从 1 开始递增' },
  { token: '{original}', label: '原名', description: '原始文件名（不含扩展名）' }
]

const INVALID_CHARS = /[\\/:*?"<>|]/

// T12：模板变量解析
function resolveTemplate(template: string, file: MediaFile, seq: number): string {
  const createdAt = new Date(file.created_at)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const dateStr = `${createdAt.getFullYear()}${pad(createdAt.getMonth() + 1)}${pad(createdAt.getDate())}`
  const timeStr = `${pad(createdAt.getHours())}${pad(createdAt.getMinutes())}${pad(createdAt.getSeconds())}`
  const originalName = file.file_name.replace(/\.[^.]+$/, '')

  return template
    .replace(/\{date\}/g, dateStr)
    .replace(/\{time\}/g, timeStr)
    .replace(/\{scene\}/g, file.scene_category || 'unknown')
    .replace(/\{outfit\}/g, file.outfit || 'unknown')
    .replace(/\{seq\}/g, String(seq))
    .replace(/\{original\}/g, originalName)
}

/**
 * P1-U2：迁移到 BaseDialog，移除手写的 useFocusTrap / 遮罩 / modal-enter 模板
 * 卡片宽度 size=xl 对应原 w-[560px]，BaseDialog 自带 mx-4 + w-full + max-w-xl 在窄屏自适应
 */
export const BatchRenameDialog: React.FC<BatchRenameDialogProps> = ({
  open,
  files,
  onClose,
  onConfirm
}) => {
  const [template, setTemplate] = useState('{date}_{seq}')
  const inputRef = useRef<HTMLInputElement>(null)

  // T12：实时预览前 5 个文件的新文件名
  const preview = useMemo(() => {
    if (!open || files.length === 0) return []
    return files.slice(0, 5).map((file, idx) => {
      const newName = resolveTemplate(template, file, idx + 1)
      return {
        oldName: file.file_name,
        newName: newName + file.file_ext,
        invalid: INVALID_CHARS.test(newName) || !newName.trim()
      }
    })
  }, [open, files, template])

  const error = useMemo(() => {
    if (!template.trim()) return '模板不能为空'
    if (INVALID_CHARS.test(template)) return '模板不能包含 \\ / : * ? " < > |'
    if (preview.some((p) => p.invalid)) return '解析后文件名包含非法字符'
    return ''
  }, [template, preview])

  const handleConfirm = useCallback(() => {
    if (error || files.length === 0) return
    const operations = files.map((file, idx) => ({
      oldPath: file.file_path,
      newName: resolveTemplate(template, file, idx + 1)
    }))
    onConfirm(operations)
  }, [error, files, template, onConfirm])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !error) {
      handleConfirm()
    }
  }

  const insertVar = (token: string) => {
    setTemplate((prev) => prev + token)
  }

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      ariaLabelledby="batch-rename-title"
      size="xl"
      initialFocusRef={inputRef}
    >
      <div>
        <h3
          id="batch-rename-title"
          className="text-lg font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          批量重命名
        </h3>
        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          共 {files.length} 个文件，冲突时自动追加 _1/_2 后缀
        </p>
      </div>

      {/* 模板输入 */}
      <div className="space-y-2">
        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          命名模板
        </label>
        <input
          ref={inputRef}
          type="text"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-3 py-2 rounded-lg text-sm font-mono"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            border: `1px solid ${error ? 'var(--danger)' : 'var(--divider)'}`
          }}
          placeholder="例如：{date}_{seq}"
          aria-invalid={!!error}
          aria-describedby="template-error"
        />
        {error && (
          <p id="template-error" className="text-xs" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
      </div>

      {/* 变量快捷插入 */}
      <div>
        <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
          点击插入变量：
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_VARS.map((v) => (
            <button
              key={v.token}
              onClick={() => insertVar(v.token)}
              className="px-2 py-1 rounded-md text-xs transition-colors"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--divider)'
              }}
              title={v.description}
            >
              <span className="font-mono" style={{ color: 'var(--accent)' }}>
                {v.token}
              </span>
              <span className="ml-1">{v.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 实时预览 */}
      <div>
        <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
          预览（前 {Math.min(5, files.length)} 个）：
        </p>
        <div
          className="rounded-lg p-3 space-y-1.5 max-h-48 overflow-y-auto"
          style={{ background: 'var(--bg-tertiary)' }}
        >
          {preview.map((p, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span
                className="truncate flex-1"
                style={{ color: 'var(--text-tertiary)' }}
                title={p.oldName}
              >
                {p.oldName}
              </span>
              <span style={{ color: 'var(--text-tertiary)' }}>→</span>
              <span
                className="truncate flex-1 font-mono"
                style={{ color: p.invalid ? 'var(--danger)' : 'var(--text-primary)' }}
                title={p.newName}
              >
                {p.newName}
              </span>
            </div>
          ))}
          {files.length > 5 && (
            <p className="text-xs text-center pt-1" style={{ color: 'var(--text-tertiary)' }}>
              ... 还有 {files.length - 5} 个文件
            </p>
          )}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn-secondary" onClick={onClose}>
          取消
        </button>
        <button
          className="btn-primary"
          onClick={handleConfirm}
          disabled={!!error || files.length === 0}
        >
          重命名 {files.length} 个文件
        </button>
      </div>
    </BaseDialog>
  )
}
