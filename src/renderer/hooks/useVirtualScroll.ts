import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

interface VirtualScrollOptions {
  itemCount: number
  itemHeight: number
  overscan?: number
  gap?: number
}

interface VirtualScrollState {
  startIndex: number
  endIndex: number
  totalHeight: number
  offsetY: number
}

export function useVirtualScroll({
  itemCount,
  itemHeight,
  overscan = 3,
  gap = 0
}: VirtualScrollOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  // C-O8：原 effect 依赖 [itemCount]，分页加载时 itemCount 频繁变化
  // 导致 effect 频繁重挂监听（removeEventListener + addEventListener）。
  // 实际 effect 内部不使用 itemCount（visibleItems 计算在 render 中完成），
  // 改为 [] 依赖，监听器只在挂载时建立一次。

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const update = () => {
      setScrollTop(container.scrollTop)
      setContainerHeight(container.clientHeight)
    }

    update()
    container.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    const observer = new ResizeObserver(update)
    observer.observe(container)

    return () => {
      container.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer.disconnect()
    }
  }, [])

  const rowHeight = itemHeight + gap
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const visibleCount = Math.ceil(containerHeight / rowHeight) + overscan * 2
  const endRow = Math.min(itemCount - 1, startRow + visibleCount)

  const state: VirtualScrollState = {
    startIndex: startRow,
    endIndex: endRow,
    totalHeight: itemCount * rowHeight - gap,
    offsetY: startRow * rowHeight
  }

  const scrollToIndex = useCallback(
    (index: number) => {
      const container = containerRef.current
      if (!container) return
      container.scrollTop = index * rowHeight
    },
    [rowHeight]
  )

  return { containerRef, ...state, scrollToIndex }
}

interface VirtualGridOptions {
  items: unknown[]
  itemHeight: number
  gap?: number
  overscan?: number
  columns: number
}

export function useVirtualGrid({
  items,
  itemHeight,
  gap = 0,
  overscan = 2,
  columns
}: VirtualGridOptions) {
  const rowCount = useMemo(() => Math.ceil(items.length / columns), [items.length, columns])
  const rowHeight = itemHeight + gap

  const {
    containerRef,
    startIndex: startRow,
    endIndex: endRow,
    totalHeight,
    offsetY,
    scrollToIndex
  } = useVirtualScroll({
    itemCount: rowCount,
    itemHeight: rowHeight,
    overscan,
    gap: 0
  })

  const visibleItems = useMemo(() => {
    const start = startRow * columns
    const end = Math.min(items.length, (endRow + 1) * columns)
    return items.slice(start, end).map((item, index) => ({
      item,
      index: start + index,
      row: Math.floor((start + index) / columns),
      col: (start + index) % columns
    }))
  }, [items, startRow, endRow, columns])

  return {
    containerRef,
    visibleItems,
    totalHeight,
    offsetY,
    rowHeight,
    columns,
    scrollToIndex
  }
}
