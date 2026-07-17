import React, { useState, useCallback } from 'react'
import { useMediaStore, loadMediaFromDatabase } from '../../stores/mediaStore'
import { IconClose } from '../../icons'

// 修复 U-S1/F-S2：
// U-S1：原 ScanProgress 组件从未被挂载，扫描进度不可见
// F-S2：扫描过程无法中止，用户只能等待
// 新实现：在 GalleryPage 挂载，新增停止按钮可中止扫描
export const ScanProgress: React.FC = () => {
  const scanProgress = useMediaStore((state) => state.scanProgress)
  const setScanProgress = useMediaStore((state) => state.setScanProgress)
  const setMediaFiles = useMediaStore((state) => state.setMediaFiles)
  const [stopping, setStopping] = useState(false)

  const handleStop = useCallback(async () => {
    if (!window.electronAPI?.scanner?.stop || stopping) return
    setStopping(true)
    try {
      await window.electronAPI.scanner.stop()
      // 停止后重新加载已扫描的数据
      const result = await loadMediaFromDatabase()
      if (result) setMediaFiles(result.files)
    } catch (error) {
      console.error('停止扫描失败:', error)
    } finally {
      setStopping(false)
      setScanProgress({ scanning: false, status: 'completed' })
    }
  }, [stopping, setScanProgress, setMediaFiles])

  if (!scanProgress.scanning && scanProgress.status !== 'running') {
    return null
  }

  // U-G6：进度百分比使用动态上限，避免硬编码导致超限提前满格或少于时永远不满
  // 优先使用 total 字段；若无则取 scanned/found 的较大值作为分母（至少为 1 避免除零）
  const total = (scanProgress as { total?: number }).total
  const denominator = total && total > 0 ? total : Math.max(scanProgress.scanned, scanProgress.found, 1)
  const percent = Math.min(100, (scanProgress.scanned / denominator) * 100)

  return (
    <div
      className="fixed right-6 glass-card p-4 w-80 z-50"
      style={{ bottom: '44px', animation: 'slideInBottom 300ms ease-out' }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {stopping ? '正在停止...' : '正在扫描...'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            已找到 {scanProgress.found} 个文件
          </span>
          {!stopping && (
            <button
              className="p-1 rounded hover:bg-black/10 transition-colors"
              onClick={handleStop}
              title="停止扫描"
              aria-label="停止扫描"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <IconClose size={14} strokeWidth="2" />
            </button>
          )}
        </div>
      </div>

      {/* 进度条 */}
      <div className="progress-bar mb-2">
        <div
          className="progress-bar-fill"
          style={{
            width: `${stopping ? 100 : percent}%`,
            transition: 'width 300ms ease-out'
          }}
        />
      </div>

      {/* 当前路径 */}
      {scanProgress.currentPath && (
        <p
          className="text-xs ellipsis"
          style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          title={scanProgress.currentPath}
        >
          {scanProgress.currentPath}
        </p>
      )}
    </div>
  )
}
