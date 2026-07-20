interface Breakpoint {
  width: number
  cols: number
}

/**
 * P1-U10：Gallery 视图默认响应式列数断点
 *
 * VirtualImageGrid / TimelineView / EventTimelineView 三者原各自维护相同的断点表
 * （1280→6, 1024→5, 768→4, 480→3, 0→2），统一为单一数据源。
 */
export const DEFAULT_COLUMNS_BREAKPOINTS: readonly Breakpoint[] = [
  { width: 1280, cols: 6 },
  { width: 1024, cols: 5 },
  { width: 768, cols: 4 },
  { width: 480, cols: 3 },
  { width: 0, cols: 2 }
] as const

/**
 * 根据容器宽度计算响应式列数
 *
 * @param width 容器宽度（px）
 * @param breakpoints 断点表（降序排列），默认 DEFAULT_COLUMNS_BREAKPOINTS
 * @returns 匹配的列数
 */
export function getResponsiveColumns(
  width: number,
  breakpoints: readonly Breakpoint[] = DEFAULT_COLUMNS_BREAKPOINTS
): number {
  return breakpoints.find((b) => width >= b.width)?.cols ?? 2
}
