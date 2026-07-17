import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { IconImport, IconImage, IconVideo, IconClose } from '../../icons'
import { formatSize } from '../../utils/format'
import { formatTimestamp } from '../../utils/date'

// T14：本地类型声明（与主进程接口保持一致）
interface ImportFilePreview {
  sourcePath: string
  fileName: string
  size: number
  mtime: string
  ext: string
  isVideo: boolean
}
type ImportNamingRule = 'keep' | 'date' | 'seq'
type ImportCategorize = 'flat' | 'byDate' | 'byMonth'
type ImportConflictStrategy = 'skip' | 'rename' | 'overwrite'

interface ImportWizardProps {
  open: boolean
  onClose: () => void
}

type Step = 1 | 2 | 3

const NAMING_OPTIONS: { id: ImportNamingRule; label: string; description: string }[] = [
  { id: 'keep', label: '保留原名', description: '保持源文件名不变' },
  { id: 'date', label: '拍摄日期', description: 'YYYYMMDD_HHmmss.ext' },
  { id: 'seq', label: '序号', description: '0001.ext、0002.ext 递增' }
]

const CATEGORIZE_OPTIONS: { id: ImportCategorize; label: string; description: string }[] = [
  { id: 'flat', label: '不分类', description: '全部放入目标目录' },
  { id: 'byDate', label: '按日期', description: 'YYYY-MM-DD 子目录' },
  { id: 'byMonth', label: '按月份', description: 'YYYY-MM 子目录' }
]

const CONFLICT_OPTIONS: { id: ImportConflictStrategy; label: string; description: string }[] = [
  { id: 'skip', label: '跳过', description: '目标已存在则不导入' },
  { id: 'rename', label: '自动重命名', description: '追加 _1/_2 后缀' },
  { id: 'overwrite', label: '覆盖', description: '直接替换目标文件' }
]

// P1-I：formatSize 和 formatTimestamp 已统一到 utils/format.ts 和 utils/date.ts

export const ImportWizard: React.FC<ImportWizardProps> = ({ open, onClose }) => {
  const [step, setStep] = useState<Step>(1)
  const [sourceDir, setSourceDir] = useState('')
  const [targetDir, setTargetDir] = useState('')
  const [previewFiles, setPreviewFiles] = useState<ImportFilePreview[]>([])
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [namingRule, setNamingRule] = useState<ImportNamingRule>('keep')
  const [categorize, setCategorize] = useState<ImportCategorize>('flat')
  const [conflictStrategy, setConflictStrategy] = useState<ImportConflictStrategy>('rename')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 })
  const [result, setResult] = useState<{
    imported: Array<{ sourcePath: string; targetPath: string }>
    failed: Array<{ sourcePath: string; message: string }>
    skipped: Array<{ sourcePath: string; reason: string }>
  } | null>(null)
  const [error, setError] = useState('')

  const containerRef = useFocusTrap<HTMLDivElement>({
    active: open,
    onEscape: onClose
  })

  // 进度回调
  useEffect(() => {
    if (!open || !window.electronAPI?.import?.onProgress) return
    const off = window.electronAPI.import.onProgress((p) => {
      setProgress(p)
    })
    return off
  }, [open])

  // 重置状态
  useEffect(() => {
    if (open) {
      setStep(1)
      setSourceDir('')
      setTargetDir('')
      setPreviewFiles([])
      setSelectedPaths(new Set())
      setNamingRule('keep')
      setCategorize('flat')
      setConflictStrategy('rename')
      setLoading(false)
      setImporting(false)
      setProgress({ current: 0, total: 0 })
      setResult(null)
      setError('')
    }
  }, [open])

  const handleSelectSource = async () => {
    const dir = await window.electronAPI?.dialog?.selectDirectory()
    if (!dir) return
    setSourceDir(dir)
    await loadPreview(dir)
  }

  const handleSelectTarget = async () => {
    const dir = await window.electronAPI?.dialog?.selectDirectory()
    if (dir) setTargetDir(dir)
  }

  const loadPreview = useCallback(async (dir: string) => {
    if (!window.electronAPI?.import?.preview) return
    setLoading(true)
    setError('')
    try {
      const res = await window.electronAPI.import.preview(dir)
      if (res?.success && Array.isArray(res.files)) {
        setPreviewFiles(res.files)
        // 默认全选
        setSelectedPaths(new Set(res.files.map(f => f.sourcePath)))
      } else {
        setPreviewFiles([])
        setError(res?.message || '无法读取源目录')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const toggleSelect = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedPaths.size === previewFiles.length) {
      setSelectedPaths(new Set())
    } else {
      setSelectedPaths(new Set(previewFiles.map(f => f.sourcePath)))
    }
  }

  const totalSize = useMemo(() => {
    return previewFiles
      .filter(f => selectedPaths.has(f.sourcePath))
      .reduce((sum, f) => sum + f.size, 0)
  }, [previewFiles, selectedPaths])

  const handleStartImport = async () => {
    if (!window.electronAPI?.import?.run || !targetDir || selectedPaths.size === 0) return
    setImporting(true)
    setError('')
    setResult(null)
    setProgress({ current: 0, total: selectedPaths.size })
    try {
      const res = await window.electronAPI.import.run(
        Array.from(selectedPaths),
        targetDir,
        { namingRule, categorize, conflictStrategy }
      )
      if (res) {
        setResult({
          imported: res.imported || [],
          failed: res.failed || [],
          skipped: res.skipped || []
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  const canProceedToStep2 = sourceDir && previewFiles.length > 0 && !loading
  const canProceedToStep3 = targetDir && selectedPaths.size > 0

  if (!open) return null

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-wizard-title"
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'var(--overlay-bg)' }}
      onClick={onClose}
    >
      <div
        className="glass-card p-6 w-[680px] max-w-[90vw] max-h-[90vh] overflow-y-auto space-y-4 modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题与步骤指示 */}
        <div className="flex items-center justify-between">
          <div>
            <h3 id="import-wizard-title" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              文件导入向导
            </h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {step === 1 && '步骤 1/3：选择源文件夹'}
              {step === 2 && '步骤 2/3：预览并选择待导入文件'}
              {step === 3 && '步骤 3/3：配置导入规则并执行'}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <IconClose size={18} />
          </button>
        </div>

        {/* 步骤进度条 */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className="flex-1 h-1 rounded-full transition-colors"
              style={{
                background: s <= step ? 'var(--accent)' : 'var(--bg-tertiary)'
              }}
            />
          ))}
        </div>

        {error && (
          <div className="p-3 rounded-lg text-xs" style={{
            background: 'var(--danger-bg)',
            color: 'var(--danger-hover)'
          }}>
            {error}
          </div>
        )}

        {/* 步骤 1：选择源目录 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                源文件夹路径
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sourceDir}
                  onChange={(e) => setSourceDir(e.target.value)}
                  placeholder="选择或输入源文件夹路径"
                  className="input-field flex-1"
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--divider)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)'
                  }}
                />
                <button className="btn-secondary text-xs px-3 py-1.5" onClick={handleSelectSource}>
                  浏览
                </button>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                将递归扫描所选文件夹及其子目录中的所有图片和视频文件
              </p>
            </div>

            {loading && (
              <div className="py-8 text-center">
                <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>正在扫描源目录…</div>
              </div>
            )}

            {previewFiles.length > 0 && (
              <div className="p-3 rounded-lg space-y-2" style={{ background: 'var(--bg-tertiary)' }}>
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>扫描结果</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    共 {previewFiles.length} 个媒体文件，总大小 {formatSize(previewFiles.reduce((s, f) => s + f.size, 0))}
                  </span>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                    <IconImage size={14} />
                    {previewFiles.filter(f => !f.isVideo).length} 张图片
                  </span>
                  <span className="flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                    <IconVideo size={14} />
                    {previewFiles.filter(f => f.isVideo).length} 个视频
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 步骤 2：预览并选择文件 */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                已选 {selectedPaths.size} / {previewFiles.length} 个，总大小 {formatSize(totalSize)}
              </span>
              <button className="btn-secondary text-xs px-2 py-1" onClick={toggleSelectAll}>
                {selectedPaths.size === previewFiles.length ? '取消全选' : '全选'}
              </button>
            </div>
            <div className="border rounded-lg max-h-[300px] overflow-y-auto" style={{ borderColor: 'var(--divider)' }}>
              {previewFiles.map((file) => {
                const checked = selectedPaths.has(file.sourcePath)
                return (
                  <label
                    key={file.sourcePath}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-opacity-50 transition-colors"
                    style={{
                      borderBottom: '1px solid var(--divider)',
                      background: checked ? 'rgba(255, 184, 0, 0.06)' : 'transparent'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(file.sourcePath)}
                      className="flex-shrink-0"
                    />
                    <div className="flex-shrink-0">
                      {file.isVideo ? <IconVideo size={16} /> : <IconImage size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono truncate" style={{ color: 'var(--text-primary)' }} title={file.fileName}>
                        {file.fileName}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {formatTimestamp(file.mtime)} · {formatSize(file.size)}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* 步骤 3：配置规则并导入 */}
        {step === 3 && (
          <div className="space-y-4">
            {/* 导入进度 */}
            {importing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>正在导入…</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>{progress.current} / {progress.total}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                      background: 'var(--accent)'
                    }}
                  />
                </div>
              </div>
            )}

            {/* 导入结果 */}
            {result && (
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(34, 197, 94, 0.12)' }}>
                  <div className="text-lg font-semibold" style={{ color: 'var(--success-deep)' }}>{result.imported.length}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>成功导入</div>
                </div>
                <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(234, 88, 12, 0.12)' }}>
                  <div className="text-lg font-semibold" style={{ color: '#ea580c' }}>{result.skipped.length}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>跳过</div>
                </div>
                <div className="p-3 rounded-lg text-center" style={{ background: 'var(--danger-bg)' }}>
                  <div className="text-lg font-semibold" style={{ color: 'var(--danger-hover)' }}>{result.failed.length}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>失败</div>
                </div>
              </div>
            )}

            {!importing && !result && (
              <>
                {/* 目标目录 */}
                <div className="space-y-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    目标目录（导入到此处）
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={targetDir}
                      onChange={(e) => setTargetDir(e.target.value)}
                      placeholder="选择目标目录"
                      className="input-field flex-1"
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--divider)',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)'
                      }}
                    />
                    <button className="btn-secondary text-xs px-3 py-1.5" onClick={handleSelectTarget}>
                      浏览
                    </button>
                  </div>
                </div>

                {/* 命名规则 */}
                <div className="space-y-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    命名规则
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {NAMING_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setNamingRule(opt.id)}
                        className="p-2 rounded-lg text-left transition-all"
                        style={{
                          border: `1px solid ${namingRule === opt.id ? 'var(--accent)' : 'var(--divider)'}`,
                          background: namingRule === opt.id ? 'rgba(255, 184, 0, 0.08)' : 'var(--bg-tertiary)'
                        }}
                      >
                        <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{opt.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 分类策略 */}
                <div className="space-y-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    目录分类
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {CATEGORIZE_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setCategorize(opt.id)}
                        className="p-2 rounded-lg text-left transition-all"
                        style={{
                          border: `1px solid ${categorize === opt.id ? 'var(--accent)' : 'var(--divider)'}`,
                          background: categorize === opt.id ? 'rgba(255, 184, 0, 0.08)' : 'var(--bg-tertiary)'
                        }}
                      >
                        <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{opt.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 冲突处理 */}
                <div className="space-y-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    同名文件冲突处理
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {CONFLICT_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setConflictStrategy(opt.id)}
                        className="p-2 rounded-lg text-left transition-all"
                        style={{
                          border: `1px solid ${conflictStrategy === opt.id ? 'var(--accent)' : 'var(--divider)'}`,
                          background: conflictStrategy === opt.id ? 'rgba(255, 184, 0, 0.08)' : 'var(--bg-tertiary)'
                        }}
                      >
                        <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{opt.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 摘要 */}
                <div className="p-3 rounded-lg text-xs space-y-1" style={{ background: 'var(--bg-tertiary)' }}>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-tertiary)' }}>待导入文件</span>
                    <span style={{ color: 'var(--text-primary)' }}>{selectedPaths.size} 个（{formatSize(totalSize)}）</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-tertiary)' }}>磁盘空间预估</span>
                    <span style={{ color: 'var(--text-primary)' }}>{formatSize(totalSize)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* 底部按钮 */}
        <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--divider)' }}>
          <div className="flex gap-2">
            {step > 1 && !importing && !result && (
              <button
                className="btn-secondary text-sm px-4 py-1.5"
                onClick={() => setStep((step - 1) as Step)}
              >
                上一步
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary text-sm px-4 py-1.5" onClick={onClose}>
              {result ? '关闭' : '取消'}
            </button>
            {step === 1 && (
              <button
                className="btn-primary text-sm px-4 py-1.5"
                disabled={!canProceedToStep2}
                onClick={() => setStep(2)}
              >
                下一步
              </button>
            )}
            {step === 2 && (
              <button
                className="btn-primary text-sm px-4 py-1.5"
                disabled={!canProceedToStep3}
                onClick={() => setStep(3)}
              >
                下一步
              </button>
            )}
            {step === 3 && !importing && !result && (
              <button
                className="btn-primary text-sm px-4 py-1.5 flex items-center gap-1.5"
                disabled={!canProceedToStep3}
                onClick={handleStartImport}
              >
                <IconImport size={16} />
                开始导入
              </button>
            )}
            {result && (
              <button
                className="btn-primary text-sm px-4 py-1.5"
                onClick={() => {
                  onClose()
                }}
              >
                完成
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
