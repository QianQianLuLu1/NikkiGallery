import React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { fadeVariants, scaleFadeVariants, fastFade, springSoft } from '../../utils/motionPresets'

type DialogSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CLASS: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl'
}

interface BaseDialogProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** 卡片最大宽度档位，默认 md */
  size?: DialogSize
  /** 初始聚焦元素 ref（不传则聚焦第一个可聚焦元素） */
  initialFocusRef?: React.RefObject<HTMLElement>
  /** aria-labelledby 的 id */
  ariaLabelledby?: string
  /** 点击遮罩是否关闭，默认 true */
  closeOnOverlayClick?: boolean
  /** 是否启用焦点陷阱，默认 true（FeedbackDialog 等历史组件迁移后统一启用） */
  trapFocus?: boolean
  /** 自定义卡片 className（追加到默认类之后，用于 max-h、overflow 等） */
  cardClassName?: string
  /** 自定义遮罩 className（追加到默认类之后） */
  overlayClassName?: string
  /** P1-U2：遮罩背景色，默认 var(--overlay-bg)；批量操作/重要操作可传 var(--overlay-bg-strong) 增强视觉对比 */
  overlayBackground?: string
}

/**
 * P1-U13：对话框公共骨架
 *
 * 封装 5 个 Dialog 重复的模板逻辑：
 * - AnimatePresence + motion 双层结构（遮罩 fade + 卡片 scaleFade）
 * - useFocusTrap 焦点陷阱 + Esc 关闭 + 焦点恢复
 * - 遮罩点击关闭 + 内容点击阻止冒泡
 * - 统一 z-index、overlay 背景、glass-card 卡片样式、motion 预设
 *
 * 调用方仅需传入 children（卡片内容）和必要的回调。
 */
export const BaseDialog: React.FC<BaseDialogProps> = ({
  open,
  onClose,
  children,
  size = 'md',
  initialFocusRef,
  ariaLabelledby,
  closeOnOverlayClick = true,
  trapFocus = true,
  cardClassName = '',
  overlayClassName = '',
  overlayBackground = 'var(--overlay-bg)'
}) => {
  // trapFocus=false 时不启用焦点陷阱（极少数场景：对话框内含需外部焦点的控件）
  const overlayRef = useFocusTrap<HTMLDivElement>({
    active: open && trapFocus,
    onEscape: onClose,
    initialFocusRef
  })

  const handleOverlayClick = closeOnOverlayClick ? onClose : undefined

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={trapFocus ? overlayRef : undefined}
          variants={fadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={fastFade}
          role="dialog"
          aria-modal="true"
          aria-labelledby={ariaLabelledby}
          className={`fixed inset-0 z-[100] flex items-center justify-center ${overlayClassName}`}
          style={{ background: overlayBackground }}
          onClick={handleOverlayClick}
        >
          <motion.div
            variants={scaleFadeVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springSoft}
            className={`glass-card p-6 w-full ${SIZE_CLASS[size]} mx-4 space-y-4 ${cardClassName}`}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
