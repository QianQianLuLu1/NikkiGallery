import { useCallback } from 'react'
import { loadMediaFromDatabase, useMediaStore } from '../stores/mediaStore'

export function useRefreshMedia(options?: {
  withLoading?: boolean
  onError?: (msg: string) => void
}): () => Promise<void> {
  const setMediaFiles = useMediaStore((state) => state.setMediaFiles)
  const setCategories = useMediaStore((state) => state.setCategories)
  const setLoading = useMediaStore((state) => state.setLoading)
  const withLoading = options?.withLoading ?? false
  const onError = options?.onError

  const refresh = useCallback(async () => {
    if (withLoading) setLoading(true)
    try {
      const result = await loadMediaFromDatabase()
      if (result) {
        setMediaFiles(result.files)
        setCategories(result.categories)
      } else {
        // P2-C9：result 为 null 时提示加载失败，而非静默保留旧数据
        console.error('[useRefreshMedia] loadMediaFromDatabase 返回 null，媒体数据加载失败')
        onError?.('媒体数据加载失败，请重试或检查数据库')
      }
    } finally {
      if (withLoading) setLoading(false)
    }
  }, [setMediaFiles, setCategories, setLoading, withLoading, onError])

  return refresh
}
