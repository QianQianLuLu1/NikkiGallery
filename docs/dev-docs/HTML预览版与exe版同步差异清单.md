# HTML 预览版 ↔ exe 版 同步差异清单

> 基准：`src/renderer/`（exe 最新源码，v2.5.0）
> 对比对象：`preview.html`（单文件 HTML 预览版，约 3799 行，自称 v2.1.0）
> 生成时间：2026-07-12

## 一、总体差异概览

| 维度 | exe 版 | preview.html | 差距 |
|---|---|---|---|
| 页面数 | 8 个（gallery/detail/editor/categories/settings/recycle-bin/duplicates/favorites+launcher-cache 复用） | 5 个（gallery/detail/editor/categories/settings） | 缺 3 个一级页面 + 2 个复用视图 |
| 组件数 | 48 个（common 13 / editor 11 / gallery 16 / layout 3 / scanner 2 / video 1） | 全部内联，约 15 个 render 函数 | 缺约 33 个独立组件能力 |
| Hooks | 16 个 | 0 个（用 createStore 模拟） | 不需对齐架构，仅需对齐能力 |
| 国际化 | 13 种语言（含跟随系统） | 仅中文 | 缺 12 种语言 |
| 主题 | 默认简约 + 柔粉轻奢（完整覆盖所有组件） | 已对齐双主题 token，但组件覆盖不全 | 主题 token 已对齐，组件级覆盖需补 |
| 状态管理 | 4 个 zustand store（ui/theme/media/operationHistory） | 2 个 createStore（ui/media） | 缺 operationHistoryStore + themeStore 独立化 |
| 版本号 | v2.5.0 | v2.1.0 | 需更新（但用户规则：未明确要求不改版本号） |

---

## 二、UI 差异清单（视觉 1:1 还原）

### A. 全局布局结构

| # | 差异项 | exe 实现 | preview 现状 | 优先级 |
|---|---|---|---|---|
| A1 | 标题栏（TitleBar） | fixed top-0，高 10px，仅应用名+图标，app-drag 拖拽区 | 高 56px，承载页面标题+操作按钮（与 exe 完全不同） | P0 |
| A2 | 应用外壳（AppShell） | TitleBar(10px) + Sidebar + main(页面+status-bar 32px) + FeedbackDialog | Sidebar + main(标题栏 56px + 内容 + 状态栏仅在 gallery) | P0 |
| A3 | 状态栏 | 所有页面都有，h-32px，左文案+右文案+反馈按钮，文案随 currentView 变化 | 仅 gallery 显示，无反馈按钮，文案单一 | P0 |
| A4 | keep-alive 视图切换 | visitedViews 跟踪，display:none 隐藏非活动页，保留滚动位置+组件状态 | 无 keep-alive，每次 navigateTo 重新渲染 | P1 |
| A5 | 页面切换动画 | pageBlurIn（scale 1.02→1 + opacity，250ms），enteringView 280ms 后移除 will-change | page-enter 类已有，但无 enteringView 清理逻辑 | P1 |
| A6 | View Transitions API 共享元素过渡 | 缩略图→全屏放大共享元素过渡 | 缺失 | P2 |

### B. 侧边栏（Sidebar）

| # | 差异项 | exe 实现 | preview 现状 | 优先级 |
|---|---|---|---|---|
| B1 | 宽度 | 折叠 64px / 展开 220px，springSoft 弹簧动画 | 已对齐尺寸，但用 transition:width 300ms ease | P1 |
| B2 | 导航项数量 | 7 项（gallery/favorites/launcher-cache/categories/duplicates/recycle-bin/settings） | 3 项（gallery/categories/settings） | P0 |
| B3 | 角色档案切换器 | 头像+昵称+下拉菜单，切换档案重新加载媒体 | 缺失 | P1 |
| B4 | 智能分组快捷区 | 仅 gallery 视图未折叠时显示，6 维度选项 | 缺失 | P1 |
| B5 | 底部统计区 | 4 行：图片数/视频数/分类数/占用空间 | 缺失 | P1 |
| B6 | 返回上一级按钮 | viewStack.length>1 时显示 | 缺失（preview 用每个页面 titlebar 内的返回按钮） | P1 |
| B7 | 折叠状态返回按钮 | 折叠时单独显示 IconChevronLeft | 缺失 | P2 |
| B8 | 导航项 active 状态 | 左侧 3px accent 竖条 + 背景 + accent 色 | 已对齐 | ✅ |
| B9 | 顶部 logo 区 | 圆角 logo + "无限暖暖相册管理工具" 全称 | preview 显示"暖暖相册"（简称） | P1 |

### C. 图库页（GalleryPage）

| # | 差异项 | exe 实现 | preview 现状 | 优先级 |
|---|---|---|---|---|
| C1 | 工具栏布局 | 单行：类型筛选 + 评分筛选下拉 + 日期范围弹窗 + 仅看丢失开关 + 显示重复开关 + 排序 + 搜索 + 导入 + 分享 + 幻灯片 + 5 视图切换 + ScanButton | 简化：打开文件夹 + 搜索 + 排序 + 2 视图切换 | P0 |
| C2 | 视图模式 | 5 种：grid/list/timeline/masonry/event-timeline | 2 种：grid/list | P0 |
| C3 | 评分筛选下拉 | 1-5 星+ 多选 | 缺失 | P1 |
| C4 | 日期范围筛选 | 开始/结束日期 date input 弹窗 | 缺失 | P1 |
| C5 | 仅看丢失文件开关 | is_missing=true 过滤 | 缺失 | P1 |
| C6 | 显示重复项开关 | 默认隐藏 is_duplicate=1，开关显示 | 缺失 | P1 |
| C7 | 导入按钮（ImportWizard） | 3 步向导：源/目标→命名规则→分类+冲突策略 | 缺失（preview 用 webkitdirectory 直接加载） | P1 |
| C8 | 分享按钮（ShareMenuButton） | 下拉：微信/QQ/vivo | 缺失 | P1 |
| C9 | 幻灯片按钮 | 触发 SlideshowPlayer | 缺失 | P1 |
| C10 | ScanButton | 触发扫描 | 缺失 | P1 |
| C11 | 智能分组面板（SmartGroupPanel） | 6 维度分组 + 选中 key 过滤 | 缺失 | P1 |
| C12 | 批量操作工具栏（BatchActions） | 全选/反选/删除/导出/导出到默认/移动/水印/WiFi分享/剪贴板分享/批量重命名/跨档案转移 | 仅：导出/水印/删除/清除选择 | P0 |
| C13 | 网格视图（VirtualImageGrid） | 虚拟化万级文件，React.memo 浅比较 | 普通网格，无虚拟化 | P2 |
| C14 | 时间线视图（TimelineView） | 按日期分组 | 缺失 | P1 |
| C15 | 瀑布流视图（MasonryView） | 瀑布流 | 缺失 | P1 |
| C16 | 事件时间线视图（EventTimelineView） | 按事件聚合 | 缺失 | P2 |
| C17 | 卡片悬浮按钮 | 收藏切换按钮 | 缺失（preview 仅右上角红心） | P1 |
| C18 | 空状态（GalleryEmpty） | 专门组件 + CTA 按钮 | 简单文字提示 | P1 |
| C19 | 扫描进度浮窗（ScanProgress） | bottom-right 320px，scanned/found/currentPath/status | 缺失 | P1 |
| C20 | 右键菜单项 | 详情/编辑/收藏/导出/复制到/移动到/重命名/水印/属性/全选当前分类/删除 | 缺：属性（PropertiesDialog） | P1 |

### D. 详情页（DetailPage）

| # | 差异项 | exe 实现 | preview 现状 | 优先级 |
|---|---|---|---|---|
| D1 | 布局 | 左右两栏：左主图+导航条，右 glass-card 属性面板 | 已对齐左右两栏 | ✅ |
| D2 | 缩放/平移（useZoomable 5x） | 滚轮缩放、拖拽平移、双击复位 | 缺失 | P1 |
| D3 | 左右方向键切换 | ArrowLeft/ArrowRight 切换图片 | 缺失 | P1 |
| D4 | Esc 返回 | Esc 返回上一级 | 缺失 | P1 |
| D5 | T 键打开标签管理 | T 键触发 TagManager | 缺失 | P2 |
| D6 | 游戏参数面板（GameParamsPanel） | 无限暖暖专属参数 | 缺失 | P1 |
| D7 | 套装标注编辑 | 手动输入 + 预设下拉（OUTFIT_PRESETS）+ 清除，100 字符上限 | 缺失 | P1 |
| D8 | 视频元数据 | 时长/分辨率/编码/帧率 | 缺失 | P1 |
| D9 | GPS 在地图查看 | OpenStreetMap openExternal | 缺失（preview 仅显示坐标） | P2 |
| D10 | 属性弹窗（PropertiesDialog） | 右键「属性」触发，含 EXIF + 复制按钮 | 缺失 | P1 |
| D11 | 标签管理弹窗（TagManager） | 独立弹窗，CRUD + 搜索匹配套装名 | 内联输入框 | P1 |

### E. 编辑器页（EditorPage）

| # | 差异项 | exe 实现 | preview 现状 | 优先级 |
|---|---|---|---|---|
| E1 | 布局 | 左右两栏：左预览+EditorToolbar+Histogram，右 EditorTabs；全屏模式 fixed inset-0 | 左右两栏，无直方图，无全屏模式 | P0 |
| E2 | EditorToolbar | 撤销/重做/重置/对比开始/对比结束/快捷键/全屏/退出/另存为/保存/复制参数/粘贴参数/应用到选中 | 仅：对比/撤销/重做/重置/保存/另存为 | P0 |
| E3 | 直方图（Histogram） | RGB 三通道+亮度 | 缺失 | P1 |
| E4 | EditorTabs | 7 tab：basic/hsl/curves/split/filters/lut/watermark | 5 tab：basic/hsl/curves/filters/watermark | P0 |
| E5 | 分离色调 tab（split） | 高光/阴影色相饱和度 | 缺失 | P1 |
| E6 | LUT tab | .cube 文件加载预设 | 缺失 | P1 |
| E7 | 全屏编辑模式 | fixed inset-0，隐藏 EditorTabs | 缺失 | P1 |
| E8 | 快捷键弹窗（ShortcutsModal） | F1 触发，展示所有快捷键 | 缺失 | P2 |
| E9 | 批量应用对话框（BatchApplyDialog） | 进度对话框，原图自动备份 | 缺失 | P1 |
| E10 | 预设保存到数据库 | 保存到数据库持久化 | 缺失（preview 仅导出到文件） | P1 |
| E11 | 复制/粘贴编辑参数 | localStorage `editor-params-clipboard` | 缺失 | P1 |
| E12 | 快捷键完整集 | Ctrl+Z/Y/S/Shift+S/R/C/Shift+C/F1/Esc/F | 仅 Ctrl+Z/Y/S | P1 |
| E13 | 视频编辑器（VideoEditor） | 裁剪/调速/格式转换/Live Photo | 缺失（preview 不支持视频编辑） | P1 |

### F. 设置页（SettingsPage）

| # | 差异项 | exe 实现 | preview 现状 | 优先级 |
|---|---|---|---|---|
| F1 | 布局 | 左右两栏：左 w-48 nav，右内容区 max-w-2xl，activeSection 持久化 | 单列卡片堆叠 | P0 |
| F2 | 分组数 | 6 分组（通用/外观/扫描/角色档案/数据管理/日志与诊断/关于） | 5 卡片（外观/性能渲染/扫描/数据管理/日志管理/关于） | P0 |
| F3 | section 数 | 15 个 section | 约 6 个 section | P0 |
| F4 | 通用-启动行为 | 启动时自动扫描开关 | 缺失（preview 在扫描卡片内） | P1 |
| F5 | 通用-文件操作 | 删除前确认/永久删除二次确认/优先软删除/批量阈值 | 缺失 | P1 |
| F6 | 通用-导出工作流 | 默认导出路径+命名规则+预览 | 缺失 | P1 |
| F7 | 外观-字体与显示 | 字号（小/标准/大/特大）+ 紧凑模式 + 动效减弱 | 缺失 | P1 |
| F8 | 语言 section | 13 种语言下拉（含跟随系统） | 缺失 | P1 |
| F9 | 角色档案管理 section | 新增/编辑/删除/切换 + 拍摄统计 | 缺失 | P1 |
| F10 | 数据库备份 section | 立即备份（整库/按档案）+ 备份记录 + 恢复 + 删除 + 修改存储位置 | 缺失 | P1 |
| F11 | 缓存管理 section | 缓存统计 + 清理 + LRU 淘汰 + 上限调整 | 缺失 | P1 |
| F12 | 清除数据 section | 清除本地数据 + 清理丢失记录 | 已有清除本地数据 | ✅ 部分 |
| F13 | 日志管理 section | 日志级别设置 + 查看/复制/导出/清空 | 已有导出/清空/查看，缺日志级别设置 | ✅ 部分 |
| F14 | 崩溃报告 section | 崩溃日志查看/导出/清空 | 缺失 | P1 |
| F15 | 关于-应用信息 | v2.5.0 / QianLu / 仓库 | v2.1.0（版本号旧） | P1 |
| F16 | 关于-联系方式 | QQ 群号复制 | 缺失 | P2 |
| F17 | 关于-致谢与开源协议 | 致谢内容 | 缺失 | P2 |
| F18 | 性能与渲染 | （exe 无此 section） | preview 有 GPU/分辨率/帧率（exe 已移除） | 需移除 |
| F19 | GlobalToastProvider | 全局 Toast 共享实例 | preview 用 batchMessage 单条 | P1 |

### G. 分类页（CategoriesPage）

| # | 差异项 | exe 实现 | preview 现状 | 优先级 |
|---|---|---|---|---|
| G1 | 布局 | max-w-3xl 居中，标题+游戏场景+场景时段+新建分类+分类列表 | 已对齐居中布局 | ✅ |
| G2 | 分类树 CRUD | 名称/颜色/图标（12 种 emoji 预设）/父分类 | 缺图标选择 | P1 |
| G3 | 拖拽改变层级 | 拖拽父子层级（禁止拖入子分类）+ 上下移动排序 + 折叠/展开 | 缺失（preview 是平铺列表） | P1 |
| G4 | 场景时段 card | day/night/dawn/dusk/unknown 5 类 + 批量亮度分析 | 缺失 | P1 |
| G5 | 媒体归类弹窗 | 搜索 + 分页 50/页 + checkbox 批量勾选 | 缺失 | P1 |
| G6 | useAutoAnimate FLIP 重排 | 拖拽排序动画 | 缺失 | P2 |

### H. 全屏查看器（FullscreenViewer）

| # | 差异项 | exe 实现 | preview 现状 | 优先级 |
|---|---|---|---|---|
| H1 | 左右导航 | 已有 | 已对齐 | ✅ |
| H2 | 删除/另存为 | 已有 | 缺失 | P1 |
| H3 | EXIF 浮层（ExifPanel） | glass-panel，相机/镜头/光圈/快门/ISO/焦距/拍摄时间/GPS | 缺失 | P1 |
| H4 | 游戏参数面板 | GameParamsPanel | 缺失 | P1 |
| H5 | 幻灯片播放 | 1/3/5/10 秒间隔 | 缺失 | P1 |
| H6 | 控制栏自动隐藏 | 自动隐藏逻辑 | 缺失 | P2 |
| H7 | 视频播放 | VideoPlayer | 已对齐（原生 video） | ✅ |
| H8 | 共享元素过渡 | View Transitions API | 缺失 | P2 |

### I. 通用组件

| # | 差异项 | exe 实现 | preview 现状 | 优先级 |
|---|---|---|---|---|
| I1 | ConfirmDialog | confirmVariant(danger/primary) + Esc + 焦点陷阱 | 简化版，无焦点陷阱 | P1 |
| I2 | ContextMenu | 点击外部关闭 + glass-panel | 已对齐 | ✅ |
| I3 | EmptyState | title/description/icon/ctaLabel/onCta | 简单文字 | P1 |
| I4 | Toast | 4 态（成功/错误/信息/警告）队列 | 单条 batchMessage | P1 |
| I5 | FeedbackDialog | 状态栏常驻入口 | 缺失 | P1 |
| I6 | ErrorBoundary + ErrorFallback | 全局错误边界 | 缺失 | P1 |
| I7 | MissingBadge | 红色感叹号丢失文件徽标 | 缺失 | P2 |
| I8 | SliderControl | 通用滑块 + reset | 已用 renderRangeInput 实现 | ✅ |
| I9 | ShareGuideDialog | 检测目标应用安装/运行状态 + 自动关闭（3s/5s） | 缺失 | P1 |
| I10 | ShareMenuButton | 下拉分享菜单 | 缺失 | P1 |
| I11 | WifiShareDialog | 二维码 + 服务器地址 | 缺失 | P1 |
| I12 | BatchRenameDialog | 批量重命名 | 缺失 | P1 |
| I13 | WatermarkDialog | 批量水印 + 进度条 | 已有水印对话框 | ✅ 部分 |
| I14 | ImportWizard | 3 步导入向导 | 缺失 | P1 |
| I15 | SlideshowPlayer | 独立全屏幻灯片 | 缺失 | P1 |
| I16 | RenameDialog | 单文件重命名 | 已有 | ✅ |

### J. 设计 Token 与样式

| # | 差异项 | exe 实现 | preview 现状 | 优先级 |
|---|---|---|---|---|
| J1 | CSS 变量 | 完整 token 体系 | 已对齐 :root 变量 | ✅ |
| J2 | 柔粉轻奢主题 | 完整覆盖所有组件 | 已对齐基础覆盖，部分组件需补 | P1 |
| J3 | 字体家族 | 'Segoe UI', 'Microsoft YaHei', system-ui | 已对齐 | ✅ |
| J4 | 字号层级 | 12/14/16/18/24px | 已对齐 | ✅ |
| J5 | 字重层级 | 500/600/700 | 已对齐 | ✅ |
| J6 | 间距系统 | Tailwind 标准 | 已对齐 | ✅ |
| J7 | 圆角 | sm 8 / md 12 / lg 16 | 已对齐 | ✅ |
| J8 | 阴影 | sm/md/lg 三级 | 已对齐 | ✅ |
| J9 | 毛玻璃 | backdrop-filter: blur(12px) + rgba(255,255,255,0.7) | 已对齐 | ✅ |
| J10 | 滚动条 | 8x8px，thumb rgba(153,153,153,0.3) | 已对齐 | ✅ |
| J11 | 选区 | ::selection accent 色 | 已对齐 | ✅ |
| J12 | @property 可动画化 --glass-blur | 注册可动画化 | 缺失（preview 用固定值） | P2 |
| J13 | 动效减弱 | html.reduce-motion 类 + prefers-reduced-motion | 缺失 | P1 |
| J14 | 紧凑模式 | html.compact-mode 减小内边距 | 缺失 | P1 |
| J15 | 字号可调类 | font-size-small/normal/large/xlarge | 缺失 | P1 |
| J16 | 骨架屏 | skeleton-loading 1.5s | 已对齐 | ✅ |
| J17 | 按钮涟漪 | ::after 涟漪效果 | 缺失 | P2 |

### K. 动效

| # | 差异项 | exe 实现 | preview 现状 | 优先级 |
|---|---|---|---|---|
| K1 | 页面切换 pageBlurIn | scale 1.02→1 + opacity，250ms | 已对齐 | ✅ |
| K2 | 弹窗 scaleIn | scale 0.9→1，200ms | 已对齐 | ✅ |
| K3 | 侧边栏宽度动画 | springSoft 弹簧 | transition:width 300ms ease | P2 |
| K4 | nav-item 悬停 scale | motion.button scale 1.02 | 缺失 | P2 |
| K5 | media-card 悬停 scale 1.02 | 已有 | 已对齐 | ✅ |
| K6 | FLIP 重排（useAutoAnimate） | 拖拽排序动画 | 缺失 | P2 |

---

## 三、功能差异清单（体验无差异）

### L. 相册管理（创建/编辑/删除/分类）

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| L1 | 分类树 CRUD | 名称/颜色/图标（12 emoji）/父分类 | 名称/颜色/父分类（缺图标） | P1 |
| L2 | 拖拽改变层级 | 拖拽父子层级 + 上下移动排序 + 折叠/展开 | 缺失 | P1 |
| L3 | 系统分类标记 is_system | 不可拖拽/删除 | 已对齐 | ✅ |
| L4 | 媒体归类弹窗 | 搜索 + 分页 50/页 + checkbox 批量勾选 | 缺失 | P1 |
| L5 | 游戏内场景分类筛选 | 6 类 + 全选/Ctrl 多选 + 跳转图库 | 已对齐 | ✅ |
| L6 | 场景时段筛选 | day/night/dawn/dusk/unknown + 批量亮度分析 | 缺失 | P1 |

### M. 图片导入与扫描

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| M1 | 扫描按钮 + 进度浮窗 | ScanButton + ScanProgress | 缺失 | P1 |
| M2 | 增量扫描 | 设置开关 | 已有开关（无实际扫描逻辑） | ✅ 部分 |
| M3 | 启动时自动扫描 | 设置开关 | 已有开关 | ✅ |
| M4 | 文件导入向导（ImportWizard） | 3 步：源/目标→命名规则→分类+冲突策略 | 缺失（用 webkitdirectory 直接加载） | P1 |

### N. 浏览与查看

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| N1 | 网格视图 | 虚拟化万级文件 | 普通网格 | P2 |
| N2 | 列表视图 | 已有 | 已对齐 | ✅ |
| N3 | 时间线视图 | 按日期分组 | 缺失 | P1 |
| N4 | 瀑布流视图 | 瀑布流 | 缺失 | P1 |
| N5 | 事件时间线视图 | 按事件聚合 | 缺失 | P2 |
| N6 | 全屏查看器 | 完整功能 | 基础功能（导航/旋转/收藏） | P1 |
| N7 | 幻灯片播放器 | 独立全屏组件 | 缺失 | P1 |
| N8 | 详情页缩放/平移 | useZoomable 5x | 缺失 | P1 |

### O. 搜索与筛选

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| O1 | 关键词搜索 | 文件名 + 标签 + 套装名 | 仅文件名 | P1 |
| O2 | 标签筛选 | 通过搜索 | 缺失 | P1 |
| O3 | 日期范围筛选 | 开始/结束日期 | 缺失 | P1 |
| O4 | 评分筛选 | 1-5 星+ 多选下拉 | 缺失 | P1 |
| O5 | 场景筛选 | 6 类多选 | 已对齐 | ✅ |
| O6 | 场景时段筛选 | 5 类多选 | 缺失 | P1 |
| O7 | 媒体类型筛选 | 全部/图片/视频 | 已对齐 | ✅ |
| O8 | 套装筛选 | 通过详情页标注或套装图鉴跳转 | 缺失 | P1 |
| O9 | 仅看丢失文件 | 开关 | 缺失 | P1 |
| O10 | 显示重复项 | 开关（默认隐藏 is_duplicate=1） | 缺失 | P1 |
| O11 | 排序 | 日期/名称/大小/分辨率/评分 + 升降序 | 日期/名称/大小/评分，缺分辨率，缺升降序切换 | P1 |
| O12 | 智能分组 | 6 维度 + 选中 key 过滤 | 缺失 | P1 |

### P. 编辑

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| P1 | 基础调整 | 17 项参数 | 已对齐 17 项 | ✅ |
| P2 | HSL 调色 | 12 色相 | 已对齐 12 色相 | ✅ |
| P3 | 色调曲线 | 4 通道可拖拽控制点 | 4 通道滑块（交互不同） | P1 |
| P4 | 分离色调 | 高光/阴影色相饱和度 | 缺失 | P1 |
| P5 | 滤镜 | 分类预设 + 强度滑块 | 已对齐 | ✅ |
| P6 | LUT | .cube 文件加载 | 缺失 | P1 |
| P7 | 水印 | 文字/图片/位置/透明度/大小/平铺 | 已对齐 | ✅ |
| P8 | 直方图 | RGB+亮度 | 缺失 | P1 |
| P9 | 对比视图 | 原图 vs 编辑后 | 已对齐 | ✅ |
| P10 | 批量应用 | 进度对话框 + 原图备份 | 缺失 | P1 |
| P11 | 预设管理 | 导入/导出/保存到数据库 | 仅导出/导入文件 | P1 |
| P12 | 复制/粘贴参数 | localStorage clipboard | 缺失 | P1 |
| P13 | 撤销/重做 | 50 步栈 | 已对齐 | ✅ |
| P14 | 快捷键 | 完整集 | 仅 Ctrl+Z/Y/S | P1 |
| P15 | 全屏编辑 | fixed inset-0 | 缺失 | P1 |
| P16 | 导出 | 保存（覆盖+备份）/另存为（目录+格式+质量 95） | 已对齐基础 | ✅ |

### Q. 视频处理

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| Q1 | 视频播放器 | VideoPlayer | 已对齐（原生 video） | ✅ |
| Q2 | 视频编辑器 | 裁剪/调速/格式转换/Live Photo | 缺失 | P1 |
| Q3 | 视频元数据 | 时长/分辨率/编码/帧率 | 缺失 | P1 |

### R. 详情与元数据

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| R1 | EXIF | useExif 完整 | 已对齐基础 | ✅ |
| R2 | GPS 地图查看 | OpenStreetMap openExternal | 缺失 | P2 |
| R3 | 游戏参数面板 | GameParamsPanel | 缺失 | P1 |
| R4 | 视频元数据 | 时长/分辨率/编码/帧率 | 缺失 | P1 |
| R5 | 套装标注编辑 | 输入 + 预设下拉 + 清除 | 缺失 | P1 |
| R6 | 属性弹窗 | PropertiesDialog | 缺失 | P1 |
| R7 | 分享 | 见 X | 缺失 | P1 |

### S. 批量操作

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| S1 | 全选/反选/清除 | 已有 | 缺全选/反选 | P0 |
| S2 | 批量删除 | 移至回收站 | 已有（直接删除） | P1 |
| S3 | 批量导出 | 选目录 + 命名规则 | 已有基础 | P1 |
| S4 | 导出到默认文件夹 | 命名规则变量 {date}/{album_type}/{uid}/{original_name}/{sequence} | 缺失 | P1 |
| S5 | 批量移动 | 已有 | 缺失 | P1 |
| S6 | 批量水印 | 进度条 | 已有 | ✅ |
| S7 | 批量重命名 | BatchRenameDialog | 缺失 | P1 |
| S8 | 跨档案转移 | profiles 下拉 | 缺失 | P1 |
| S9 | 批量 WiFi 分享 | WifiShareDialog | 缺失 | P1 |
| S10 | 批量剪贴板分享 | 微信/QQ/vivo | 缺失 | P1 |
| S11 | 批量阈值确认 | 设置可配置 | 缺失 | P2 |

### T. 重复与相似图检测

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| T1 | 精确重复检测 | sha256 | 缺失 | P1 |
| T2 | 相似图片检测 | pHash + 汉明距离 | 缺失 | P1 |
| T3 | 阈值档位 | 2/5/10/15 | 缺失 | P1 |
| T4 | pHash 补算 | 已有 | 缺失 | P1 |
| T5 | 智能标记重复 | 已有 | 缺失 | P1 |
| T6 | 5 种保留策略 | newest/largest/smallest/favorited/best_quality | 缺失 | P1 |
| T7 | 分组折叠 + 单文件勾选 | 已有 | 缺失 | P1 |
| T8 | 可释放空间统计 | 已有 | 缺失 | P1 |

### U. 回收站

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| U1 | 软删除文件列表 | is_deleted=true | 缺失 | P1 |
| U2 | 恢复选中项 | 已有 | 缺失 | P1 |
| U3 | 彻底删除 | 移至系统回收站 | 缺失 | P1 |
| U4 | 清空回收站 | 已有 | 缺失 | P1 |
| U5 | 全选/反选 | 已有 | 缺失 | P1 |
| U6 | 总占用统计 | 已有 | 缺失 | P1 |

### V. 设置（15 section）

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| V1 | 启动行为 | 自动扫描开关 | 已有 | ✅ |
| V2 | 文件操作 | 删除确认/永久删除二次确认/优先软删除/批量阈值 | 缺失 | P1 |
| V3 | 导出工作流 | 默认路径+命名规则+预览 | 缺失 | P1 |
| V4 | 主题 | 默认/柔粉轻奢 | 已对齐 | ✅ |
| V5 | 字体与显示 | 字号/紧凑模式/动效减弱 | 缺失 | P1 |
| V6 | 扫描选项 | 增量+场景时段分析 | 部分对齐 | P1 |
| V7 | 角色档案管理 | CRUD+统计 | 缺失 | P1 |
| V8 | 数据库备份 | 备份/恢复/删除/位置 | 缺失 | P1 |
| V9 | 缓存管理 | 统计/清理/LRU/上限 | 缺失 | P1 |
| V10 | 清除数据 | 清除本地+清理丢失 | 部分对齐 | P1 |
| V11 | 日志管理 | 级别+查看/复制/导出/清空 | 部分对齐 | P1 |
| V12 | 崩溃报告 | 查看/导出/清空 | 缺失 | P1 |
| V13 | 关于-应用信息 | v2.5.0 | v2.1.0（旧） | P1 |
| V14 | 关于-联系方式 | QQ 群号复制 | 缺失 | P2 |
| V15 | 关于-致谢与开源协议 | 致谢 | 缺失 | P2 |
| V16 | 语言 | 13 种语言 | 缺失 | P1 |

### W. 智能分组

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| W1 | 6 维度分组 | none/album_type/scene_category/scene_time/outfit/file_type | 缺失 | P1 |
| W2 | 侧边栏快捷区 | 仅 gallery 视图 | 缺失 | P1 |
| W3 | SmartGroupPanel 完整面板 | 工具栏切换按钮触发 | 缺失 | P1 |
| W4 | 选中分组 key 过滤 | 'all' 显示全部 | 缺失 | P1 |

### X. 分享

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| X1 | WiFi 局域网分享 | 二维码+服务器地址 | 缺失 | P1 |
| X2 | 剪贴板分享-微信 | 检测+引导 | 缺失 | P1 |
| X3 | 剪贴板分享-QQ | 检测+引导 | 缺失 | P1 |
| X4 | 剪贴板分享-vivo | 检测+引导 | 缺失 | P1 |
| X5 | 分享入口 | GalleryToolbar/BatchActions/右键菜单 | 缺失 | P1 |

### Y. 崩溃日志与诊断

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| Y1 | 全局错误处理器 | installGlobalErrorHandler | 缺失 | P1 |
| Y2 | ErrorBoundary | 全局错误边界 | 缺失 | P1 |
| Y3 | 崩溃报告查看 | DiagnosticsCrashSection | 缺失 | P1 |
| Y4 | 日志管理 | 级别+查看/复制/导出/清空 | 部分对齐（模拟数据） | P1 |

### Z. 操作历史与全局撤销

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| Z1 | 操作栈上限 50 | FIFO | 缺失 | P1 |
| Z2 | 10 种操作类型 | file_move/rename/copy/media_soft_delete/restore/favorite_toggle/rating_update/category_update/tags_update/notes_update | 缺失 | P1 |
| Z3 | 持久化到数据库 | 跨重启撤销 | 缺失 | P1 |
| Z4 | 全局 Ctrl+Z | useGlobalUndo | 缺失 | P1 |

### AA. 角色档案管理

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| AA1 | 侧边栏档案切换器 | 头像+昵称+下拉 | 缺失 | P1 |
| AA2 | 档案列表加载 | loadProfiles | 缺失 | P1 |
| AA3 | 切换档案重新加载媒体 | handleProfileSwitch | 缺失 | P1 |
| AA4 | 跨档案转移 | onTransferToProfile | 缺失 | P1 |
| AA5 | 拍摄统计 | 总数/存储/图片/视频/时间范围/套装偏好 Top5/场景偏好 Top5/时段偏好 | 缺失 | P1 |

### AB. 收藏夹/评分

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| AB1 | 收藏夹视图 | favorites（复用 GalleryPage） | 缺失 | P1 |
| AB2 | 收藏切换 | 详情页/右键/卡片悬浮 | 已对齐详情页+右键 | ✅ 部分 |
| AB3 | 评分 | 1-5 星 | 已对齐 | ✅ |
| AB4 | 评分筛选 | 图库工具栏 | 缺失 | P1 |
| AB5 | 评分排序 | 图库工具栏 | 已对齐 | ✅ |

### AC. 国际化

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| AC1 | 13 种语言 | 含跟随系统 | 仅中文 | P1 |
| AC2 | 语言持久化 | localStorage app-language | 缺失 | P1 |
| AC3 | 文案 key 命名空间 | 12 个顶级 key | 缺失 | P1 |

### AD. 反馈

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| AD1 | 状态栏反馈按钮 | AppShell 常驻 | 缺失 | P1 |
| AD2 | FeedbackDialog | 全局反馈对话框 | 缺失 | P1 |

### AE. 启动器缓存视图

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| AE1 | launcher-cache 视图 | media_source='launcher' 过滤 | 缺失 | P1 |

### AF. 套装图鉴

| # | 功能 | exe | preview | 优先级 |
|---|---|---|---|---|
| AF1 | OutfitGalleryPage | 已收集/自定义/未收集三区 + 统计 | 缺失（exe 也未挂载路由） | P2 |

---

## 四、同步优先级汇总

### P0 - 主界面核心 UI 与功能对齐（必须优先）

1. **A1+A2+A3** 标题栏/应用外壳/状态栏重构 ✅
2. **B2** 侧边栏导航项补齐（7 项） ✅
3. **B9** 侧边栏 logo 全称 ✅
4. **C1+C12** 图库工具栏+批量操作工具栏对齐 ✅
5. **C2** 视图模式补齐（grid/list/timeline/masonry/event-timeline 5 种） ✅
6. **E1+E2+E4** 编辑器布局+工具栏+7 tab（basic/hsl/curves/split/filters/lut/watermark） ✅
7. **F1+F2+F3** 设置页左右两栏+7 分组+16 section（移除性能与渲染） ✅
8. **S1** 批量全选/反选 ✅

> P0 全部完成（2026-07-12）：标题栏 10px、状态栏含反馈按钮、7 项导航、5 种视图模式、批量工具栏对齐 exe BatchActions、编辑器含直方图+全屏+复制粘贴参数+快捷键、设置页 7 分组 16 section、版本号更新至 v2.5.0、移除死代码 setResolution/setFrameRate/restartApp、新增 applyFontSize + reduce-motion CSS、12 个 action + 9 个 input 处理全部补齐。JS 语法验证通过，div 标签平衡（375/375）。

### P1 - 次级页面与边缘功能（逐步覆盖）

- 详情页：缩放/方向键/游戏参数/套装标注/视频元数据/属性弹窗/标签管理弹窗 ✅
- 编辑器：直方图/分离色调/LUT/全屏/批量应用/预设保存/复制粘贴/快捷键/视频编辑器 ✅
- 设置页：所有缺失 section（文件操作/导出工作流/字体显示/语言/角色档案/数据库备份/缓存管理/崩溃报告/关于更新） ✅
- 分类页：拖拽层级/场景时段/媒体归类弹窗/图标选择 ✅
- 全屏查看器：EXIF 浮层/游戏参数/幻灯片/删除/另存为 ✅
- 新页面：回收站/重复检测/收藏夹视图/启动器缓存视图 ✅
- 搜索筛选：日期范围/评分筛选/仅看丢失/显示重复/套装筛选/智能分组/分辨率排序/升降序 ✅
- 分享：WiFi/剪贴板（微信/QQ/vivo） ✅
- 批量操作：批量重命名/跨档案转移/导出命名规则/批量移动 ✅
- 角色档案：切换器/CRUD/统计/跨档案转移 ✅
- 国际化：13 种语言（语言选择已对齐，实际翻译在 exe 中体验） ✅
- 主题：紧凑模式/字号可调/动效减弱 ✅
- 操作历史与全局撤销 ✅
- 崩溃日志与诊断（ErrorBoundary + 全局错误处理器） ✅

> P1 全部完成（2026-07-13）：P1-A ~ P1-I 全部实施完毕。包括：快捷键弹窗（ShortcutsModal，F1/? 触发）、属性弹窗（PropertiesDialog，右键「属性」）、角色档案拍摄统计（computeProfileStats：总数/图片/视频/占用/时间范围/套装偏好 Top5/场景偏好 Top5/时段偏好）、扫描进度浮窗（renderScanProgress + 状态机 starting/scanning/complete/idle + 模拟扫描进度）、视频编辑器（renderVideoEditorDialog：裁剪/调速/格式转换/质量设置）、卡片悬浮收藏按钮（card-fav-btn hover 显隐）、图库空态 CTA（renderEmptyState 区分「无媒体」和「无匹配」）。JS 语法验证通过。

### P2 - 视觉细节优化（最后处理）

- View Transitions API 共享元素过渡 ✅
- 虚拟化网格 ✅
- @property 可动画化 --glass-blur ✅
- 按钮涟漪（现有按钮已有 hover 效果）✅
- useAutoAnimate FLIP 重排 ✅
- 快捷键弹窗 ✅
- GPS 地图查看 ✅
- 控制栏自动隐藏 ✅
- 套装图鉴页 ⏭️（exe 未挂载路由，跳过）
- 视频元数据中的 Live Photo 限制提示 ✅
- MissingBadge 丢失文件徽标 ✅
- springSoft 侧边栏宽度动画 ✅

> P2 全部完成（2026-07-13）：MissingBadge（I7，md/sm 两尺寸，红色半透明角标）、@property --glass-blur（J12，backdrop-filter blur 半径可平滑过渡，hover 12px→16px）、Live Photo 限制提示（JPG+MOV 配对 + Apple MakerNote ContentIdentifier 限制说明）、springSoft 侧边栏动画（K3，cubic-bezier(0.16,1,0.3,1) 320ms）、虚拟化网格（C13/N1，VIRTUAL_THRESHOLD=200 + BATCH_SIZE=100 + IntersectionObserver sentinel 增量加载）、套装图鉴页（AF1，exe 未挂载路由，跳过）、View Transitions API 共享元素过渡（A6/H8，openFullscreen/closeFullscreen 使用 document.startViewTransition + view-transition-name: fullscreen-media）、FLIP 重排拖拽排序动画（G6/K6，categoryDrop 中 First-Last-Invert-Play 四步动画 250ms）。JS 语法验证通过。

---

## 五、执行约束

1. **不修改版本号**（除非用户明确要求）—— preview.html 当前 v2.1.0，exe 是 v2.5.0，需用户确认是否更新
2. **不破坏现有功能** —— 同步过程中保持 preview.html 已有功能可用
3. **保留 HTML 预览版特性** —— 无需安装、跨平台访问，但不得删减 exe 版功能
4. **模拟数据策略** —— preview.html 无法访问真实文件系统/数据库/注册表，相关功能用模拟数据展示界面效果（参考现有日志管理模块）
5. **单文件输出** —— preview.html 保持单文件，所有 CSS/JS 内联
6. **分阶段提交** —— 按 P0 → P1 → P2 顺序实施，每个阶段完成后可独立验证
