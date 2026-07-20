import { contextBridge, ipcRenderer } from 'electron'
import type { ExportOptions } from './types/file'
import type { IpcResponse } from '../shared/types/ipc-types'

// ============ IPC 响应解包层 ============
// 主进程所有 handler 经 wrapHandler 包装后返回 IpcResponse<T>：
//   { success: true, data: T } | { success: false, error: { code, message, details? } }
// preload 在此统一解包：成功返回 T，失败抛出 IpcError（携带 code/message/details）。
// 渲染层调用方式保持不变：const data = await electronAPI.file.delete(paths)
// 错误处理：try { ... } catch (err) { if (err instanceof IpcError) { err.code ... } }

/**
 * 渲染进程可见的 IPC 错误类
 * 主进程 AppError 通过 IPC 序列化为 { code, message, userMessage?, details? } 后，由 preload 还原为 IpcError 抛出
 */
export class IpcError extends Error {
  readonly code: string
  readonly userMessage?: string
  readonly details?: unknown

  constructor(code: string, message: string, details?: unknown, userMessage?: string) {
    super(message)
    this.name = 'IpcError'
    this.code = code
    this.userMessage = userMessage
    this.details = details
    Object.setPrototypeOf(this, IpcError.prototype)
  }
}

/**
 * 统一 IPC 调用入口：invoke + 解包 IpcResponse
 * 成功返回业务数据 T，失败抛出 IpcError
 */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResponse<T>
  if (res && res.success) {
    return res.data
  }
  if (res && !res.success && res.error) {
    throw new IpcError(res.error.code, res.error.message, res.error.details, res.error.userMessage)
  }
  // 兜底：返回值结构不符合 IpcResponse 契约
  throw new IpcError('IPC_MALFORMED_RESPONSE', `IPC 响应格式异常: ${channel}`, res)
}

// ============ 业务数据类型定义 ============

interface ScannerStartResult {
  success: boolean
  filesFound?: number
  message?: string
}
interface ScannerStatus {
  isScanning: boolean
  lastScanTime?: string
  filesFound?: number
}
interface ScannerProgress {
  scanned: number
  found: number
  currentPath: string
}
interface ScannerComplete {
  success: boolean
  message: string
  filesFound?: number
}

interface FileOpResult {
  success: boolean
  message?: string
  processed?: number
  failed?: number
  skipped?: number
  renamed?: Array<{ oldPath: string; newPath: string; newFileName: string }>
  errors?: Array<{ path: string; message: string }>
  exported?: Array<{ source: string; target: string; success: boolean; message?: string }>
  imported?: Array<{ source: string; target: string }>
}

interface EditorSaveResult {
  success: boolean
  backupPath?: string
  message?: string
}
interface EditorSaveAsResult {
  success: boolean
  filePath?: string
  message?: string
}
interface FilterPreset {
  id: string
  name: string
  category: string
  params: unknown
  isBuiltin: boolean
  createdAt: string
}
interface EditorLoadPresetsResult {
  presets: FilterPreset[]
}

interface WatermarkApplyResult {
  success: boolean
  processed: number
  failed?: number
  message?: string
}
interface WatermarkTemplateRow {
  id: number
  name: string
  config: string
  is_builtin: number
  created_at: string
}

interface VideoThumbnailResult {
  thumbnail: string | null
  hasThumbnail: boolean
}
interface VideoMetadata {
  path: string
  size: number
  duration: number
  width: number
  height: number
  codec: string
  frameRate: number
}

interface BackupListResult {
  backups: Array<{ name: string; size: number; createdAt: string }>
  backupDir: string
}
interface DirOpResult {
  success: boolean
  needRestart: boolean
  message: string
}

interface CacheStats {
  totalSize: number
  fileCount: number
  limitBytes: number
  dir: string
}
interface CacheCleanResult {
  clearedSize: number
  clearedCount: number
}
interface CacheSetLimitResult {
  applied: boolean
  evicted: number
}
interface CacheEnforceResult {
  evicted: number
  totalSize: number
  fileCount: number
}

interface LogFaultListResult {
  faults: Array<Record<string, unknown>>
}
interface LogFaultDetailResult {
  fault: Record<string, unknown> | null
}
interface LogDirectoryPathResult {
  path: string
}
interface LogStats {
  totalSize: number
  fileCount: number
  oldestTime?: string
  newestTime?: string
}
interface LogExportZipResult {
  success: boolean
  filePath: string
  message?: string
}
interface LogClearResult {
  success: boolean
  cleared: number
  message?: string
}

interface CrashListResult {
  crashes: Array<Record<string, unknown>>
}
interface CrashStats {
  total: number
  oldestTime?: string
  newestTime?: string
}
interface CrashClearResult {
  success: boolean
  cleared: number
  message?: string
}

interface ShareStartWifiResult {
  url: string
  port: number
  pin: string
  fileCount: number
  timeoutMs: number
}
interface ShareCopyFilesResult {
  success: boolean
  count: number
  skipped: number
  message?: string
}
interface ShareDetectAppResult {
  installed: boolean
  running: boolean
  installPath: string | null
}

interface MediaListResult {
  items: Array<Record<string, unknown>>
  total: number
  page: number
  pageSize: number
}
interface DuplicateGroup {
  hash: string
  files: Array<Record<string, unknown>>
}
interface SimilarGroup {
  phash: string
  files: Array<Record<string, unknown>>
}
interface GroupCountsResult {
  groups: Array<{ key: string; count: number; label?: string }>
}
interface OutfitStat {
  outfit: string
  count: number
  firstCreatedAt: string
  lastCreatedAt: string
}
interface OutfitStatsResult {
  stats: OutfitStat[]
}
interface ProfileRow {
  uid: string
  nickname: string
  avatar?: string
  is_default: number
  created_at: string
}
interface ProfileStats {
  totalFiles: number
  totalSize: number
  albums: Array<{ album_type: string; count: number }>
}

interface UiThemeGetResult {
  theme: 'default' | 'soft-pink-luxury'
}

interface OperationHistoryRecord {
  id: number
  operationType: string
  mediaId: number | null
  payload: string
  description: string
  createdAt: string
}
interface OperationHistoryListResult {
  records: OperationHistoryRecord[]
}

interface ImportPreviewResult {
  files: Array<{ path: string; size: number; mtime: string }>
}
interface ImportRunResult {
  imported: Array<{ source: string; target: string }>
  failed: Array<{ source: string; message: string }>
  skipped: Array<{ source: string; reason: string }>
}

interface DecodeFileResult {
  error?: string
  [key: string]: unknown
}
interface DecodeFileResponse {
  ok: boolean
  data: DecodeFileResult
  message?: string
}
interface EncodeCameraParamsResponse {
  ok: boolean
  data?: string
  message?: string
}
interface DecodeClothDiyResponse {
  ok: boolean
  data: {
    timestamp?: number
    uidBytes?: string
    networkData?: unknown
  }
  message?: string
}
interface DecodeHomeBuildResponse {
  ok: boolean
  data: {
    server?: string
    networkData?: unknown
  }
  message?: string
}

// ============ 暴露给渲染进程的 API ============
// 所有方法返回 Promise<T>（T 为业务数据类型），失败时抛出 IpcError
// 渲染层用法：
//   try {
//     const result = await electronAPI.file.delete(paths)
//     // result 即业务数据
//   } catch (err) {
//     if (err instanceof window.IpcError) {
//       console.error(err.code, err.message)
//     }
//   }

const electronAPI = {
  // 扫描器
  scanner: {
    start: (options?: {
      path?: string
      incremental?: boolean
      customKnownPaths?: string[]
      fullScan?: boolean
    }) => call<ScannerStartResult>('scanner:start', options),
    stop: () => call<unknown>('scanner:stop'),
    status: () => call<ScannerStatus>('scanner:status'),
    onProgress: (callback: (progress: ScannerProgress) => void) => {
      const handler = (_: unknown, progress: ScannerProgress) => callback(progress)
      ipcRenderer.on('scanner:progress', handler)
      return () => {
        ipcRenderer.removeListener('scanner:progress', handler)
      }
    },
    onComplete: (callback: (result: ScannerComplete) => void) => {
      const handler = (_: unknown, result: ScannerComplete) => callback(result)
      ipcRenderer.on('scanner:complete', handler)
      return () => {
        ipcRenderer.removeListener('scanner:complete', handler)
      }
    }
  },

  // 文件操作
  file: {
    delete: (filePaths: string[]) => call<FileOpResult>('file:delete', filePaths),
    deletePermanent: (filePaths: string[]) =>
      call<FileOpResult>('file:deletePermanent', filePaths),
    copy: (sourcePaths: string[], targetDir: string) =>
      call<FileOpResult>('file:copy', sourcePaths, targetDir),
    move: (sourcePaths: string[], targetDir: string) =>
      call<FileOpResult>('file:move', sourcePaths, targetDir),
    rename: (oldPath: string, newName: string) =>
      call<FileOpResult>('file:rename', oldPath, newName),
    // T12：批量重命名，返回每条操作的详细结果
    batchRename: (operations: { oldPath: string; newName: string }[]) =>
      call<FileOpResult>('file:batchRename', operations),
    export: (filePaths: string[], targetDir: string, options?: ExportOptions) =>
      call<FileOpResult>('file:export', filePaths, targetDir, options),
    saveAs: (filePath: string, targetDir: string, newName?: string) =>
      call<FileOpResult>('file:saveAs', filePath, targetDir, newName),
    getExif: (filePath: string) =>
      call<Record<string, unknown>>('file:getExif', filePath)
  },

  // 编辑器
  editor: {
    save: (
      filePath: string,
      dataUrl: string,
      options?: { format?: string; quality?: number; params?: string }
    ) => call<EditorSaveResult>('editor:save', filePath, dataUrl, options),
    saveAs: (
      dataUrl: string,
      options?: { directory?: string; fileName?: string; format?: string; quality?: number }
    ) => call<EditorSaveAsResult>('editor:saveAs', dataUrl, options),
    exportPreset: (preset: unknown) =>
      call<{ id: number }>('editor:exportPreset', preset),
    loadPresets: () => call<EditorLoadPresetsResult>('editor:loadPresets'),
    deletePreset: (id: string | number) =>
      call<{ deleted: boolean }>('editor:deletePreset', id),
    exportPresetToFile: (preset: { name: string; category: string; params: unknown }) =>
      call<{ filePath: string }>('editor:exportPresetToFile', preset),
    importPresetFromFile: () =>
      call<{ preset: FilterPreset; filePath: string }>('editor:importPresetFromFile')
  },

  // 水印
  watermark: {
    apply: (config: unknown, filePaths: string[], targetDir: string) =>
      call<WatermarkApplyResult>('watermark:apply', config, filePaths, targetDir),
    saveTemplate: (name: string, config: unknown) =>
      call<{ id: number }>('watermark:saveTemplate', name, config),
    loadTemplates: () => call<WatermarkTemplateRow[]>('watermark:loadTemplates'),
    deleteTemplate: (id: number) =>
      call<{ deleted: boolean }>('watermark:deleteTemplate', id),
    onProgress: (callback: (progress: { current: number; total: number }) => void) => {
      const handler = (_: unknown, progress: { current: number; total: number }) =>
        callback(progress)
      ipcRenderer.on('watermark:progress', handler)
      return () => {
        ipcRenderer.removeListener('watermark:progress', handler)
      }
    }
  },

  // 分类
  category: {
    create: (name: string, options?: { icon?: string; color?: string; parentId?: number }) =>
      call<{ id: number }>('category:create', name, options),
    update: (
      id: number,
      updates: { name?: string; icon?: string; color?: string; parent_id?: number | null }
    ) => call<{ updated: boolean }>('category:update', id, updates),
    delete: (id: number) => call<{ deleted: boolean }>('category:delete', id),
    reorder: (orders: Array<{ id: number; sort_order: number; parent_id?: number }>) =>
      call<{ reordered: boolean }>('category:reorder', orders),
    list: () => call<unknown[]>('category:list')
  },

  // P0-B：删除 tag 命名空间（tag:list/add/remove IPC 已移除）

  // 媒体操作
  mediaAction: {
    updateRating: (mediaId: number, rating: number) =>
      call<{ updated: boolean }>('media:updateRating', mediaId, rating),
    // P0-D：删除 toggleFavorite（已有 updateFavorite 满足需求）
    updateFavorite: (mediaId: number, isFavorite: boolean) =>
      call<{ updated: boolean }>('media:updateFavorite', mediaId, isFavorite),
    updateTags: (mediaId: number, tags: string[]) =>
      call<{ updated: boolean }>('media:updateTags', mediaId, tags),
    updateNotes: (mediaId: number, notes: string) =>
      call<{ updated: boolean }>('media:updateNotes', mediaId, notes),
    updateCategory: (mediaId: number, categoryId: number | null) =>
      call<{ updated: boolean }>('media:updateCategory', mediaId, categoryId),
    // F-O1：更新套装标注
    updateOutfit: (mediaId: number, outfit: string) =>
      call<{ updated: boolean }>('media:updateOutfit', mediaId, outfit),
    // F-O1：批量分析场景时段
    analyzeSceneTime: (mediaIds?: number[]) =>
      call<{ message: string; analyzed: number }>('media:analyzeSceneTime', mediaIds),
    // 物理删除数据库记录（配合文件永久删除场景，与 softDelete 语义不同，不合并）
    delete: (mediaId: number) =>
      call<{ deleted: boolean }>('media:delete', mediaId),
    // F-S6 回收站：软删除/恢复/彻底删除/清空
    softDelete: (mediaIds: number[]) =>
      call<{ message: string }>('media:softDelete', mediaIds),
    restore: (mediaIds: number[]) =>
      call<{ message: string }>('media:restore', mediaIds),
    permanentDelete: (mediaIds: number[]) =>
      call<{ message: string }>('media:permanentDelete', mediaIds),
    emptyRecycleBin: () => call<{ message: string }>('media:emptyRecycleBin'),
    // T02：丢失记录清理（批量 / 单条）
    cleanupMissing: () => call<{ cleaned: number }>('media:cleanupMissing'),
    removeMissing: (mediaId: number) =>
      call<{ removed: boolean }>('media:removeMissing', mediaId),
    // T03：套装图鉴统计
    getOutfitStats: () => call<OutfitStatsResult>('media:getOutfitStats')
  },

  // 视频
  video: {
    thumbnail: (filePath: string) =>
      call<VideoThumbnailResult>('video:thumbnail', filePath),
    metadata: (filePath: string) => call<VideoMetadata>('video:metadata', filePath),
    export: (filePath: string, targetDir: string, format: string) =>
      call<FileOpResult>('video:export', filePath, targetDir, format),
    captureFrame: (filePath: string, currentTime: number, targetDir?: string) =>
      call<{ filePath?: string; message?: string }>(
        'video:captureFrame',
        filePath,
        currentTime,
        targetDir
      ),
    // F-S9：视频裁剪（保留 [startTime, endTime] 区间，单位秒）
    trim: (filePath: string, startTime: number, endTime: number, targetDir: string) =>
      call<{ output: string; duration: number; message?: string }>(
        'video:trim',
        filePath,
        startTime,
        endTime,
        targetDir
      ),
    // F-S9：视频调速（speed 范围 0.25-4.0）
    changeSpeed: (filePath: string, speed: number, targetDir: string) =>
      call<{ output: string; message?: string }>(
        'video:changeSpeed',
        filePath,
        speed,
        targetDir
      ),
    // P1-05：导出 Apple Live Photo（JPG + MOV 配对文件）
    exportLivePhoto: (filePath: string, targetDir: string) =>
      call<{ jpgPath: string; movPath: string; message?: string }>(
        'video:exportLivePhoto',
        filePath,
        targetDir
      )
  },

  // 对话框
  dialog: {
    // dialog:* 系列在用户取消时返回 null（由主进程 handler 决定），不抛错
    selectDirectory: () => call<string | null>('dialog:selectDirectory'),
    openFile: (options?: {
      properties?: (
        | 'openFile'
        | 'openDirectory'
        | 'multiSelections'
        | 'showHiddenFiles'
        | 'createDirectory'
        | 'promptToCreate'
        | 'noResolveAliases'
        | 'treatPackageAsDirectory'
        | 'dontAddToRecent'
      )[]
      filters?: { name: string; extensions: string[] }[]
    }) => call<string | null>('dialog:openFile', options),
    saveFile: (options?: {
      defaultPath?: string
      filters?: { name: string; extensions: string[] }[]
    }) => call<string | null>('dialog:saveFile', options),
    showMessageBox: (options: {
      type?: 'none' | 'info' | 'error' | 'question' | 'warning'
      title?: string
      message: string
      buttons?: string[]
    }) => call<number>('dialog:showMessageBox', options)
  },

  // 缩略图
  thumbnail: {
    // P1-03：quality='low' 返回 64px 低质量缩略图，'standard' 或 undefined 返回标准 320px
    // 高清档位：quality='high' 返回 512px 高清缩略图（高分屏 DPR ≥ 2 时使用）
    generate: (filePath: string, quality?: 'low' | 'standard' | 'high') =>
      call<string | null>('thumbnail:generate', filePath, quality)
  },

  // 媒体列表更新通知
  media: {
    list: (options?: {
      page?: number
      pageSize?: number
      includeDeleted?: boolean
      deletedOnly?: boolean
      sortBy?: string
      sortOrder?: string
      accountUid?: string
      albumType?: string
      hideDuplicates?: boolean
    }) => call<MediaListResult>('media:list', options),
    // F-S10：重复文件检测——返回完整 sha256 hash 重复的分组
    findDuplicates: () => call<DuplicateGroup[]>('media:findDuplicates'),
    // T05：基于 pHash 的相似图检测——返回汉明距离≤threshold 的图片分组
    findSimilar: (options?: { threshold?: number }) =>
      call<SimilarGroup[]>('media:findSimilar', options),
    // T05：手动触发 phash 补算（用于已入库但 phash 为 NULL 的图片）
    generatePhash: () => call<{ processed: number }>('media:generatePhash'),
    // P0-03：智能媒体分组——按维度统计分组数量
    getGroupCounts: (
      dimension: string,
      accountUid?: string,
      mediaSource?: 'game' | 'launcher' | 'cloud' | 'all'
    ) => call<GroupCountsResult>('media:getGroupCounts', dimension, accountUid, mediaSource),
    // P1-01：手动触发重复标记（基于 pHash 极严格阈值 + 评分推荐保留）
    markDuplicates: () => call<{ marked: number }>('media:markDuplicates'),
    // P1-01：查询已标记的重复分组（is_duplicate=1 按 original_id 聚合）
    listDuplicateGroups: () => call<unknown[]>('duplicate:listGroups'),
    onUpdated: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('media:updated', handler)
      return () => {
        ipcRenderer.removeListener('media:updated', handler)
      }
    }
  },

  // P0-02：角色档案管理
  profile: {
    list: () => call<ProfileRow[]>('profile:list'),
    add: (uid: string, nickname: string, avatar?: string) =>
      call<{ added: boolean }>('profile:add', uid, nickname, avatar),
    update: (uid: string, nickname?: string, avatar?: string) =>
      call<{ updated: boolean }>('profile:update', uid, nickname, avatar),
    delete: (uid: string) => call<{ deleted: boolean }>('profile:delete', uid),
    setCurrent: (uid: string) => call<{ set: boolean }>('profile:setCurrent', uid),
    getStats: (uid: string) => call<ProfileStats>('profile:getStats', uid),
    // P1-04：跨档案转移——批量更新 media_files.account_uid
    transferFiles: (mediaIds: number[], targetUid: string) =>
      call<{ transferred: number }>('profile:transferFiles', mediaIds, targetUid)
  },

  // 界面主题（统一主题接口）
  uiTheme: {
    get: () => call<UiThemeGetResult>('ui-theme:get'),
    set: (theme: 'default' | 'soft-pink-luxury') =>
      call<{ applied: boolean }>('ui-theme:set', theme)
  },

  // 系统
  shell: {
    openExternal: (url: string) => call<{ opened: boolean }>('shell:openExternal', url),
    openPath: (dirPath: string) => call<{ opened: boolean }>('shell:openPath', dirPath),
    // 在资源管理器中打开文件所在位置并选中该文件
    showItemInFolder: (filePath: string) =>
      call<{ opened: boolean }>('shell:showItemInFolder', filePath)
  },

  // 应用设置
  settings: {
    get: (key: string, defaultValue?: unknown) =>
      call<unknown>('settings:get', key, defaultValue),
    set: (key: string, value: unknown) =>
      call<{ saved: boolean }>('settings:set', key, value)
  },

  // 数据管理
  data: {
    clear: () => call<{ message: string }>('data:clear')
  },

  // T01：数据库备份管理
  backup: {
    // P1-04：支持按档案备份（文件名加入 _{uid} 后缀以便识别）
    create: (options?: { accountUid?: string }) =>
      call<{ success: boolean; filePath?: string; message?: string }>('backup:create', options),
    list: () => call<BackupListResult>('backup:list'),
    restore: (filename: string) =>
      call<{ success: boolean; message?: string }>('backup:restore', filename),
    delete: (filename: string) =>
      call<{ success: boolean; message?: string }>('backup:delete', filename),
    // 自定义目录支持
    setDir: (dir: string) => call<DirOpResult>('backup:setDir', dir),
    resetDir: () => call<DirOpResult>('backup:resetDir'),
    getDir: () => call<string>('backup:getDir')
  },

  // T08：WiFi 局域网分享 + T09 剪贴板分享
  share: {
    startWifi: (filePaths: string[]) =>
      call<ShareStartWifiResult>('share:startWifi', filePaths),
    stopWifi: () => call<{ stopped: boolean }>('share:stopWifi'),
    // P0-D：删除 wifiStatus（已有 startWifi/stopWifi 满足需求）
    // T09：复制文件到剪贴板（CF_HDROP 格式）
    copyFiles: (filePaths: string[]) =>
      call<ShareCopyFilesResult>('share:copyFiles', filePaths),
    // T09：检测渠道应用状态（installed + running + installPath）
    detectApp: (channelId: string) =>
      call<ShareDetectAppResult>('share:detectApp', channelId),
    // T09：启动目标应用（已安装未运行时调用）
    launchApp: (channelId: string) => call<unknown>('share:launchApp', channelId)
  },

  // T10：缩略图缓存管理
  cache: {
    getStats: () => call<CacheStats>('cache:getStats'),
    clean: () => call<CacheCleanResult>('cache:clean'),
    setLimit: (limitBytes: number) =>
      call<CacheSetLimitResult>('cache:setLimit', limitBytes),
    enforceLimit: () => call<CacheEnforceResult>('cache:enforceLimit'),
    // 自定义目录支持
    setDir: (dir: string) => call<DirOpResult>('cache:setDir', dir),
    resetDir: () => call<DirOpResult>('cache:resetDir'),
    getDir: () => call<string>('cache:getDir')
  },

  // 日志管理
  log: {
    // 获取所有故障列表（按时间倒序）
    listFaults: () => call<LogFaultListResult>('log:listFaults'),
    // 获取单个故障详情
    getFaultDetail: (id: string) =>
      call<LogFaultDetailResult>('log:getFaultDetail', id),
    // 打开日志目录
    openDirectory: () => call<{ opened: boolean }>('log:openDirectory'),
    // 获取日志目录路径
    getDirectoryPath: () => call<LogDirectoryPathResult>('log:getDirectoryPath'),
    // 获取日志统计信息
    getStats: () => call<LogStats>('log:getStats'),
    // 导出全部日志为 zip（主进程会弹出保存对话框）
    exportZip: () => call<LogExportZipResult>('log:exportZip'),
    // 清空所有日志
    clear: () => call<LogClearResult>('log:clear'),
    // 自定义目录支持
    setDir: (dir: string) => call<DirOpResult>('log:setDir', dir),
    resetDir: () => call<DirOpResult>('log:resetDir'),
    getDir: () => call<string>('log:getDir'),
    // P0-2：渲染进程错误上报到主进程 faults 日志
    reportRendererError: (payload: {
      message: string
      stack?: string
      componentStack?: string
      filename?: string
      lineno?: number
      colno?: number
      source: 'ErrorBoundary' | 'window.onerror' | 'unhandledrejection'
    }) => call<{ reported: boolean }>('log:reportRendererError', payload)
  },

  // T13：崩溃报告管理（crashReporter dump 文件）
  crash: {
    list: () => call<CrashListResult>('crash:list'),
    getStats: () => call<CrashStats>('crash:getStats'),
    openDirectory: () => call<{ opened: boolean }>('crash:openDirectory'),
    clear: () => call<CrashClearResult>('crash:clear'),
    // 自定义目录支持
    setDir: (dir: string) => call<DirOpResult>('crash:setDir', dir),
    resetDir: () => call<DirOpResult>('crash:resetDir'),
    getDir: () => call<string>('crash:getDir')
  },

  // 应用控制（重启等）
  app: {
    relaunch: () => call<{ relaunching: boolean }>('app:relaunch'),
    // U1：获取应用版本号，避免渲染层硬编码
    getVersion: () => call<string>('app:getVersion')
  },

  // T14：文件导入向导
  import: {
    preview: (sourceDir: string) =>
      call<ImportPreviewResult>('import:preview', sourceDir),
    run: (
      sourcePaths: string[],
      targetBaseDir: string,
      options: {
        namingRule: 'keep' | 'date' | 'seq'
        categorize: 'flat' | 'byDate' | 'byMonth'
        conflictStrategy: 'skip' | 'rename' | 'overwrite'
        seqStart?: number
      }
    ) => call<ImportRunResult>('import:run', sourcePaths, targetBaseDir, options),
    onProgress: (callback: (progress: { current: number; total: number }) => void) => {
      const handler = (_: unknown, progress: { current: number; total: number }) =>
        callback(progress)
      ipcRenderer.on('import:progress', handler)
      return () => {
        ipcRenderer.removeListener('import:progress', handler)
      }
    }
  },

  // 建议改#9：操作历史持久化（支持跨重启撤销）
  operationHistory: {
    add: (record: {
      operationType: string
      mediaId?: number
      payload: unknown
      description: string
      createdAt: string
    }) => call<{ id: number }>('operation-history:add', record),
    list: (limit: number = 50) =>
      call<OperationHistoryListResult>('operation-history:list', limit),
    remove: (id: number) =>
      call<{ removed: boolean }>('operation-history:remove', id),
    clear: () => call<{ cleared: boolean }>('operation-history:clear')
  },

  // 游戏参数解密
  decrypt: {
    decodeFile: (filePath: string, albumType: string, uid?: string) =>
      call<DecodeFileResponse>('decrypt:decodeFile', filePath, albumType, uid),
    // Group 2: 相机参数加密
    encodeCameraParams: (jsonText: string) =>
      call<EncodeCameraParamsResponse>('decrypt:encodeCameraParams', jsonText),
    // Group 3: 染色分享码解码
    decodeClothDiy: (codeStr: string) =>
      call<DecodeClothDiyResponse>('decrypt:decodeClothDiy', codeStr),
    // Group 4: 家园建造分享码解码
    decodeHomeBuild: (codeStr: string) =>
      call<DecodeHomeBuildResponse>('decrypt:decodeHomeBuild', codeStr)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
// 暴露 IpcError 类供渲染层做 instanceof 判断
contextBridge.exposeInMainWorld('IpcError', IpcError)

// 类型声明
declare global {
  interface Window {
    electronAPI: typeof electronAPI
    IpcError: typeof IpcError
  }
}
