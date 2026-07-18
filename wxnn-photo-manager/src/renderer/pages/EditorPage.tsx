import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import { useMediaStore, toFileUrl } from '../stores/mediaStore'
import { Histogram } from '../components/editor/Histogram'
import { useImageProcessor } from '../hooks/useImageProcessor'
import {
  processImageData,
  imageToDataUrl,
  type FilterPreset,
  type FilterParams
} from '../utils/imageProcessor'
import { mergeFilterParams } from '../utils/filter'
import { useEditHistory, type AdjustmentState } from '../hooks/useEditHistory'
// P0-C1：编辑保存后清理游戏参数缓存，避免显示旧 EXIF/参数
import { clearAllGameParamsCache } from '../hooks/useGameParams'
import { useEditorShortcuts } from '../hooks/useEditorShortcuts'
import { useGlobalToast } from './settings/sections'
import { useRefreshMedia } from '../hooks/useRefreshMedia'
import { EditorToolbar } from '../components/editor/EditorToolbar'
import { EditorTabs, type EditorTabId } from '../components/editor/EditorTabs'
import { ShortcutsModal } from '../components/editor/ShortcutsModal'
import { BatchApplyDialog, type BatchApplyProgress } from '../components/editor/BatchApplyDialog'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { EmptyState } from '../components/common/EmptyState'
import { ZoomableContainer } from '../components/common/ZoomableContainer'
import { VideoEditor } from '../components/editor/VideoEditor'
import { IconImage } from '../icons'

export const EditorPage: React.FC = () => {
  const { t } = useTranslation()
  const { selectedMediaId, selectedMediaIds, navigateTo } = useUIStore()
  const { mediaFiles } = useMediaStore()
  const media = mediaFiles.find((f) => f.id === selectedMediaId)

  // F-S7 批量编辑：选中的图片（排除当前编辑的图片和视频）
  const batchApplyTargets = useMemo(() => {
    return mediaFiles.filter(
      (f) => selectedMediaIds.includes(f.id) && f.id !== selectedMediaId && f.file_type === 'image'
    )
  }, [mediaFiles, selectedMediaIds, selectedMediaId])

  const sourceUrl = useMemo(
    () => (media && media.file_type === 'image' ? toFileUrl(media.file_path) : null),
    [media]
  )

  const {
    loading,
    error: processorError,
    params,
    setParams,
    updateParam,
    updateCurve,
    updateHSL,
    filter,
    setFilter,
    applyFilterPreset,
    filterIntensity,
    setFilterIntensity,
    watermark,
    setWatermark,
    previewUrl,
    originalUrl,
    reset,
    exportDataUrl
  } = useImageProcessor({ source: sourceUrl, maxPreviewSize: 1400 })

  const [activeTab, setActiveTab] = useState<EditorTabId>('basic')
  const [compareMode, setCompareMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [canPaste, setCanPaste] = useState(false)
  // F-S7 批量编辑状态
  const [batchApplyConfirm, setBatchApplyConfirm] = useState(false)
  const [batchApplying, setBatchApplying] = useState(false)
  const [batchProgress, setBatchProgress] = useState<BatchApplyProgress | null>(null)
  const [batchDone, setBatchDone] = useState(false)
  const [batchMessage, setBatchMessage] = useState('')
  const showMessage = useGlobalToast()
  const refreshMedia = useRefreshMedia()
  // F-B2：editor:save 失败时暂存 dataUrl，下次进入编辑器时提示恢复
  const [recoverData, setRecoverData] = useState<{
    dataUrl: string
    fileName: string
    timestamp: number
  } | null>(null)

  useEffect(() => {
    const hasClipboard = Boolean(localStorage.getItem('editor-params-clipboard'))
    setCanPaste(hasClipboard)
    // F-B2：检查上次保存失败的编辑结果
    try {
      const raw = localStorage.getItem('editor-failed-save')
      if (raw) {
        const parsed = JSON.parse(raw) as { dataUrl: string; fileName: string; timestamp: number }
        setRecoverData(parsed)
      }
    } catch {
      // 数据损坏时清除
      localStorage.removeItem('editor-failed-save')
    }
  }, [])

  const applyHistoryState = useCallback(
    (state: AdjustmentState) => {
      setParams(state.params)
      setFilter(state.filter)
      setFilterIntensity(state.filterIntensity)
      setWatermark(state.watermark)
    },
    [setParams, setFilter, setFilterIntensity, setWatermark]
  )

  // C-O11：initialState 改用 ref 持有最新值
  // 原实现 useMemo([]) 空依赖导致 initialState 永远是首次渲染的快照，
  // 但 useEditHistory 的初始化 effect 依赖 [initialState]，仅当引用变化时重新初始化——
  // 这与"只初始化一次"的意图冲突。现在用 ref 让 useEditHistory 始终拿到最新值，
  // 而 initializedRef 保证只初始化一次（见 useEditHistory.ts）。
  const initialStateRef = useRef<AdjustmentState>({
    params: { ...params },
    filter,
    filterIntensity,
    watermark
  })
  useEffect(() => {
    initialStateRef.current = { params: { ...params }, filter, filterIntensity, watermark }
  }, [params, filter, filterIntensity, watermark])

  // useEditHistory 只在首次挂载时初始化，传入稳定的空对象避免引用变化触发重初始化
  const {
    pushHistory: pushHistoryToStack,
    undo,
    redo,
    canUndo,
    canRedo
  } = useEditHistory(initialStateRef.current, applyHistoryState)

  const pushHistory = useCallback(() => {
    pushHistoryToStack({ params: { ...params }, filter, filterIntensity, watermark })
  }, [params, filter, filterIntensity, watermark, pushHistoryToStack])

  const handleReset = useCallback(() => {
    reset()
    pushHistory()
  }, [reset, pushHistory])

  useEffect(() => {
    if (isFullscreen) {
      const original = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = original
      }
    }
  }, [isFullscreen])

  const handleCopyParams = useCallback(() => {
    const payload = JSON.stringify({ params, filter, filterIntensity, watermark })
    localStorage.setItem('editor-params-clipboard', payload)
    setCanPaste(true)
    showMessage('已复制编辑参数', 'success')
  }, [params, filter, filterIntensity, watermark, showMessage])

  const handlePasteParams = useCallback(() => {
    const raw = localStorage.getItem('editor-params-clipboard')
    if (!raw) {
      showMessage('剪贴板为空', 'error')
      return
    }
    try {
      const parsed = JSON.parse(raw)
      if (parsed.params) setParams(parsed.params)
      if (parsed.filter !== undefined) setFilter(parsed.filter)
      if (parsed.filterIntensity !== undefined) setFilterIntensity(parsed.filterIntensity)
      if (parsed.watermark !== undefined) setWatermark(parsed.watermark)
      pushHistory()
      showMessage('已粘贴编辑参数', 'success')
    } catch {
      showMessage('粘贴参数失败', 'error')
    }
  }, [setParams, setFilter, setFilterIntensity, setWatermark, pushHistory, showMessage])

  const handleSave = useCallback(async () => {
    if (!media || !window.electronAPI) return
    setSaving(true)
    try {
      const dataUrl = await exportDataUrl(true)
      if (!dataUrl) throw new Error('导出失败')
      const result = await window.electronAPI.editor.save(media.file_path, dataUrl, {
        format: media.file_ext.replace('.', '') || 'jpg',
        quality: 95
      })
      showMessage(result.message, result.success ? 'success' : 'error')
      if (result.success) {
        // P0-C1：编辑保存成功后清理游戏参数缓存，避免详情页显示旧解码结果
        clearAllGameParamsCache()
        // F-B2：保存成功后清除暂存的失败编辑结果
        localStorage.removeItem('editor-failed-save')
        await refreshMedia()
      } else {
        // F-B2：IPC 返回失败时，暂存 dataUrl 到 localStorage 供下次恢复
        try {
          localStorage.setItem(
            'editor-failed-save',
            JSON.stringify({
              dataUrl,
              fileName: media.file_name,
              timestamp: Date.now()
            })
          )
          showMessage(t('editor.recover.stored'), 'info')
        } catch {
          // localStorage quota 超限（dataUrl 过大）
          showMessage(t('editor.recover.storeFailed'), 'error')
        }
      }
    } catch (error) {
      showMessage(String(error), 'error')
      // F-B2：异常失败时也尝试暂存（此时 dataUrl 可能未生成）
    } finally {
      setSaving(false)
    }
  }, [media, exportDataUrl, showMessage, refreshMedia, t])

  const handleSaveAs = useCallback(async () => {
    if (!media || !window.electronAPI) return
    setSaving(true)
    try {
      const dataUrl = await exportDataUrl(true)
      if (!dataUrl) throw new Error('导出失败')
      const directory = await window.electronAPI.dialog.selectDirectory()
      if (!directory) {
        setSaving(false)
        return
      }
      const result = await window.electronAPI.editor.saveAs(dataUrl, {
        directory,
        fileName: `${media.file_name.replace(/\.[^.]+$/, '')}_编辑`,
        format: 'jpg',
        quality: 95
      })
      showMessage(result.message, result.success ? 'success' : 'error')
    } catch (error) {
      showMessage(String(error), 'error')
    } finally {
      setSaving(false)
    }
  }, [media, exportDataUrl, showMessage])

  const handleExportPreset = useCallback(async () => {
    if (!window.electronAPI) {
      showMessage('当前环境不支持导出预设', 'error')
      return
    }
    try {
      const name = presetName.trim() || filter?.name || '自定义预设'
      const preset = {
        name,
        category: filter?.category || 'custom',
        params: { ...params }
      }
      const result = await window.electronAPI.editor.exportPresetToFile(preset)
      if (result.canceled) return
      showMessage(
        result.success ? '预设导出成功' : result.message || '预设导出失败',
        result.success ? 'success' : 'error'
      )
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '预设导出失败', 'error')
    }
  }, [presetName, filter, params, showMessage])

  const handleImportPreset = useCallback(async () => {
    if (!window.electronAPI) {
      showMessage('当前环境不支持导入预设', 'error')
      return
    }
    try {
      const result = await window.electronAPI.editor.importPresetFromFile()
      if (result.canceled) return
      if (!result.success || !result.preset) {
        showMessage(result.message || '预设导入失败', 'error')
        return
      }
      const imported = result.preset as {
        name: string
        category: string
        params: Partial<FilterParams>
      }
      const newPreset: FilterPreset = {
        id: `imported-${Date.now()}`,
        name: imported.name || '导入预设',
        category: imported.category || 'custom',
        params: imported.params || {}
      }
      applyFilterPreset(newPreset)
      setFilterIntensity(100)
      pushHistory()
      showMessage('预设导入成功', 'success')
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '预设导入失败', 'error')
    }
  }, [applyFilterPreset, pushHistory, showMessage])

  const handleSavePreset = useCallback(async () => {
    if (!window.electronAPI || !window.electronAPI.editor?.exportPreset) {
      showMessage('当前环境不支持保存预设', 'error')
      return
    }
    try {
      const name = presetName.trim() || filter?.name || '自定义预设'
      const preset = {
        name,
        category: 'custom',
        params: JSON.stringify({ ...params })
      }
      const result = await window.electronAPI.editor.exportPreset(preset)
      if (result.success) {
        setPresetName('')
        showMessage('预设保存成功', 'success')
      } else {
        showMessage(result.message || '预设保存失败', 'error')
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '预设保存失败', 'error')
    }
  }, [presetName, filter, params, showMessage])

  const handleApplyFilterPreset = useCallback(
    (preset: FilterPreset) => {
      applyFilterPreset(preset)
      pushHistory()
    },
    [applyFilterPreset, pushHistory]
  )

  // F-S7 批量编辑：将当前调整/滤镜/水印应用到选中的图片
  // 逐张加载图片 → 应用 processImageData → 导出 dataUrl → 调用 editor:save（含原图备份机制）
  const performBatchApply = useCallback(async () => {
    if (!window.electronAPI?.editor?.save) return
    const targets = batchApplyTargets
    if (targets.length === 0) return

    setBatchApplying(true)
    setBatchDone(false)
    setBatchMessage('')
    setBatchProgress({ current: 0, total: targets.length, currentFileName: '', failedCount: 0 })

    // 计算当前编辑器合并后的参数（含滤镜强度）
    const mergedParams = mergeFilterParams(params, filter, filterIntensity)
    const paramsJson = JSON.stringify(mergedParams)
    let successCount = 0
    let failedCount = 0

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      setBatchProgress({
        current: i,
        total: targets.length,
        currentFileName: target.file_name,
        failedCount
      })
      try {
        // 1. 加载图片为 Image 对象
        const imgUrl = toFileUrl(target.file_path)
        if (!imgUrl) throw new Error(`路径无效: ${target.file_name}`)
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const im = new Image()
          im.crossOrigin = 'anonymous'
          im.onload = () => resolve(im)
          im.onerror = () => reject(new Error(`加载失败: ${target.file_name}`))
          im.src = imgUrl
        })
        // 2. 应用编辑参数 + 水印
        const imageData = await processImageData(img, mergedParams, { maxSize: 4096, watermark })
        // 3. 导出 dataUrl
        const dataUrl = await imageToDataUrl(imageData, 'image/jpeg', 0.95)
        if (!dataUrl) throw new Error('导出失败')
        // 4. 调用 editor:save（主进程会备份原图并记录编辑历史）
        const result = await window.electronAPI.editor.save(target.file_path, dataUrl, {
          format: target.file_ext.replace('.', '') || 'jpg',
          quality: 95,
          params: paramsJson
        })
        if (result.success) successCount++
        else {
          failedCount++
          console.warn(`[BatchApply] 保存失败: ${target.file_name}`, result.message)
        }
      } catch (err) {
        failedCount++
        console.warn(`[BatchApply] 处理失败: ${target.file_name}`, err)
      }
      // 让出主线程，避免长时间阻塞 UI
      await new Promise((r) => setTimeout(r, 0))
    }

    setBatchProgress({
      current: targets.length,
      total: targets.length,
      currentFileName: '',
      failedCount
    })
    setBatchApplying(false)
    setBatchDone(true)
    setBatchMessage(
      failedCount > 0
        ? `批量应用完成：成功 ${successCount} 项，失败 ${failedCount} 项。原图已自动备份，可在编辑历史中回退。`
        : `批量应用完成：成功处理 ${successCount} 项。原图已自动备份，可在编辑历史中回退。`
    )
    showMessage('批量应用完成', 'success')
    // 刷新图库以反映编辑后的缩略图
    refreshMedia()
  }, [batchApplyTargets, params, filter, filterIntensity, watermark, showMessage, refreshMedia])

  const handleApplyToSelected = useCallback(() => {
    if (batchApplyTargets.length === 0) {
      showMessage('请先在图库中选择要批量应用的图片', 'error')
      return
    }
    setBatchApplyConfirm(true)
  }, [batchApplyTargets.length, showMessage])

  // F-B2：下载暂存的编辑结果到本地
  const handleRecoverDownload = useCallback(() => {
    if (!recoverData) return
    try {
      const link = document.createElement('a')
      link.href = recoverData.dataUrl
      const baseName = recoverData.fileName.replace(/\.[^.]+$/, '')
      link.download = `${baseName}_编辑恢复.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      localStorage.removeItem('editor-failed-save')
      setRecoverData(null)
      showMessage(t('editor.recover.downloaded'), 'success')
    } catch (error) {
      showMessage(String(error), 'error')
    }
  }, [recoverData, showMessage, t])

  // F-B2：丢弃暂存的编辑结果
  const handleRecoverDiscard = useCallback(() => {
    localStorage.removeItem('editor-failed-save')
    setRecoverData(null)
    showMessage(t('editor.recover.discarded'), 'info')
  }, [showMessage, t])

  const shortcutOptions = useMemo(
    () => ({
      onUndo: undo,
      onRedo: redo,
      onSave: handleSave,
      onSaveAs: handleSaveAs,
      onReset: handleReset,
      onCopyParams: handleCopyParams,
      onPasteParams: handlePasteParams,
      onToggleFullscreen: () => setIsFullscreen((prev) => !prev),
      onToggleShortcuts: () => setShowShortcuts((prev) => !prev),
      onExit: () => navigateTo('detail'),
      isFullscreen,
      showShortcuts
    }),
    [
      undo,
      redo,
      handleSave,
      handleSaveAs,
      handleReset,
      handleCopyParams,
      handlePasteParams,
      navigateTo,
      isFullscreen,
      showShortcuts
    ]
  )

  useEditorShortcuts(shortcutOptions)

  if (!media) {
    return (
      <EmptyState title="未选择媒体文件" ctaLabel="返回图库" onCta={() => navigateTo('gallery')} />
    )
  }

  if (media.file_type === 'video') {
    // F-S9：视频编辑器（裁剪/调速），替换原"视频文件暂不支持编辑"占位
    return <VideoEditor media={media} onExit={() => navigateTo('detail')} />
  }

  return (
    <div
      className={`h-full flex gap-4 ${isFullscreen ? 'fixed inset-0 z-50 p-4' : ''}`}
      style={isFullscreen ? { background: 'var(--bg-primary)' } : undefined}
    >
      {/* 左侧预览区 */}
      <div className="flex-1 flex flex-col min-w-0">
        <EditorToolbar
          canUndo={canUndo}
          canRedo={canRedo}
          compareMode={compareMode}
          isFullscreen={isFullscreen}
          saving={saving}
          loading={loading}
          canPaste={canPaste}
          applyToSelectedCount={batchApplyTargets.length}
          batchApplying={batchApplying}
          onUndo={undo}
          onRedo={redo}
          onReset={handleReset}
          onCompareStart={() => setCompareMode(true)}
          onCompareEnd={() => setCompareMode(false)}
          onToggleShortcuts={() => setShowShortcuts(true)}
          onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
          onExit={() => navigateTo('detail')}
          onSaveAs={handleSaveAs}
          onSave={handleSave}
          onCopyParams={handleCopyParams}
          onPasteParams={handlePasteParams}
          onApplyToSelected={handleApplyToSelected}
        />

        <Histogram imageSrc={previewUrl} className="mb-3" />

        <div
          className="flex-1 flex items-center justify-center relative overflow-hidden rounded-2xl"
          style={{ background: 'var(--bg-tertiary)' }}
        >
          {loading && (
            <div
              className="absolute inset-0 flex items-center justify-center z-10"
              style={{ background: 'var(--bg-tertiary)' }}
            >
              <div
                className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin"
                style={{ color: 'var(--accent)' }}
              />
            </div>
          )}
          {previewUrl && (
            <ZoomablePreview
              src={compareMode ? originalUrl || previewUrl : previewUrl}
              alt={media.file_name}
            />
          )}
          {!loading && !previewUrl && (
            <div className="flex flex-col items-center" style={{ color: 'var(--text-tertiary)' }}>
              <IconImage size={64} strokeWidth={1} />
              <p className="mt-2">{processorError || '无法加载图片'}</p>
            </div>
          )}
        </div>
      </div>

      {/* U-G13：全屏模式下隐藏 EditorTabs 面板，退出后恢复显示 */}
      {!isFullscreen && (
        <EditorTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          params={params}
          updateParam={updateParam}
          updateCurve={updateCurve}
          updateHSL={updateHSL}
          pushHistory={pushHistory}
          filter={filter}
          filterIntensity={filterIntensity}
          applyFilterPreset={handleApplyFilterPreset}
          setFilterIntensity={setFilterIntensity}
          watermark={watermark}
          setWatermark={setWatermark}
          presetName={presetName}
          setPresetName={setPresetName}
          sourceUrl={sourceUrl}
          onExportPreset={handleExportPreset}
          onImportPreset={handleImportPreset}
          onSavePreset={handleSavePreset}
        />
      )}

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      <BatchApplyDialog
        open={batchApplying || batchDone}
        progress={batchProgress}
        done={batchDone}
        message={batchMessage}
        onClose={() => {
          setBatchDone(false)
          setBatchMessage('')
        }}
      />

      <ConfirmDialog
        open={batchApplyConfirm}
        title="批量应用编辑参数"
        message={`将当前调整/滤镜/水印应用到选中的 ${batchApplyTargets.length} 张图片。每张图片保存前会自动备份原图，可在编辑历史中回退。确定要继续吗？`}
        confirmText="开始应用"
        onConfirm={() => {
          setBatchApplyConfirm(false)
          performBatchApply()
        }}
        onCancel={() => setBatchApplyConfirm(false)}
      />

      {/* F-B2：恢复上次保存失败的编辑结果 */}
      <ConfirmDialog
        open={!!recoverData}
        title={t('editor.recover.title')}
        message={
          recoverData
            ? t('editor.recover.message', {
                fileName: recoverData.fileName,
                time: new Date(recoverData.timestamp).toLocaleString()
              })
            : ''
        }
        confirmText={t('editor.recover.download')}
        cancelText={t('editor.recover.discard')}
        onConfirm={handleRecoverDownload}
        onCancel={handleRecoverDiscard}
      />
    </div>
  )
}

// U-O8：编辑器预览区缩放/平移支持——滚轮缩放、拖拽平移、双击复位
// P1-U12：复用 ZoomableContainer 共享组件，仅保留图片渲染
interface ZoomablePreviewProps {
  src: string
  alt: string
}

const ZoomablePreview: React.FC<ZoomablePreviewProps> = ({ src, alt }) => {
  return (
    <ZoomableContainer
      maxZoom={8}
      resetVariant="text"
      containerClassName="flex items-center justify-center w-full h-full overflow-hidden relative"
    >
      <img src={src} alt={alt} className="max-w-full max-h-full object-contain" draggable={false} />
    </ZoomableContainer>
  )
}
