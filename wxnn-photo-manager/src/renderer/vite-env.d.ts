/// <reference types="vite/client" />

declare module '*.svg' {
  const content: React.FunctionComponent<React.SVGAttributes<SVGElement>>
  export default content
}

declare module '*.png' {
  const content: string
  export default content
}

type ExportFormat = 'jpg' | 'jpeg' | 'png' | 'webp' | 'original'

// P0-F2：与主进程 ExportOptions 接口保持一致（含 useDefaultDir 字段）
interface ExportOptions {
  quality?: number
  format?: ExportFormat
  namingPattern?: string
  useDefaultDir?: boolean
}

// F-S10：重复文件检测返回的单条记录（对应主进程 DuplicateItem 接口）
interface DuplicateItem {
  id: number
  file_path: string
  file_name: string
  file_type: string
  file_size: number
  modified_at: string
  width: number | null
  height: number | null
  is_favorite: boolean
  rating: number
}

// T03：套装图鉴统计（对应主进程 OutfitStat 接口）
interface OutfitStat {
  outfit: string
  count: number
  latestCreatedAt: string
  coverFilePath: string
  coverThumbnail: string | null
}

// 日志管理：故障类型与故障记录（与主进程 logger.ts 保持同步）
// P2-D：补全 FaultType 缺失的 4 个类型（与 settings/shared.tsx 保持一致）
type FaultType =
  | 'uncaughtException'
  | 'unhandledRejection'
  | 'rendererCrash'
  | 'rendererError'
  | 'ipcError'
  | 'manual'
  | 'rendererComponent'
  | 'rendererPromise'
  | 'rendererResource'
  | 'exitDiagnosis'

interface FaultRecord {
  id: string
  timestamp: string
  type: FaultType
  summary: string
  detail: string
  context?: Record<string, unknown>
  file: string
  // P0-1 新增环境信息字段（旧日志可能缺失，UI 兜底显示"未知"）
  appVersion?: string
  electronVersion?: string
  nodeVersion?: string
  platform?: string
  osVersion?: string
  pid?: number
  uptime?: number
}

// T01：数据库备份记录
interface BackupRecord {
  filename: string
  filePath: string
  size: number
  createdAt: string
}

// T13：崩溃 dump 文件元信息（对应主进程 CrashRecord 接口）
// P2-D：新增 crashReason / topFrame 字段（与 settings/shared.tsx 保持一致）
interface CrashRecord {
  filename: string
  filePath: string
  size: number
  mtime: string
  processType: string
  crashReason?: string
  topFrame?: string
}

// T14：导入文件预览信息
interface ImportFilePreview {
  sourcePath: string
  fileName: string
  size: number
  mtime: string
  ext: string
  isVideo: boolean
}

// T14：导入命名规则与分类策略类型
type ImportNamingRule = 'keep' | 'date' | 'seq'
type ImportCategorize = 'flat' | 'byDate' | 'byMonth'
type ImportConflictStrategy = 'skip' | 'rename' | 'overwrite'

// T14：导入选项
interface ImportOptions {
  namingRule: ImportNamingRule
  categorize: ImportCategorize
  conflictStrategy: ImportConflictStrategy
  seqStart?: number
}

interface WindowElectronAPI {
  scanner: {
    start: (options?: {
      path?: string
      incremental?: boolean
      customKnownPaths?: string[]
      fullScan?: boolean
    }) => Promise<{ success: boolean; message?: string; filesFound?: number }>
    stop: () => Promise<{ success: boolean }>
    // 建议改#6：明确 status 返回结构（原 unknown 类型导致调用方无法访问字段）
    status: () => Promise<{
      scanned: number
      found: number
      currentPath: string
      status: 'idle' | 'running' | 'completed' | 'failed'
    }>
    onProgress: (
      callback: (progress: { scanned: number; found: number; currentPath: string }) => void
    ) => () => void
    onComplete: (
      callback: (result: { success: boolean; message: string; filesFound?: number }) => void
    ) => () => void
  }
  decrypt: {
    decodeFile: (
      filePath: string,
      albumType: string,
      uid?: string
    ) => Promise<{
      success: boolean
      data?: {
        hasParams: boolean
        camera?: {
          focalLength: number
          apertureSection: number
          brightness: number
          exposure: number
          contrast: number
          saturation: number
          vibrance: number
          highlights: number
          shadows: number
          vignetteIntensity: number
          bloomIntensity: number
          bloomThreshold: number
          portraitMode: boolean
          filter?: { id: string; strength: number }
          light?: { id: string; strength: number }
          rawParams: string
          // RichCameraParams 新增字段
          zoom: number
          rotation: number
          cameraYaw: number
          cameraPitch: number
          cameraLoc: { x: number; y: number; z: number } | null
          pose: number
          framedMoment: number
          momoHidden: 'enabled' | 'disabled' | null
        }
        photography?: {
          edit: { enabled: boolean; hasSticker: boolean; hasText: boolean }
          date: { day: number } | null
          time: { hour: number; minute: number; second: number } | null
          location: { pos: { x: number; y: number; z: number }; name: string | null } | null
          weather: number | null
          photoWall: number[]
          tasks: Array<{ type: 'puzzle' | 'risk' | 'interactive'; tag: number }>
        }
        nikki?: {
          giantState: boolean
          hidden: boolean
          loc: { x: number; y: number; z: number } | null
          rot: { yaw: number; pitch: number; roll: number } | null
          scale: { x: number; y: number; z: number } | null
        }
        dressing?: {
          clothes: Array<{
            id: number
            clothType: number
            clothTypeName: string | null
            state: number
            species: number
          }>
          eureka: Array<{
            id: number
            level: number
            color: number
            attachmentPoint: number
            outfit: number
          }>
        }
        interactions?: {
          mount: {
            id: number | string
            loc: { x: number; y: number; z: number }
            rot: { yaw: number; pitch: number; roll: number }
            scale: { x: number; y: number; z: number }
          } | null
          carrier: {
            id: number | string
            loc: { x: number; y: number; z: number }
            rot: { yaw: number; pitch: number; roll: number }
            scale: { x: number; y: number; z: number }
          } | null
          interactions: Array<{
            id: number | string
            loc: { x: number; y: number; z: number }
            rot: { yaw: number; pitch: number; roll: number }
            scale: { x: number; y: number; z: number }
          }>
        }
        error?: string
      }
      message?: string
    }>
    // Group 2: 相机参数加密
    encodeCameraParams: (
      jsonText: string
    ) => Promise<{ success: boolean; data?: string; message?: string }>
    // Group 3: 染色分享码解码
    decodeClothDiy: (codeStr: string) => Promise<{
      success: boolean
      data?: { timestamp?: number; uidBytes?: string; networkData?: string }
      message?: string
    }>
    // Group 4: 家园建造分享码解码
    decodeHomeBuild: (codeStr: string) => Promise<{
      success: boolean
      data?: { server?: number; networkData?: string }
      message?: string
    }>
  }
  file: {
    delete: (filePaths: string[]) => Promise<{ success: boolean; message: string }>
    deletePermanent: (filePaths: string[]) => Promise<{ success: boolean; message: string }>
    copy: (
      sourcePaths: string[],
      targetDir: string
    ) => Promise<{ success: boolean; message: string; actualPaths?: string[] }>
    move: (
      sourcePaths: string[],
      targetDir: string
    ) => Promise<{ success: boolean; message: string; actualPaths?: string[] }>
    rename: (oldPath: string, newName: string) => Promise<{ success: boolean; message: string }>
    // T12：批量重命名返回结构
    batchRename: (operations: { oldPath: string; newName: string }[]) => Promise<{
      success: boolean
      message: string
      renamed: { oldPath: string; newPath: string; newFileName: string }[]
      failed: { oldPath: string; message: string }[]
    }>
    export: (
      filePaths: string[],
      targetDir: string,
      options?: ExportOptions
    ) => Promise<{ success: boolean; message: string }>
    saveAs: (
      filePath: string,
      targetDir: string,
      newName?: string
    ) => Promise<{ success: boolean; message: string; newPath?: string }>
    getExif: (filePath: string) => Promise<{
      camera?: string
      lens?: string
      aperture?: string
      shutter?: string
      iso?: number
      focalLength?: string
      gps?: { latitude: number; longitude: number }
      dateTaken?: string
      width?: number
      height?: number
    }>
  }
  editor: {
    save: (
      filePath: string,
      dataUrl: string,
      options?: { format?: string; quality?: number; params?: string }
    ) => Promise<{ success: boolean; message: string; filePath?: string }>
    saveAs: (
      dataUrl: string,
      options?: { directory?: string; fileName?: string; format?: string; quality?: number }
    ) => Promise<{ success: boolean; message: string; filePath?: string }>
    exportPreset: (preset: {
      name: string
      category: string
      params: string
    }) => Promise<{ success: boolean; id?: number; message?: string }>
    loadPresets: () => Promise<{ success: boolean; presets: unknown[]; message?: string }>
    deletePreset: (id: string | number) => Promise<{ success: boolean; message?: string }>
    exportPresetToFile: (preset: {
      name: string
      category: string
      params: unknown
    }) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; message?: string }>
    importPresetFromFile: () => Promise<{
      success: boolean
      preset?: unknown
      canceled?: boolean
      filePath?: string
      message?: string
    }>
  }
  watermark: {
    apply: (
      config: unknown,
      filePaths: string[],
      targetDir: string
    ) => Promise<{ success: boolean; message: string; processed: number }>
    saveTemplate: (
      name: string,
      config: string
    ) => Promise<{ success: boolean; id?: number; message?: string }>
    loadTemplates: () => Promise<unknown[]>
    deleteTemplate: (id: number) => Promise<{ success: boolean; message?: string }>
    onProgress: (callback: (progress: { current: number; total: number }) => void) => () => void
  }
  category: {
    create: (
      name: string,
      options?: { icon?: string; color?: string; parentId?: number }
    ) => Promise<{ success: boolean; id?: number; message?: string }>
    update: (
      id: number,
      updates: { name?: string; icon?: string; color?: string; parent_id?: number | null }
    ) => Promise<{ success: boolean; message?: string }>
    delete: (id: number) => Promise<{ success: boolean; message?: string }>
    reorder: (
      orders: Array<{ id: number; sort_order: number; parent_id?: number }>
    ) => Promise<{ success: boolean; message?: string }>
    list: () => Promise<{ success: boolean; categories: unknown[]; message?: string }>
  }
  // P0-B：删除 tag 命名空间类型定义（IPC 已移除）
  mediaAction: {
    updateRating: (
      mediaId: number,
      rating: number
    ) => Promise<{ success: boolean; message?: string }>
    // P0-D：删除 toggleFavorite 类型定义
    updateFavorite: (
      mediaId: number,
      isFavorite: boolean
    ) => Promise<{ success: boolean; message?: string }>
    updateTags: (mediaId: number, tags: string[]) => Promise<{ success: boolean; message?: string }>
    updateNotes: (mediaId: number, notes: string) => Promise<{ success: boolean; message?: string }>
    updateCategory: (
      mediaId: number,
      categoryId: number | null
    ) => Promise<{ success: boolean; message?: string }>
    // F-O1：更新套装标注
    updateOutfit: (
      mediaId: number,
      outfit: string
    ) => Promise<{ success: boolean; message?: string }>
    // F-O1：批量分析场景时段
    analyzeSceneTime: (
      mediaIds?: number[]
    ) => Promise<{ success: boolean; message?: string; analyzed?: number }>
    // 物理删除数据库记录（配合文件永久删除场景，与 softDelete 语义不同，不合并）
    delete: (mediaId: number) => Promise<{ success: boolean; message?: string }>
    softDelete: (mediaIds: number[]) => Promise<{ success: boolean; message: string }>
    restore: (mediaIds: number[]) => Promise<{ success: boolean; message: string }>
    permanentDelete: (mediaIds: number[]) => Promise<{ success: boolean; message: string }>
    emptyRecycleBin: () => Promise<{ success: boolean; message: string }>
    // T02：丢失记录清理（批量 / 单条）
    cleanupMissing: () => Promise<{ success: boolean; message: string; cleared?: number }>
    removeMissing: (mediaId: number) => Promise<{ success: boolean; message: string }>
    // T03：套装图鉴统计
    getOutfitStats: () => Promise<{ success: boolean; message?: string; stats: OutfitStat[] }>
  }
  video: {
    thumbnail: (filePath: string) => Promise<unknown>
    metadata: (filePath: string) => Promise<{
      success: boolean
      message?: string
      path?: string
      size?: number
      duration?: number
      width?: number
      height?: number
      codec?: string
      frameRate?: number
    }>
    export: (
      filePath: string,
      targetDir: string,
      format: string
    ) => Promise<{ success: boolean; message: string }>
    captureFrame: (
      filePath: string,
      currentTime: number,
      targetDir?: string
    ) => Promise<{ success: boolean; message: string; filePath?: string }>
    // F-S9：视频裁剪与调速
    trim: (
      filePath: string,
      startTime: number,
      endTime: number,
      targetDir: string
    ) => Promise<{ success: boolean; message: string; filePath?: string }>
    changeSpeed: (
      filePath: string,
      speed: number,
      targetDir: string
    ) => Promise<{ success: boolean; message: string; filePath?: string }>
    // P1-05：导出 Apple Live Photo（JPG + MOV 配对文件，含 ContentIdentifier UUID）
    exportLivePhoto: (
      filePath: string,
      targetDir: string
    ) => Promise<{
      success: boolean
      message: string
      jpgPath?: string
      movPath?: string
      uuid?: string
    }>
  }
  dialog: {
    selectDirectory: () => Promise<string | null>
    openFile: (options?: {
      properties?: string[]
      filters?: { name: string; extensions: string[] }[]
    }) => Promise<string | null>
    saveFile: (options?: {
      defaultPath?: string
      filters?: { name: string; extensions: string[] }[]
    }) => Promise<string | null>
    showMessageBox: (options: {
      type?: string
      title?: string
      message: string
      buttons?: string[]
    }) => Promise<number>
  }
  thumbnail: {
    // P1-03：quality='low' 返回 64px 低质量缩略图（首屏快速预览）
    // quality='high' 返回 512px 高清缩略图（高分屏 DPR ≥ 2 时使用）
    generate: (filePath: string, quality?: 'low' | 'standard' | 'high') => Promise<string | null>
  }
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
      mediaSource?: 'game' | 'launcher' | 'cloud' | 'all'
    }) => Promise<{
      success: boolean
      files: unknown[]
      message?: string
      total?: number
      page?: number
      pageSize?: number
      hasMore?: boolean
    }>
    // F-S10：重复文件检测——返回 sha256 hash 重复分组及统计信息
    // P1-01：返回值新增 bestItemIds（每组推荐保留的 id，基于评分）
    findDuplicates: () => Promise<{
      success: boolean
      message?: string
      duplicates: DuplicateItem[][]
      bestItemIds: (number | null)[]
      totalGroups: number
      totalFiles: number
      wastedBytes: number
      scannedFiles: number
    }>
    // T05：基于 pHash 的相似图检测——返回汉明距离≤threshold 的图片分组
    // P1-01：返回值新增 bestItemIds（每组推荐保留的 id，基于评分）
    findSimilar: (options?: { threshold?: number }) => Promise<{
      success: boolean
      message?: string
      duplicates: DuplicateItem[][]
      bestItemIds: (number | null)[]
      totalGroups: number
      totalFiles: number
      wastedBytes: number
      scannedFiles: number
      // 相似检测特有：实际使用的阈值与已计算 phash 的图片数
      threshold: number
      hashedFiles: number
    }>
    // T05：手动触发 phash 补算
    generatePhash: () => Promise<{
      success: boolean
      message?: string
      processed?: number
      total?: number
    }>
    // P0-03：智能媒体分组——按维度统计分组数量
    getGroupCounts: (
      dimension: string,
      accountUid?: string,
      mediaSource?: 'game' | 'launcher' | 'cloud' | 'all'
    ) => Promise<{
      success: boolean
      message?: string
      groups: Array<{ key: string; count: number }>
    }>
    // P1-01：手动触发重复标记（基于 pHash 极严格阈值 + 评分推荐保留）
    markDuplicates: () => Promise<{
      success: boolean
      message?: string
      markedDuplicates: number
      totalGroups: number
    }>
    // P1-01：查询已标记的重复分组（is_duplicate=1 按 original_id 聚合）
    listDuplicateGroups: () => Promise<{
      success: boolean
      message?: string
      groups: Array<{
        originalId: number
        original: DuplicateItem | null
        duplicates: DuplicateItem[]
      }>
      totalGroups: number
    }>
    onUpdated: (callback: () => void) => () => void
  }
  // P0-02：角色档案管理
  profile: {
    list: () => Promise<{
      success: boolean
      message?: string
      profiles: Array<{
        uid: string
        nickname: string
        avatar: string | null
        created_at: string
        last_active_at: string | null
      }>
    }>
    add: (
      uid: string,
      nickname: string,
      avatar?: string
    ) => Promise<{ success: boolean; message?: string }>
    update: (
      uid: string,
      nickname?: string,
      avatar?: string
    ) => Promise<{ success: boolean; message?: string }>
    delete: (uid: string) => Promise<{ success: boolean; message?: string }>
    setCurrent: (uid: string) => Promise<{ success: boolean; message?: string }>
    getStats: (uid: string) => Promise<{
      success: boolean
      message?: string
      stats: {
        totalCount: number
        imageCount: number
        videoCount: number
        totalSize: number
        earliestTime: string | null
        latestTime: string | null
        topOutfits: Array<{ outfit: string; cnt: number }>
        topScenes: Array<{ scene_category: string; cnt: number }>
        timeDistribution: Array<{ scene_time: string; cnt: number }>
      } | null
    }>
    // P1-04：跨档案转移——批量更新 media_files.account_uid
    transferFiles: (
      mediaIds: number[],
      targetUid: string
    ) => Promise<{ success: boolean; message?: string }>
  }
  uiTheme: {
    get: () => Promise<{ theme: 'default' | 'soft-pink-luxury' }>
    set: (theme: 'default' | 'soft-pink-luxury') => Promise<{ success: boolean }>
  }
  shell: {
    openExternal: (url: string) => Promise<{ success: boolean }>
    openPath: (dirPath: string) => Promise<{ success: boolean; message?: string }>
    // 在资源管理器中打开文件所在位置并选中该文件
    showItemInFolder: (filePath: string) => Promise<{ success: boolean; message?: string }>
  }
  settings: {
    get: (key: string, defaultValue?: unknown) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<{ success: boolean }>
  }
  data: {
    clear: () => Promise<{ success: boolean; message: string }>
  }
  // T01：数据库备份管理
  backup: {
    // P1-04：支持按档案备份（文件名加入 _{uid} 后缀以便识别）
    create: (options?: {
      accountUid?: string
    }) => Promise<{ success: boolean; backup?: BackupRecord; message?: string }>
    list: () => Promise<{
      success: boolean
      backups: BackupRecord[]
      backupDir: string
      message?: string
    }>
    restore: (filename: string) => Promise<{ success: boolean; message?: string }>
    delete: (filename: string) => Promise<{ success: boolean; message?: string }>
    // 自定义目录支持
    setDir: (dir: string) => Promise<{ success: boolean; needRestart: boolean; message: string }>
    resetDir: () => Promise<{ success: boolean; needRestart: boolean; message: string }>
    getDir: () => Promise<string>
  }
  // T08：WiFi 局域网分享 + T09 剪贴板分享
  share: {
    startWifi: (filePaths: string[]) => Promise<{
      success: boolean
      message?: string
      url?: string
      port?: number
      pin?: string
      fileCount?: number
      timeoutMs?: number
    }>
    stopWifi: () => Promise<{ success: boolean; message?: string }>
    // P0-D：删除 wifiStatus 类型定义
    // T09：复制文件到剪贴板（CF_HDROP 格式）
    copyFiles: (
      filePaths: string[]
    ) => Promise<{ success: boolean; message: string; count: number; skipped: number }>
    // T09：检测渠道应用状态（installed=已安装，running=正在运行，installPath=可执行文件路径）
    detectApp: (channelId: string) => Promise<{
      success: boolean
      installed: boolean
      running: boolean
      installPath: string | null
    }>
    // T09：启动目标应用（用于"已安装未运行"场景，用户点击"打开 XX"按钮）
    launchApp: (channelId: string) => Promise<{ success: boolean; message: string }>
  }
  // T10：缩略图缓存管理
  cache: {
    getStats: () => Promise<{
      success: boolean
      message?: string
      totalSize?: number
      fileCount?: number
      limit?: number
      cacheDir?: string
    }>
    clean: () => Promise<{
      success: boolean
      message?: string
      clearedSize?: number
      clearedCount?: number
    }>
    setLimit: (
      limitBytes: number
    ) => Promise<{ success: boolean; message?: string; applied: boolean; evicted: number }>
    enforceLimit: () => Promise<{
      success: boolean
      message?: string
      evicted: number
      totalSize?: number
      fileCount?: number
    }>
    // 自定义目录支持
    setDir: (dir: string) => Promise<{ success: boolean; needRestart: boolean; message: string }>
    resetDir: () => Promise<{ success: boolean; needRestart: boolean; message: string }>
    getDir: () => Promise<string>
  }
  log: {
    // 获取所有故障列表（按时间倒序）
    listFaults: () => Promise<{ success: boolean; faults: FaultRecord[]; message?: string }>
    // 获取单个故障详情
    getFaultDetail: (
      id: string
    ) => Promise<{ success: boolean; fault?: FaultRecord; message?: string }>
    // 打开日志目录
    openDirectory: () => Promise<{ success: boolean; message: string }>
    // 获取日志目录路径
    getDirectoryPath: () => Promise<{ success: boolean; path: string }>
    // 获取日志统计信息
    getStats: () => Promise<{
      success: boolean
      faultCount: number
      totalSize: number
      fileCount: number
      oldestTimestamp: string | null
      message?: string
    }>
    // 导出全部日志为 zip（主进程会弹出保存对话框）
    exportZip: () => Promise<{ success: boolean; message?: string; canceled?: boolean }>
    // 清空所有日志
    clear: () => Promise<{ success: boolean; message: string; cleared: number }>
    // 自定义目录支持
    setDir: (dir: string) => Promise<{ success: boolean; needRestart: boolean; message: string }>
    resetDir: () => Promise<{ success: boolean; needRestart: boolean; message: string }>
    getDir: () => Promise<string>
    // P0-2：渲染进程错误上报到主进程 faults 日志（与 preload.ts 签名保持一致）
    reportRendererError: (payload: {
      message: string
      stack?: string
      componentStack?: string
      filename?: string
      lineno?: number
      colno?: number
      source: 'ErrorBoundary' | 'window.onerror' | 'unhandledrejection'
    }) => Promise<{ success: boolean; message?: string }>
  }
  // T13：崩溃报告管理
  crash: {
    // 列出所有崩溃 dump 文件（按时间倒序）
    list: () => Promise<{ success: boolean; crashes: CrashRecord[]; message?: string }>
    // 获取崩溃目录统计信息
    getStats: () => Promise<{
      success: boolean
      fileCount: number
      totalSize: number
      oldestTime: string | null
      message?: string
    }>
    // 打开崩溃目录（系统资源管理器）
    openDirectory: () => Promise<{ success: boolean; message: string }>
    // 清空所有崩溃 dump 文件
    clear: () => Promise<{ success: boolean; cleared: number; message: string }>
    // 自定义目录支持
    setDir: (dir: string) => Promise<{ success: boolean; needRestart: boolean; message: string }>
    resetDir: () => Promise<{ success: boolean; needRestart: boolean; message: string }>
    getDir: () => Promise<string>
  }
  // 应用控制（重启等）
  app: {
    relaunch: () => Promise<{ success: boolean }>
    // U1：获取应用版本号，避免渲染层硬编码
    getVersion: () => Promise<string>
  }
  // T14：文件导入向导
  import: {
    // 预览源目录中的待导入文件（仅元信息）
    preview: (
      sourceDir: string
    ) => Promise<{ success: boolean; files: ImportFilePreview[]; message?: string }>
    // 执行批量导入
    run: (
      sourcePaths: string[],
      targetBaseDir: string,
      options: ImportOptions
    ) => Promise<{
      success: boolean
      message: string
      imported: Array<{ sourcePath: string; targetPath: string }>
      failed: Array<{ sourcePath: string; message: string }>
      skipped: Array<{ sourcePath: string; reason: string }>
    }>
    // 进度回调
    onProgress: (callback: (progress: { current: number; total: number }) => void) => () => void
  }

  // 建议改#9：操作历史持久化（支持跨重启撤销）
  operationHistory: {
    add: (record: {
      operationType: string
      mediaId?: number
      payload: unknown
      description: string
      createdAt: string
    }) => Promise<{ success: boolean; id?: number; message?: string }>
    list: (limit?: number) => Promise<{
      success: boolean
      records: Array<{
        id: number
        operationType: string
        mediaId: number | null
        payload: string
        description: string
        createdAt: string
      }>
      message?: string
    }>
    remove: (id: number) => Promise<{ success: boolean; message?: string }>
    clear: () => Promise<{ success: boolean; message?: string }>
  }
}

declare global {
  interface Window {
    electronAPI?: WindowElectronAPI
  }
}

declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
  }
}

export {}
