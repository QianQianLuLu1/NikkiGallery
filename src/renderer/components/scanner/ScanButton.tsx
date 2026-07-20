import React, { useState, useEffect, useRef } from 'react'
import { useMediaStore, loadMediaFromDatabase } from '../../stores/mediaStore'
import { IconRefresh, IconChevronDown } from '../../icons'

type ScanMode = 'incremental' | 'full' | 'custom'

export const ScanButton: React.FC = () => {
  const { setMediaFiles, setScanProgress } = useMediaStore()
  const [scanning, setScanning] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 注册扫描进度监听，并在组件卸载时取消订阅
  useEffect(() => {
    if (!window.electronAPI?.scanner?.onProgress) return
    const unsubscribe = window.electronAPI.scanner.onProgress((progress) => {
      setScanProgress({ ...progress, scanning: true })
    })
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [setScanProgress])

  // 监听扫描完成事件：主进程在 startScan 返回后立即发送，
  // 即使 IPC 返回值因某种原因延迟，UI 也能及时清除"正在扫描"状态
  // 修复：扫描完成后必须重新加载媒体列表，否则启动自动扫描的新增文件不会显示
  useEffect(() => {
    if (!window.electronAPI?.scanner?.onComplete) return
    const unsubscribe = window.electronAPI.scanner.onComplete(async (result) => {
      setScanning(false)
      setScanProgress({ scanning: false, status: result?.success ? 'completed' : 'failed' })
      // 无论扫描成功或失败，都重新加载媒体列表，确保前端与数据库同步
      const res = await loadMediaFromDatabase()
      if (res) setMediaFiles(res.files)
    })
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [setScanProgress, setMediaFiles])

  // 建议改#6：挂载时同步主进程当前扫描状态，
  // 避免启动自动扫描时 UI 初始为 false 与实际不一致
  useEffect(() => {
    if (!window.electronAPI?.scanner?.status) return
    void window.electronAPI.scanner.status().then((progress) => {
      if (progress?.status === 'running') {
        setScanning(true)
        setScanProgress({ ...progress, scanning: true })
      }
    })
  }, [setScanProgress])

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const handleScan = async (mode: ScanMode) => {
    if (!window.electronAPI?.scanner || scanning) return
    setMenuOpen(false)
    setScanning(true)
    setScanProgress({ scanning: true, status: 'running' })

    try {
      let customPath: string | undefined
      if (mode === 'custom') {
        // 选择自定义目录（兜底入口，当全盘签名搜索未命中时使用）
        if (window.electronAPI?.dialog?.selectDirectory) {
          const result = await window.electronAPI.dialog.selectDirectory()
          if (!result) {
            // 用户取消选择
            setScanning(false)
            setScanProgress({ scanning: false, status: 'completed' })
            return
          }
          customPath = result
        } else {
          // 预览版无 IPC，直接取消
          setScanning(false)
          setScanProgress({ scanning: false, status: 'completed' })
          return
        }
      }

      // P0-01：移除 customKnownPaths 传递
      // 新方案采用纯文件名签名全盘搜索，不再依赖预设固定路径
      // 增量扫描和全盘扫描均通过文件名签名定位游戏目录
      const result = await window.electronAPI.scanner.start({
        incremental: mode === 'incremental',
        path: customPath,
        fullScan: mode === 'full'
      })
      if (result.success) {
        const res = await loadMediaFromDatabase()
        if (res) setMediaFiles(res.files)
      }
    } finally {
      setScanning(false)
      setScanProgress({ scanning: false, status: 'completed' })
    }
  }

  const scanOptions: { mode: ScanMode; label: string; desc: string }[] = [
    { mode: 'incremental', label: '增量扫描', desc: '仅扫描新增文件' },
    { mode: 'full', label: '自动定位游戏目录', desc: '文件名签名全盘搜索游戏媒体' },
    { mode: 'custom', label: '指定目录', desc: '手动选择目录扫描（兜底）' }
  ]

  return (
    <div ref={menuRef} className="relative">
      <div className="flex items-center">
        <button
          className={`icon-btn ${scanning ? 'active' : ''}`}
          onClick={() => handleScan('incremental')}
          disabled={scanning}
          title="增量扫描"
          aria-label="增量扫描"
        >
          <IconRefresh size={16} className={scanning ? 'animate-spin' : ''} />
        </button>
        <button
          className="icon-btn px-1"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={scanning}
          title="扫描选项"
          aria-label="扫描选项"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <IconChevronDown size={12} />
        </button>
      </div>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 glass-panel py-1 min-w-[180px] z-50"
          style={{ animation: 'scaleIn 150ms ease-out' }}
        >
          {scanOptions.map((opt) => (
            <button
              key={opt.mode}
              role="menuitem"
              className="w-full flex flex-col items-start px-3 py-2 text-left transition-colors hover:bg-[var(--hover-bg)]"
              onClick={() => handleScan(opt.mode)}
            >
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {opt.label}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {opt.desc}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
