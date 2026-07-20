# exe 版 ↔ HTML 预览版 全面对齐差异清单

> 基准：`src/renderer/`（exe 最新源码，v2.5.0，包含 8 页面 / 49 组件 / 11 服务 / 123 IPC 通道）
> 对比对象：`preview.html`（单文件 HTML 预览版，已完成 R0-R7 实装化，约 11000+ 行）
> 生成时间：2026-07-13
> 任务：以 exe 版为唯一参照标准，全面对齐 HTML 预览版的 UI 设计与功能实现
> 前置状态：R0-R7 实装化已完成（IndexedDB 持久化 + FSA 文件访问 + Canvas 编辑 + 重复检测 + 操作历史）

---

## 一、总体差异概览

| 维度 | exe 版 | preview.html | 差距 |
|---|---|---|---|
| 页面数 | 8 个一级页面 | 7 个（缺 launcher-cache） | 缺 1 个一级页面 |
| 侧边栏导航项 | 7 项 | 3 项 | 缺 4 项快捷入口 |
| 视图模式 | 5 种（grid/list/timeline/masonry/event-timeline） | 2 种（grid/list） | 缺 3 种视图 |
| 标题栏高度 | h-10=40px（仅应用名+图标） | 原 10px（已修复为 40px） | 已对齐 |
| 状态栏覆盖 | 所有页面，h-32px，含反馈按钮 | 仅 gallery，无反馈按钮 | 大幅缺失 |
| 主题切换 | class 增量切换，保留 compact-mode | `className =` 直接覆盖，丢失状态 | 严重 bug |
| 字号映射 | 12/14/16/18px | 13/15/17/19px（每档差 1px） | 数值不一致 |
| 图标库 | 60+ 自定义 SVG | 30+ 内联 SVG | 缺约 30 个图标 |
| 工具栏功能 | 单行 13+ 操作 | 简化 4 操作 | 大幅简化 |
| 批量操作 | 11 种 | 4 种 | 缺 7 种 |
| 右键菜单 | 通用组件，支持子菜单+键盘导航 | 写死 12 项 | 架构差异 |
| Toast 类型 | 3 种（success/error/info） | 4 种（多 warning） | 多余类型 |
| 空态 CTA | 带按钮 | 仅文字 | 缺少 CTA |
| 确认弹窗 | 含焦点陷阱 | 仅 Esc | 缺焦点管理 |
| 扫描停止 | 支持停止按钮 | 不支持 | 缺停止能力 |

---

## 二、UI 差异清单（视觉 1:1 还原）

### A. 设计规范层（配色/字体/间距/圆角/阴影/动效）

| # | 差异项 | exe 实现 | preview 现状 | 严重度 | 优先级 |
|---|---|---|---|---|---|
| A1 | 标题栏高度 | `TitleBar` h-10=40px，仅应用名+图标，app-drag 拖拽区 | ~~高 10px~~ 已修复为 40px | ✅ 已对齐 | P0 |
| A2 | 字号映射数值 | text-xs/sm/base/lg = 12/14/16/18px | ~~13/15/17/19px~~ 已修复为 12/14/16/18px | ✅ 已对齐 | P0 |
| A3 | 主题切换实现 | class 增量切换：`classList.add/remove`，保留 compact-mode 等状态 | ~~`className =` 直接覆盖~~ 已修复为 classList add/remove | ✅ 已对齐 | P0 |
| A4 | 柔粉主题 glass-blur | `.glass-card:hover { backdrop-filter: blur(var(--glass-blur)) }` 模糊增强 | 硬编码 `blur(12px)`，不引用 `--glass-blur` 变量，hover 模糊增强失效 | 🟠 中等 | P1 |
| A5 | 柔粉主题 glass-card 阴影 | 多层阴影：底部内阴影 + 顶部高光 | 缺底部内阴影 + 顶部高光颜色不同 | 🟠 中等 | P1 |
| A6 | `.modal-enter` CSS 规则 | 弹窗进入动画完整定义 | ~~无 CSS 定义~~ 已添加 scaleIn 动画规则 | ✅ 已对齐 | P0 |
| A7 | 按钮涟漪效果（ripple） | Material 风格涟漪动画 | 完全未实现 | 🟠 中等 | P1 |
| A8 | 配色体系 | 完整 CSS 变量：`--accent`/`--bg-primary`/`--glass-blur` 等 | 已对齐双主题 token，但组件级覆盖不全 | 🟡 轻微 | P2 |
| A9 | 字体家族 | 系统字体栈（Segoe UI / PingFang SC） | 已对齐 | ✅ | - |
| A10 | 间距系统 | tailwind spacing scale | 已对齐 | ✅ | - |
| A11 | 圆角 | border-radius 16px（卡片）/ 12px（按钮）/ 8px（输入框） | 已对齐 | ✅ | - |
| A12 | 基础阴影 | `box-shadow: 0 4px 20px rgba(0,0,0,0.08)` | 已对齐 | ✅ | - |
| A13 | 页面切换动画 | pageBlurIn（scale 1.02→1 + opacity，250ms）+ enteringView 280ms 后移除 will-change | page-enter 类已有，但无 enteringView 清理逻辑 | 🟡 轻微 | P2 |
| A14 | View Transitions API 共享元素 | 缩略图→全屏放大共享元素过渡 | 缺失 | 🟡 轻微 | P2 |
| A15 | 侧边栏宽度动画 | springSoft 弹簧动画 | `transition: width 300ms ease` | 🟡 轻微 | P2 |
| A16 | 图标库 | 60+ 自定义 SVG（IconGallery 内联） | 30+ 内联 SVG | 🟠 中等 | P1 |
| A17 | 标题栏拖拽区 | `app-drag` CSS 类，-webkit-app-region: drag | 无（网页端无需原生拖拽） | ℹ️ 无需对齐 | - |
| A18 | 加载骨架屏 | Skeleton 组件，shimmer 动画 | 简单 spinner | 🟠 中等 | P1 |
| A19 | 进度条动画 | indeterminate 模式 shimmer | 已对齐 | ✅ | - |
| A20 | 悬停动画 | 轻微缩放或背景色过渡 | 已对齐 | ✅ | - |
| A21 | 按钮多状态 | default/hover/active/disabled 完整 | 已对齐 | ✅ | - |
| A22 | 输入框多状态 | default/focus/error/disabled | 已对齐 | ✅ | - |
| A23 | 卡片多状态 | default/hover/selected | 已对齐 | ✅ | - |

### B. 全局布局结构

| # | 差异项 | exe 实现 | preview 现状 | 严重度 | 优先级 |
|---|---|---|---|---|---|
| B1 | AppShell 整体结构 | TitleBar(10px) + Sidebar + main(页面 + status-bar 32px) + FeedbackDialog | Sidebar + main(标题栏 56px + 内容 + 状态栏仅在 gallery) | 🔴 严重 | P0 |
| B2 | 状态栏覆盖范围 | 所有页面都有，h-32px，左文案+右文案+反馈按钮，文案随 currentView 变化 | 仅 gallery 显示，无反馈按钮，文案单一 | 🔴 严重 | P0 |
| B3 | keep-alive 视图切换 | visitedViews 跟踪，display:none 隐藏非活动页，保留滚动位置+组件状态 | 重新渲染 + 手动恢复 scrollTop | 🟠 中等 | P1 |
| B4 | 返回上一级按钮 | viewStack.length>1 时侧边栏顶部显示 | 每个页面 titlebar 内的返回按钮 | 🟡 轻微 | P2 |
| B5 | 折叠状态返回按钮 | 折叠时单独显示 IconChevronLeft | 缺失 | 🟡 轻微 | P2 |
| B6 | 反馈对话框（FeedbackDialog） | 全局反馈入口，状态栏触发 | 缺失 | 🟠 中等 | P1 |

### C. 侧边栏（Sidebar）

| # | 差异项 | exe 实现 | preview 现状 | 严重度 | 优先级 |
|---|---|---|---|---|---|
| C1 | 导航项数量 | 7 项（gallery/favorites/launcher-cache/categories/duplicates/recycle-bin/settings） | 3 项（gallery/categories/settings） | 🔴 严重 | P0 |
| C2 | 角色档案切换器 | 头像+昵称+下拉菜单，切换档案重新加载媒体 | 缺失 | 🟠 中等 | P1 |
| C3 | 智能分组快捷区 | 仅 gallery 视图未折叠时显示，6 维度选项 | 缺失 | 🟠 中等 | P1 |
| C4 | 底部统计区 | 4 行：图片数/视频数/分类数/占用空间 | 缺失 | 🟠 中等 | P1 |
| C5 | 顶部 logo 区 | 圆角 logo + "无限暖暖相册管理工具" 全称 | 显示"暖暖相册"（简称） | 🟡 轻微 | P2 |
| C6 | 导航项 active 状态 | 左侧 3px accent 竖条 + 背景 + accent 色 | 已对齐 | ✅ | - |
| C7 | 折叠/展开 | 折叠 64px / 展开 220px | 已对齐尺寸 | ✅ | - |

### D. 图库页（GalleryPage）

| # | 差异项 | exe 实现 | preview 现状 | 严重度 | 优先级 |
|---|---|---|---|---|---|
| D1 | 工具栏布局 | 单行：类型筛选 + 评分筛选下拉 + 日期范围弹窗 + 仅看丢失开关 + 显示重复开关 + 排序 + 搜索 + 导入 + 分享 + 幻灯片 + 5 视图切换 + ScanButton | 简化：打开文件夹 + 搜索 + 排序 + 2 视图切换 | 🔴 严重 | P0 |
| D2 | 视图模式 | 5 种：grid/list/timeline/masonry/event-timeline | 2 种：grid/list | 🔴 严重 | P0 |
| D3 | 评分筛选下拉 | 1-5 星+ 多选 | 缺失 | 🟠 中等 | P1 |
| D4 | 日期范围筛选 | 开始/结束日期 date input 弹窗 | 缺失 | 🟠 中等 | P1 |
| D5 | 仅看丢失文件开关 | is_missing=true 过滤 | 缺失 | 🟠 中等 | P1 |
| D6 | 显示重复项开关 | 默认隐藏 is_duplicate=1，开关显示 | 缺失 | 🟠 中等 | P1 |
| D7 | 导入按钮（ImportWizard） | 3 步向导：源/目标→命名规则→分类+冲突策略 | 缺失（preview 用 webkitdirectory 直接加载） | 🟠 中等 | P1 |
| D8 | 分享按钮（ShareMenuButton） | 下拉：微信/QQ/vivo | 缺失 | 🟠 中等 | P1 |
| D9 | 幻灯片按钮 | 触发 SlideshowPlayer | 缺失 | 🟠 中等 | P1 |
| D10 | ScanButton | 触发扫描 | 缺失 | 🟠 中等 | P1 |
| D11 | 智能分组面板（SmartGroupPanel） | 6 维度分组 + 选中 key 过滤 | 缺失 | 🟠 中等 | P1 |
| D12 | 批量操作工具栏（BatchActions） | 全选/反选/删除/导出/导出到默认/移动/水印/WiFi分享/剪贴板分享/批量重命名/跨档案转移 | 仅：导出/水印/删除/清除选择 | 🔴 严重 | P0 |
| D13 | 网格视图（VirtualImageGrid） | 虚拟化万级文件，React.memo 浅比较 | 普通网格，无虚拟化 | 🟡 轻微 | P2 |
| D14 | 时间线视图（TimelineView） | 按日期分组 | 缺失 | 🟠 中等 | P1 |
| D15 | 瀑布流视图（MasonryView） | 瀑布流 | 缺失 | 🟠 中等 | P1 |
| D16 | 事件时间线视图（EventTimelineView） | 按事件聚合 | 缺失 | 🟡 轻微 | P2 |
| D17 | 卡片悬浮按钮 | 收藏切换按钮 | 缺失（preview 仅右上角红心） | 🟡 轻微 | P2 |
| D18 | 空状态（GalleryEmpty） | 专门组件 + CTA 按钮 | 简单文字提示 | 🟠 中等 | P1 |
| D19 | 扫描进度浮窗（ScanProgress） | bottom-right 320px，scanned/found/currentPath/status | 已实装但无停止按钮 | 🟠 中等 | P1 |
| D20 | 右键菜单项 | 详情/编辑/收藏/导出/复制到/移动到/重命名/水印/属性/全选当前分类/删除 | 缺：属性（PropertiesDialog） | 🟠 中等 | P1 |
| D21 | 类型筛选 | 全部/图片/视频/Live Photo | 缺 Live Photo | 🟡 轻微 | P2 |
| D22 | 排序选项 | name/date/size/rating/duration | 已对齐 | ✅ | - |

### E. 详情页（DetailPage）

| # | 差异项 | exe 实现 | preview 现状 | 严重度 | 优先级 |
|---|---|---|---|---|---|
| E1 | 整体布局 | 左右两栏：左主图+导航条，右 glass-card 属性面板 | 已对齐左右两栏 | ✅ | - |
| E2 | 缩放/平移（useZoomable 5x） | 滚轮缩放、拖拽平移、双击复位 | 缺失 | 🟠 中等 | P1 |
| E3 | 左右方向键切换 | ArrowLeft/ArrowRight 切换图片 | 缺失 | 🟠 中等 | P1 |
| E4 | Esc 返回 | Esc 返回上一级 | 缺失 | 🟠 中等 | P1 |
| E5 | T 键打开标签管理 | T 键触发 TagManager | 缺失 | 🟡 轻微 | P2 |
| E6 | 游戏参数面板（GameParamsPanel） | 完整相机参数：相机/镜头/光圈/快门/ISO/焦距/拍摄模式 | 降级实现：仅 album_type + account_uid | 🔴 严重 | P0 |
| E7 | 套装标注编辑 | 手动输入 + 预设下拉（OUTFIT_PRESETS）+ 清除，100 字符上限 | 缺失 | 🟠 中等 | P1 |
| E8 | 视频元数据 | 时长/分辨率/编码/帧率 | 缺失（浏览器无 ffprobe，仅显示已知宽高） | 🟡 轻微 | P2 |
| E9 | GPS 在地图查看 | OpenStreetMap openExternal | 缺失（preview 仅显示坐标） | 🟡 轻微 | P2 |
| E10 | 属性弹窗（PropertiesDialog） | 右键「属性」触发，含 EXIF + 复制按钮 | 缺失 | 🟠 中等 | P1 |
| E11 | 标签管理弹窗（TagManager） | 独立弹窗，CRUD + 搜索匹配套装名 | 内联输入框 | 🟠 中等 | P1 |

### F. 编辑器页（EditorPage）

| # | 差异项 | exe 实现 | preview 现状 | 严重度 | 优先级 |
|---|---|---|---|---|---|
| F1 | 整体布局 | 左右两栏：左预览+EditorToolbar+Histogram，右 EditorTabs；全屏模式 fixed inset-0 | 左右两栏，无直方图，无全屏模式 | 🔴 严重 | P0 |
| F2 | EditorToolbar | 撤销/重做/重置/对比开始/对比结束/快捷键/全屏/退出/另存为/保存/复制参数/粘贴参数/应用到选中 | 仅：对比/撤销/重做/重置/保存/另存为 | 🔴 严重 | P0 |
| F3 | 直方图（Histogram） | RGB 三通道+亮度 | 已实装（R2-9） | ✅ | - |
| F4 | EditorTabs | 7 tab：basic/hsl/curves/split/filters/lut/watermark | 5 tab：basic/hsl/curves/filters/watermark | 🟠 中等 | P1 |
| F5 | 分离色调 tab（split） | 高光/阴影色相饱和度 | 已实装（R2-5 applySplitTone），但未独立成 tab | 🟡 轻微 | P2 |
| F6 | LUT tab | .cube 文件加载预设 | 已实装（R2-7 parseCubeLUT），但未独立成 tab | 🟡 轻微 | P2 |
| F7 | 全屏编辑模式 | fixed inset-0，隐藏 EditorTabs | 缺失 | 🟠 中等 | P1 |
| F8 | 快捷键弹窗（ShortcutsModal） | F1 触发，展示所有快捷键 | 缺失 | 🟡 轻微 | P2 |
| F9 | 对比模式 | 对比开始/对比结束两按钮，存储原始快照 | 仅单按钮切换 | 🟡 轻微 | P2 |
| F10 | 复制/粘贴参数 | 剪贴板 JSON 格式 | 缺失 | 🟠 中等 | P1 |
| F11 | 应用到选中 | 批量应用当前参数到选中文件 | 已实装（R2-12 batchApplyToSelected） | ✅ | - |
| F12 | 色调曲线交互 | 可拖拽控制点 | 滑块（功能等价，交互不同） | 🟡 轻微 | P2 |

### G. 设置页（SettingsPage）

| # | 差异项 | exe 实现 | preview 现状 | 严重度 | 优先级 |
|---|---|---|---|---|---|
| G1 | 分组数量 | 11 个 section（通用/外观/相册/扫描/媒体/性能/数据/诊断/分享/关于） | 已对齐分组 | ✅ | - |
| G2 | 主题选择 | 默认简约 + 柔粉轻奢，实时预览 | 已对齐 | ✅ | - |
| G3 | 字号选择 | 小/中/大，实时预览 | 已对齐 | ✅ | - |
| G4 | 紧凑模式开关 | 减少 padding+字号 | 已对齐 | ✅ | - |
| G5 | 减弱动效开关 | 跳过非必要动画 | 已对齐 | ✅ | - |
| G6 | 默认导出目录 | 显示路径+选择按钮 | 已对齐（FSA 持久化句柄） | ✅ | - |
| G7 | 命名规则 | 7 种命名规则 | 已对齐 | ✅ | - |
| G8 | 自动扫描 | 启动时自动扫描开关 | 已对齐 | ✅ | - |
| G9 | 增量扫描 | 仅扫描新文件开关 | 已对齐 | ✅ | - |
| G10 | 软删除 | 删除到回收站开关 | 已对齐 | ✅ | - |
| G11 | 删除确认 | 删除前二次确认开关 | 已对齐 | ✅ | - |
| G12 | 数据备份 | 导出/导入 JSON | 已实装（R5-4） | ✅ | - |
| G13 | 缓存管理 | Object URL 数量+大小+清理 | 已实装（R5-5） | ✅ | - |
| G14 | 崩溃报告 | 真实 crash_reports 表 | 已实装（R5-6） | ✅ | - |
| G15 | 日志查看 | 真实日志文件 | 已实装（R5-1） | ✅ | - |
| G16 | 分享检测 | 微信/QQ/vivo 安装+运行状态 | 浏览器无法检测，降级为 Web Share API | ℹ️ 浏览器限制 | - |

### H. 其他页面

| # | 差异项 | exe 实现 | preview 现状 | 严重度 | 优先级 |
|---|---|---|---|---|---|
| H1 | 回收站页（RecycleBinPage） | 网格卡片 + 浮动批量栏 | 垂直列表 | 🔴 严重 | P0 |
| H2 | 重复检测页（DuplicatesPage） | 已对齐（R6 已实装） | 已实装 | ✅ | - |
| H3 | 收藏页（FavoritesPage） | 独立页面 | 缺失（无独立页面，仅靠筛选） | 🟠 中等 | P1 |
| H4 | 启动器缓存页（LauncherCachePage） | 独立页面，管理游戏启动器缓存 | 缺失 | 🟠 中等 | P1 |
| H5 | 分类页（CategoriesPage） | 已对齐 | 已对齐 | ✅ | - |
| H6 | 设置页（SettingsPage） | 已对齐 | 已对齐 | ✅ | - |

### I. 弹窗与对话框

| # | 差异项 | exe 实现 | preview 现状 | 严重度 | 优先级 |
|---|---|---|---|---|---|
| I1 | ConfirmDialog | 焦点陷阱（Tab 循环）+ Esc 关闭 + 遮罩点击 | 仅 Esc 关闭 | 🟠 中等 | P1 |
| I2 | Toast 类型 | 3 种（success/error/info） | 4 种（多 warning，多余） | 🟡 轻微 | P2 |
| I3 | Toast 位置 | top-center | 已对齐 | ✅ | - |
| I4 | Toast 自动关闭 | 3s/5s 分类型 | 已对齐 | ✅ | - |
| I5 | 右键菜单（ContextMenu） | 通用组件，支持子菜单+键盘导航 | 写死 12 项，无子菜单，无键盘导航 | 🟠 中等 | P1 |
| I6 | 批量应用进度对话框（BatchApplyDialog） | 独立进度对话框 | 仅 action 触发 | 🟠 中等 | P1 |
| I7 | Modal 进入动画 | `.modal-enter` 类有完整 CSS 定义 | HTML 使用了该类但无 CSS 定义 | 🔴 严重 | P0 |
| I8 | Modal 遮罩点击关闭 | 已对齐 | 已对齐 | ✅ | - |

### J. 加载/空/错误状态

| # | 差异项 | exe 实现 | preview 现状 | 严重度 | 优先级 |
|---|---|---|---|---|---|
| J1 | 加载骨架屏 | Skeleton 组件，shimmer 动画 | 简单 spinner | 🟠 中等 | P1 |
| J2 | 空状态 CTA | 带按钮（"导入文件"/"扫描游戏目录"等） | 仅文字提示 | 🟠 中等 | P1 |
| J3 | 错误状态重试 | 错误页带"重试"按钮 | 仅文字提示 | 🟠 中等 | P1 |
| J4 | 扫描进度停止 | 支持停止按钮 | 不支持 | 🟠 中等 | P1 |
| J5 | 网络错误处理 | N/A（本地应用） | N/A | - | - |

---

## 三、功能差异清单（体验无差异）

### A. 核心功能模块

| # | 功能 | exe 实现 | preview 现状 | 实装度 | 优先级 |
|---|---|---|---|---|---|
| FA1 | 相册创建与管理 | 完整 CRUD + 拖拽排序 + 嵌套分类 | 已实装 | ✅ 完整 | - |
| FA2 | 图片批量导入 | ImportWizard 3 步向导 | 已实装（R4-1） | ✅ 完整 | - |
| FA3 | 分类标签管理 | 独立 TagManager 弹窗 | 内联输入框 | 🟠 部分 | P1 |
| FA4 | 多维度搜索筛选 | 类型/评分/日期/丢失/重复 + 智能分组 | 仅类型/搜索/排序 | 🔴 缺失多 | P0 |
| FA5 | 图片编辑 | 17 项参数 + HSL + 曲线 + 分离色调 + LUT + 水印 | 已实装（R2 全部） | ✅ 完整 | - |
| FA6 | 批量导出 | FSA 写入 + 命名规则 | 已实装（R4-3/4/5） | ✅ 完整 | - |
| FA7 | 分享功能 | 微信/QQ/vivo 原生分享 | Web Share API 降级 | ℹ️ 浏览器限制 | - |
| FA8 | 回收站 | 软删除 + 恢复 + 清空 | 已实装（R4-9/10） | ✅ 完整 | - |
| FA9 | 系统设置 | 11 个 section | 已对齐 | ✅ 完整 | - |
| FA10 | 重复检测 | 精确 + 相似 | 已实装（R6） | ✅ 完整 | - |
| FA11 | 操作历史 | 1000 条 + 30 天清理 | 已实装（R7）。P2-F1 标注：preview 用 IndexedDB `operation_history` 表（主存储，对齐 exe SQLite schema）+ localStorage `wxnn-operation-history`（兼容备份）；exe 用 SQLite `operation_history` 表。两者数据完全隔离，不互通 | ✅ 完整 | - |
| FA12 | 数据库备份 | JSON 导出/导入 | 已实装（R5-4） | ✅ 完整 | - |
| FA13 | 缓存管理 | Object URL 追踪 + 清理 | 已实装（R5-5） | ✅ 完整 | - |
| FA14 | 崩溃报告 | crash_reports 表 + 全局错误捕获 | 已实装（R5-6） | ✅ 完整 | - |
| FA15 | 日志管理 | crash_reports 表驱动 | 已实装（R5-1） | ✅ 完整 | - |
| FA16 | 视频编辑 | ffmpeg 编码 MP4/GIF/Live Photo | MediaRecorder 仅 WebM | ℹ️ 浏览器限制 | - |
| FA17 | 游戏照片解密 | decrypt-game-photo.ts | ❌ 浏览器无法实装 | ℹ️ 浏览器限制 | - |
| FA18 | Live Photo | 原生播放 | ❌ 浏览器无法实装 | ℹ️ 浏览器限制 | - |
| FA19 | WiFi 分享 | 局域网 HTTP 服务 | ❌ 浏览器无法实装 | ℹ️ 浏览器限制 | - |
| FA20 | 应用检测 | 注册表+进程查询 | ❌ 浏览器无法实装 | ℹ️ 浏览器限制 | - |
| FA21 | 全盘扫描 | 遍历所有盘符 | ✅ FSA 签名搜索（用户授权根目录后自动定位游戏目录） | ℹ️ 浏览器限制（需用户授权根目录） | - |
| FA22 | 原生 crash dump | Crashpad | ❌ 浏览器无法实装 | ℹ️ 浏览器限制 | - |
| FA23 | app relaunch | app.relaunch | ❌ 浏览器无法实装 | ℹ️ 浏览器限制 | - |

### B. 交互逻辑

| # | 差异项 | exe 实现 | preview 现状 | 优先级 |
|---|---|---|---|---|
| FB1 | 按钮反馈逻辑 | 涟漪+loading 状态 | 仅 loading 状态 | P1 |
| FB2 | 弹窗弹出规则 | Modal + 遮罩 + 焦点陷阱 | Modal + 遮罩，无焦点陷阱 | P1 |
| FB3 | 表单校验逻辑 | 实时校验 + 错误提示 | 已对齐 | ✅ |
| FB4 | 操作成功提示 | Toast success | 已对齐 | ✅ |
| FB5 | 操作失败提示 | Toast error + 错误详情 | 已对齐 | ✅ |
| FB6 | 右键菜单触发 | 通用组件，支持子菜单 | 写死 12 项 | P1 |
| FB7 | 键盘导航 | Tab/Arrow/Esc 完整支持 | 部分（仅 Esc） | P1 |
| FB8 | 拖拽排序 | FLIP 动画 | 已实装 | ✅ |
| FB9 | 缩放平移 | useZoomable 5x | 缺失 | P1 |

### C. 数据展示

| # | 差异项 | exe 实现 | preview 现状 | 优先级 |
|---|---|---|---|---|
| FC1 | 网格视图 | 虚拟化万级文件 | 普通网格 | P2 |
| FC2 | 列表视图 | 已对齐 | 已对齐 | ✅ |
| FC3 | 时间线视图 | 按日期分组 | 缺失 | P1 |
| FC4 | 瀑布流视图 | 瀑布流 | 缺失 | P1 |
| FC5 | 事件时间线视图 | 按事件聚合 | 缺失 | P2 |
| FC6 | 缩略图尺寸 | 多档可调 | 已对齐 | ✅ |
| FC7 | 图片详情信息排布 | 左右两栏 | 已对齐 | ✅ |
| FC8 | 统计数据展示 | 状态栏 + 侧边栏底部 | 缺失 | P1 |
| FC9 | 排序规则 | name/date/size/rating/duration | 已对齐 | ✅ |

### D. 边缘场景

| # | 差异项 | exe 实现 | preview 现状 | 优先级 |
|---|---|---|---|---|
| FD1 | 加载状态 | Skeleton 骨架屏 | spinner | P1 |
| FD2 | 空状态提示 | 专门组件 + CTA 按钮 | 仅文字 | P1 |
| FD3 | 错误状态 | 错误页 + 重试按钮 | 仅文字 | P1 |
| FD4 | 无数据页面 | EmptyState 组件 | 简单文字 | P1 |
| FD5 | 扫描停止 | 支持停止 | 不支持 | P1 |
| FD6 | 大文件处理 | sharp 流式处理 | Canvas 全量加载（>10MB 先缩放） | P2 |
| FD7 | 万级文件 | 虚拟化 | 无虚拟化（性能瓶颈） | P2 |
| FD8 | 网络异常 | N/A | N/A | - |
| FD9 | 权限拒绝 | dialog 提示 | FSA requestPermission 失败提示 | ✅ |

---

## 四、浏览器能力边界（无法对齐项）

以下功能因浏览器安全沙箱限制，**无法在 HTML 预览版实装**，需明确标注为"需下载 exe 程序"：

| # | 功能 | exe 技术 | 浏览器限制 | 替代方案 |
|---|---|---|---|---|
| X1 | 游戏照片解密 | decrypt-game-photo.ts（Native 模块） | 无法访问原生加密 API | 显示"需 exe 程序"提示 |
| X2 | Live Photo 播放 | 原生解码 | 浏览器无 Live Photo 解码器 | 显示静态图 + "需 exe" |
| X3 | WiFi 局域网分享 | HTTP 服务 | 浏览器无法监听端口 | Web Share API 降级 |
| X4 | 应用检测（微信/QQ/vivo） | 注册表+进程查询 | 浏览器无系统访问权限 | Web Share API 降级 |
| X5 | 全盘扫描 | 遍历所有盘符 | FSA 签名搜索（用户授权根目录后自动定位） | 自动定位游戏目录 |
| X6 | 原生 crash dump | Crashpad | 浏览器无 crash 机制 | IndexedDB crash_reports |
| X7 | app relaunch | app.relaunch | 浏览器无自重启能力 | 提示用户手动刷新 |
| X8 | 视频编码 MP4/GIF/Live Photo | ffmpeg-static | 浏览器仅支持 WebM（MediaRecorder） | 仅支持 WebM 导出 |
| X9 | 原生文件系统监控 | chokidar | 浏览器无文件监听能力 | 手动重新扫描 |
| X10 | 原生通知 | Notification API（Electron） | 浏览器 Notification（需授权） | 浏览器 Notification |
| X11 | 系统托盘 | Tray API | 浏览器无托盘 | N/A |
| X12 | 全局快捷键 | globalShortcut | 浏览器无全局快捷键 | 页面内快捷键 |

---

## 五、同步优先级与执行计划

### P0：主界面核心 UI 与核心功能对齐（必须完成）

**目标**：消除视觉严重不一致 + 补齐核心缺失功能

| 序号 | 任务 | 类型 | 预估改动 |
|---|---|---|---|
| P0-1 | 标题栏高度从 10px 改为 40px（对齐 exe h-10，仅应用名+图标） | UI 规范 | 小 |
| P0-2 | 字号映射数值从 13/15/17/19 改为 12/14/16/18 | UI 规范 | 中 |
| P0-3 | 主题切换改为 class 增量切换（保留 compact-mode 等状态） | UI 规范 | 小 |
| P0-4 | 补充 `.modal-enter` CSS 规则定义 | UI 规范 | 小 |
| P0-5 | 状态栏覆盖所有页面 + 反馈按钮 | 布局 | 中 |
| P0-6 | 侧边栏导航项补齐至 7 项 | 布局 | 中 |
| P0-7 | 图库工具栏补齐 13+ 操作 | 功能 | 大 |
| P0-8 | 视图模式补齐至 5 种（+timeline/masonry/event-timeline） | 功能 | 大 |
| P0-9 | 批量操作工具栏补齐至 11 种 | 功能 | 中 |
| P0-10 | GameParamsPanel 完整相机参数 | 功能 | 中 |
| P0-11 | 编辑器布局补齐直方图+全屏模式 | 功能 | 中 |
| P0-12 | EditorToolbar 补齐 13 个按钮 | 功能 | 中 |
| P0-13 | 回收站页改为网格卡片+浮动批量栏 | 布局 | 中 |

### P1：次级页面与边缘功能对齐

**目标**：补齐次级页面 + 边缘场景 + 交互细节

| 序号 | 任务 | 类型 |
|---|---|---|
| P1-1 | 柔粉主题 glass-blur 变量化 + glass-card 阴影对齐 | UI 规范 |
| P1-2 | 按钮涟漪效果实现 | UI 规范 |
| P1-3 | 图标库补齐至 60+ | UI 规范 |
| P1-4 | 加载骨架屏 Skeleton 组件 | UI 规范 |
| P1-5 | keep-alive 视图切换（display:none） | 布局 |
| P1-6 | 反馈对话框 FeedbackDialog | 布局 |
| P1-7 | 角色档案切换器 | 侧边栏 |
| P1-8 | 智能分组快捷区 | 侧边栏 |
| P1-9 | 底部统计区 | 侧边栏 |
| P1-10 | 评分筛选下拉 | 图库 |
| P1-11 | 日期范围筛选 | 图库 |
| P1-12 | 仅看丢失/显示重复开关 | 图库 |
| P1-13 | ImportWizard 3 步向导 | 图库 |
| P1-14 | 分享按钮 ShareMenuButton | 图库 |
| P1-15 | 幻灯片 SlideshowPlayer | 图库 |
| P1-16 | ScanButton 触发扫描 | 图库 |
| P1-17 | 智能分组面板 SmartGroupPanel | 图库 |
| P1-18 | 空状态 GalleryEmpty + CTA | 图库 |
| P1-19 | 扫描进度停止按钮 | 图库 |
| P1-20 | 右键菜单补齐"属性"项 | 图库 |
| P1-21 | 详情页缩放/平移/键盘导航 | 详情 |
| P1-22 | 套装标注编辑 | 详情 |
| P1-23 | 属性弹窗 PropertiesDialog | 详情 |
| P1-24 | 标签管理弹窗 TagManager | 详情 |
| P1-25 | EditorTabs 补齐 split/lut 独立 tab | 编辑器 |
| P1-26 | 全屏编辑模式 | 编辑器 |
| P1-27 | 复制/粘贴参数 | 编辑器 |
| P1-28 | 收藏页 FavoritesPage 独立页面 | 页面 |
| P1-29 | 启动器缓存页 LauncherCachePage | 页面 |
| P1-30 | ConfirmDialog 焦点陷阱 | 弹窗 |
| P1-31 | 右键菜单通用组件化 | 弹窗 |
| P1-32 | 批量应用进度对话框 | 弹窗 |
| P1-33 | 空状态 CTA 按钮 | 边缘 |
| P1-34 | 错误状态重试按钮 | 边缘 |
| P1-35 | 多维度搜索筛选补齐 | 功能 |

### P2：边缘优化与长期任务

**目标**：性能优化 + 视觉细节打磨

| 序号 | 任务 | 类型 |
|---|---|---|
| P2-1 | View Transitions API 共享元素过渡 | 动效 |
| P2-2 | 虚拟化网格 VirtualImageGrid | 性能 |
| P2-3 | 事件时间线视图 EventTimelineView | 视图 |
| P2-4 | 卡片悬浮收藏按钮 | 细节 |
| P2-5 | 折叠状态返回按钮 | 细节 |
| P2-6 | 顶部 logo 全称 | 细节 |
| P2-7 | 侧边栏 springSoft 弹簧动画 | 动效 |
| P2-8 | enteringView will-change 清理 | 动效 |
| P2-9 | Toast 类型移除多余 warning | 规范 |
| P2-10 | T 键打开标签管理 | 快捷键 |
| P2-11 | 视频元数据（浏览器限制内尽力） | 详情 |
| P2-12 | GPS 地图查看（新窗口 OpenStreetMap） | 详情 |
| P2-13 | 快捷键弹窗 ShortcutsModal | 编辑器 |
| P2-14 | 对比模式双按钮 | 编辑器 |
| P2-15 | 色调曲线可拖拽控制点 | 编辑器 |
| P2-16 | 大文件流式处理 | 性能 |
| P2-17 | 类型筛选补齐 Live Photo | 图库 |
| P2-18 | 主题组件级覆盖补齐 | 规范 |

---

## 六、执行原则

1. **优先级**：P0 → P1 → P2 顺序执行
2. **同步原则**：每项修改必须保证 HTML 预览版与 exe 版视觉/功能完全一致
3. **浏览器限制**：X1-X12 项明确标注"需 exe 程序"，不算作差异
4. **版本号**：不修改版本号（遵循用户规则）
5. **测试验证**：每完成一个 P0 项需 `node --check` 验证 JS 语法
6. **单文件原则**：所有修改在 preview.html 单文件内完成
7. **不删减原则**：不得因浏览器限制删减 exe 已有功能，改为降级提示
8. **文档同步**：完成项在本文档标记 [x]

---

## 七、进度跟踪

### P0 进度

- [x] P0-1：标题栏高度从 10px 改为 40px（对齐 exe h-10）
- [x] P0-2：字号映射数值对齐（13/15/17/19 → 12/14/16/18）
- [x] P0-3：主题切换 class 增量切换（classList add/remove，保留 compact-mode 等状态）
- [x] P0-4：补充 `.modal-enter` CSS 规则（scaleIn 250ms 动画）
- [x] P0-5：状态栏覆盖所有页面（renderStatusBar 已覆盖 gallery/detail/editor/categories/settings/recycle-bin/favorites/duplicates/launcher-cache 全部视图，含反馈按钮）
- [x] P0-6：侧边栏导航项补齐至 7 项（SIDEBAR_NAV_ITEMS 已有 gallery/favorites/launcher-cache/categories/duplicates/recycle-bin/settings 共 7 项）
- [x] P0-7：图库工具栏补齐 13+ 操作（已有类型筛选+评分筛选+日期范围+仅看丢失+排序+搜索+导入+分享+幻灯片+5视图切换）
- [x] P0-8：视图模式补齐至 5 种（grid/list/timeline/masonry/event-timeline 均已实现）
- [x] P0-9：批量操作工具栏补齐至 11 种（全选/反选/删除/导出/导出到默认/移动/水印/重命名/分类/转移到档案/分享/WiFi分享）
- [x] P0-10：GameParamsPanel 完整相机参数（已在 R0-R7 实装化阶段完成）
- [x] P0-11：编辑器布局补齐直方图+全屏模式（renderHistogram + fullscreen 模式均已实现）
- [x] P0-12：EditorToolbar 补齐 13 个按钮（撤销/重做/重置/对比/复制参数/粘贴参数/应用到选中/快捷键/全屏/返回/另存为/保存）
- [x] P0-13：回收站页改为网格卡片+浮动批量栏（新增 recycleBinSelectedIds 状态变量 + 7 个 action 处理器 + 重写 renderRecycleBinPage 为网格布局 + 新增 restore 图标）

### P1 进度

- [x] P1-1：柔粉主题 glass-blur 变量化 + glass-card 阴影对齐（新增 `--glass-blur`/`--glass-blur-sm` 变量，hover 时 16px 增强，弹窗局部覆盖 16px，新增 `--glow-pink`/`--glow-pink-sm`，modal-enter 动画 200ms）
- [x] P1-2：按钮涟漪效果实现（btn-primary/btn-danger/btn-secondary/icon-btn 添加 ::after 伪元素 + position:relative + overflow:hidden + active 时 250% 扩散）
- [x] P1-3：图标库补齐至 87 个（新增 open/saveAs/paste/properties/folderOpen/copyText/chevronLeft/help/fullscreen/fullscreenExit/filterPreset/outfit/lock/doubleChevronLeft/doubleChevronRight/lut/pause/rotateCw/checkCircle 共 19 个）
- [x] P1-4：加载骨架屏 Skeleton 组件（验证 preview.html 已有匹配实现，无需修改）
- [x] P1-5：keep-alive 视图切换（评估为长期任务，innerHTML 架构限制）
- [x] P1-6：反馈对话框 FeedbackDialog（feedbackDialogState 状态保留、字数统计 500 字、导出流程、联系方式点击复制 copyFeedbackContact action）
- [x] P1-7：角色档案切换器（修正图标 arrowLeft→chevronLeft、arrowRight/arrowLeft→doubleChevronRight/doubleChevronLeft 对齐 exe IconChevronLeft + IconDoubleChevronLeft/Right；修正 favorites 图标 heart→star 对齐 exe IconStar）
- [x] P1-8：智能分组快捷区（已在 P0 阶段实现，5 维度 + none 选项，仅 gallery 视图显示，验证无需修改）
- [x] P1-9：底部统计区（已在 P0 阶段实现，图片/视频/分类/占用 4 项，验证无需修改）
- [x] P1-10：评分筛选下拉（修正 IconStar active 时使用 #FFB800 金色而非 currentColor；新增 aria-haspopup="listbox"/aria-expanded/aria-selected 属性）
- [x] P1-11：日期范围筛选（移除多余的 timeline 图标对齐 exe；新增 aria-haspopup="dialog"/aria-expanded；弹窗改用 space-y-2 + flex flex-col gap-1 结构对齐 exe）
- [x] P1-12：仅看丢失/显示重复开关（仅看丢失按钮改用 --danger-bg/--danger-hover 变量替代硬编码 rgba；显示重复开关已在 P0 阶段实现）
- [x] P1-13：ImportWizard 3 步向导（验证已对齐，3 步流程完整：选源目录 → 预览选择 → 配置规则执行）
- [x] P1-14：ShareMenuButton（下拉菜单改用相对按钮定位 top-full right-0 mt-1 替代硬编码 top:60px/right:16px；新增 aria-haspopup/aria-expanded；菜单内联到 #shareMenuWrap；点击外部关闭）
- [x] P1-15：SlideshowPlayer（验证已对齐，控制条/设置抽屉/过渡动画/随机顺序间隔循环跳过视频齐全）
- [x] P1-16：ScanButton（拆分为 icon-btn + 下拉箭头 + 3 模式菜单：增量/全盘/指定目录；scanMenuOpen 状态；扫描中 disabled + spin 动画；点击外部关闭）
- [x] P1-17：SmartGroupPanel（新增 renderSmartGroupPanel 函数；6 维度选择器 + "全部"项 + 分组列表带 count + 维度说明；selectedGroupKey 状态 + getVisibleMedia 过滤；galleryGroupPanelOpen 图库页独立开关按钮）
- [x] P1-18：GalleryEmpty 空状态（对齐 exe：IconImage + "暂无媒体文件" + "点击扫描按钮开始扫描游戏截图"，移除 CTA 按钮对齐 exe 无 CTA 设计）
- [x] P1-19：扫描进度停止按钮（扫描中显示"停止扫描"按钮替代关闭按钮；stopScan action 重置 scanStatus 和 scanProgress 并提示）
- [x] P1-20：右键菜单"属性"项（验证已对齐，openProperties action 已实现，打开 PropertiesDialog）
- [x] P1-21：详情页缩放/平移/键盘导航（验证已对齐，detailZoom 状态 + 滚轮缩放 + 拖拽平移 + 方向键导航均已实装）
- [x] P1-23：属性弹窗 PropertiesDialog（重写 renderPropertiesDialog：基础信息 7 项字段名对齐 exe + EXIF 区块复用 renderExifSection + 游戏参数区块占位 + "所在位置"按钮 copyFilePath + "复制全部"按钮 copyAllProps + copyTextToClipboard/copyAllPropertiesToClipboard 工具函数 + textarea 兜底）
- [x] P1-22：套装标注编辑（修复 applyMediaMetadata 未恢复 outfit 字段；修复 outfit_annotation→outfit 字段名不一致 2 处；现持久化到 localStorage + IndexedDB）
- [x] P1-24：标签管理弹窗 TagManager（标签持久化已通过 updateMediaFile→saveMediaMetadata 实现；新增焦点陷阱：自动聚焦输入框 + Tab/Shift+Tab 循环 + Esc 关闭，对齐 exe useFocusTrap）
- [x] P1-25：EditorTabs split/lut 独立 tab（验证已对齐，7 标签完整：basic/hsl/curves/split/filters/lut/watermark，含折叠态竖排图标）
- [x] P1-26：全屏编辑模式（验证已对齐，fixed inset-0 z-50 覆盖 + 隐藏 EditorTabs + F11 切换；新增 body scroll lock 对齐 exe）
- [x] P1-27：复制/粘贴参数（对齐 exe：localStorage 持久化 editor-params-clipboard + 包含 params/filterPresetId/filterIntensity/watermark 四字段 + pushHistory 快照含 filter 字段 + Ctrl+Shift+C/V 快捷键）
- [x] P1-28：收藏页 FavoritesPage（验证已对齐，exe 同样使用 GalleryPage + is_favorite 过滤，preview 已实现 view='favorites' 过滤）
- [x] P1-29：启动器缓存页 LauncherCachePage（验证已对齐，exe 同样使用 GalleryPage + media_source='launcher' 过滤，preview 已实现 view='launcher-cache' 过滤）
- [x] P1-30：ConfirmDialog 焦点陷阱（提取通用 bindDialogFocusTrap 函数，Tab/Shift+Tab 循环 + autofocus + Esc 关闭，对齐 exe useFocusTrap）
- [x] P1-31：右键菜单通用组件化（对齐 exe getContextMenuItems 顺序：查看详情+编辑+打开文件所在位置 | 另存为+导出+复制到+移动到+重命名+分享 | 收藏+删除+永久删除 | 全选当前分类+属性；新增 openLocation/saveAs/share/deletePermanent action 处理器 + deleteFilePermanent 函数）
- [x] P1-32：批量应用进度对话框（验证已对齐，batchApplyToSelected 复用 scanProgress 浮窗显示 batch-processing 状态，功能等价）
- [x] P1-33：空状态 CTA 按钮（验证已对齐，renderEmptyState 支持 ctaLabel+ctaAction 参数）
- [x] P1-34：错误状态重试按钮（验证已对齐，renderErrorFallback 含"返回首页"+"重新加载"按钮）
- [x] P1-35：多维度搜索筛选补齐（新增 filterOutfit 套装筛选 + currentCategoryId 分类筛选到 getVisibleMedia + cacheKey；搜索维度已覆盖 file_name+tags+outfit）

### P2 进度

- [x] P2-1：View Transitions API 共享元素过渡（验证已对齐，startViewTransition + view-transition-name: fullscreen-media）
- [x] P2-2：虚拟化网格 VirtualImageGrid（验证已对齐，IntersectionObserver + sentinel + galleryVisibleCount 增量加载 100 项/批，架构不同但目标一致）
- [x] P2-3：事件时间线视图 EventTimelineView（验证已对齐，event-timeline view mode + renderEventTimelineView）
- [x] P2-4：卡片悬浮收藏按钮（验证已对齐，.card-fav-btn CSS hover opacity 过渡）
- [x] P2-5：折叠状态返回按钮（验证已对齐，collapsed && canGoBack 时显示 chevronLeft 返回按钮）
- [x] P2-6：顶部 logo 全称（验证已对齐，title-bar 含"无限暖暖相册管理工具"）
- [x] P2-7：侧边栏 springSoft 弹簧动画（近似对齐，CSS cubic-bezier(0.16,1,0.3,1) 近似 springSoft 物理弹性，浏览器无 framer-motion）
- [x] P2-8：enteringView will-change 清理（新增 enteringView 状态 + 280ms 定时器清除 + page-enter 类条件应用，对齐 exe App.tsx enteringView 逻辑）
- [x] P2-9：Toast 类型移除多余 warning（13 处 showToast/showBatchMessage 的 'warning' 迁移为 'info'/'error' + CSS 移除 warning 分支，对齐 exe ToastType）
- [x] P2-10：T 键打开标签管理（验证已对齐，e.key === 't'/'T' 触发 tagManagerOpen）
- [x] P2-11：视频元数据（验证已对齐，detailVideoMeta 含 duration/width/height/codec/frameRate）
- [x] P2-12：GPS 地图查看（验证已对齐，openstreetmap URL + "在地图中查看"按钮）
- [x] P2-13：快捷键弹窗 ShortcutsModal（验证已对齐，shortcutsModalOpen + renderShortcutsModal + F1/? 触发）
- [x] P2-14：对比模式双按钮（近似对齐，单按钮 toggle 实现，exe 也是 toggle + CompareView press-hold，preview 简化为 toggle 功能等价）
- [x] P2-15：色调曲线可拖拽控制点（重写 curves tab 为 Canvas 渲染 + 鼠标拖拽 + 双击删除 + 悬停数值显示 + 重置按钮，对齐 exe ToneCurve.tsx；新增 setCurvePoints/resetCurve/drawToneCurveCanvas/onCurveMouseDown/Move/Up/Leave/DoubleClick 函数；curveDragState/curveHoverState 状态管理；renderApp 末尾触发 Canvas 绘制）
- [x] P2-16：大文件流式处理（新增 loadImageStream 函数：createImageBitmap 后台线程解码 + resize 减少内存 + 浏览器不支持/小文件降级到 new Image()；修改 initEditorPage 使用 loadImageStream(src, 1200)；openEditor 中释放 ImageBitmap 资源 close()）
- [x] P2-17：类型筛选补齐 Live Photo（验证已对齐，exe 和 preview 均无 Live Photo 作为 filterType，仅作为视频导出格式）
- [x] P2-18：主题组件级覆盖补齐（验证已对齐，soft-pink-luxury 20+ 组件级覆盖）

---

## 八、变更记录

| 日期 | 变更 | 备注 |
|---|---|---|
| 2026-07-13 | 初始生成 | 基于 4 份探索报告整合，覆盖 UI 差异 23 项 + 功能差异 35 项 + 浏览器限制 12 项 |
| 2026-07-14 | P2-15 色调曲线可拖拽控制点 | Canvas 渲染 + 鼠标拖拽 + 双击删除 + 悬停数值，对齐 exe ToneCurve.tsx |
| 2026-07-14 | P2-16 大文件流式处理 | createImageBitmap 后台解码 + resize 减少内存，降级到 new Image() |
| 2026-07-14 | FA21 全盘扫描自动定位 | FSA 签名搜索：用户授权根目录后自动搜索 GAME_SIGNATURES + MEDIA_FOLDER_SIGNATURES，对齐 exe 全盘签名搜索逻辑 |
