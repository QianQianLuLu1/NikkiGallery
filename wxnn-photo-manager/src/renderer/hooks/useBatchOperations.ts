import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useMediaStore, type MediaFile } from '../stores/mediaStore'
import { type WatermarkConfig } from '../utils/imageProcessor'

export interface UseBatchOperationsOptions {
  onShowMessage: (text: string, type?: 'success' | 'error') => void
}

export function useBatchOperations(options: UseBatchOperationsOptions) {
  const { onShowMessage } = options
  const { selectedMediaIds, clearSelection } = useUIStore()
  const { mediaFiles, setMediaFiles, updateMediaFile } = useMediaStore()
  const [watermarkDialog, setWatermarkDialog] = useState(false)
  const [watermarkConfig, setWatermarkConfig] = useState<WatermarkConfig | null>(null)
  const [watermarkProgress, setWatermarkProgress] = useState<{ current: number; total: number } | null>(null)
  const [watermarking, setWatermarking] = useState(false)
  // P2-C8：watermarking ref 供 onProgress 回调检查，避免异常后仍触发 setWatermarkProgress
  const watermarkingRef = useRef(false)
  // T12：批量重命名对话框状态
  const [batchRenameDialog, setBatchRenameDialog] = useState(false)

  useEffect(() => {
    if (!window.electronAPI?.watermark?.onProgress) return
    const unsubscribe = window.electronAPI.watermark.onProgress((progress) => {
      // P2-C8：异常/取消后 watermarkingRef 为 false，忽略残留的进度回调
      if (!watermarkingRef.current) return
      setWatermarkProgress(progress)
    })
    return () => { unsubscribe() }
  }, [])

  const getSelectedFilePaths = useCallback(() => {
    return mediaFiles
      .filter((f) => selectedMediaIds.includes(f.id))
      .map((f) => f.file_path)
  }, [mediaFiles, selectedMediaIds])

  const handleBatchExport = useCallback(async (useDefaultDir = false) => {
    if (!window.electronAPI) {
      onShowMessage('当前环境不支持导出', 'error')
      return
    }
    try {
      let targetDir = ''
      if (useDefaultDir) {
        // P1-02：使用默认导出路径（主进程从 settings 读取）
        const defaultDir = await window.electronAPI.settings.get('export.defaultDir', '') as string
        if (!defaultDir) {
          onShowMessage('未配置默认导出路径，请先在设置中配置', 'error')
          return
        }
        targetDir = defaultDir
      } else {
        targetDir = await window.electronAPI.dialog.selectDirectory() || ''
        if (!targetDir) return
      }
      const filePaths = getSelectedFilePaths()
      // P1-02：useDefaultDir=true 时让主进程自动应用命名规则
      const result = await window.electronAPI.file.export(filePaths, targetDir, useDefaultDir ? { useDefaultDir: true } : {})
      onShowMessage(result.message, result.success ? 'success' : 'error')
    } catch (error) {
      onShowMessage(error instanceof Error ? error.message : '批量导出失败', 'error')
    }
  }, [getSelectedFilePaths, onShowMessage])

  const handleBatchMove = useCallback(async () => {
    if (!window.electronAPI) {
      onShowMessage('当前环境不支持移动', 'error')
      return
    }
    try {
      const targetDir = await window.electronAPI.dialog.selectDirectory()
      if (!targetDir) return
      const filePaths = getSelectedFilePaths()
      const result = await window.electronAPI.file.move(filePaths, targetDir)
      if (result.success) {
        const movedIds = new Set(selectedMediaIds)
        setMediaFiles(mediaFiles.filter((f) => !movedIds.has(f.id)))
        clearSelection()
      }
      onShowMessage(result.message, result.success ? 'success' : 'error')
    } catch (error) {
      onShowMessage(error instanceof Error ? error.message : '批量移动失败', 'error')
    }
  }, [getSelectedFilePaths, mediaFiles, selectedMediaIds, setMediaFiles, clearSelection, onShowMessage])

  const handleBatchWatermark = useCallback(async () => {
    if (!watermarkConfig) {
      onShowMessage('请先配置水印', 'error')
      return
    }
    if (!window.electronAPI) {
      onShowMessage('当前环境不支持批量水印', 'error')
      return
    }
    try {
      const targetDir = await window.electronAPI.dialog.selectDirectory()
      if (!targetDir) return
      const filePaths = mediaFiles
        .filter((f) => selectedMediaIds.includes(f.id) && f.file_type === 'image')
        .map((f) => f.file_path)
      if (filePaths.length === 0) {
        onShowMessage('未选择可添加水印的图片', 'error')
        return
      }
      setWatermarking(true)
      watermarkingRef.current = true
      setWatermarkProgress({ current: 0, total: filePaths.length })
      const result = await window.electronAPI.watermark.apply(watermarkConfig, filePaths, targetDir)
      watermarkingRef.current = false
      setWatermarking(false)
      setWatermarkProgress(null)
      onShowMessage(result.message, result.success ? 'success' : 'error')
      if (result.success) {
        setWatermarkDialog(false)
      }
    } catch (error) {
      watermarkingRef.current = false
      setWatermarking(false)
      setWatermarkProgress(null)
      onShowMessage(error instanceof Error ? error.message : '批量水印失败', 'error')
    }
  }, [watermarkConfig, mediaFiles, selectedMediaIds, onShowMessage])

  // T12：批量重命名选中文件——调用 IPC 完成文件系统+数据库同步更新，再同步本地 store
  const handleBatchRename = useCallback(async (operations: { oldPath: string; newName: string }[]) => {
    if (!window.electronAPI?.file?.batchRename) {
      onShowMessage('当前环境不支持批量重命名', 'error')
      return
    }
    try {
      const result = await window.electronAPI.file.batchRename(operations)
      // 同步本地 store：用返回的新路径/新文件名更新对应 MediaFile
      if (result.renamed.length > 0) {
        const pathMap = new Map(result.renamed.map((r) => [r.oldPath, { newPath: r.newPath, newFileName: r.newFileName }]))
        for (const file of mediaFiles) {
          const mapped = pathMap.get(file.file_path)
          if (mapped) {
            updateMediaFile(file.id, { file_path: mapped.newPath, file_name: mapped.newFileName })
          }
        }
      }
      onShowMessage(result.message, result.success ? 'success' : 'error')
      if (result.success) {
        setBatchRenameDialog(false)
        clearSelection()
      }
    } catch (error) {
      onShowMessage(error instanceof Error ? error.message : '批量重命名失败', 'error')
    }
  }, [mediaFiles, updateMediaFile, clearSelection, onShowMessage])

  // T12：当前选中的文件列表（供 BatchRenameDialog 预览使用）
  const selectedFiles: MediaFile[] = useMemo(() => {
    return mediaFiles.filter((f) => selectedMediaIds.includes(f.id))
  }, [mediaFiles, selectedMediaIds])

  // P1-04：跨档案转移——批量更新 account_uid
  const handleTransferToProfile = useCallback(async (targetUid: string) => {
    if (!window.electronAPI?.profile?.transferFiles) {
      onShowMessage('当前环境不支持跨档案转移', 'error')
      return
    }
    if (selectedMediaIds.length === 0) {
      onShowMessage('未选择要转移的文件', 'error')
      return
    }
    try {
      // selectedMediaIds 是 string[]（uiStore），主进程需要 number[]
      const mediaIds = selectedMediaIds.map((id) => Number(id)).filter((n) => !Number.isNaN(n))
      if (mediaIds.length === 0) {
        onShowMessage('选中文件 id 无效', 'error')
        return
      }
      const result = await window.electronAPI.profile.transferFiles(mediaIds, targetUid)
      onShowMessage(result.message ?? (result.success ? '转移成功' : '转移失败'), result.success ? 'success' : 'error')
      if (result.success) {
        // 本地同步 account_uid 字段
        const targetSet = new Set(selectedMediaIds)
        for (const file of mediaFiles) {
          if (targetSet.has(file.id) && file.account_uid !== undefined) {
            updateMediaFile(file.id, { account_uid: targetUid } as Partial<MediaFile>)
          }
        }
        clearSelection()
      }
    } catch (error) {
      onShowMessage(error instanceof Error ? error.message : '跨档案转移失败', 'error')
    }
  }, [selectedMediaIds, mediaFiles, updateMediaFile, clearSelection, onShowMessage])

  return useMemo(() => ({
    watermarkDialog,
    setWatermarkDialog,
    watermarkConfig,
    setWatermarkConfig,
    watermarkProgress,
    watermarking,
    handleBatchExport,
    handleBatchMove,
    handleBatchWatermark,
    // T12：批量重命名
    batchRenameDialog,
    setBatchRenameDialog,
    selectedFiles,
    handleBatchRename,
    // P1-04：跨档案转移
    handleTransferToProfile
  }), [watermarkDialog, setWatermarkDialog, watermarkConfig, setWatermarkConfig, watermarkProgress, watermarking, handleBatchExport, handleBatchMove, handleBatchWatermark, batchRenameDialog, setBatchRenameDialog, selectedFiles, handleBatchRename, handleTransferToProfile])
}
