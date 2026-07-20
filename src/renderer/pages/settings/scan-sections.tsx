import React, { useEffect, useState, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaStore, loadMediaFromDatabase } from '../../stores/mediaStore'
import { SectionShell, GlobalToastContext } from './shared'

// ============ 扫描与路径 ============

export const ScanOptionsSection: React.FC = () => {
  const { t } = useTranslation()
  const [incremental, setIncremental] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const { setMediaFiles } = useMediaStore()
  const showMessage = useContext(GlobalToastContext)

  useEffect(() => {
    const load = async () => {
      if (!window.electronAPI) return
      const i = (await window.electronAPI.settings.get('incrementalScan', true)) as boolean
      setIncremental(i)
    }
    load()
  }, [])

  const saveIncremental = async (value: boolean) => {
    setIncremental(value)
    if (window.electronAPI) await window.electronAPI.settings.set('incrementalScan', value)
    showMessage(value ? t('logAction.incrementalOn') : t('logAction.incrementalOff'))
  }

  const handleAnalyzeSceneTime = async () => {
    if (!window.electronAPI?.mediaAction?.analyzeSceneTime || analyzing) return
    setAnalyzing(true)
    try {
      const result = await window.electronAPI.mediaAction.analyzeSceneTime()
      if (result.success) {
        showMessage(
          result.message || t('logAction.sceneAnalyzed', { count: result.analyzed ?? 0 }),
          'success'
        )
        const res = await loadMediaFromDatabase()
        if (res) setMediaFiles(res.files)
      } else {
        showMessage(result.message || t('logAction.sceneAnalyzeFailed'), 'error')
      }
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : t('logAction.sceneAnalyzeFailed'),
        'error'
      )
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <SectionShell title={t('settings.sections.scanOptions')}>
      <label className="flex items-center justify-between cursor-pointer">
        <span style={{ color: 'var(--text-primary)' }}>{t('settings.scan.incremental')}</span>
        <input
          type="checkbox"
          checked={incremental}
          onChange={(e) => saveIncremental(e.target.checked)}
          className="w-5 h-5"
        />
      </label>
      <div className="pt-3 space-y-2" style={{ borderTop: '1px solid var(--divider)' }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {t('settings.scan.sceneTimeTitle')}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {t('settings.scan.sceneTimeDesc')}
            </p>
          </div>
          <button
            className="btn-primary text-sm"
            onClick={handleAnalyzeSceneTime}
            disabled={analyzing}
          >
            {analyzing ? t('settings.scan.analyzing') : t('settings.scan.analyzeNow')}
          </button>
        </div>
      </div>
    </SectionShell>
  )
}

// P0-01：ScanPathsSection 已移除
// 原方案依赖预设固定路径列表（DEFAULT_KNOWN_PATHS），新方案改为纯文件名签名全盘搜索
// 用户无需手动配置游戏路径，扫描器会自动全盘搜索游戏特征文件和媒体特征文件夹
// 保留"指定目录"扫描入口作为兜底（在 ScanButton 下拉菜单中）
