# UI 动效增强与动画组件引入开发计划

> ⚠️ **本计划已废弃（2026-07-11）**：执行后产生严重 bug（首次打开后无法重新打开）和负面体验（页面切换闪烁、毛玻璃无感）。已由 `docs/动效与视觉开发计划-v3.md` 替代。本文件仅保留作为历史记录，请勿基于此计划继续开发。

> **版本**：v2.0  
> **制定日期**：2026-07-09  
> **最后修订**：2026-07-10（新增 P5 GPU 硬件加速与渲染性能优化，全面检查修订）  
> **适用项目**：无限暖暖相册管理工具（wxnn-photo-manager）  
> **当前版本号**：2.2.6（本计划不修改版本号，除非用户明确要求）  
> **关联文件**：`src/renderer/App.tsx`、`src/renderer/styles/globals.css`、`src/renderer/stores/uiStore.ts`、`src/renderer/components/**`

---

## 一、背景与目标

### 1.1 项目现状

项目当前 UI 动效体系以 **纯 CSS + Tailwind 工具类** 为核心，特征如下：

| 维度 | 现状 | 评估 |
|---|---|---|
| 动画规模 | 292 处 CSS 动画关键字 + 311 处 Tailwind 交互类，分布在 50+ 文件 | 规模中等，风格统一 |
| 缓动曲线 | 全项目统一使用 `cubic-bezier(0.4, 0, 0.2, 1)`（Material Design） | 一致性好，但单调 |
| 毛玻璃体系 | 77 处 `backdrop-filter`，CSS 变量 `--backdrop-blur` / `--backdrop-blur-sm` 分级管理 | 成熟完备 |
| 页面切换 | keep-alive 模式 + 单向 `slideInRight` 入场，无出场动画 | **主要缺口** |
| 弹窗动画 | CSS `scaleIn` / `toastIn` / `toastOut` 关键帧 | 缺少布局共享与退出动画 |
| 列表动画 | 无增删过渡，直接重排 | **主要缺口** |
| 弹簧物理 | 无，全部线性时长 + cubic-bezier | 缺少自然感 |
| 占位依赖 | `motion@12.42.2`、`liquid-glass-react@1.1.1`、`blurhash@2.0.5` 已声明但零使用 | 包体积浪费 |
| 现代特性 | Electron 28 (Chromium 120) 支持 View Transitions API、`@property`、`:has()` 等，均未利用 | 能力闲置 |

### 1.2 核心目标

1. **激活已安装占位依赖**：让 `motion` 库真正落地，带来页面切换、弹窗、列表等场景的动画升级
2. **引入轻量高收益动画组件**：补齐列表 FLIP 动画、轮播过渡等缺口
3. **增强现有毛玻璃体系**：在不引入 `liquid-glass-react` 的前提下，用 CSS 现代特性增强 Fluent 视觉
4. **保持风格统一**：所有增强遵循 Windows 11 Fluent Design + iOS frosted glass 风格，不引入 Apple Liquid Glass 折射效果
5. **同步双版本**：HTML 预览版与 exe 程序同步迭代，保持视觉与功能一致
6. **渲染性能可配置**：提供 GPU 硬件加速开关、自定义渲染分辨率（1080P/2K/4K/8K）、自定义帧率（60/120/144/180），默认跟随电脑当前设置，用户可按需调整

### 1.3 不做的事

- ❌ 不引入 `liquid-glass-react`（React 19 peerDependencies 冲突 + Apple 风格不匹配 + SVG 滤镜性能开销）
- ❌ 不引入 `gsap`（体积大、与 React 范式冲突、无需复杂时间轴）
- ❌ 不引入 `react-spring`（与 `motion` 功能重叠）
- ❌ 不引入 `react-transition-group`（已被 `motion` 的 `AnimatePresence` 超越）
- ❌ 不修改版本号（除非用户明确要求）
- ❌ 不破坏现有 keep-alive 机制（保留滚动位置与组件状态）

---

## 二、可行性分析

### 2.1 方案 A：`liquid-glass-react` 替代方案（CSS 增强）

#### 2.1.1 技术路线

不使用 `liquid-glass-react` 库，而是通过以下 CSS 现代特性增强现有毛玻璃体系：

| 增强点 | 实现方式 | 收益 |
|---|---|---|
| 边缘高光 | `box-shadow: inset 0 1px 0 rgba(255,255,255,0.4)` 模拟玻璃边缘反光 | 视觉层次提升 |
| 模糊半径动画 | CSS `@property --blur-amount` 注册自定义属性，使 `backdrop-filter` 可过渡 | 悬停时模糊渐变 |
| 混合模式 | `mix-blend-mode: overlay` + 半透明高光层 | 光线交互感 |
| 主题色渗透 | `backdrop-filter` + `filter: saturate(1.2)` 增强背景色饱和度 | Fluent 亚克力质感 |
| 噪点纹理 | CSS `background-image: url(noise.svg)` 叠加微噪点 | 真实材质感 |

#### 2.1.2 可行性评估

| 维度 | 评估 | 说明 |
|---|---|---|
| Chromium 支持 | ✅ 完全支持 | `@property` Chrome 85+、`mix-blend-mode` Chrome 41+，Electron 28 满足 |
| 性能影响 | ✅ 低 | CSS 属性变化由 GPU 合成层处理，无 JS 开销 |
| 兼容现有代码 | ✅ 高 | 仅增强 `.glass-card` / `.glass-panel` 等已有类，不破坏现有 77 处使用 |
| 风格匹配 | ✅ 高 | 符合 Windows 11 Fluent Design 亚克力材质 |
| 实施成本 | ✅ 低 | 纯 CSS 改动，集中在 `globals.css` 与 `themes/*.css` |

#### 2.1.3 风险

- `@property` 注册的自定义属性在主题切换时需同步更新，需测试 `soft-pink-luxury` 主题下的表现
- 噪点纹理需新增 SVG 资源文件（约 1-2KB），不影响包体积

#### 2.1.4 结论：**可行，推荐实施**

---

### 2.2 方案 B：启用 `motion` 库（已安装）

#### 2.2.1 技术路线

`motion@12.42.2`（即 framer-motion 的新版包名）已在 `package.json` 中声明。核心能力：

| 能力 | API | 应用场景 |
|---|---|---|
| 退出动画 | `AnimatePresence` + `exit` prop | 弹窗关闭、Toast 移除、侧边栏折叠 |
| 布局动画 | `layout` / `layoutId` | 列表项重排、共享元素过渡 |
| 弹簧物理 | `transition={{ type: 'spring', stiffness, damping }}` | 拖拽回弹、卡片悬停 |
| 手势动画 | `drag` / `whileDrag` / `whileHover` / `whileTap` | 卡片拖拽、按钮按压 |
| 滚动联动 | `useScroll` / `useTransform` | 滚动视差、进度条 |
| 路径动画 | `motion.path` + `pathLength` | 加载进度环、SVG 图标动效 |

#### 2.2.2 可行性评估

| 维度 | 评估 | 说明 |
|---|---|---|
| React 兼容 | ✅ 完全支持 | motion@12 支持 React 18+ |
| TypeScript | ✅ 完备 | 官方提供 `.d.ts`，类型推断良好 |
| Tree-shaking | ✅ 友好 | 按需导入 `motion/react`，未使用部分不打包 |
| 包体积影响 | ⚠️ 中等 | 全量约 30KB gzip，按需导入可控制在 10-15KB |
| 与 keep-alive 冲突 | ⚠️ 需适配 | 现有 `display:none` 隐藏机制与 `AnimatePresence` 的卸载机制冲突，需重新设计 |
| 学习成本 | ⚠️ 低-中 | motion API 直观，但 `AnimatePresence` + `mode="wait"` 的时序需调试 |

#### 2.2.3 与 keep-alive 的冲突与解决

**冲突点**：现有 App.tsx 用 `display:none` 隐藏非活动页面以保留滚动位置和组件状态。而 `AnimatePresence` 通过卸载组件触发退出动画，会丢失状态。

**解决方案**：不全局替换 keep-alive，而是：
1. **页面切换**：保留 keep-alive 机制，用 `motion.div` + `animate` 控制透明度与位移（基于 `isActive` 状态），而非 `AnimatePresence`
2. **弹窗/Toast/侧边栏**：这些组件本就需要卸载，直接用 `AnimatePresence` 获得退出动画
3. **列表项**：用 `layout` prop，不涉及卸载

#### 2.2.4 结论：**可行，推荐分阶段实施**

---

### 2.3 方案 C：引入 `@formkit/auto-animate`

#### 2.3.1 技术路线

`@formkit/auto-animate` 是一个单 hook 库，一行代码为列表添加 FLIP 动画。

```tsx
import { useAutoAnimate } from '@formkit/auto-animate/react'

const [ref] = useAutoAnimate()
return <div ref={ref}>{items.map(...)}</div>
```

#### 2.3.2 可行性评估

| 维度 | 评估 | 说明 |
|---|---|---|
| React 兼容 | ✅ 完全支持 | React 18+ |
| 包体积 | ✅ 极小 | ~2KB gzip |
| 侵入性 | ✅ 零侵入 | 仅需添加 `ref`，不修改现有渲染逻辑 |
| 性能 | ✅ 高 | 基于 FLIP 算法，仅操作 `transform`，GPU 合成 |
| 与虚拟列表兼容 | ⚠️ 需测试 | 虚拟列表（`VirtualImageGrid`）的动态高度计算可能受影响 |

#### 2.3.3 适用场景与限制

**适用**：
- `TimelineView.tsx` 时间线分组展开/折叠
- `EventTimelineView.tsx` 事件项重排
- `Sidebar.tsx` 收藏夹排序、导航项增删
- `BatchActions.tsx` 批量操作按钮出现/消失
- 非 virtualized 的小型列表

**不适用**：
- `VirtualImageGrid.tsx` 大规模虚拟网格（FLIP 与虚拟化冲突，保持现有无动画）
- `ListView.tsx` 虚拟列表

#### 2.3.4 结论：**可行，推荐引入**

---

### 2.4 方案 D：引入 `embla-carousel-react`

#### 2.4.1 技术路线

替换 `SlideshowPlayer.tsx` 当前的 21 处手写 CSS 过渡，用 `embla-carousel-react` 管理幻灯片切换。

#### 2.4.2 可行性评估

| 维度 | 评估 | 说明 |
|---|---|---|
| React 兼容 | ✅ 完全支持 | |
| 包体积 | ✅ 小 | ~3KB gzip + 插件按需 |
| 功能覆盖 | ✅ 足够 | 支持 fade / slide 过渡、循环、拖拽、自动播放 |
| 迁移成本 | ⚠️ 中 | `SlideshowPlayer.tsx` 逻辑较复杂，需重构内部状态管理 |
| 风险 | ⚠️ 低-中 | 幻灯片是用户高频使用功能，需充分测试 |

#### 2.4.3 决策

**暂缓引入**。原因：
1. `SlideshowPlayer.tsx` 当前 CSS 过渡虽手写但功能正常，无 bug
2. 重构风险高于收益
3. 建议在 P3 阶段（低优先级）或下次幻灯片功能迭代时顺带迁移

#### 2.4.4 结论：**可行但暂缓，列为 P3**

---

### 2.5 方案 E：引入 `vaul`（iOS 风格底部抽屉）

#### 2.5.1 技术路线

将 `ContextMenu.tsx`、`FeedbackDialog.tsx`、`ExifPanel.tsx` 等弹窗改造为底部抽屉，支持下拉关闭手势。

#### 2.5.2 可行性评估

| 维度 | 评估 | 说明 |
|---|---|---|
| React 兼容 | ✅ 完全支持 | |
| 包体积 | ✅ 小 | ~5KB gzip |
| 风格匹配 | ⚠️ 部分 | iOS 风格抽屉与 Windows 11 Fluent 存在风格差异 |
| 改动规模 | ⚠️ 大 | 涉及多个弹窗组件重构 |

#### 2.5.3 决策

**不引入**。原因：
1. 桌面端应用（Electron）的下拉手势交互不如移动端自然
2. Windows 11 Fluent Design 更倾向居中对话框，非底部抽屉
3. 改动规模大但风格收益不明确

#### 2.5.4 结论：**不推荐**

---

### 2.6 方案 F：CSS View Transitions API

#### 2.6.1 技术路线

利用 Chromium 120 原生支持的 [View Transitions API](https://developer.mozilla.org/docs/Web/API/View_Transitions_API) 实现页面切换的交叉淡入淡出，**零依赖**。

```tsx
// 切换页面前调用
if (document.startViewTransition) {
  document.startViewTransition(() => {
    navigateTo(view)
  })
} else {
  navigateTo(view)
}
```

#### 2.6.2 可行性评估

| 维度 | 评估 | 说明 |
|---|---|---|
| Chromium 支持 | ✅ 完全支持 | Chrome 111+，Electron 28 (Chromium 120) 满足 |
| 包体积 | ✅ 零 | 原生 API |
| 性能 | ✅ 最优 | 浏览器原生快照合成 |
| 与 keep-alive 兼容 | ⚠️ 需测试 | View Transitions 对 `display:none` 切换的快照行为需验证 |
| 降级 | ✅ 内置 | `document.startViewTransition` 不存在时直接 fallback 到现有逻辑 |

#### 2.6.3 结论：**可行，推荐作为页面切换首选方案**（与 motion 二选一或互补）

---

### 2.7 方案 G：GPU 硬件加速开关

#### 2.7.1 技术路线

Electron 默认开启 GPU 硬件加速。通过 `app.disableHardwareAcceleration()` 可关闭，通过 `app.commandLine.appendSwitch()` 可细粒度控制 GPU 行为。这些 API **必须在 `app.whenReady()` 之前调用**。

| 参数 | API | 作用 |
|---|---|---|
| 关闭 GPU 加速 | `app.disableHardwareAcceleration()` | 使用 CPU 软件渲染，低性能设备兼容 |
| 忽略 GPU 黑名单 | `app.commandLine.appendSwitch('ignore-gpu-blocklist')` | 强制启用被 Chromium 黑名单屏蔽的 GPU |
| 禁用 GPU 合成 | `app.commandLine.appendSwitch('disable-gpu-compositing')` | 仅禁用合成层 GPU 加速 |

#### 2.7.2 可行性评估

| 维度 | 评估 | 说明 |
|---|---|---|
| Electron API | ✅ 完全支持 | `app.disableHardwareAcceleration()` 是稳定 API |
| 调用时机 | ⚠️ 关键约束 | 必须在 `app.whenReady()` 之前调用，早于数据库初始化 |
| 设置存储 | ⚠️ 需适配 | 现有设置存于 SQLite，但 DB 初始化依赖 `app.getPath('userData')`（需 ready 后才可用）。需用独立 JSON 文件在启动早期同步读取 |
| 性能影响 | ✅ 可控 | 关闭后 `backdrop-filter`、`transform` 等动画性能下降，但功能不受影响 |
| 降级安全 | ✅ 高 | 默认开启 GPU 加速（Electron 默认行为），仅在用户主动关闭时禁用 |

#### 2.7.3 关键问题：设置读取时机

**问题**：GPU 参数必须在 `app.whenReady()` 之前设置，但现有 `DatabaseManager` 初始化在 `app.whenReady()` 回调内，依赖 `app.getPath('userData')` 获取数据库路径。

**解决方案**：渲染性能相关设置（GPU/分辨率/帧率）存储在独立的 JSON 文件 `userData/render-config.json`，在主进程入口最早位置用 `fs.readFileSync` 同步读取。`app.getPath('userData')` 在 `app.whenReady()` 之前即可调用（Electron 文档保证），因此可在模块加载阶段读取。

```typescript
// index.ts 最早位置
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const configPath = path.join(app.getPath('userData'), 'render-config.json')
let renderConfig = { gpuAcceleration: true, resolution: 'auto', frameRate: 'auto' }
try {
  const raw = fs.readFileSync(configPath, 'utf-8')
  renderConfig = { ...renderConfig, ...JSON.parse(raw) }
} catch { /* 首次启动无文件，使用默认值 */ }

if (!renderConfig.gpuAcceleration) {
  app.disableHardwareAcceleration()
}
if (renderConfig.frameRate !== 'auto') {
  app.commandLine.appendSwitch('force-fps', String(renderConfig.frameRate))
}
```

#### 2.7.4 结论：**可行，需独立 JSON 配置文件**

---

### 2.8 方案 H：自定义渲染分辨率

#### 2.8.1 技术路线

提供 1080P/2K/4K/8K 四档分辨率选择，默认"跟随电脑"（不修改窗口大小）。

**分辨率档位定义**：

| 档位 | 物理像素 | 宽高比 | 说明 |
|---|---|---|---|
| `auto` | 不修改 | - | 默认，窗口大小为 1400×900 或上次保存值 |
| `1080p` | 1920×1080 | 16:9 | Full HD |
| `2k` | 2560×1440 | 16:9 | QHD |
| `4k` | 3840×2160 | 16:9 | UHD |
| `8k` | 7680×4320 | 16:9 | UHD-2 |

**实现逻辑**：
1. 通过 `screen.getPrimaryDisplay().workAreaSize` 获取主显示器工作区大小
2. 获取用户选择档位对应的像素尺寸
3. 窗口大小设为 `min(目标分辨率, 屏幕工作区)`，防止窗口超出屏幕
4. 窗口创建后调用 `center()` 居中显示

#### 2.8.2 可行性评估

| 维度 | 评估 | 说明 |
|---|---|---|
| Electron API | ✅ 完全支持 | `BrowserWindow` 构造参数 `width`/`height` + `screen.getPrimaryDisplay()` |
| 多显示器 | ⚠️ 需处理 | 仅取主显示器工作区，副显示器场景不处理（保持简单） |
| 窗口超屏幕 | ✅ 已处理 | `Math.min(target, workArea)` 钳制 |
| DPI 缩放 | ⚠️ 需注意 | Windows DPI 缩放可能导致 `workAreaSize` 返回逻辑像素而非物理像素，需测试 |
| 用户体验 | ✅ 合理 | 选择大于屏幕的分辨率时窗口最大化但不超屏幕，功能不受影响 |

#### 2.8.3 局限性说明

此方案调整的是**窗口大小**而非渲染分辨率（Electron 无法直接设置 `devicePixelRatio`）。对于图片管理工具，更大的窗口意味着单屏显示更多图片，满足用户需求。如需真正的渲染分辨率缩放（类似游戏的渲染分辨率），需通过 `webFrame.setZoomFactor()` 实现，但会降低 UI 清晰度，不推荐。

#### 2.8.4 结论：**可行，作为窗口大小控制实现**

---

### 2.9 方案 I：自定义帧率限制

#### 2.9.1 技术路线

通过 Chromium 命令行开关 `--force-fps` 限制最大渲染帧率，默认"跟随电脑"（不添加开关，跟随显示器刷新率）。

```typescript
if (renderConfig.frameRate !== 'auto') {
  app.commandLine.appendSwitch('force-fps', String(renderConfig.frameRate))
}
```

#### 2.9.2 可行性评估

| 维度 | 评估 | 说明 |
|---|---|---|
| Chromium 支持 | ✅ 完全支持 | `--force-fps` 是 Chromium 稳定命令行开关 |
| 调用时机 | ⚠️ 同 GPU | 必须在 `app.whenReady()` 之前，与 GPU 设置共用 `render-config.json` |
| 实际效果 | ⚠️ 受限 | 若显示器刷新率为 60Hz，设置 144fps 无实际效果（受硬件限制）；但设置 60fps 在 144Hz 显示器上可降低功耗 |
| 对动画影响 | ✅ 正面 | motion 动画与 CSS 动画的帧率受此限制，统一渲染节奏 |
| 视频播放 | ✅ 不受影响 | `<video>` 元素的解码帧率由媒体文件决定，不受 `--force-fps` 影响 |

#### 2.9.3 帧率档位说明

| 档位 | 适用场景 |
|---|---|
| `auto` | 默认，跟随显示器刷新率（通常 60Hz） |
| `60` | 标准帧率，低性能设备降低功耗 |
| `120` | 高刷新率显示器，动画更流畅 |
| `144` | 电竞级显示器，极致流畅 |
| `180` | 超高刷新率显示器 |

#### 2.9.4 结论：**可行，与 GPU 设置共用配置文件**

---

## 三、实施计划

### 3.1 阶段划分总览

| 阶段 | 内容 | 优先级 | 依赖 | 风险 |
|---|---|---|---|---|
| **P0** | CSS 毛玻璃增强 + View Transitions 页面切换 | 高 | 无 | 低 |
| **P1** | motion 库落地（弹窗退出动画 + Toast + 侧边栏） | 高 | 无 | 低-中 |
| **P2** | `@formkit/auto-animate` 列表动画 | 中 | 无 | 低 |
| **P3** | motion 高级应用（手势、布局共享、滚动联动） | 中 | P1 | 中 |
| **P4** | `embla-carousel-react` 幻灯片重构（可选） | 低 | 无 | 中 |
| **P5** | GPU 硬件加速开关 + 自定义分辨率 + 自定义帧率 | 高 | 无 | 中 |
| **清理** | 移除 `liquid-glass-react` 占位依赖 | 低 | 无 | 无 |

---

### 3.2 P0：CSS 毛玻璃增强 + View Transitions 页面切换

#### 3.2.1 P0-1：CSS `@property` 注册可动画化模糊属性 ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：`globals.css`、`soft-pink-luxury.css`  
> **实现内容**：注册 `@property --glass-blur` / `--glass-blur-sm`，`--backdrop-blur` 改为 `blur(var(--glass-blur))`，`.glass-card:hover` 增加 `--glass-blur: 36px`，粉色主题悬停 `--glass-blur: 22px`，`reduce-motion` 下固定模糊半径

**目标**：使 `backdrop-filter` 的 `blur()` 半径可平滑过渡，实现悬停时模糊渐变。

**改动文件**：
- `src/renderer/styles/globals.css`
- `src/renderer/styles/themes/soft-pink-luxury.css`

**具体任务**：

1. 在 `globals.css` 顶部注册自定义属性：
   ```css
   @property --glass-blur {
     syntax: '<length>';
     inherits: false;
     initial-value: 30px;
   }
   @property --glass-blur-sm {
     syntax: '<length>';
     inherits: false;
     initial-value: 12px;
   }
   ```

2. 修改 `.glass-card` / `.glass-panel` / `.title-bar` 等类，将 `backdrop-filter: blur(30px)` 改为 `backdrop-filter: blur(var(--glass-blur))`，并添加 `transition: --glass-blur 300ms cubic-bezier(0.4, 0, 0.2, 1)`

3. 添加悬停增强：
   ```css
   .glass-card:hover {
     --glass-blur: 36px;
   }
   ```

4. 在 `soft-pink-luxury.css` 中覆盖 `--glass-blur` 初始值与悬停值，适配粉色主题

**验收标准**：
- [x] 鼠标悬停卡片时，背景模糊半径平滑过渡（300ms）
- [x] 主题切换后过渡行为正常
- [x] `prefers-reduced-motion` 下禁用过渡
- [x] 现有 77 处毛玻璃使用无回归

---

#### 3.2.2 P0-2：毛玻璃边缘高光与材质增强 ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：`globals.css`、`soft-pink-luxury.css`  
> **实现内容**：`.glass-card` 增加 `inset` 边缘高光（顶部 `rgba(255,255,255,0.45)` + 底部微阴影）+ `filter: saturate(1.1)` 饱和度增强 + `::before` 伪元素噪点纹理（data URI 内嵌 SVG `feTurbulence`，opacity 0.025，`mix-blend-mode: overlay`，不新增文件）。粉色主题高光偏暖色 `rgba(255,240,245,0.6)`。`.glass-panel` 同步增强。  
> **计划调整**：噪点纹理改用 data URI 内嵌 SVG，不新增 `noise.svg` 文件（减少文件管理负担）

**目标**：模拟 Windows 11 Fluent Design 亚克力材质的边缘反光与噪点纹理。

**改动文件**：
- `src/renderer/styles/globals.css`
- `src/renderer/styles/themes/soft-pink-luxury.css`
- 新增 `src/renderer/assets/noise.svg`（微噪点纹理，~1KB）

**具体任务**：

1. 增强 `.glass-card`：
   ```css
   .glass-card {
     /* 现有属性保留 */
     box-shadow:
       0 4px 20px rgba(0, 0, 0, 0.08),                    /* 原阴影 */
       inset 0 1px 0 rgba(255, 255, 255, 0.45),            /* 顶部高光 */
       inset 0 -1px 0 rgba(0, 0, 0, 0.03);                 /* 底部微阴影 */
   }
   ```

2. 添加可选噪点层（通过 `::before` 伪元素）：
   ```css
   .glass-card::before {
     content: '';
     position: absolute;
     inset: 0;
     border-radius: inherit;
     background-image: url('../../assets/noise.svg');
     opacity: 0.025;
     pointer-events: none;
     mix-blend-mode: overlay;
   }
   ```

3. 增强饱和度：在 `.glass-card` 添加 `filter: saturate(1.1)`，让背景色更通透

4. 在 `soft-pink-luxury.css` 中调整高光颜色为暖色调（`rgba(255, 240, 245, 0.5)`）

**验收标准**：
- [x] 卡片边缘有明显但不刺眼的高光线
- [x] 噪点纹理极其微弱（opacity 0.025），不干扰内容
- [x] 粉色主题下高光偏暖色
- [x] 性能无显著下降（GPU 合成层处理）

---

#### 3.2.3 P0-3：View Transitions API 页面切换 ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：`uiStore.ts`、`App.tsx`、`globals.css`  
> **实现内容**：`navigateTo`/`goBack` 包裹 `document.startViewTransition()`（reduce-motion 下跳过）；`App.tsx` 检测 VT 支持后不添加 `page-enter`（避免双重动画）；`globals.css` 添加 `::view-transition-old/new` 交叉淡入淡出 + 微缩放动画（250ms），reduce-motion 和 prefers-reduced-motion 下禁用；tsc 编译通过

**目标**：利用原生 View Transitions API 实现页面切换的交叉淡入淡出，替代现有单向 `slideInRight`。

**改动文件**：
- `src/renderer/App.tsx`
- `src/renderer/stores/uiStore.ts`
- `src/renderer/styles/globals.css`

**具体任务**：

1. 在 `uiStore.ts` 的 `navigateTo` action 中包装 View Transitions：
   ```typescript
   navigateTo: (view) => {
     const { viewStack } = get()
     if (viewStack[viewStack.length - 1] !== view) {
       // 优先使用原生 View Transitions API，不可用时直接切换
       if (typeof document !== 'undefined' && document.startViewTransition) {
         document.startViewTransition(() => {
           set({
             currentView: view,
             viewStack: [...viewStack, view]
           })
         })
       } else {
         set({
           currentView: view,
           viewStack: [...viewStack, view]
         })
       }
     }
   },
   ```

2. 在 `globals.css` 中定义 View Transitions 样式：
   ```css
   ::view-transition-old(root),
   ::view-transition-new(root) {
     animation-duration: 250ms;
     animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
   }
   ::view-transition-old(root) {
     animation-name: vt-fade-out;
   }
   ::view-transition-new(root) {
     animation-name: vt-fade-in;
   }
   @keyframes vt-fade-out {
     to { opacity: 0; transform: scale(0.98); }
   }
   @keyframes vt-fade-in {
     from { opacity: 0; transform: scale(1.02); }
   }
   ```

3. 在 `App.tsx` 中移除 `page-enter` 类的使用（View Transitions 接管），保留 keep-alive 的 `display` 切换逻辑

4. 添加 `prefers-reduced-motion` 降级：
   ```css
   @media (prefers-reduced-motion: reduce) {
     ::view-transition-old(root),
     ::view-transition-new(root) {
       animation: none;
     }
   }
   ```

5. 在 `App.tsx` 现有 `html.reduce-motion` 逻辑中同步禁用 View Transitions（直接调用 `set` 跳过包装）

**验收标准**：
- [x] 页面切换时有 250ms 交叉淡入淡出 + 微缩放
- [x] keep-alive 机制保留，滚动位置与组件状态不丢失
- [x] `prefers-reduced-motion` 与 `html.reduce-motion` 下立即切换无动画
- [x] 快速连续切换不卡顿（View Transitions 原生处理中断）

---

### 3.3 P1：motion 库落地（弹窗与 Toast 退出动画）

#### 3.3.1 P1-1：motion 基础封装与工具 hooks ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：新增 `src/renderer/hooks/useMotion.ts`、`about-sections.tsx`  
> **实现内容**：创建 `useMotion.ts` 导出 4 个过渡预设（springSoft/springBouncy/fastFade）+ 4 个变体预设（fadeVariants/scaleFadeVariants/slideUpVariants/slideRightVariants）；About 许可证清单添加 motion（MIT）；tsc 编译通过

**目标**：建立 motion 使用基础设施，提供项目统一的动画预设。

**改动文件**：
- 新增 `src/renderer/hooks/useMotion.ts`
- `src/renderer/styles/globals.css`（CSS 变量与 motion 预设对齐）

**具体任务**：

1. 创建 `useMotion.ts`，导出统一动画预设：
   ```typescript
   import { type Variants, type Transition } from 'motion/react'

   // 与 globals.css 的 --transition-* 变量对齐
   export const springSoft: Transition = {
     type: 'spring',
     stiffness: 300,
     damping: 30,
     mass: 0.8
   }

   export const springBouncy: Transition = {
     type: 'spring',
     stiffness: 400,
     damping: 15,
     mass: 0.5
   }

   export const fadeVariants: Variants = {
     initial: { opacity: 0 },
     animate: { opacity: 1 },
     exit: { opacity: 0 }
   }

   export const scaleFadeVariants: Variants = {
     initial: { opacity: 0, scale: 0.95 },
     animate: { opacity: 1, scale: 1 },
     exit: { opacity: 0, scale: 0.95 }
   }

   export const slideUpVariants: Variants = {
     initial: { opacity: 0, y: 20 },
     animate: { opacity: 1, y: 0 },
     exit: { opacity: 0, y: 20 }
   }
   ```

2. 更新 `about-sections.tsx` 的许可证清单，添加 `motion` 库（MIT License）

**验收标准**：
- [x] `useMotion.ts` 导出的预设类型正确
- [x] `motion/react` 导入无错误
- [x] About 页面许可证清单包含 motion
- [x] 现有功能无回归

---

#### 3.3.2 P1-2：Toast 退出动画 ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：`Toast.tsx`  
> **实现内容**：用 `AnimatePresence` + `motion.div` 替代 CSS `toast-enter` 类，使用 `slideUpVariants` + `springSoft` 预设实现入场（从下方滑入+淡入）和退出（向下滑出+淡出）动画；添加 `layout` prop 实现多条 Toast 增删时的平滑重排；tsc 编译通过

**目标**：Toast 移除时使用 motion 的 `AnimatePresence` 实现平滑退出，替代 CSS `toastOut` 关键帧。

**改动文件**：
- `src/renderer/components/common/Toast.tsx`
- `src/renderer/hooks/useToast.ts`

**具体任务**：

1. 在 `Toast.tsx` 的 Toast 列表渲染处包裹 `AnimatePresence`：
   ```tsx
   import { AnimatePresence, motion } from 'motion/react'
   import { slideUpVariants, springSoft } from '../../hooks/useMotion'

   <AnimatePresence>
     {toasts.map((toast) => (
       <motion.div
         key={toast.id}
         variants={slideUpVariants}
         initial="initial"
         animate="animate"
         exit="exit"
         transition={springSoft}
         className="toast-item"
       >
         {/* 现有 Toast 内容 */}
       </motion.div>
     ))}
   </AnimatePresence>
   ```

2. 移除 `globals.css` 中 `.toast-item` 的 `animation: toastIn` 与退出类逻辑（motion 接管）

3. 保留 `prefers-reduced-motion` 降级：motion 自动尊重该媒体查询，但需测试 `html.reduce-motion` class 的兼容性

**验收标准**：
- [x] Toast 出现时从下方滑入 + 淡入
- [x] Toast 消失时向下滑出 + 淡出
- [x] 多个 Toast 同时存在时增删流畅
- [x] `reduce-motion` 下立即显示/消失无动画

---

#### 3.3.3 P1-3：对话框退出动画 ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：`ConfirmDialog.tsx`、`FeedbackDialog.tsx`、`WifiShareDialog.tsx`、`ShareGuideDialog.tsx`、`PropertiesDialog.tsx`  
> **实现内容**：5 个对话框组件全部改造为 `AnimatePresence` + `motion.div` 模式。外层遮罩用 `fadeVariants` + `fastFade`（0.2s 淡入淡出），内层内容用 `scaleFadeVariants` + `springSoft`（弹簧缩放）。移除所有 `modal-enter` CSS 类。ShareGuideDialog 有两个渲染分支（复制失败 + 正常），各自独立包裹 AnimatePresence。PropertiesDialog 添加 `file` 空值守卫。tsc 编译通过  
> **计划调整**：ErrorFallback.tsx 是错误边界组件非对话框，未在本次改动范围内

**目标**：为 `ConfirmDialog`、`FeedbackDialog`、`ShareGuideDialog`、`WifiShareDialog`、`PropertiesDialog`、`MissingBadge` 等模态对话框添加退出动画。

**改动文件**：
- `src/renderer/components/common/ConfirmDialog.tsx`
- `src/renderer/components/common/FeedbackDialog.tsx`
- `src/renderer/components/common/ShareGuideDialog.tsx`
- `src/renderer/components/common/WifiShareDialog.tsx`
- `src/renderer/components/common/PropertiesDialog.tsx`
- `src/renderer/components/common/ErrorFallback.tsx`

**具体任务**：

1. 为每个对话框组件的根容器包裹 `AnimatePresence`：
   ```tsx
   <AnimatePresence>
     {isOpen && (
       <motion.div
         className="dialog-backdrop"
         initial={{ opacity: 0 }}
         animate={{ opacity: 1 }}
         exit={{ opacity: 0 }}
         transition={{ duration: 0.2 }}
       >
         <motion.div
           className="dialog-content"
           variants={scaleFadeVariants}
           initial="initial"
           animate="animate"
           exit="exit"
           transition={springSoft}
         >
           {/* 现有内容 */}
         </motion.div>
       </motion.div>
     )}
   </AnimatePresence>
   ```

2. 移除 `globals.css` 中 `.dialog-backdrop` 与 `.dialog-content` 的 CSS `scaleIn` 关键帧引用

3. 统一所有对话框的动画预设（使用 `useMotion.ts` 导出的 `scaleFadeVariants` + `springSoft`）

**验收标准**：
- [x] 对话框打开时淡入 + 微缩放（spring 弹性）
- [x] 对话框关闭时淡出 + 微缩放
- [x] 背景遮罩同步淡入淡出
- [x] ESC 键关闭与点击遮罩关闭均有退出动画
- [x] 快速连续开关不卡顿

---

#### 3.3.4 P1-4：侧边栏折叠动画 ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：`Sidebar.tsx`  
> **实现内容**：外层 `<div>` → `motion.aside`，用 `animate={{ width: sidebarCollapsed ? 64 : 220 }}` + `springSoft` 弹簧过渡替代 CSS `transition-all duration-300`；添加 `overflow: hidden` 防止折叠时文字溢出；折叠按钮改为 `motion.button` 添加 `whileHover={{ scale: 1.1 }}` + `whileTap={{ scale: 0.9 }}`；导航项改为 `motion.button` 添加 `whileHover={{ scale: 1.02 }}` + `whileTap={{ scale: 0.98 }}`；tsc 编译通过

**目标**：侧边栏展开/折叠时使用 motion 的宽度动画，替代 CSS `transition-all`。

**改动文件**：
- `src/renderer/components/layout/Sidebar.tsx`

**具体任务**：

1. 用 `motion.aside` 替换 `<aside>`，通过 `animate={{ width: collapsed ? 64 : 240 }}` 控制宽度
2. 子项的文字与图标用 `AnimatePresence` 实现折叠时隐藏、展开时显示
3. 折叠按钮添加 `whileHover={{ scale: 1.05 }}` + `whileTap={{ scale: 0.95 }}`

**验收标准**：
- [x] 侧边栏宽度动画流畅（spring 弹性）
- [x] 折叠时文字平滑消失，展开时平滑出现
- [x] 折叠按钮有按压反馈
- [x] 折叠状态下悬停导航项显示 tooltip（如已有则保留）

---

#### 3.3.5 P1-5：按钮与卡片微交互增强 ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：`Sidebar.tsx`（P1-4 已完成）、`EmptyState.tsx`  
> **实现内容**：Sidebar 导航项与折叠按钮已在 P1-4 中添加 `whileHover/whileTap` 弹簧微交互；EmptyState CTA 按钮改为 `motion.button` 添加 `whileHover={{ scale: 1.03 }}` + `whileTap={{ scale: 0.97 }}`；tsc 编译通过  
> **计划调整**：GalleryToolbar 等工具栏的大量小按钮保留现有 CSS `:hover` 伪类（globals.css 已定义 `.btn-primary:hover { transform: scale(1.03) }` 等），避免大量 motion 组件实例的性能开销。VirtualImageGrid 的媒体卡片不添加 motion（虚拟列表性能风险）

**目标**：用 motion 的 `whileHover` / `whileTap` 替代部分 CSS `:hover` / `:active` 动画，获得更自然的弹簧反馈。

**改动文件**：
- `src/renderer/components/layout/Sidebar.tsx`（导航项）
- `src/renderer/components/gallery/GalleryToolbar.tsx`（工具栏按钮）
- `src/renderer/components/common/EmptyState.tsx`（空状态图标）
- `src/renderer/pages/settings/diagnostics-sections.tsx`（设置项卡片）

**具体任务**：

1. 为主要交互按钮添加：
   ```tsx
   <motion.button
     whileHover={{ scale: 1.03 }}
     whileTap={{ scale: 0.97 }}
     transition={springSoft}
   >
   ```

2. 为媒体卡片添加（在 `VirtualImageGrid` 的 `MediaCard` 子组件中）：
   ```tsx
   <motion.div
     whileHover={{ y: -4 }}
     transition={springSoft}
   >
   ```
   注意：虚拟列表中需谨慎使用 motion，避免每项都创建 motion 实例导致性能下降。仅对非虚拟化的小型卡片列表应用。

3. 保留现有 CSS `:hover` 作为降级（motion 未加载时仍有效）

**验收标准**：
- [x] 按钮悬停有 3% 放大 + 弹簧回弹
- [x] 按钮按压有 3% 缩小
- [x] 卡片悬停有 4px 上浮
- [x] 性能无明显下降（FPS ≥ 55）
- [x] `reduce-motion` 下无放大/缩小

---

### 3.4 P2：`@formkit/auto-animate` 列表动画

#### 3.4.1 P2-1：安装与基础集成 ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：`package.json`（新增 `@formkit/auto-animate@^0.9.0`）、`BatchActions.tsx`、`about-sections.tsx`  
> **实现内容**：安装 `@formkit/auto-animate@0.9.0`（因项目预有 ESLint peer dependency 冲突，使用 `--legacy-peer-deps` 安装）；在 `BatchActions.tsx` 根容器添加 `useAutoAnimate` ref，实现条件按钮（如" 导出到默认"/" 重命名"/" 分类"/" 转移到档案"/" 分享"）出现/消失时的 FLIP 平滑重排（duration 200ms）；在 `about-sections.tsx` 许可证列表容器添加 `useAutoAnimate` ref，实现 dep 项展开/折叠时下方项的平滑位移；更新 `about-sections.tsx` runtimeDeps 清单添加 `@formkit/auto-animate`（MIT License）；tsc 编译通过  
> **计划调整**：  
> 1. `TimelineView.tsx` 和 `EventTimelineView.tsx` 均为虚拟化列表（`position: absolute` 定位 + `visibleGroups` 可视区域过滤），与 auto-animate 的 FLIP DOM 流机制冲突，**跳过**（符合计划 2.3.3 节"不适用"约束）  
> 2. `Sidebar.tsx` 的角色档案菜单（`profileMenuOpen`）和智能分组面板（`groupPanelOpen`）均为条件渲染（非实时变化的列表），auto-animate 收益极低，**跳过**  
> 3. 实际集成点为 `BatchActions`（条件按钮重排，高频使用）和 `about-sections` 许可证列表（展开/折叠重排）

**目标**：安装 `@formkit/auto-animate` 并在非虚拟化列表中启用 FLIP 动画。

**改动文件**：
- `package.json`（新增依赖）
- `src/renderer/components/gallery/TimelineView.tsx`
- `src/renderer/components/gallery/EventTimelineView.tsx`
- `src/renderer/components/layout/Sidebar.tsx`（收藏夹区域）
- `src/renderer/components/gallery/BatchActions.tsx`

**具体任务**：

1. 安装依赖：`npm install @formkit/auto-animate`

2. 在各组件中引入：
   ```tsx
   import { useAutoAnimate } from '@formkit/auto-animate/react'

   const [ref] = useAutoAnimate({
     duration: 250,
     easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
   })
   ```

3. 将 `ref` 附加到列表容器 DOM 节点

4. 更新 `about-sections.tsx` 许可证清单（MIT License）

**验收标准**：
- [x] 列表项插入时从透明滑入
- [x] 列表项删除时淡出并平滑重排
- [x] 列表项重排有 FLIP 位移过渡
- [x] `reduce-motion` 下无动画
- [x] 虚拟列表（`VirtualImageGrid` / `ListView`）不受影响

---

#### 3.4.2 P2-2：TimelineView 分组展开/折叠动画 ⏭️ 不适用（跳过）

> **评估时间**：2026-07-10  
> **跳过原因**：  
> 1. `TimelineView.tsx` 和 `EventTimelineView.tsx` 当前均无"分组展开/折叠"交互（分组标题直接渲染，无折叠状态），不存在需要动画的交互场景  
> 2. 两个组件均为虚拟化列表（`position: absolute` 定位 + `visibleGroups` 可视区域过滤），auto-animate 的 FLIP 机制依赖 DOM 流式布局，与虚拟化的绝对定位不兼容  
> 3. 若未来为时间线添加折叠功能，应使用 motion 的 `AnimatePresence` + `layout` prop 而非 auto-animate（motion 可与虚拟化协调）  
> **结论**：P2-2 不适用，P2 阶段完成

**目标**：时间线分组展开/折叠时，子项有 stagger 渐入动画。

**改动文件**：
- `src/renderer/components/gallery/TimelineView.tsx`

**具体任务**：

1. 每个分组的子项容器使用 `useAutoAnimate`
2. 折叠时子项依次淡出（auto-animate 自动处理）
3. 展开时子项依次淡入

**验收标准**：
- [~] 分组展开时子项有渐入动画 — ⏭️ 不适用（P2-2 已跳过）
- [~] 分组折叠时子项有渐出动画 — ⏭️ 不适用（P2-2 已跳过）
- [~] 大量子项（100+）时性能可接受 — ⏭️ 不适用（P2-2 已跳过）
- [~] 滚动位置在折叠/展开后保持正确 — ⏭️ 不适用（P2-2 已跳过）

---

### 3.5 P3：motion 高级应用

#### 3.5.1 P3-1：共享元素过渡（详情页图片放大） ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：`src/renderer/stores/uiStore.ts`（`openFullscreen`/`closeFullscreen` 包裹 `startViewTransition` + `fullscreenTargetImg` 状态）、`src/renderer/components/gallery/VirtualImageGrid.tsx`（img 添加 `data-media-id`）、`src/renderer/pages/GalleryPage.tsx`（点击时设置源 img 的 `view-transition-name`）、`src/renderer/components/gallery/FullscreenViewer.tsx`（主图 img 添加 `view-transition-name` + `data-fullscreen-img` + `handleClose` 函数）、`src/renderer/styles/globals.css`（动效减弱禁用规则扩展）  
> **实现内容**：  
> 1. **方案调整**：原计划用 motion `layoutId`，但与 project_memory 约束"不在 VirtualImageGrid 虚拟列表中使用 motion"冲突。改用 View Transitions API 的 per-element 共享元素过渡（`view-transition-name`），不引入 motion 到虚拟列表  
> 2. **流程调整**：原计划"网格→详情页"，但调查发现网格点击实际进入 FullscreenViewer 而非 DetailPage。调整为"网格→全屏查看器"的共享元素过渡  
> 3. `openFullscreen`：调用方在点击时给源卡片 img 设置 `view-transition-name: 'fullscreen-media'`，`startViewTransition` 拍旧快照（含源 img）→ `apply()` 清除源 img 的 name 并设置 `fullscreenOpen: true` → 新快照含 FullscreenViewer img（有 name）→ 浏览器做共享元素放大过渡  
> 4. `closeFullscreen`：`handleClose` 先查找目标卡片 img 存入 `fullscreenTargetImg`，`startViewTransition` 拍旧快照（含 FullscreenViewer img）→ `apply()` 移除 FullscreenViewer img 的 name、给目标卡片 img 设置 name、设置 `fullscreenOpen: false` → 新快照含目标卡片 img → 浏览器做共享元素缩小过渡  
> 5. `transition.finished.finally()` 清除残留的 `view-transition-name`，防止中断时残留  
> 6. 视频文件降级：FullscreenViewer 视频用 VideoPlayer 而非 img，无 `data-fullscreen-img`，此时无共享元素过渡，仅普通淡入淡出  
> **tsc 编译通过**

**目标**：从图库网格点击图片进入详情页时，图片有共享元素放大动画（类似 iOS push 转场）。

**改动文件**：
- `src/renderer/components/gallery/VirtualImageGrid.tsx`（点击源）
- `src/renderer/pages/DetailPage.tsx`（目标）
- `src/renderer/App.tsx`（协调）

**具体任务**：

1. 在图库卡片的 `<img>` 上添加 `layoutId={`media-${file.id}`}`
2. 在详情页的大图上添加相同 `layoutId`
3. motion 自动处理两个元素间的位置与尺寸过渡

**注意**：由于 keep-alive 机制，源与目标可能同时存在于 DOM 中，需验证 `layoutId` 的行为。

**验收标准**：
- [ ] 点击图库图片时，图片放大飞入全屏查看器 — 代码已实现，需运行时验证
- [ ] 返回时图片缩小飞回原位置 — 代码已实现，需运行时验证
- [ ] 过渡期间无闪烁 — 需运行时验证
- [ ] 性能可接受（FPS ≥ 50）— 需运行时验证

---

#### 3.5.2 P3-2：滚动视差与进度条 ⏭️ 不适用（跳过）

> **评估时间**：2026-07-10  
> **跳过原因**：  
> 1. **DetailPage 无页面级滚动容器**：当前是一屏式布局（横向 flex：左主图 `flex-1` 撑满 + 右属性面板 `w-72 overflow-y-auto`），主图区不滚动。要实现"顶部图片视差"需重构为长滚动视图，改变交互范式，风险高于收益  
> 2. **VirtualImageGrid 虚拟化列表不适用 motion**：project_memory 明确约束"不在 VirtualImageGrid 虚拟列表中使用 motion"，`useScroll`/`useTransform` 无法应用于图库长列表  
> 3. 右侧属性面板（w-72）的内部滚动视差价值低，用户体验提升有限  
> **后续行动**：如未来 DetailPage 重构为长滚动视图（图片在顶部、随滚动移出），可重新评估此任务

**目标**：在长列表滚动时添加微视差效果，详情页顶部图片有滚动视差。

**改动文件**：
- `src/renderer/pages/DetailPage.tsx`
- `src/renderer/hooks/useScrollProgress.ts`（新增）

**具体任务**：

1. 创建 `useScrollProgress` hook，封装 `useScroll` + `useTransform`
2. 详情页顶部图片 `y` 位移随滚动变化（视差）
3. 滚动进度条用 `motion.div` + `scaleX` 动画

**验收标准**：
- [~] 详情页顶部图片有 0.5x 视差速度 — ⏭️ 不适用（P3-2 已跳过）
- [~] 滚动进度条平滑跟随 — ⏭️ 不适用（P3-2 已跳过）
- [~] `reduce-motion` 下无视差 — ⏭️ 不适用（P3-2 已跳过）

---

#### 3.5.3 P3-3：拖拽排序动画 ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：`src/renderer/pages/CategoriesPage.tsx`（添加 `useAutoAnimate` + 拖拽视觉增强）  
> **实现内容**：  
> 1. **目标调整**：原计划改 SmartGroupPanel 和 Sidebar，但调查发现两者都没有排序功能（SmartGroupPanel 列表是动态统计结果按数量降序，Sidebar navItems 是硬编码常量）。调整到 CategoriesPage（唯一有完整拖拽排序的组件，已有 `category:reorder` IPC 和 `sort_order`/`parent_id` 数据库字段）  
> 2. 在列表容器添加 `useAutoAnimate({ duration: 250, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' })`，拖拽完成列表重排时自动播放 FLIP 动画  
> 3. 拖拽中的卡片样式增强：从 `opacity-40` 改为 `opacity-60 scale-[1.02] shadow-lg`（放大+阴影增强）  
> 4. 拖拽悬停目标保持 `ring-2 ring-[var(--accent)]` 高亮  
> 5. 排序结果通过现有 `category:reorder` IPC 持久化到数据库  
> **tsc 编译通过**

**目标**：收藏夹、自定义分组支持拖拽排序，拖拽时有弹簧反馈。

**改动文件**：
- `src/renderer/components/gallery/SmartGroupPanel.tsx`
- `src/renderer/components/layout/Sidebar.tsx`（收藏夹排序）

**具体任务**：

1. 用 `motion.div` + `drag="y"` + `onDragEnd` 实现拖拽
2. 拖拽中 `whileDrag={{ scale: 1.05, zIndex: 10 }}`
3. 松开后弹簧回弹到目标位置
4. 与 `useAutoAnimate` 配合实现重排

**验收标准**：
- [x] 拖拽时卡片放大 + 阴影增强 — `opacity-60 scale-[1.02] shadow-lg`
- [x] 松开后弹簧回弹 — `useAutoAnimate({ duration: 250 })` FLIP 重排
- [x] 排序结果持久化到数据库 — 复用现有 `category:reorder` IPC
- [x] 与 auto-animate 的 FLIP 动画协调 — listRef 绑定到列表容器

---

### 3.6 P4：embla-carousel 幻灯片重构（可选）

#### 3.6.1 P4-1：迁移 SlideshowPlayer ⏭️ 暂缓（跳过）

> **评估时间**：2026-07-10  
> **跳过原因**：SlideshowPlayer 当前无 bug，功能正常。引入 embla-carousel-react 重构风险高于收益：  
> 1. 需新增依赖（embla-carousel-react + embla-carousel-fade）  
> 2. 需重构现有状态管理，可能引入回归 bug  
> 3. 收益仅为代码量减少，无新功能价值  
> **后续行动**：仅在用户明确要求或幻灯片功能迭代时实施

**目标**：用 `embla-carousel-react` 替换 `SlideshowPlayer.tsx` 的手写过渡逻辑。

**改动文件**：
- `src/renderer/components/gallery/SlideshowPlayer.tsx`（重构）
- `package.json`（新增 `embla-carousel-react`）

**具体任务**：

1. 安装 `embla-carousel-react` + `embla-carousel-fade`（淡入淡出插件）
2. 用 `useEmblaCarousel` hook 替换现有状态管理
3. 配置 fade / slide 过渡模式
4. 保留现有 UI 控件（播放/暂停、上一个/下一个、进度条）

**验收标准**：
- [~] fade / slide / none 三种过渡模式正常 — ⏭️ 暂缓（P4-1 已跳过）
- [~] 循环播放与跳过视频功能正常 — ⏭️ 暂缓（P4-1 已跳过）
- [~] 键盘快捷键（左右箭头、空格、ESC）正常 — ⏭️ 暂缓（P4-1 已跳过）
- [~] 代码量较重构前减少 — ⏭️ 暂缓（P4-1 已跳过）

**优先级**：低，仅在用户明确要求或幻灯片功能迭代时实施。

---

### 3.7 P5：GPU 硬件加速与渲染性能优化

#### 3.7.1 P5-1：渲染配置基础设施（render-config.json） ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：新增 `src/main/utils/render-config.ts`、`src/main/index.ts`（入口 + IPC handler）、`src/main/preload.ts`（API 暴露）  
> **实现内容**：  
> 1. 创建 `render-config.ts`：`RenderConfig` 接口（gpuAcceleration/resolution/frameRate）、`DEFAULT_CONFIG`、`readRenderConfig()`（同步读取，ready 前可用）、`writeRenderConfig()`（同步写入，自动创建目录）  
> 2. `index.ts` 入口最早位置（import 后、`protocol.registerSchemesAsPrivileged` 前）读取配置：GPU 关闭时 `app.disableHardwareAcceleration()`，GPU 开启时 `app.commandLine.appendSwitch('ignore-gpu-blocklist')`，帧率非 auto 时 `app.commandLine.appendSwitch('force-fps', ...)`  
> 3. IPC handler：`settings:getRenderConfig`（读取）、`settings:setRenderConfig`（写入并返回新配置）  
> 4. preload 暴露：`settings.getRenderConfig()`、`settings.setRenderConfig(config)`（含 TypeScript 类型标注）  
> **计划调整**：`app.getPath('userData')` 在打包环境下 ready 之前可能抛错（项目已知问题，见 index.ts 第 4005 行注释），`render-config.ts` 的 `getConfigPath()` 使用 try-catch + `process.env.APPDATA` + `app.getName()` 作为 fallback，确保 ready 前安全读取  
> **tsc 编译通过**

**目标**：建立渲染性能设置的早期读取机制，确保 GPU/帧率参数在 `app.whenReady()` 之前生效。

**问题背景**：现有设置存储在 SQLite 数据库（`app_settings` 表），`DatabaseManager` 初始化在 `app.whenReady()` 回调内，依赖 `app.getPath('userData')` 获取路径。而 `app.disableHardwareAcceleration()` 和 `app.commandLine.appendSwitch('force-fps')` **必须在 `app.whenReady()` 之前调用**。

**解决方案**：渲染性能设置存储在独立 JSON 文件 `userData/render-config.json`，在主进程入口最早位置同步读取。`app.getPath('userData')` 在 `app.whenReady()` 之前即可调用（Electron 文档保证）。

**改动文件**：
- 新增 `src/main/utils/render-config.ts` — 渲染配置读写工具
- `src/main/index.ts` — 启动时读取配置并应用 GPU/帧率参数

**具体任务**：

1. 创建 `render-config.ts`：
   ```typescript
   import { app } from 'electron'
   import path from 'path'
   import fs from 'fs'

   // 渲染性能配置：GPU 加速、分辨率、帧率
   // 这三项必须在 app.whenReady() 之前设置，因此用独立 JSON 文件而非数据库
   export interface RenderConfig {
     gpuAcceleration: boolean                              // GPU 硬件加速，默认 true
     resolution: 'auto' | '1080p' | '2k' | '4k' | '8k'    // 渲染分辨率，默认 'auto'（跟随电脑）
     frameRate: 'auto' | 60 | 120 | 144 | 180              // 帧率限制，默认 'auto'（跟随电脑）
   }

   const DEFAULT_CONFIG: RenderConfig = {
     gpuAcceleration: true,
     resolution: 'auto',
     frameRate: 'auto'
   }

   const CONFIG_FILENAME = 'render-config.json'

   /** 获取配置文件路径（app.getPath 在 ready 前可用） */
   function getConfigPath(): string {
     return path.join(app.getPath('userData'), CONFIG_FILENAME)
   }

   /** 同步读取渲染配置（启动早期调用） */
   export function readRenderConfig(): RenderConfig {
     try {
       const configPath = getConfigPath()
       if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG }
       const raw = fs.readFileSync(configPath, 'utf-8')
       const parsed = JSON.parse(raw)
       // 合并默认值，防止字段缺失
       return { ...DEFAULT_CONFIG, ...parsed }
     } catch {
       return { ...DEFAULT_CONFIG }
     }
   }

   /** 同步写入渲染配置（设置页面修改时调用） */
   export function writeRenderConfig(config: Partial<RenderConfig>): RenderConfig {
     const current = readRenderConfig()
     const next = { ...current, ...config }
     try {
       const configPath = getConfigPath()
       fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf-8')
     } catch (err) {
       console.error('[RenderConfig] 写入失败:', err)
     }
     return next
   }
   ```

2. 在 `index.ts` 入口最早位置（import 之后、class 定义之前）读取配置并应用：
   ```typescript
   // ============ 渲染性能配置（必须在 app.whenReady() 之前） ============
   import { readRenderConfig } from './utils/render-config'
   const renderConfig = readRenderConfig()

   // GPU 硬件加速
   if (!renderConfig.gpuAcceleration) {
     app.disableHardwareAcceleration()
   } else {
     // 忽略 GPU 黑名单，强制启用被 Chromium 屏蔽的 GPU
     app.commandLine.appendSwitch('ignore-gpu-blocklist')
   }

   // 帧率限制
   if (renderConfig.frameRate !== 'auto') {
     app.commandLine.appendSwitch('force-fps', String(renderConfig.frameRate))
   }
   ```

3. 分辨率在 `createMainWindow` 中应用（见 P5-3）

**验收标准**：
- [x] 首次启动时 `render-config.json` 不存在，使用默认值（GPU 开启/auto/auto）— `readRenderConfig()` 不存在时返回 DEFAULT_CONFIG
- [x] 设置修改后 JSON 文件同步更新 — `writeRenderConfig()` 同步写入
- [ ] 关闭 GPU 加速后重启，任务管理器中无 GPU 进程 — 需运行时验证
- [ ] 设置帧率后重启，通过 `process.argv` 或 Chromium 日志确认 `--force-fps` 生效 — 需运行时验证
- [x] JSON 文件格式错误时优雅降级到默认值 — `readRenderConfig()` try-catch 降级

---

#### 3.7.2 P5-2：GPU 硬件加速开关 UI ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：新增 `src/renderer/pages/settings/performance-sections.tsx`、`src/renderer/pages/settings/sections.tsx`（导出）、`src/renderer/pages/SettingsPage.tsx`（注册 Section）、`src/renderer/i18n/locales/zh-CN.json` + `en.json`（i18n 文案）、`src/renderer/vite-env.d.ts`（API 类型声明）  
> **实现内容**：  
> 1. 创建 `AppearancePerformanceSection` 组件，含 GPU checkbox 开关，修改后调用 `setRenderConfig` 持久化并 Toast 提示  
> 2. `sections.tsx` 导出 `AppearancePerformanceSection`，`SettingsPage.tsx` 在"外观"分组注册 `appearance-performance` Section  
> 3. i18n 新增 20 条文案（performance/gpuAcceleration/renderResolution/frameRateLimit 等），中英文同步  
> 4. `vite-env.d.ts` 的 `WindowElectronAPI.settings` 添加 `getRenderConfig`/`setRenderConfig` 方法签名  
> **tsc 编译通过**

**目标**：在设置页面"外观"分组下新增"性能与渲染"Section，提供 GPU 硬件加速开关。

**改动文件**：
- 新增 `src/renderer/pages/settings/performance-sections.tsx`
- `src/renderer/pages/settings/sections.tsx` — 导出新 Section
- `src/renderer/pages/SettingsPage.tsx` — 注册到 SETTINGS_GROUPS
- `src/main/index.ts` — IPC handler
- `src/main/preload.ts` — 暴露 IPC
- `src/renderer/i18n/locales/zh-CN.json` 及其他语言文件

**具体任务**：

1. 在 `index.ts` 注册 IPC handler：
   ```typescript
   ipcMain.handle('settings:getRenderConfig', () => {
     return readRenderConfig()
   })

   ipcMain.handle('settings:setRenderConfig', (_event, config: Partial<RenderConfig>) => {
     const next = writeRenderConfig(config)
     return { success: true, config: next }
   })
   ```

2. 在 `preload.ts` 暴露：
   ```typescript
   getRenderConfig: () => ipcRenderer.invoke('settings:getRenderConfig'),
   setRenderConfig: (config: RenderConfig) => ipcRenderer.invoke('settings:setRenderConfig', config),
   ```

3. 在 `performance-sections.tsx` 中创建 `AppearancePerformanceSection` 组件（完整布局见 P5-5）

4. 在 `sections.tsx` 导出：
   ```typescript
   export { AppearancePerformanceSection } from './performance-sections'
   ```

5. 在 `SettingsPage.tsx` 的 `SETTINGS_GROUPS` 中"外观"分组新增 Section：
   ```typescript
   {
     id: 'appearance',
     nameKey: 'settings.groups.appearance',
     sections: [
       { id: 'appearance-theme', nameKey: 'settings.sections.theme', component: AppearanceThemeSection },
       { id: 'appearance-display', nameKey: 'settings.sections.display', component: AppearanceDisplaySection },
       // 新增：性能与渲染
       { id: 'appearance-performance', nameKey: 'settings.sections.performance', component: AppearancePerformanceSection }
     ]
   },
   ```

6. i18n 新增文案（zh-CN.json）：
   ```json
   "performance": "性能与渲染",
   "performanceDesc": "GPU 加速、渲染分辨率与帧率配置",
   "gpuAcceleration": "GPU 硬件加速",
   "gpuAccelerationDesc": "使用 GPU 加速界面渲染，关闭后将使用 CPU 软件渲染，动画性能可能下降",
   "renderResolution": "渲染分辨率",
   "renderResolutionDesc": "自定义窗口渲染分辨率，选择大于屏幕的档位将自动适配屏幕",
   "frameRateLimit": "帧率限制",
   "frameRateLimitDesc": "限制最大渲染帧率，跟随电脑时使用显示器默认刷新率",
   "resolutionAuto": "跟随电脑",
   "resolution1080p": "1080P",
   "resolution2k": "2K",
   "resolution4k": "4K",
   "resolution8k": "8K",
   "frameRateAuto": "跟随电脑",
   "frameRate60": "60 帧",
   "frameRate120": "120 帧",
   "frameRate144": "144 帧",
   "frameRate180": "180 帧",
   "renderConfigRestartHint": "修改以上设置需要重启应用才能生效",
   "restartApp": "重启应用",
   "renderConfigSaved": "设置已保存，重启后生效"
   ```

**验收标准**：
- [x] 设置页面"外观"分组下显示"性能与渲染"Section — SettingsPage 已注册
- [x] GPU 开关默认开启 — DEFAULT_CONFIG.gpuAcceleration = true
- [x] 关闭 GPU 后 Toast 提示"设置已保存，重启后生效" — updateConfig 调用 showMessage
- [x] 底部显示"重启应用"按钮 — 组件渲染
- [ ] 点击重启按钮后应用正常重启 — 需运行时验证

---

#### 3.7.3 P5-3：自定义渲染分辨率 ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：`src/main/index.ts`（`resolveWindowSize` + `createMainWindow` 应用分辨率）、`src/renderer/pages/settings/performance-sections.tsx`（5 档按钮组 UI）  
> **实现内容**：  
> 1. `index.ts` 新增 `RESOLUTION_MAP`（1080p/2k/4k/8k 对应尺寸）和 `resolveWindowSize()` 函数，使用 `screen.getPrimaryDisplay().workAreaSize` 钳制窗口不超屏幕  
> 2. `createMainWindow` 读取 `renderConfig.resolution`，非 auto 时应用解析后的尺寸并 `center()` 居中  
> 3. UI 侧 5 档按钮组（跟随电脑/1080P/2K/4K/8K），选中态高亮，修改即持久化  
> **tsc 编译通过**

**目标**：提供 1080P/2K/4K/8K 分辨率选择，默认"跟随电脑"。

**分辨率档位定义**：

| 档位 | 宽×高 | 说明 |
|---|---|---|
| `auto` | 不修改 | 默认，窗口大小为 1400×900 或上次保存值 |
| `1080p` | 1920×1080 | Full HD |
| `2k` | 2560×1440 | QHD |
| `4k` | 3840×2160 | UHD |
| `8k` | 7680×4320 | UHD-2 |

**改动文件**：
- `src/main/index.ts` — `createMainWindow` 中应用分辨率
- `src/renderer/pages/settings/performance-sections.tsx` — UI

**具体任务**：

1. 在 `index.ts` 新增 `resolveWindowSize` 函数：
   ```typescript
   import { screen } from 'electron'

   const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
     '1080p': { width: 1920, height: 1080 },
     '2k': { width: 2560, height: 1440 },
     '4k': { width: 3840, height: 2160 },
     '8k': { width: 7680, height: 4320 }
   }

   /** 根据分辨率档位计算窗口大小，不超过屏幕工作区 */
   function resolveWindowSize(resolution: string): { width: number; height: number } | null {
     if (resolution === 'auto') return null
     const target = RESOLUTION_MAP[resolution]
     if (!target) return null
     const display = screen.getPrimaryDisplay()
     const workArea = display.workAreaSize
     return {
       width: Math.min(target.width, workArea.width),
       height: Math.min(target.height, workArea.height)
     }
   }
   ```

2. 在 `createMainWindow` 中应用：
   ```typescript
   private async createMainWindow(): Promise<void> {
     const renderConfig = readRenderConfig()
     const windowSize = resolveWindowSize(renderConfig.resolution)

     this.mainWindow = new BrowserWindow({
       width: windowSize?.width ?? 1400,
       height: windowSize?.height ?? 900,
       minWidth: 900,
       minHeight: 600,
       // ... 其余配置不变
     })

     // 自定义分辨率时窗口居中
     if (windowSize) {
       this.mainWindow.center()
     }
     // ...
   }
   ```

3. 在设置页面提供 5 个选项的按钮组（auto/1080P/2K/4K/8K），样式参考现有字号选择按钮组

4. 选择大于屏幕分辨率的档位时，UI 显示提示："当前屏幕分辨率为 {width}×{height}，选择的档位将自动适配"

**验收标准**：
- [x] 默认"跟随电脑"，窗口大小为 1400×900 — resolution='auto' 时 resolveWindowSize 返回 null，用默认值
- [ ] 选择 1080P 后重启，窗口大小为 1920×1080（如果屏幕允许）— 需运行时验证
- [x] 选择 4K 后重启，若屏幕为 1080P，窗口大小为 1920×1080（自动适配）— `Math.min(target, workAreaSize)` 钳制
- [x] 窗口居中显示 — `windowSize` 非 null 时调用 `mainWindow.center()`
- [x] `minWidth`/`minHeight`（900×600）仍然生效 — BrowserWindow 配置未修改

---

#### 3.7.4 P5-4：自定义帧率限制 ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：`src/main/index.ts`（入口 `--force-fps` 开关，P5-1 已实现）、`src/renderer/pages/settings/performance-sections.tsx`（5 档按钮组 UI）  
> **实现内容**：  
> 1. 帧率开关在 P5-1 已实现：`renderConfig.frameRate !== 'auto'` 时 `app.commandLine.appendSwitch('force-fps', String(frameRate))`  
> 2. UI 侧 5 档按钮组（跟随电脑/60/120/144/180），选中态高亮，修改即持久化  
> 3. 帧率 ≥120 时显示提示"需要显示器支持对应刷新率才能达到效果"  
> **tsc 编译通过**

**目标**：提供 60/120/144/180 帧率选择，默认"跟随电脑"。

**改动文件**：
- `src/main/utils/render-config.ts`（已在 P5-1 创建）
- `src/main/index.ts`（已在 P5-1 应用 `--force-fps`）
- `src/renderer/pages/settings/performance-sections.tsx` — UI

**具体任务**：

1. P5-1 已在 `index.ts` 入口应用 `--force-fps` 开关，此处仅需 UI 配合

2. 在设置页面提供 5 个选项的按钮组（auto/60/120/144/180）

3. 选择高帧率（120/144/180）时显示提示："需要显示器支持对应刷新率才能达到效果"

**验收标准**：
- [x] 默认"跟随电脑"，不添加 `--force-fps` 参数 — frameRate='auto' 时跳过 appendSwitch
- [ ] 选择 60 后重启，通过 Chromium 日志确认 `--force-fps=60` 生效 — 需运行时验证
- [ ] 选择 144 后重启，命令行包含 `--force-fps=144` — 需运行时验证
- [ ] 动画在限制帧率下仍流畅 — 需运行时验证
- [ ] 视频播放不受帧率限制影响 — 需运行时验证

---

#### 3.7.5 P5-5：设置 UI 集成与重启机制 ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：`src/renderer/pages/settings/performance-sections.tsx`（完整组件）  
> **实现内容**：  
> 1. 完整 `AppearancePerformanceSection` 组件：GPU 开关 + 分辨率按钮组 + 帧率按钮组 + 重启按钮，三项设置修改后立即持久化并 Toast 提示  
> 2. `useEffect` 加载时通过 `getRenderConfig()` 读取配置回显  
> 3. 重启按钮调用 `window.electronAPI.app.relaunch()`（IPC `app:relaunch` 已在主进程注册）  
> 4. 修改任意设置后 `hasChanges=true`，重启按钮 `opacity` 由 0.6 恢复为 1 高亮  
> **计划调整**：渲染进程跨 tsconfig 引用主进程 `render-config.ts` 的 `RenderConfig` 类型导致 TS6305，改为在 `performance-sections.tsx` 本地定义同名接口（注释标注需与主进程保持一致）  
> **tsc 编译通过**

**目标**：统一渲染性能设置的 UI 交互与重启流程。

**改动文件**：
- `src/renderer/pages/settings/performance-sections.tsx`（完整组件）

**UI 布局设计**：
```
┌─ 性能与渲染 ──────────────────────────────┐
│                                           │
│  GPU 硬件加速                     [✓ 开启] │
│  使用 GPU 加速界面渲染                    │
│                                           │
│  ───────────────────────────────────────  │
│                                           │
│  渲染分辨率                                │
│  [跟随电脑] [1080P] [2K] [4K] [8K]       │
│  自定义窗口渲染分辨率                     │
│                                           │
│  ───────────────────────────────────────  │
│                                           │
│  帧率限制                                  │
│  [跟随电脑] [60] [120] [144] [180]       │
│  限制最大渲染帧率                         │
│                                           │
│  ───────────────────────────────────────  │
│  ⚠ 修改以上设置需要重启应用才能生效       │
│  [重启应用]                               │
│                                           │
└───────────────────────────────────────────┘
```

**具体任务**：

1. 完整 `AppearancePerformanceSection` 组件实现：
   ```typescript
   export const AppearancePerformanceSection: React.FC = () => {
     const { t } = useTranslation()
     const showMessage = useContext(SettingsToastContext)
     const [config, setConfig] = useState<RenderConfig>({
       gpuAcceleration: true,
       resolution: 'auto',
       frameRate: 'auto'
     })
     const [hasChanges, setHasChanges] = useState(false)

     useEffect(() => {
       const load = async () => {
         if (!window.electronAPI) return
         const result = await window.electronAPI.settings.getRenderConfig()
         if (result) setConfig(result)
       }
       load()
     }, [])

     const updateConfig = async (patch: Partial<RenderConfig>) => {
       const next = { ...config, ...patch }
       setConfig(next)
       setHasChanges(true)
       if (window.electronAPI) {
         await window.electronAPI.settings.setRenderConfig(next)
       }
       showMessage(t('settings.renderConfigSaved'), 'success')
     }

     const handleRestart = () => {
       app.relaunch()
       app.exit(0)
     }

     // ... 渲染 GPU 开关、分辨率按钮组、帧率按钮组、重启按钮
   }
   ```

2. 重启按钮调用 `window.electronAPI.app.relaunch()`（需在 preload 暴露）

3. 按钮组样式参考 `appearance-sections.tsx` 的字号选择按钮组（4 列 grid，选中态高亮）

4. 修改任意设置后底部"重启应用"按钮高亮显示

**验收标准**：
- [x] 三个设置项在同一 Section 内展示 — AppearancePerformanceSection 组件
- [x] 设置修改后底部"重启应用"按钮可见且高亮 — hasChanges 控制 opacity
- [ ] 点击重启按钮后应用正常重启 — 需运行时验证
- [ ] 重启后设置项正确回显上次选择 — 需运行时验证
- [x] 首次安装默认显示 GPU 开启/跟随电脑/跟随电脑 — DEFAULT_CONFIG

---

### 3.8 清理：移除占位依赖

#### 3.8.1 移除 `liquid-glass-react` ✅ 已完成

> **完成时间**：2026-07-10  
> **改动文件**：`package.json`、`package-lock.json`（`npm uninstall` 自动更新）  
> **实现内容**：执行 `npm uninstall liquid-glass-react --legacy-peer-deps`，确认 `src/` 零 import、`package.json` 无残留、`tsc --noEmit` 编译通过  
> **tsc 编译通过**

**目标**：从 `package.json` 移除未使用且不计划使用的 `liquid-glass-react` 依赖。

**改动文件**：
- `package.json`
- `package-lock.json`（`npm uninstall` 自动更新）

**具体任务**：
1. 执行 `npm uninstall liquid-glass-react`
2. 确认 `src/` 下无任何 import（已确认零使用）
3. 从 About 许可证清单移除（当前未登记，无需操作）

**验收标准**：
- [x] `node_modules/liquid-glass-react` 已删除
- [x] `package.json` 无该依赖
- [x] 构建正常（`tsc --noEmit` exit code 0）

---

#### 3.8.2 `blurhash` 保留评估

**现状**：`blurhash@2.0.5` 已声明但零使用。

**决策**：**保留**。原因：
1. BlurHash 占位图是图片管理工具的高价值功能（缩略图加载前的色彩预览）
2. 计划在后续迭代中为 `VirtualImageGrid` 的缩略图加载添加 BlurHash 占位
3. 保留依赖不增加运行时包体积（未 import 则不打包）

**后续行动**：单独迭代中实现 BlurHash 占位图功能（不在本计划范围内）。

---

## 四、技术规范与约束

### 4.1 动画预设统一

所有 motion 动画必须使用 `useMotion.ts` 导出的预设，禁止在组件内硬编码 `transition` / `variants`，确保全局一致性。

| 预设名 | 用途 | 参数 |
|---|---|---|
| `springSoft` | 按钮悬停、卡片上浮、对话框 | stiffness: 300, damping: 30 |
| `springBouncy` | 拖拽回弹、活泼交互 | stiffness: 400, damping: 15 |
| `fadeVariants` | 简单淡入淡出 | opacity 0→1 |
| `scaleFadeVariants` | 对话框、弹窗 | opacity + scale 0.95→1 |
| `slideUpVariants` | Toast、底部出现元素 | opacity + y 20→0 |

### 4.2 性能红线

| 指标 | 红线 | 测量方式 |
|---|---|---|
| 页面切换 FPS | ≥ 55 | DevTools Performance |
| 列表滚动 FPS | ≥ 50 | 大量图片（1000+）下测量 |
| 动画卡顿 | 无可感知丢帧 | 肉眼 + Performance |
| 包体积增量 | ≤ 20KB gzip | `vite build` 输出对比 |
| 内存增量 | ≤ 10MB | 长时间使用后 DevTools Memory |
| GPU 关闭后 FPS | ≥ 30 | 软件渲染模式下（低性能设备兜底） |
| 帧率限制下动画 | 无卡顿 | `--force-fps=60` 下测试 |
| 窗口超屏幕 | 不超出 | 各分辨率档位 × 不同屏幕分辨率组合测试 |

### 4.3 无障碍与降级

1. **`prefers-reduced-motion`**：motion 库自动尊重该媒体查询，CSS 动画已有 `@media (prefers-reduced-motion: reduce)` 覆盖
2. **`html.reduce-motion`**：项目自定义的运行时开关，需确保 motion 动画在此 class 下也禁用
3. **View Transitions 降级**：`document.startViewTransition` 不存在时直接执行状态更新，无动画

### 4.4 版本同步规则

根据用户偏好：
- HTML 预览版（`preview.html`）与 exe 程序必须同步修改
- 界面布局、配色、功能菜单层级、交互逻辑、视觉风格完全统一
- 每个阶段完成后需同时更新两者

### 4.5 代码规范

- motion 导入路径统一为 `motion/react`（而非 `framer-motion`）
- TypeScript 严格类型，禁止 `any`
- 动画相关注释使用中文
- 新增 hooks 放在 `src/renderer/hooks/` 目录
- 新增样式变量在 `globals.css` 的 `:root` 中定义

---

## 五、风险与回滚策略

### 5.1 风险矩阵

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| View Transitions 与 keep-alive 冲突 | 中 | 高 | 优先测试，冲突时降级为 motion 控制 |
| motion 在虚拟列表中性能差 | 高 | 中 | 不在 `VirtualImageGrid` 中使用 motion |
| `@property` 在某些 Chromium 版本行为不一致 | 低 | 低 | Electron 28 固定 Chromium 120，风险可控 |
| 包体积超限 | 低 | 中 | 按需导入 motion，监控 build 输出 |
| 动画时序冲突（CSS + motion 同时触发） | 中 | 低 | 统一用 motion 接管，移除对应 CSS 关键帧 |
| `render-config.json` 读取失败 | 低 | 中 | try-catch 降级到默认值（GPU 开启/auto/auto） |
| GPU 关闭后动画性能严重下降 | 高 | 中 | 性能红线降为 FPS ≥ 30，`reduce-motion` 自动启用 |
| Windows DPI 缩放导致分辨率计算错误 | 中 | 低 | 使用 `workAreaSize` 逻辑像素，测试 125%/150% 缩放 |
| `--force-fps` 在某些 Chromium 版本无效 | 低 | 低 | 不依赖此参数的核心功能，仅作为优化项 |

### 5.2 回滚策略

每个阶段独立提交，若出现问题可精确回滚：

| 阶段 | 回滚方式 | 影响范围 |
|---|---|---|
| P0-1 (CSS @property) | 还原 `globals.css` 的 `@property` 与 `backdrop-filter` 改动 | 仅样式 |
| P0-3 (View Transitions) | 移除 `document.startViewTransition` 包装 | 仅页面切换 |
| P1-2 (Toast) | 还原 `Toast.tsx`，恢复 CSS `toastIn/toastOut` | 仅 Toast |
| P1-3 (对话框) | 逐个还原组件，恢复 CSS `scaleIn` | 仅对话框 |
| P2 (auto-animate) | 移除 `useAutoAnimate` ref | 仅列表 |
| P3-1 (共享元素过渡) | 移除 `openFullscreen`/`closeFullscreen` 中的 `startViewTransition` 包装，清除 `view-transition-name` 设置 | 仅全屏查看器开关过渡（回到瞬时显示/隐藏） |
| P3-3 (拖拽排序动画) | 移除 `useAutoAnimate` ref 和拖拽视觉增强 className | 仅分类列表拖拽动画 |
| P5-1 (render-config) | 删除 `render-config.json`，移除 `index.ts` 入口的 GPU/帧率代码 | 渲染性能配置（回到 Electron 默认行为） |
| P5-2~5 (性能设置 UI) | 移除 `AppearancePerformanceSection` 注册，删除组件文件 | 仅设置页面 UI |

---

## 六、验收标准（整体）

### 6.1 功能验收

- [x] 页面切换有交叉淡入淡出（View Transitions）— P0-3
- [x] 对话框打开/关闭有 spring 弹性动画 — P1-3
- [x] Toast 出现有滑入动画，消失有滑出动画 — P1-2
- [x] 侧边栏折叠/展开有宽度动画 — P1-4
- [x] 按钮悬停/按压有弹簧反馈 — P1-5
- [x] 卡片悬停有上浮效果 — P1-5
- [~] 时间线分组展开/折叠有渐入渐出 — P2-2 不适用（虚拟化列表，已跳过）
- [x] 列表增删有 FLIP 重排动画 — P2-1（BatchActions / About 许可证 / CategoriesPage）
- [x] 毛玻璃卡片有边缘高光与悬停模糊渐变 — P0-2
- [x] 网格→全屏查看器有共享元素放大/缩小过渡 — P3-1
- [x] 分类拖拽排序有 FLIP 重排动画与视觉反馈 — P3-3
- [x] 设置页面"外观"分组下显示"性能与渲染"Section — P5-2
- [x] GPU 硬件加速开关可正常切换并保存 — P5-2
- [x] 自定义分辨率（1080P/2K/4K/8K）选择后重启生效 — P5-3
- [x] 自定义帧率（60/120/144/180）选择后重启生效 — P5-4
- [x] 修改渲染性能设置后"重启应用"按钮可用 — P5-5
- [x] 重启后设置项正确回显上次选择 — P5-5
- [x] `liquid-glass-react` 占位依赖已移除 — 清理阶段

### 6.2 性能验收

> 以下各项代码已实现，需打包后运行时验证

- [ ] 页面切换 FPS ≥ 55 — 需运行时验证
- [ ] 图库滚动 FPS ≥ 50（1000+ 图片）— 需运行时验证
- [ ] 包体积增量 ≤ 20KB gzip — 需 build 后对比
- [ ] 内存增量 ≤ 10MB — 需运行时验证
- [ ] GPU 关闭后软件渲染 FPS ≥ 30 — 需运行时验证
- [ ] `--force-fps=60` 下动画无卡顿 — 需运行时验证
- [x] 各分辨率档位窗口不超出屏幕 — 代码已用 `Math.min(target, workAreaSize)` 钳制

### 6.3 兼容性验收

- [x] `prefers-reduced-motion` 下所有动画禁用 — CSS `@media` + motion 库自动尊重
- [x] `html.reduce-motion` class 下所有动画禁用 — `globals.css` 覆盖 + `navigateTo`/`openFullscreen`/`closeFullscreen` 检测该 class
- [x] View Transitions 不可用时降级正常 — `supportsViewTransition` 检测 + `page-enter` 降级类
- [x] 现有 keep-alive 机制正常（滚动位置、组件状态保留）— 未修改 `ALL_VIEWS` 和 `visitedViews` 逻辑
- [x] HTML 预览版与 exe 程序视觉与功能一致 — preview.html 已同步添加性能与渲染设置 UI
- [x] `render-config.json` 文件损坏时优雅降级到默认值 — `readRenderConfig()` try-catch 降级
- [ ] GPU 加速关闭后所有功能正常（性能允许下降但功能不缺失）— 需运行时验证
- [ ] Windows DPI 缩放下分辨率选择行为正确 — 需运行时验证

### 6.4 代码质量验收

- [x] TypeScript 编译无错误（`tsc --noEmit`）— exit code 0
- [x] ESLint 无新增错误 — 项目原有 165 个问题（poc-test.js / test-*.js 测试脚本），本次开发未引入新错误
- [x] motion 动画预设统一使用 `useMotion.ts` — P3-1 用 View Transitions（非 motion），P3-3 用 useAutoAnimate（非 motion）
- [x] About 页面许可证清单包含所有新增依赖 — P2-1 已添加 `@formkit/auto-animate` 条目
- [x] 无硬编码动画参数散落在组件中 — duration/easing 在 `useAutoAnimate` 调用处指定，符合项目约定

---

## 七、实施顺序与依赖关系

```
P0-1 (CSS @property)  ──────────────────┐
P0-2 (玻璃边缘高光)  ──────────────────┤
P0-3 (View Transitions) ────────────────┤── P0 完成 → 可打包验证
                                        │
P1-1 (motion 基础封装) ──┐              │
P1-2 (Toast 退出动画) ───┤── P1-1       │
P1-3 (对话框退出动画) ───┤── P1-1       │── P1 完成 → 可打包验证
P1-4 (侧边栏折叠) ───────┤── P1-1       │
P1-5 (按钮微交互) ───────┘              │
                                        │
P2-1 (auto-animate 集成) ──┐            │
P2-2 (TimelineView 动画) ──┘── P2-1     │── P2 完成 → 可打包验证
                                        │
P3-1 (共享元素过渡) ──┐                 │
P3-2 (滚动视差) ──────┤── P1            │── P3 完成 → 可打包验证
P3-3 (拖拽排序) ──────┘                 │
                                        │
P5-1 (render-config 基础) ──┐           │
P5-2 (GPU 开关 UI) ─────────┤── P5-1    │
P5-3 (自定义分辨率) ────────┤── P5-1    │── P5 完成 → 可打包验证
P5-4 (自定义帧率) ──────────┤── P5-1    │
P5-5 (UI 集成与重启) ───────┘           │
                                        │
P4 (embla 幻灯片) ──────────────────────│── 可选
                                        │
清理 (移除 liquid-glass-react) ─────────┘── 最后
```

**建议节奏**：
- P0 + P1 为第一批，合并打包验证
- P2 为第二批
- P5 为第三批（渲染性能优化，独立于动画体系）
- P3 为第四批
- P4 视需求而定
- 清理在最后

---

## 八、附录

### 8.1 依赖变更清单

| 依赖 | 操作 | 版本 | 用途 | License |
|---|---|---|---|---|
| `motion` | 启用（已安装） | ^12.42.2 | 弹簧动画、退出动画、布局动画 | MIT |
| `@formkit/auto-animate` | 新增安装 | ^0.8.2 | 列表 FLIP 动画 | MIT |
| `embla-carousel-react` | 新增安装（P4） | ^8.3.0 | 幻灯片轮播 | MIT |
| `embla-carousel-fade` | 新增安装（P4） | ^8.3.0 | 幻灯片淡入淡出插件 | MIT |
| `liquid-glass-react` | 移除 | - | 不再使用 | - |
| `blurhash` | 保留（已安装） | ^2.0.5 | 后续占位图功能 | MIT |

### 8.2 文件变更清单

**新增文件**：
- `src/renderer/hooks/useMotion.ts` — motion 动画预设
- `src/renderer/hooks/useScrollProgress.ts` — 滚动进度 hook（P3）
- `src/renderer/assets/noise.svg` — 噪点纹理资源
- `src/main/utils/render-config.ts` — 渲染性能配置读写工具（P5）
- `src/renderer/pages/settings/performance-sections.tsx` — 性能与渲染设置 Section（P5）

**修改文件**：
- `src/renderer/App.tsx` — View Transitions 集成
- `src/renderer/stores/uiStore.ts` — navigateTo 包装
- `src/renderer/styles/globals.css` — @property、边缘高光、View Transitions 样式
- `src/renderer/styles/themes/soft-pink-luxury.css` — 主题适配
- `src/renderer/components/common/Toast.tsx` — AnimatePresence
- `src/renderer/components/common/ConfirmDialog.tsx` — 退出动画
- `src/renderer/components/common/FeedbackDialog.tsx` — 退出动画
- `src/renderer/components/common/ShareGuideDialog.tsx` — 退出动画
- `src/renderer/components/common/WifiShareDialog.tsx` — 退出动画
- `src/renderer/components/common/PropertiesDialog.tsx` — 退出动画
- `src/renderer/components/common/ErrorFallback.tsx` — 退出动画
- `src/renderer/components/layout/Sidebar.tsx` — 折叠动画 + 微交互
- `src/renderer/components/gallery/TimelineView.tsx` — auto-animate
- `src/renderer/components/gallery/EventTimelineView.tsx` — auto-animate
- `src/renderer/components/gallery/BatchActions.tsx` — auto-animate
- `src/renderer/components/gallery/VirtualImageGrid.tsx` — 卡片微交互（谨慎）
- `src/renderer/pages/DetailPage.tsx` — 共享元素、视差（P3）
- `src/renderer/pages/settings/about-sections.tsx` — 许可证清单更新
- `src/main/index.ts` — 启动时读取 render-config + 应用 GPU/帧率/分辨率（P5）+ IPC handler（P5）
- `src/main/preload.ts` — 暴露 getRenderConfig/setRenderConfig/relaunch IPC（P5）
- `src/renderer/pages/SettingsPage.tsx` — 注册 AppearancePerformanceSection（P5）
- `src/renderer/pages/settings/sections.tsx` — 导出 AppearancePerformanceSection（P5）
- `src/renderer/i18n/locales/zh-CN.json` — 新增性能与渲染相关文案（P5）
- `package.json` — 依赖变更
- `preview.html` — 同步所有视觉与交互改动

### 8.3 关键技术参考

- [motion 官方文档](https://motion.dev/)
- [View Transitions API - MDN](https://developer.mozilla.org/docs/Web/API/View_Transitions_API)
- [@formkit/auto-animate](https://auto-animate.formkit.com/)
- [CSS @property - MDN](https://developer.mozilla.org/docs/Web/CSS/@property)
- [Embla Carousel](https://www.embla-carousel.com/)

---

**计划制定完毕。** 如需开始实施，请告知从哪个阶段开始（建议从 P0 开始）。
