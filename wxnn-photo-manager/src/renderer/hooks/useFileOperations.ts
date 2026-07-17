import { useCallback, useMemo, useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useMediaStore, type MediaFile } from '../stores/mediaStore'
import { useOperationHistoryStore } from '../stores/operationHistoryStore'
import type { ToastType } from './useToast'
import { useFavoriteToggle } from './useFavoriteToggle'
import { formatFileSize } from '../utils/format'
import { formatDate } from '../utils/date'
// DU1：路径工具统一到 utils/file.ts
import { getDirName, joinPath } from '../utils/file'

export interface UseFileOperationsOptions {
  filteredFiles: MediaFile[]
  onShowMessage: (text: string, type?: ToastType) => void
  onRefreshMedia: () => Promise<void>
}

export interface DeleteConfirmConfig {
  title: string
  message: string
  onConfirm: () => Promise<void>
}

export function useFileOperations(options: UseFileOperationsOptions) {
  const { filteredFiles, onShowMessage, onRefreshMedia } = options
  const { selectMedia, navigateTo, openFullscreen } = useUIStore()
  const { deleteMediaFiles, updateMediaFile } = useMediaStore()
  const pushHistory = useOperationHistoryStore((s) => s.push)
  const registerUndoHandler = useOperationHistoryStore((s) => s.registerUndoHandler)

  // 建议改#9：注册 4 个 undoHandler（按 type 分发，避免闭包捕获）
  // 使用 ref 保存最新的 onRefreshMedia/updateMediaFile，handler 内通过 ref 访问
  useEffect(() => {
    // P1-C8：收集各 registerUndoHandler 返回的注销函数，在 cleanup 中调用
    const unsubscribers: Array<() => void> = []

    // file_move: 将文件从 newPath 移回原目录
    unsubscribers.push(registerUndoHandler('file_move', async (payload) => {
      if (!window.electronAPI) return { success: false, message: '当前环境不支持撤销' }
      const { newPath, originalPath } = payload as { newPath: string; originalPath: string }
      try {
        const undoResult = await window.electronAPI.file.move([newPath], getDirName(originalPath))
        if (!undoResult.success) return { success: false, message: undoResult.message }
        await onRefreshMedia()
        return { success: true }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) }
      }
    }))

    // file_rename: 将文件名改回 originalName
    unsubscribers.push(registerUndoHandler('file_rename', async (payload) => {
      if (!window.electronAPI) return { success: false, message: '当前环境不支持撤销' }
      const { newPath, originalName } = payload as { newPath: string; originalName: string }
      try {
        const undoResult = await window.electronAPI.file.rename(newPath, originalName)
        if (!undoResult.success) return { success: false, message: undoResult.message }
        await onRefreshMedia()
        return { success: true }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) }
      }
    }))

    // media_soft_delete: 从回收站恢复
    unsubscribers.push(registerUndoHandler('media_soft_delete', async (payload) => {
      if (!window.electronAPI) return { success: false, message: '当前环境不支持撤销' }
      const { mediaId } = payload as { mediaId: number }
      try {
        const undoResult = await window.electronAPI.mediaAction.restore([mediaId])
        if (!undoResult.success) return { success: false, message: undoResult.message }
        await onRefreshMedia()
        return { success: true }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) }
      }
    }))

    // favorite_toggle: 恢复收藏状态
    unsubscribers.push(registerUndoHandler('favorite_toggle', async (payload, mediaId) => {
      if (!window.electronAPI || !mediaId) return { success: false, message: '当前环境不支持撤销' }
      const { originalFavorite } = payload as { originalFavorite: boolean }
      try {
        const undoResult = await window.electronAPI.mediaAction.updateFavorite(Number(mediaId), originalFavorite)
        if (!undoResult.success) return { success: false, message: undoResult.message }
        updateMediaFile(mediaId, { is_favorite: originalFavorite })
        return { success: true }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) }
      }
    }))

    // P1-C8：组件卸载时注销所有 handler，避免撤销调用已卸载闭包
    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [registerUndoHandler, onRefreshMedia, updateMediaFile])

  const handleOpen = useCallback((file: MediaFile) => {
    selectMedia(file.id)
    openFullscreen(filteredFiles.findIndex((f) => f.id === file.id))
  }, [filteredFiles, selectMedia, openFullscreen])

  const handleEdit = useCallback((file: MediaFile) => {
    selectMedia(file.id)
    navigateTo('editor')
  }, [selectMedia, navigateTo])

  const handleSaveAs = useCallback(async (file: MediaFile) => {
    if (!window.electronAPI) {
      onShowMessage('当前环境不支持另存为', 'error')
      return
    }
    try {
      const targetDir = await window.electronAPI.dialog.selectDirectory()
      if (!targetDir) return
      const result = await window.electronAPI.file.saveAs(file.file_path, targetDir)
      onShowMessage(result.message, result.success ? 'success' : 'error')
    } catch (error) {
      onShowMessage(error instanceof Error ? error.message : '另存为失败', 'error')
    }
  }, [onShowMessage])

  const handleCopy = useCallback(async (file: MediaFile) => {
    if (!window.electronAPI) {
      onShowMessage('当前环境不支持复制', 'error')
      return
    }
    try {
      const targetDir = await window.electronAPI.dialog.selectDirectory()
      if (!targetDir) return
      const result = await window.electronAPI.file.copy([file.file_path], targetDir)
      onShowMessage(result.message, result.success ? 'success' : 'error')
    } catch (error) {
      onShowMessage(error instanceof Error ? error.message : '复制失败', 'error')
    }
  }, [onShowMessage])

  const handleMove = useCallback(async (file: MediaFile) => {
    if (!window.electronAPI) {
      onShowMessage('当前环境不支持移动', 'error')
      return
    }
    try {
      const targetDir = await window.electronAPI.dialog.selectDirectory()
      if (!targetDir) return
      const originalPath = file.file_path
      const result = await window.electronAPI.file.move([originalPath], targetDir)
      if (result.success) {
        deleteMediaFiles([file.id])
        // P1-C2：使用主进程返回的实际路径（冲突时可能被自动重命名），避免撤销时找不到文件
        const newPath = result.actualPaths?.[0] ?? joinPath(targetDir, file.file_name)
        pushHistory({
          type: 'file_move',
          description: `移动文件 "${file.file_name}"`,
          mediaId: file.id,
          payload: { originalPath, newPath, targetDir }
        })
      }
      onShowMessage(result.message, result.success ? 'success' : 'error')
    } catch (error) {
      onShowMessage(error instanceof Error ? error.message : '移动失败', 'error')
    }
  }, [deleteMediaFiles, onShowMessage, pushHistory])

  const handleRename = useCallback(async (file: MediaFile, newName: string) => {
    if (!window.electronAPI) {
      onShowMessage('当前环境不支持重命名', 'error')
      return
    }
    try {
      const originalPath = file.file_path
      const originalName = file.file_name
      const result = await window.electronAPI.file.rename(originalPath, newName)
      if (result.success) {
        await onRefreshMedia()
        // 建议改#9：不传 undoFn，仅传 type + payload
        const dir = getDirName(originalPath)
        const newPath = joinPath(dir, newName)
        pushHistory({
          type: 'file_rename',
          description: `重命名 "${originalName}" → "${newName}"`,
          mediaId: file.id,
          payload: { originalPath, newPath, originalName, newName }
        })
      }
      onShowMessage(result.message, result.success ? 'success' : 'error')
    } catch (error) {
      onShowMessage(error instanceof Error ? error.message : '重命名失败', 'error')
    }
  }, [onShowMessage, onRefreshMedia, pushHistory])

  const getDeleteConfirm = useCallback((file: MediaFile, permanent = false): DeleteConfirmConfig => ({
    title: permanent ? '永久删除' : '删除文件',
    message: permanent
      ? `确定要永久删除 "${file.file_name}" 吗？此操作不可恢复。`
      : `确定要将 "${file.file_name}" 移至回收站吗？`,
    onConfirm: async () => {
      if (!window.electronAPI) {
        onShowMessage('当前环境不支持删除', 'error')
        return
      }
      try {
        if (permanent) {
          const result = await window.electronAPI.file.deletePermanent([file.file_path])
          if (result.success) {
            await window.electronAPI.mediaAction.delete(Number(file.id))
            deleteMediaFiles([file.id])
          }
          onShowMessage(result.message, result.success ? 'success' : 'error')
        } else {
          // 软删除（移入回收站）：可撤销
          const result = await window.electronAPI.file.delete([file.file_path])
          if (result.success) {
            await window.electronAPI.mediaAction.softDelete([Number(file.id)])
            deleteMediaFiles([file.id])
            // 建议改#9：不传 undoFn，仅传 type + payload
            pushHistory({
              type: 'media_soft_delete',
              description: `删除文件 "${file.file_name}" 到回收站`,
              mediaId: file.id,
              payload: { mediaId: Number(file.id), originalPath: file.file_path }
            })
          }
          onShowMessage(result.message, result.success ? 'success' : 'error')
        }
      } catch (error) {
        onShowMessage(error instanceof Error ? error.message : '删除失败', 'error')
      }
    }
  }), [deleteMediaFiles, onShowMessage, pushHistory])

  // P1-C3：复用共享 hook，保持与 FullscreenViewer 收藏撤销逻辑一致
  const handleToggleFavorite = useFavoriteToggle(onShowMessage)

  const formatProperties = useCallback((file: MediaFile): string => {
    return `名称: ${file.file_name}\n路径: ${file.file_path}\n类型: ${file.file_type}\n大小: ${formatFileSize(file.file_size)}\n分辨率: ${file.width && file.height ? `${file.width}x${file.height}` : '-'}\n创建时间: ${formatDate(file.created_at)}`
  }, [])

  return useMemo(() => ({
    handleOpen,
    handleEdit,
    handleSaveAs,
    handleCopy,
    handleMove,
    handleRename,
    getDeleteConfirm,
    handleToggleFavorite,
    formatProperties
  }), [handleOpen, handleEdit, handleSaveAs, handleCopy, handleMove, handleRename, getDeleteConfirm, handleToggleFavorite, formatProperties])
}
