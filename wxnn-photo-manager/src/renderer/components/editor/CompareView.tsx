import React, { useState, useRef, useEffect } from 'react'
import { IconChevronRight } from '../../icons'

interface CompareViewProps {
  originalSrc: string | null
  editedSrc: string | null
  className?: string
}

export const CompareView: React.FC<CompareViewProps> = ({ originalSrc, editedSrc, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [split, setSplit] = useState(50)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100))
      setSplit(percent)
    }
    const handleMouseUp = () => setIsDragging(false)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  if (!originalSrc || !editedSrc) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ background: 'var(--bg-tertiary)' }}>
        <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>加载中...</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      <img src={editedSrc} alt="编辑后" className="absolute inset-0 w-full h-full object-contain" />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${split}%` }}
      >
        <img src={originalSrc} alt="原图" className="absolute inset-0 w-full h-full object-contain" />
      </div>
      <div
        className="absolute top-0 bottom-0 w-1 cursor-ew-resize"
        style={{ left: `${split}%`, background: 'var(--text-on-overlay)', transform: 'translateX(-50%)' }}
        onMouseDown={() => setIsDragging(true)}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--text-on-overlay)' }}>
          <IconChevronRight size={12} />
        </div>
      </div>
      <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-xs" style={{ background: 'var(--overlay-bg)', color: 'var(--text-on-overlay)' }}>原图</div>
      <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-xs" style={{ background: 'var(--overlay-bg)', color: 'var(--text-on-overlay)' }}>编辑后</div>
    </div>
  )
}
