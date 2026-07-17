import React from 'react'
import { motion } from 'motion/react'
// P1-5：空态 CTA 按钮微交互
import { springSoft } from '../../utils/motionPresets'

interface EmptyStateProps {
  /** 图标（ReactNode，传入 <IconXXX /> 组件） */
  icon?: React.ReactNode
  /** 主标题 */
  title: string
  /** 副标题/描述 */
  subtitle?: string
  /** CTA 按钮文案 */
  ctaLabel?: string
  /** CTA 按钮回调 */
  onCta?: () => void
}

/**
 * U-S6：统一空态组件
 * 用于 4 处空态结构（DetailPage / EditorPage / DuplicatesPage / RecycleBinPage）
 * P1-5：CTA 按钮使用 motion 弹簧微交互
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  subtitle,
  ctaLabel,
  onCta
}) => {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-2"
      style={{ color: 'var(--text-tertiary)' }}
    >
      {icon && <div className="mb-2 opacity-60">{icon}</div>}
      <p className="text-base">{title}</p>
      {subtitle && <p className="text-sm opacity-80">{subtitle}</p>}
      {ctaLabel && onCta && (
        <motion.button
          className="btn-primary mt-4"
          onClick={onCta}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          transition={springSoft}
        >
          {ctaLabel}
        </motion.button>
      )}
    </div>
  )
}
