import { contextBridge, ipcRenderer } from 'electron'
import type { ExportOptions } from './types/file'
// 暴露给渲染进程的 API
const electronAPI = {
  // 扫描器
  scanner: {
    start: (options?: { path?: string; incremental?: boolean; customKnownPaths?: string[]; fullScan?: boolean }) => ipcRenderer.invoke('scanner:start', options),
    stop: () => ipcRenderer.invoke('scanner:stop'),
    status: () => ipcRenderer.invoke('scanner:status'),
    onProgress: (callback: (progress: { scanned: number; found: number; currentPath: string }) => void) => {
      const handler = (_: unknown, progress: { scanned: number; found: number; currentPath: string }) => callback(progress)
      ipcRenderer.on('scanner:progress', handler)
      return () => {
        ipcRenderer.removeListener('scanner:progress', handler)
      }
    },
    onComplete: (callback: (result: { success: boolean; message: string; filesFound?: number }) => void) => {
      const handler = (_: unknown, result: { success: boolean; message: string; filesFound?: number }) => callback(result)
      ipcRenderer.on('scanner:complete', handler)
      return () => {
        ipcRenderer.removeListener('scanner:complete', handler)
      }
    }
  },

  // 文件操作
  file: {
    delete: (filePaths: string[]) => ipcRenderer.invoke('file:delete', filePaths),
    deletePermanent: (filePaths: string[]) => ipcRenderer.invoke('file:deletePermanent', filePaths),
    copy: (sourcePaths: string[], targetDir: string) => ipcRenderer.invoke('file:copy', sourcePaths, targetDir),
    move: (sourcePaths: string[], targetDir: string) => ipcRenderer.invoke('file:move', sourcePaths, targetDir),
    rename: (oldPath: string, newName: string) => ipcRenderer.invoke('file:rename', oldPath, newName),
    // T12：批量重命名，返回每条操作的详细结果
    batchRename: (operations: { oldPath: string; newName: string }[]) =>
      ipcRenderer.invoke('file:batchRename', operations),
    export: (filePaths: string[], targetDir: string, options?: ExportOptions) =>
      ipcRenderer.invoke('file:export', filePaths, targetDir, options),
    saveAs: (filePath: string, targetDir: string, newName?: string) =>
      ipcRenderer.invoke('file:saveAs', filePath, targetDir, newName),
    getExif: (filePath: string) => ipcRenderer.invoke('file:getExif', filePath)
  },

  // 编辑器
  editor: {
    save: (filePath: string, dataUrl: string, options?: { format?: string; quality?: number; params?: string }) =>
      ipcRenderer.invoke('editor:save', filePath, dataUrl, options),
    saveAs: (dataUrl: string, options?: { directory?: string; fileName?: string; format?: string; quality?: number }) =>
      ipcRenderer.invoke('editor:saveAs', dataUrl, options),
    exportPreset: (preset: unknown) => ipcRenderer.invoke('editor:exportPreset', preset),
    loadPresets: () => ipcRenderer.invoke('editor:loadPresets'),
    deletePreset: (id: string | number) => ipcRenderer.invoke('editor:deletePreset', id),
    exportPresetToFile: (preset: { name: string; category: string; params: unknown }) =>
      ipcRenderer.invoke('editor:exportPresetToFile', preset),
    importPresetFromFile: () => ipcRenderer.invoke('editor:importPresetFromFile')
  },

  // 水印
  watermark: {
    apply: (config: unknown, filePaths: string[], targetDir: string) =>
      ipcRenderer.invoke('watermark:apply', config, filePaths, targetDir),
    saveTemplate: (name: string, config: unknown) => ipcRenderer.invoke('watermark:saveTemplate', name, config),
    loadTemplates: () => ipcRenderer.invoke('watermark:loadTemplates'),
    deleteTemplate: (id: number) => ipcRenderer.invoke('watermark:deleteTemplate', id),
    onProgress: (callback: (progress: { current: number; total: number }) => void) => {
      const handler = (_: unknown, progress: { current: number; total: number }) => callback(progress)
      ipcRenderer.on('watermark:progress', handler)
      return () => {
        ipcRenderer.removeListener('watermark:progress', handler)
      }
    }
  },

  // 分类
  category: {
    create: (name: string, options?: { icon?: string; color?: string; parentId?: number }) =>
      ipcRenderer.invoke('category:create', name, options),
    update: (id: number, updates: { name?: string; icon?: string; color?: string; parent_id?: number | null }) => ipcRenderer.invoke('category:update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('category:delete', id),
    reorder: (orders: Array<{ id: number; sort_order: number; parent_id?: number }>) =>
      ipcRenderer.invoke('category:reorder', orders),
    list: () => ipcRenderer.invoke('category:list')
  },

  // P0-B：删除 tag 命名空间（tag:list/add/remove IPC 已移除）

  // 媒体操作
  mediaAction: {
    updateRating: (mediaId: number, rating: number) => ipcRenderer.invoke('media:updateRating', mediaId, rating),
    // P0-D：删除 toggleFavorite（已有 updateFavorite 满足需求）
    updateFavorite: (mediaId: number, isFavorite: boolean) => ipcRenderer.invoke('media:updateFavorite', mediaId, isFavorite),
    updateTags: (mediaId: number, tags: string[]) => ipcRenderer.invoke('media:updateTags', mediaId, tags),
    updateNotes: (mediaId: number, notes: string) => ipcRenderer.invoke('media:updateNotes', mediaId, notes),
    updateCategory: (mediaId: number, categoryId: number | null) => ipcRenderer.invoke('media:updateCategory', mediaId, categoryId),
    // F-O1：更新套装标注
    updateOutfit: (mediaId: number, outfit: string) => ipcRenderer.invoke('media:updateOutfit', mediaId, outfit),
    // F-O1：批量分析场景时段
    analyzeSceneTime: (mediaIds?: number[]) => ipcRenderer.invoke('media:analyzeSceneTime', mediaIds),
    // 物理删除数据库记录（配合文件永久删除场景，与 softDelete 语义不同，不合并）
    delete: (mediaId: number) => ipcRenderer.invoke('media:delete', mediaId),
    // F-S6 回收站：软删除/恢复/彻底删除/清空
    softDelete: (mediaIds: number[]) => ipcRenderer.invoke('media:softDelete', mediaIds),
    restore: (mediaIds: number[]) => ipcRenderer.invoke('media:restore', mediaIds),
    permanentDelete: (mediaIds: number[]) => ipcRenderer.invoke('media:permanentDelete', mediaIds),
    emptyRecycleBin: () => ipcRenderer.invoke('media:emptyRecycleBin'),
    // T02：丢失记录清理（批量 / 单条）
    cleanupMissing: () => ipcRenderer.invoke('media:cleanupMissing'),
    removeMissing: (mediaId: number) => ipcRenderer.invoke('media:removeMissing', mediaId),
    // T03：套装图鉴统计
    getOutfitStats: () => ipcRenderer.invoke('media:getOutfitStats')
  },

  // 视频
  video: {
    thumbnail: (filePath: string) => ipcRenderer.invoke('video:thumbnail', filePath),
    metadata: (filePath: string) => ipcRenderer.invoke('video:metadata', filePath),
    export: (filePath: string, targetDir: string, format: string) =>
      ipcRenderer.invoke('video:export', filePath, targetDir, format),
    captureFrame: (filePath: string, currentTime: number, targetDir?: string) =>
      ipcRenderer.invoke('video:captureFrame', filePath, currentTime, targetDir),
    // F-S9：视频裁剪（保留 [startTime, endTime] 区间，单位秒）
    trim: (filePath: string, startTime: number, endTime: number, targetDir: string) =>
      ipcRenderer.invoke('video:trim', filePath, startTime, endTime, targetDir),
    // F-S9：视频调速（speed 范围 0.25-4.0）
    changeSpeed: (filePath: string, speed: number, targetDir: string) =>
      ipcRenderer.invoke('video:changeSpeed', filePath, speed, targetDir),
    // P1-05：导出 Apple Live Photo（JPG + MOV 配对文件）
    exportLivePhoto: (filePath: string, targetDir: string) =>
      ipcRenderer.invoke('video:exportLivePhoto', filePath, targetDir)
  },

  // 对话框
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
    openFile: (options?: { properties?: ('openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory' | 'promptToCreate' | 'noResolveAliases' | 'treatPackageAsDirectory' | 'dontAddToRecent')[]; filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('dialog:openFile', options),
    saveFile: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('dialog:saveFile', options),
    showMessageBox: (options: { type?: 'none' | 'info' | 'error' | 'question' | 'warning'; title?: string; message: string; buttons?: string[] }) =>
      ipcRenderer.invoke('dialog:showMessageBox', options)
  },

  // 缩略图
  thumbnail: {
    // P1-03：quality='low' 返回 64px 低质量缩略图，'standard' 或 undefined 返回标准 320px
    generate: (filePath: string, quality?: 'low' | 'standard') => ipcRenderer.invoke('thumbnail:generate', filePath, quality)
  },

  // 媒体列表更新通知
  media: {
    list: (options?: { page?: number; pageSize?: number; includeDeleted?: boolean; deletedOnly?: boolean; sortBy?: string; sortOrder?: string; accountUid?: string; albumType?: string; hideDuplicates?: boolean }) => ipcRenderer.invoke('media:list', options),
    // F-S10：重复文件检测——返回完整 sha256 hash 重复的分组
    findDuplicates: () => ipcRenderer.invoke('media:findDuplicates'),
    // T05：基于 pHash 的相似图检测——返回汉明距离≤threshold 的图片分组
    findSimilar: (options?: { threshold?: number }) => ipcRenderer.invoke('media:findSimilar', options),
    // T05：手动触发 phash 补算（用于已入库但 phash 为 NULL 的图片）
    generatePhash: () => ipcRenderer.invoke('media:generatePhash'),
    // P0-03：智能媒体分组——按维度统计分组数量
    getGroupCounts: (dimension: string, accountUid?: string, mediaSource?: 'game' | 'launcher' | 'cloud' | 'all') => ipcRenderer.invoke('media:getGroupCounts', dimension, accountUid, mediaSource),
    // P1-01：手动触发重复标记（基于 pHash 极严格阈值 + 评分推荐保留）
    markDuplicates: () => ipcRenderer.invoke('media:markDuplicates'),
    // P1-01：查询已标记的重复分组（is_duplicate=1 按 original_id 聚合）
    listDuplicateGroups: () => ipcRenderer.invoke('duplicate:listGroups'),
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
    list: () => ipcRenderer.invoke('profile:list'),
    add: (uid: string, nickname: string, avatar?: string) => ipcRenderer.invoke('profile:add', uid, nickname, avatar),
    update: (uid: string, nickname?: string, avatar?: string) => ipcRenderer.invoke('profile:update', uid, nickname, avatar),
    delete: (uid: string) => ipcRenderer.invoke('profile:delete', uid),
    setCurrent: (uid: string) => ipcRenderer.invoke('profile:setCurrent', uid),
    getStats: (uid: string) => ipcRenderer.invoke('profile:getStats', uid),
    // P1-04：跨档案转移——批量更新 media_files.account_uid
    transferFiles: (mediaIds: number[], targetUid: string) => ipcRenderer.invoke('profile:transferFiles', mediaIds, targetUid)
  },

  // 界面主题（统一主题接口）
  uiTheme: {
    get: () => ipcRenderer.invoke('ui-theme:get'),
    set: (theme: 'default' | 'soft-pink-luxury') => ipcRenderer.invoke('ui-theme:set', theme)
  },

  // 系统
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    openPath: (dirPath: string) => ipcRenderer.invoke('shell:openPath', dirPath),
    // 在资源管理器中打开文件所在位置并选中该文件
    showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath)
  },

  // 应用设置
  settings: {
    get: (key: string, defaultValue?: unknown) => ipcRenderer.invoke('settings:get', key, defaultValue),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value)
  },

  // 数据管理
  data: {
    clear: () => ipcRenderer.invoke('data:clear')
  },

  // T01：数据库备份管理
  backup: {
    // P1-04：支持按档案备份（文件名加入 _{uid} 后缀以便识别）
    create: (options?: { accountUid?: string }) => ipcRenderer.invoke('backup:create', options),
    list: () => ipcRenderer.invoke('backup:list'),
    restore: (filename: string) => ipcRenderer.invoke('backup:restore', filename),
    delete: (filename: string) => ipcRenderer.invoke('backup:delete', filename),
    // 自定义目录支持
    setDir: (dir: string) => ipcRenderer.invoke('backup:setDir', dir),
    resetDir: () => ipcRenderer.invoke('backup:resetDir'),
    getDir: () => ipcRenderer.invoke('backup:getDir')
  },

  // T08：WiFi 局域网分享 + T09 剪贴板分享
  share: {
    startWifi: (filePaths: string[]) => ipcRenderer.invoke('share:startWifi', filePaths),
    stopWifi: () => ipcRenderer.invoke('share:stopWifi'),
    // P0-D：删除 wifiStatus（已有 startWifi/stopWifi 满足需求）
    // T09：复制文件到剪贴板（CF_HDROP 格式）
    copyFiles: (filePaths: string[]) => ipcRenderer.invoke('share:copyFiles', filePaths),
    // T09：检测渠道应用状态（installed + running + installPath）
    detectApp: (channelId: string) => ipcRenderer.invoke('share:detectApp', channelId),
    // T09：启动目标应用（已安装未运行时调用）
    launchApp: (channelId: string) => ipcRenderer.invoke('share:launchApp', channelId)
  },

  // T10：缩略图缓存管理
  cache: {
    getStats: () => ipcRenderer.invoke('cache:getStats'),
    clean: () => ipcRenderer.invoke('cache:clean'),
    setLimit: (limitBytes: number) => ipcRenderer.invoke('cache:setLimit', limitBytes),
    enforceLimit: () => ipcRenderer.invoke('cache:enforceLimit'),
    // 自定义目录支持
    setDir: (dir: string) => ipcRenderer.invoke('cache:setDir', dir),
    resetDir: () => ipcRenderer.invoke('cache:resetDir'),
    getDir: () => ipcRenderer.invoke('cache:getDir')
  },

  // 日志管理
  log: {
    // 获取所有故障列表（按时间倒序）
    listFaults: () => ipcRenderer.invoke('log:listFaults'),
    // 获取单个故障详情
    getFaultDetail: (id: string) => ipcRenderer.invoke('log:getFaultDetail', id),
    // 打开日志目录
    openDirectory: () => ipcRenderer.invoke('log:openDirectory'),
    // 获取日志目录路径
    getDirectoryPath: () => ipcRenderer.invoke('log:getDirectoryPath'),
    // 获取日志统计信息
    getStats: () => ipcRenderer.invoke('log:getStats'),
    // 导出全部日志为 zip（主进程会弹出保存对话框）
    exportZip: () => ipcRenderer.invoke('log:exportZip'),
    // 清空所有日志
    clear: () => ipcRenderer.invoke('log:clear'),
    // 自定义目录支持
    setDir: (dir: string) => ipcRenderer.invoke('log:setDir', dir),
    resetDir: () => ipcRenderer.invoke('log:resetDir'),
    getDir: () => ipcRenderer.invoke('log:getDir'),
    // P0-2：渲染进程错误上报到主进程 faults 日志
    reportRendererError: (payload: {
      message: string
      stack?: string
      componentStack?: string
      filename?: string
      lineno?: number
      colno?: number
      source: 'ErrorBoundary' | 'window.onerror' | 'unhandledrejection'
    }) => ipcRenderer.invoke('log:reportRendererError', payload)
  },

  // T13：崩溃报告管理（crashReporter dump 文件）
  crash: {
    list: () => ipcRenderer.invoke('crash:list'),
    getStats: () => ipcRenderer.invoke('crash:getStats'),
    openDirectory: () => ipcRenderer.invoke('crash:openDirectory'),
    clear: () => ipcRenderer.invoke('crash:clear'),
    // 自定义目录支持
    setDir: (dir: string) => ipcRenderer.invoke('crash:setDir', dir),
    resetDir: () => ipcRenderer.invoke('crash:resetDir'),
    getDir: () => ipcRenderer.invoke('crash:getDir')
  },

  // 应用控制（重启等）
  app: {
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    // U1：获取应用版本号，避免渲染层硬编码
    getVersion: () => ipcRenderer.invoke('app:getVersion')
  },

  // T14：文件导入向导
  import: {
    preview: (sourceDir: string) => ipcRenderer.invoke('import:preview', sourceDir),
    run: (sourcePaths: string[], targetBaseDir: string, options: {
      namingRule: 'keep' | 'date' | 'seq'
      categorize: 'flat' | 'byDate' | 'byMonth'
      conflictStrategy: 'skip' | 'rename' | 'overwrite'
      seqStart?: number
    }) => ipcRenderer.invoke('import:run', sourcePaths, targetBaseDir, options),
    onProgress: (callback: (progress: { current: number; total: number }) => void) => {
      const handler = (_: unknown, progress: { current: number; total: number }) => callback(progress)
      ipcRenderer.on('import:progress', handler)
      return () => {
        ipcRenderer.removeListener('import:progress', handler)
      }
    }
  },

  // 建议改#9：操作历史持久化（支持跨重启撤销）
  operationHistory: {
    add: (record: { operationType: string; mediaId?: number; payload: unknown; description: string; createdAt: string }) =>
      ipcRenderer.invoke('operation-history:add', record),
    list: (limit: number = 50) => ipcRenderer.invoke('operation-history:list', limit),
    remove: (id: number) => ipcRenderer.invoke('operation-history:remove', id),
    clear: () => ipcRenderer.invoke('operation-history:clear')
  },

  // 游戏参数解密
  decrypt: {
    decodeFile: (filePath: string, albumType: string, uid?: string) =>
      ipcRenderer.invoke('decrypt:decodeFile', filePath, albumType, uid),
    // Group 2: 相机参数加密
    encodeCameraParams: (jsonText: string) =>
      ipcRenderer.invoke('decrypt:encodeCameraParams', jsonText),
    // Group 3: 染色分享码解码
    decodeClothDiy: (codeStr: string) =>
      ipcRenderer.invoke('decrypt:decodeClothDiy', codeStr),
    // Group 4: 家园建造分享码解码
    decodeHomeBuild: (codeStr: string) =>
      ipcRenderer.invoke('decrypt:decodeHomeBuild', codeStr),
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// 类型声明
declare global {
  interface Window {
    electronAPI: typeof electronAPI
  }
}
