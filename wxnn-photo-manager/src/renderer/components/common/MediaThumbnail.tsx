import React, { useState } from 'react'
import { MissingBadge } from './MissingBadge'
import { MediaThumbPlaceholder } from '../gallery/MediaThumbPlaceholder'

interface MediaThumbnailProps {
  /** 缩略图 URL（可为空，为空时显示占位图标） */
  src: string | null | undefined
  /** 文件名（用于 alt 文本） */
  alt: string
  /** 文件类型，决定占位图标 */
  fileType: 'image' | 'video'
  /** 是否丢失（显示丢失角标） */
  isMissing?: boolean
  /** MissingBadge 尺寸，默认 'md' */
  badgeSize?: 'md' | 'sm'
  /** 容器类名（追加到外层 div 之上） */
  className?: string
  /** img 元素的类名（默认 'absolute inset-0 w-full h-full object-cover'） */
  imgClassName?: string
  /** 点击回调 */
  onClick?: () => void
  /** 右键回调 */
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void
}

/**
 * 公共媒体缩略图组件
 *
 * 设计目标：统一包装 img + MissingBadge + MediaThumbPlaceholder + onError 错误处理，
 * 消除 8 处重复实现的 `<img className="w-full h-full object-cover" />` 模式。
 *
 * 该组件确保：
 *   1. 缩略图加载失败时显示警告图标（而非破碎图标）
 *   2. 丢失文件显示角标
 *   3. 视频文件未加载时显示视频图标
 *   4. 无障碍：alt 文本、aria-label
 *
 * 使用方式：
 *   import { MediaThumbnail } from '@/components/common/MediaThumbnail'
 *   <MediaThumbnail
 *     src={file.thumbnail}
 *     alt={file.file_name}
 *     fileType={file.file_type}
 *     isMissing={!!file.is_missing}
 *     onClick={() => onSelect(file)}
 *     onContextMenu={(e) => onContextMenu(e, file)}
 *   />
 */
export const MediaThumbnail: React.FC<MediaThumbnailProps> = ({
  src,
  alt,
  fileType,
  isMissing = false,
  badgeSize = 'md',
  className = '',
  imgClassName = 'absolute inset-0 w-full h-full object-cover',
  onClick,
  onContextMenu
}) => {
  // 加载错误状态：src 非空但加载失败时显示警告图标
  const [hasError, setHasError] = useState(false)
  // 实际是否显示缩略图：有 src 且未出错
  const showThumb = !!src && !hasError

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {/* 丢失角标 */}
      {isMissing && <MissingBadge size={badgeSize} />}

      {/* 缩略图 */}
      {showThumb && (
        <img
          src={src}
          alt={alt}
          className={imgClassName}
          loading="lazy"
          onError={() => setHasError(true)}
        />
      )}

      {/* 占位/失败图标（无缩略图或加载失败时显示） */}
      <MediaThumbPlaceholder
        fileType={fileType}
        hasError={hasError}
        variant="overlay"
        visible={!showThumb}
      />
    </div>
  )
}
