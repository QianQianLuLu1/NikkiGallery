import React, { useState, useRef, useEffect } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { IconDelete, IconExport, IconMove, IconWatermark, IconClose, IconSelectAll, IconInvertSelection, IconCategory, IconShare, IconRename } from '../../icons'
import { ShareMenuButton } from '../common/ShareMenuButton'
import type { ShareChannelId } from '../common/ShareGuideDialog'

export interface BatchActionsProps {
  count: number
  total: number
  onExport: () => void
  onMove: () => void
  onWatermark: () => void
  onDelete: () => void
  onClear: () => void
  onSelectAll: () => void
  onInvertSelection: () => void
  onCategorize?: () => void
  // T08：WiFi 局域网分享
  onShareWifi?: () => void
  // T09：剪贴板分享（微信 / QQ / vivo）
  onShareClipboard?: (channelId: ShareChannelId) => void
  // T12：批量重命名
  onBatchRename?: () => void
  // P1-02：导出到默认文件夹（仅在配置了默认路径时显示）
  onExportToDefault?: () => void
  // P1-04：跨档案转移——可选档案列表与回调
  profiles?: Array<{ uid: string; nickname: string }>
  onTransferToProfile?: (targetUid: string) => void
}

export const BatchActions: React.FC<BatchActionsProps> = ({
  count,
  total,
  onExport,
  onMove,
  onWatermark,
  onDelete,
  onClear,
  onSelectAll,
  onInvertSelection,
  onCategorize,
  onShareWifi,
  onShareClipboard,
  onBatchRename,
  onExportToDefault,
  profiles,
  onTransferToProfile
}) => {
  // P2-1：条件按钮出现/消失时 FLIP 平滑重排
  const [actionsRef] = useAutoAnimate({ duration: 200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' })

  return (
    <div
      ref={actionsRef}
      className="fixed left-1/2 -translate-x-1/2 glass-card px-4 py-2 flex items-center gap-2 z-40 flex-wrap justify-center max-w-[calc(100vw-32px)]"
      style={{ bottom: '44px', animation: 'slideInBottom 200ms ease-out' }}
      role="toolbar"
      aria-label="批量操作"
    >
      <span className="text-sm font-medium px-2" style={{ color: 'var(--text-primary)' }}>
        {count} / {total} 项已选择
      </span>
      <div className="w-px h-5 mx-1" style={{ background: 'var(--divider)' }} />
      <button className="icon-btn text-sm px-3 w-auto gap-1" onClick={onSelectAll} aria-label="全选">
        <IconSelectAll size={14} />
        全选
      </button>
      <button className="icon-btn text-sm px-3 w-auto gap-1" onClick={onInvertSelection} aria-label="反选">
        <IconInvertSelection size={14} />
        反选
      </button>
      <div className="w-px h-5 mx-1" style={{ background: 'var(--divider)' }} />
      <button className="icon-btn text-sm px-3 w-auto gap-1" onClick={onDelete} aria-label="删除">
        <IconDelete size={14} />
        删除
      </button>
      <button className="icon-btn text-sm px-3 w-auto gap-1" onClick={onExport} aria-label="导出" title="选择目录导出">
        <IconExport size={14} />
        导出
      </button>
      {onExportToDefault && (
        <button
          className="icon-btn text-sm px-3 w-auto gap-1"
          onClick={onExportToDefault}
          aria-label="导出到默认文件夹"
          title="一键导出到默认文件夹（按命名规则自动重命名）"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <IconExport size={14} />
          导出到默认
        </button>
      )}
      <button className="icon-btn text-sm px-3 w-auto gap-1" onClick={onMove} aria-label="移动">
        <IconMove size={14} />
        移动
      </button>
      <button className="icon-btn text-sm px-3 w-auto gap-1" onClick={onWatermark} aria-label="水印">
        <IconWatermark size={14} />
        水印
      </button>
      {onBatchRename && (
        <button className="icon-btn text-sm px-3 w-auto gap-1" onClick={onBatchRename} aria-label="批量重命名" title="批量重命名">
          <IconRename size={14} />
          重命名
        </button>
      )}
      {onCategorize && (
        <button className="icon-btn text-sm px-3 w-auto gap-1" onClick={onCategorize} aria-label="分类">
          <IconCategory size={14} />
          分类
        </button>
      )}
      {/* P1-04：转移到档案——下拉式选择目标档案 */}
      {onTransferToProfile && profiles && profiles.length > 0 && (
        <ProfileTransferMenu profiles={profiles} onSelect={onTransferToProfile} />
      )}
      {onShareClipboard && (
        <ShareMenuButton onSelect={onShareClipboard} label="分享" title="复制到剪贴板并分享到微信/QQ/vivo" />
      )}
      {onShareWifi && (
        <button className="icon-btn text-sm px-3 w-auto gap-1" onClick={onShareWifi} aria-label="WiFi 分享" title="WiFi 局域网分享">
          <IconShare size={14} />
          WiFi 分享
        </button>
      )}
      <div className="w-px h-5 mx-1" style={{ background: 'var(--divider)' }} />
      <button className="icon-btn" onClick={onClear} aria-label="清除选择">
        <IconClose size={14} />
      </button>
    </div>
  )
}

// P1-04：转移到档案下拉菜单——批量更新选中文件的 account_uid
// 内联实现以避免引入新文件；交互参考 ShareMenuButton（点击外部关闭 + Esc 关闭）
const ProfileTransferMenu: React.FC<{
  profiles: Array<{ uid: string; nickname: string }>
  onSelect: (targetUid: string) => void
}> = ({ profiles, onSelect }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="icon-btn text-sm px-3 w-auto gap-1"
        aria-haspopup="menu"
        aria-expanded={open}
        title="将选中文件转移到其他角色档案"
        onClick={() => setOpen((v) => !v)}
      >
        <IconCategory size={14} />
        转移到档案
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-1 glass-panel py-1 min-w-[180px] z-50 max-h-[280px] overflow-y-auto"
          style={{ animation: 'scaleIn 150ms ease-out' }}
        >
          {profiles.map((p) => (
            <button
              key={p.uid}
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left"
              style={{ color: 'var(--text-primary)' }}
              onClick={() => {
                setOpen(false)
                onSelect(p.uid)
              }}
            >
              <IconCategory size={14} />
              <span className="truncate">{p.nickname}</span>
              <span className="ml-auto text-xs" style={{ color: 'var(--text-tertiary)' }}>{p.uid}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
