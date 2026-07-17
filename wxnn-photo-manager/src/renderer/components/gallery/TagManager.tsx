import React, { useState, useRef } from 'react'
import { BaseDialog } from '../common/BaseDialog'
import { useToast } from '../../hooks/useToast'
import { useMediaStore, updateMediaFileAndPersist } from '../../stores/mediaStore'
import { IconClose } from '../../icons'
import { Toast } from '../common/Toast'

interface TagManagerProps {
  mediaId: string
  onClose: () => void
}

/**
 * P1-U2：迁移到 BaseDialog，移除手写的 useFocusTrap / 遮罩 / fadeIn+scaleIn 模板
 * Toast 移到 BaseDialog 外部渲染，zIndex=110 高于 BaseDialog 遮罩的 z-[100]，确保提示可见
 */
export const TagManager: React.FC<TagManagerProps> = ({ mediaId, onClose }) => {
  const { mediaFiles } = useMediaStore()
  const media = mediaFiles.find((f) => f.id === mediaId)
  const [newTag, setNewTag] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { messages, showMessage, dismiss } = useToast()

  const handleAddTag = async () => {
    if (!newTag.trim()) return
    const trimmed = newTag.trim()
    // U-G9：查重（大小写不敏感），已存在则提示且不添加
    if (media && media.tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      showMessage('标签已存在', 'info')
      setNewTag('')
      return
    }
    if (media) {
      const tags = [...media.tags, trimmed]
      await updateMediaFileAndPersist(mediaId, { tags })
    }
    setNewTag('')
  }

  const handleRemoveTag = async (tag: string) => {
    if (!media) return
    const tags = media.tags.filter((t) => t !== tag)
    await updateMediaFileAndPersist(mediaId, { tags })
  }

  return (
    <>
      <BaseDialog
        open={!!media}
        onClose={onClose}
        ariaLabelledby="tag-manager-title"
        size="sm"
        initialFocusRef={inputRef}
        overlayBackground="var(--overlay-bg-strong)"
      >
        <h3 id="tag-manager-title" className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          管理标签
        </h3>

        {/* 当前标签 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {media?.tags.map((tag) => (
            <span
              key={tag}
              className="category-tag active text-xs flex items-center gap-1"
            >
              {tag}
              <button
                className="hover:opacity-70"
                onClick={() => handleRemoveTag(tag)}
              >
                <IconClose size={12} />
              </button>
            </span>
          ))}
          {media && media.tags.length === 0 && (
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>暂无标签</span>
          )}
        </div>

        {/* 添加新标签 */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            className="input-field flex-1"
            placeholder="输入新标签..."
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
          />
          <button className="btn-primary" onClick={handleAddTag}>
            添加
          </button>
        </div>

        {/* 常用标签建议 */}
        <div className="mt-4">
          <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>常用标签</p>
          <div className="flex flex-wrap gap-2">
            {['截图', '风景', '人物', '装备', '剧情', '战斗', '探索'].map((tag) => (
              <button
                key={tag}
                className="category-tag text-xs"
                onClick={async () => {
                  if (media && !media.tags.includes(tag)) {
                    await updateMediaFileAndPersist(mediaId, { tags: [...media.tags, tag] })
                  }
                }}
              >
                + {tag}
              </button>
            ))}
          </div>
        </div>
      </BaseDialog>
      {/* U-G9：标签查重提示 Toast，z-index 高于 BaseDialog 遮罩确保可见 */}
      <Toast messages={messages} onDismiss={dismiss} zIndex={110} />
    </>
  )
}
