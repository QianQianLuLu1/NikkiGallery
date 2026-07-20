import { useEffect, useRef } from 'react'

interface UseEditorShortcutsOptions {
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onSaveAs: () => void
  onReset: () => void
  onCopyParams?: () => void
  onPasteParams?: () => void
  onToggleFullscreen: () => void
  onToggleShortcuts: () => void
  onExit: () => void
  isFullscreen: boolean
  showShortcuts: boolean
}

export function useEditorShortcuts(options: UseEditorShortcutsOptions) {
  // U-O12：使用 ref 保存最新 options，避免依赖整个对象导致 effect 重挂监听
  const optionsRef = useRef(options)
  optionsRef.current = options

  // 仅依赖 isFullscreen 和 showShortcuts（这两个值影响 Esc 键的分支逻辑，需及时更新）
  const { isFullscreen, showShortcuts } = options

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const opts = optionsRef.current
      if (e.key === 'Escape') {
        if (opts.showShortcuts) {
          opts.onToggleShortcuts()
          return
        }
        if (opts.isFullscreen) {
          opts.onToggleFullscreen()
          return
        }
        opts.onExit()
        return
      }

      if (e.key === 'F11') {
        e.preventDefault()
        opts.onToggleFullscreen()
        return
      }

      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        opts.onToggleShortcuts()
        return
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 's') {
          e.preventDefault()
          if (e.shiftKey) {
            opts.onSaveAs()
          } else {
            opts.onSave()
          }
          return
        }

        if (e.key.toLowerCase() === 'z') {
          e.preventDefault()
          if (e.shiftKey) {
            opts.onRedo()
          } else {
            opts.onUndo()
          }
          return
        }

        if (e.key.toLowerCase() === 'y') {
          e.preventDefault()
          opts.onRedo()
          return
        }

        if (e.key.toLowerCase() === 'c' && e.shiftKey && opts.onCopyParams) {
          e.preventDefault()
          opts.onCopyParams()
          return
        }

        if (e.key.toLowerCase() === 'v' && e.shiftKey && opts.onPasteParams) {
          e.preventDefault()
          opts.onPasteParams()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen, showShortcuts])
}
