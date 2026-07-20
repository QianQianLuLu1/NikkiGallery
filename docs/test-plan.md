# 单元测试体系搭建方案

> 项目：wxnn-photo-manager（无限暖暖相册管理工具）
> 版本：v2.3.0
> 制定日期：2026-07-19
> 测试框架：vitest@^1.6.0 / @vitest/coverage-v8@^1.6.0
> 适用范围：主进程（Electron）、渲染进程（React）、共享层（shared / common）

---

## 一、分层测试策略

### 1.1 测试金字塔分层

项目采用「Electron + React + TypeScript」架构，按测试金字塔分为五层：

| 层级 | 范围 | 单测占比 | 执行环境 | 速度目标 |
|---|---|---|---|---|
| L1 纯函数单元测试 | `src/main/utils`、`src/renderer/utils`、`src/common/utils`、`src/shared` | 60% | node | < 5s |
| L2 数据访问层测试 | `src/main/database`、`src/main/scanner`、`src/main/services/*-service` | 20% | node + 内存 SQLite | < 10s |
| L3 渲染层 Store / Hook 测试 | `src/renderer/stores`、`src/renderer/hooks` | 10% | node / jsdom | < 8s |
| L4 组件交互测试 | `src/renderer/components`、`src/renderer/pages` | 7% | jsdom + RTL | < 20s |
| L5 集成 / E2E 测试 | IPC 端到端、Electron 主流程 | 3% | electron + 真实文件系统 | < 60s |

### 1.2 分层目标与边界

#### L1 - 纯函数单元测试
- **目标**：覆盖所有不依赖 Electron API / 文件系统 / 二进制库的纯函数
- **特点**：输入输出确定、无副作用、可并行执行
- **覆盖范围**：
  - `src/main/utils/*`：路径分类、评分、并发控制、IPC 校验、场景识别、媒体常量、游戏事件、pHash 距离、文件工具
  - `src/renderer/utils/*`：LUT 色彩查找表、图片处理算法、滤镜预设、日期/格式化、文件名解析
  - `src/common/utils/*`：通用工具
  - `src/shared/*`：错误码、维度计算、场景分类枚举

#### L2 - 数据访问层测试
- **目标**：覆盖数据库 CRUD、扫描器路径分类、服务层非 Electron 部分
- **特点**：依赖 `better-sqlite3` 内存库、可重复、无网络/无进程间通信
- **覆盖范围**：
  - `src/main/database/media-repository.ts`：34 个方法
  - `src/main/scanner/path-classifier.ts`、`index.ts`（纯路径逻辑部分）
  - `src/main/services/*-service.ts`：可 mock Electron API 的服务
  - `src/main/thumbnail/generator.ts`：mock sharp 后的纯逻辑

#### L3 - 渲染层 Store / Hook 测试
- **目标**：覆盖全局状态管理与可复用 Hook
- **特点**：zustand store 在 node 环境可直接测试，Hook 需 jsdom + RTL
- **覆盖范围**：
  - `src/renderer/stores/*`：mediaStore、operationHistoryStore、themeStore、uiStore
  - `src/renderer/hooks/*`：useToast、useEditHistory、useEditorShortcuts、useVirtualScroll、useFilteredMediaFiles 等

#### L4 - 组件交互测试
- **目标**：覆盖关键交互组件的渲染、事件响应、props 传递
- **特点**：jsdom 环境 + React Testing Library，不渲染整页
- **覆盖范围**（优先级精选）：
  - `components/common/`：BaseDialog、ConfirmDialog、Toast、ContextMenu、PropertiesDialog、ShareGuideDialog
  - `components/gallery/`：VirtualImageGrid、FullscreenViewer、BatchActions、RenameDialog
  - `components/editor/`：EditorToolbar、FilterPanel、ToneCurve、Histogram
  - `components/scanner/`：ScanButton、ScanProgress

#### L5 - 集成 / E2E 测试
- **目标**：覆盖跨层调用、真实 Electron 主流程
- **特点**：仅在 CI 流水线或本地验收前运行，依赖真实环境
- **覆盖范围**：
  - IPC 端到端：renderer → preload → main → service → database
  - 启动流程：`Application.initialize` 各阶段
  - 关键用户路径：扫描 → 浏览 → 编辑 → 导出

### 1.3 模块测试优先级排序

按「业务价值 × 故障概率 × 测试难度（越易越优先）」综合排序：

| 优先级 | 模块 | 路径 | 理由 |
|---|---|---|---|
| P0 | 媒体数据库仓储 | `src/main/database/media-repository.ts` | 859 行核心 CRUD，故障直接导致数据丢失 |
| P0 | 文件工具 | `src/main/utils/file-utils.ts` | 文件移动/哈希计算，故障导致文件丢失 |
| P0 | 重复检测评分 | `src/main/utils/duplicate-scoring.ts` | 用户高频依赖的去重逻辑 |
| P0 | 图片编辑器算法 | `src/renderer/utils/imageProcessor.ts` | 948 行滤镜算法，回归测试保证编辑一致性 |
| P0 | LUT 色彩查找表 | `src/renderer/utils/lut.ts` | LUT 解析/插值精度影响视觉一致 |
| P1 | pHash 距离 | `src/main/utils/phash.ts` | 已覆盖 hammingDistance，补边界 |
| P1 | 场景分类 | `src/main/utils/scene-category.ts` | 已覆盖，补 3D 场景映射 |
| P1 | 游戏事件解析 | `src/main/utils/game-events.ts` | 已覆盖，补异常输入 |
| P1 | 媒体常量 | `src/main/utils/media-constants.ts` | 已覆盖，补新增枚举 |
| P1 | 并发控制 | `src/main/utils/concurrency.ts` | 已覆盖，补竞态用例 |
| P1 | IPC 参数校验 | `src/main/utils/ipc-validate.ts` | 安全防线 |
| P1 | 路径分类器 | `src/main/scanner/path-classifier.ts` | 纯函数，影响扫描准确性 |
| P2 | 扫描器入口 | `src/main/scanner/index.ts` | 已覆盖部分，补 Steam/Epic 路径 |
| P2 | 共享剪贴板服务 | `src/main/services/share-clipboard-service.ts` | 已覆盖，补注册表回退分支 |
| P2 | WiFi 共享服务 | `src/main/services/share-wifi-service.ts` | 已覆盖 |
| P2 | 解密服务 | `src/main/services/decryption-service.ts` | 集成测试已覆盖 |
| P2 | mediaStore | `src/renderer/stores/mediaStore.ts` | 已覆盖，补新 action |
| P2 | operationHistoryStore | `src/renderer/stores/operationHistoryStore.ts` | 已覆盖 |
| P3 | IPC handlers | `src/main/ipc/handlers/*.ts` | 12 个 handler，需 mock Electron API |
| P3 | 编辑器 Hooks | `src/renderer/hooks/useEditHistory.ts` 等 | 依赖 React 上下文 |
| P3 | 关键组件 | `src/renderer/components/*` | L4 层，需 RTL |
| P4 | 媒体 worker | `src/main/media-worker/*` | 子进程通信，需集成测试 |
| P4 | 调度器 | `src/main/scheduler/task-scheduler.ts` | 任务队列时序逻辑 |
| P4 | 缩略图生成 | `src/main/thumbnail/generator.ts` | 依赖 sharp 二进制 |
| P5 | 启动诊断 | `src/main/utils/startup-diagnostic.ts` | 依赖 OS API |
| P5 | FFmpeg 路径/运行器 | `src/main/utils/ffmpeg-*.ts` | 依赖 Electron 打包路径 |
| P5 | 磁盘/目录管理 | `src/main/utils/disk.ts`、`dir-manager.ts` | 依赖 OS |

---

## 二、测试目录结构

### 2.1 目录组织策略

采用 **co-location（同目录）模式**，与现有 21 个测试文件保持一致。理由：
1. vitest 默认 `include: ['src/**/*.test.ts']` 即可发现
2. IDE 中源码旁可直接点击运行（VSCode Vitest 插件支持）
3. 与现有约定一致，无迁移成本

集成测试使用 `.integration.test.ts` 后缀，便于按需单独运行。

### 2.2 完整目录结构

```
wxnn-photo-manager/
├── src/
│   ├── common/
│   │   └── utils/
│   │       ├── common-utils.test.ts            [已有]
│   │       ├── date.test.ts                    [P3 新增]
│   │       ├── format.test.ts                  [P3 新增]
│   │       ├── id.test.ts                      [P3 新增]
│   │       ├── object.test.ts                  [P3 新增]
│   │       ├── path.test.ts                    [P3 新增]
│   │       └── string.test.ts                  [P3 新增]
│   ├── main/
│   │   ├── database/
│   │   │   ├── media-repository.test.ts        [已有 P0]
│   │   │   └── connection.test.ts              [P4 mock electron.app]
│   │   ├── ipc/
│   │   │   └── handlers/
│   │   │       ├── media.test.ts               [P3 mock Electron]
│   │   │       ├── file.test.ts                [P3]
│   │   │       ├── editor.test.ts              [P3]
│   │   │       ├── backup.test.ts              [P3]
│   │   │       ├── share.test.ts               [P3]
│   │   │       ├── video.test.ts               [P3]
│   │   │       ├── watermark.test.ts           [P3]
│   │   │       ├── cache.test.ts               [P3]
│   │   │       ├── crash.test.ts               [P3]
│   │   │       ├── log.test.ts                 [P3]
│   │   │       ├── misc.test.ts                [P3]
│   │   │       └── set-dir-handler.test.ts     [P3]
│   │   │   ├── validator.test.ts               [P3]
│   │   ├── scanner/
│   │   │   ├── index.test.ts                   [已有 P2]
│   │   │   ├── path-classifier.test.ts         [P1 新增]
│   │   │   └── scanner-worker-bridge.test.ts   [P4 mock 子进程]
│   │   ├── scheduler/
│   │   │   └── task-scheduler.test.ts          [P4 新增]
│   │   ├── services/
│   │   │   ├── share-clipboard-service.test.ts            [已有 P2]
│   │   │   ├── share-clipboard-service.integration.test.ts [已有]
│   │   │   ├── share-wifi-service.test.ts                 [已有 P2]
│   │   │   ├── decryption-service.integration.test.ts     [已有]
│   │   │   ├── backup-service.test.ts                     [P3 新增]
│   │   │   ├── crash-service.test.ts                      [P3 新增]
│   │   │   ├── editor-service.test.ts                     [P3 新增]
│   │   │   ├── file-service.test.ts                       [P3 新增]
│   │   │   ├── livephoto-service.test.ts                  [P3 新增]
│   │   │   ├── log-service.test.ts                        [P3 新增]
│   │   │   ├── thumbnail-phash-service.test.ts            [P3 新增]
│   │   │   ├── video-service.test.ts                      [P3 新增]
│   │   │   └── watermark-service.test.ts                  [P3 新增]
│   │   ├── thumbnail/
│   │   │   └── generator.test.ts               [P4 mock sharp]
│   │   └── utils/
│   │       ├── concurrency.test.ts             [已有 P1]
│   │       ├── duplicate-scoring.test.ts       [已有 P0]
│   │       ├── file-utils.test.ts              [已有 P0]
│   │       ├── game-events.test.ts             [已有 P1]
│   │       ├── ipc-validate.test.ts            [已有 P1]
│   │       ├── media-constants.test.ts         [已有 P1]
│   │       ├── phash.test.ts                   [已有 P1]
│   │       ├── scene-category.test.ts          [已有 P1]
│   │       ├── scene-brightness.test.ts        [P3 新增]
│   │       ├── process-registry.test.ts        [P4 新增]
│   │       ├── safe-execute.test.ts            [P3 新增]
│   │       ├── startup-diagnostic.test.ts      [P5 新增 mock OS]
│   │       ├── dir-manager.test.ts             [P5 新增 mock fs]
│   │       ├── disk.test.ts                    [P5 新增 mock fs]
│   │       ├── ffmpeg-paths.test.ts            [P5 新增 mock app]
│   │       ├── ffmpeg-runner.test.ts           [P5 新增 mock fluent-ffmpeg]
│   │       └── video-probe.test.ts             [P5 新增 mock ffprobe]
│   ├── renderer/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── BaseDialog.test.tsx         [P3 新增]
│   │   │   │   ├── ConfirmDialog.test.tsx      [P3 新增]
│   │   │   │   ├── Toast.test.tsx              [P3 新增]
│   │   │   │   ├── ContextMenu.test.tsx        [P3 新增]
│   │   │   │   ├── PropertiesDialog.test.tsx   [P3 新增]
│   │   │   │   └── ShareGuideDialog.test.tsx   [P3 新增]
│   │   │   ├── gallery/
│   │   │   │   ├── right-click-wiring.test.ts  [已有 P3]
│   │   │   │   ├── VirtualImageGrid.test.tsx   [P3 新增]
│   │   │   │   ├── FullscreenViewer.test.tsx   [P3 新增]
│   │   │   │   ├── BatchActions.test.tsx       [P3 新增]
│   │   │   │   └── RenameDialog.test.tsx       [P3 新增]
│   │   │   ├── editor/
│   │   │   │   ├── EditorToolbar.test.tsx      [P3 新增]
│   │   │   │   ├── FilterPanel.test.tsx        [P3 新增]
│   │   │   │   ├── ToneCurve.test.tsx          [P3 新增]
│   │   │   │   └── Histogram.test.tsx          [P3 新增]
│   │   │   └── scanner/
│   │   │       ├── ScanButton.test.tsx         [P3 新增]
│   │   │       └── ScanProgress.test.tsx       [P3 新增]
│   │   ├── hooks/
│   │   │   ├── useToast.test.ts                [P3 新增]
│   │   │   ├── useEditHistory.test.ts          [P3 新增]
│   │   │   ├── useEditorShortcuts.test.ts      [P3 新增]
│   │   │   ├── useVirtualScroll.test.ts        [P3 新增]
│   │   │   ├── useFilteredMediaFiles.test.ts   [P3 新增]
│   │   │   ├── useBatchOperations.test.ts      [P4 新增]
│   │   │   ├── useFileOperations.test.ts       [P4 新增]
│   │   │   ├── useFavoriteToggle.test.ts       [P4 新增]
│   │   │   ├── useRefreshMedia.test.ts         [P4 新增]
│   │   │   └── useIpcCall.test.ts              [P4 新增]
│   │   ├── stores/
│   │   │   ├── mediaStore.test.ts              [已有 P2]
│   │   │   ├── mediaStore.integration.test.ts  [已有]
│   │   │   ├── operationHistoryStore.test.ts   [已有 P2]
│   │   │   ├── themeStore.test.ts              [P3 新增]
│   │   │   └── uiStore.test.ts                 [P3 新增]
│   │   └── utils/
│   │       ├── imageProcessor.test.ts          [已有 P0]
│   │       ├── lut.test.ts                     [已有 P0]
│   │       ├── date.test.ts                    [P3 新增]
│   │       ├── format.test.ts                  [P3 新增]
│   │       ├── file.test.ts                    [P3 新增]
│   │       ├── filter.test.ts                  [P3 新增]
│   │       ├── filterPresets.test.ts           [P3 新增]
│   │       ├── cloth-name-lookup.test.ts       [P3 新增]
│   │       ├── editor-colors.test.ts           [P3 新增]
│   │       ├── enum-mappings.test.ts           [P3 新增]
│   │       ├── fault-colors.test.ts            [P3 新增]
│   │       ├── group-field.test.ts             [P3 新增]
│   │       ├── location-map.test.ts            [P3 新增]
│   │       ├── lut.test.ts                     [已有]
│   │       └── responsive.test.ts              [P4 新增]
│   └── shared/
│       ├── errors/
│       │   ├── app-error.test.ts               [P3 新增]
│       │   └── error-codes.test.ts             [P3 新增]
│       ├── dimension.test.ts                   [P3 新增]
│       └── scene-category.test.ts              [P3 新增]
├── tests/
│   └── e2e/                                    [P5 新增目录]
│       ├── scan-flow.e2e.test.ts               [P5]
│       ├── edit-flow.e2e.test.ts               [P5]
│       └── export-flow.e2e.test.ts             [P5]
└── vitest.config.ts                            [按 P0/P1/P2 阶段扩展]
```

### 2.3 用例数量预估

按文件粒度估算测试用例数（含正常 + 异常 + 边界场景）：

| 层级 | 模块类别 | 文件数 | 平均用例/文件 | 用例小计 |
|---|---|---|---|---|
| L1 | 主进程纯函数 utils | 17 | 12 | 204 |
| L1 | 渲染层纯函数 utils | 14 | 10 | 140 |
| L1 | 共享层 / common | 9 | 8 | 72 |
| L2 | 数据库 / scanner 纯逻辑 | 4 | 35 | 140 |
| L2 | 服务层（可 mock 部分） | 12 | 15 | 180 |
| L3 | Store 测试 | 5 | 20 | 100 |
| L3 | Hook 测试 | 10 | 12 | 120 |
| L4 | 组件交互测试 | 16 | 10 | 160 |
| L5 | E2E 测试 | 3 | 5 | 15 |
| **合计** | - | **90** | - | **1131** |

**分阶段交付目标**：
- P0 阶段：补全核心 5 模块，约 280 用例
- P1 阶段：补全工具层 6 模块，约 200 用例
- P2 阶段：补全服务/Store 6 模块，约 220 用例
- P3 阶段：补全 IPC/Hook/组件/utils 35 模块，约 350 用例
- P4 阶段：补全调度器/worker/缩略图等 10 模块，约 80 用例
- P5 阶段：补全 OS 依赖模块 + E2E 9 模块，约 50 用例

---

## 三、Mock 隔离策略

### 3.1 隔离原则

1. **测试不依赖外部环境**：所有外部依赖（Electron API、文件系统、二进制库、网络）必须可 mock
2. **测试用例间无状态污染**：每个用例独立 setup/teardown，数据库用 `:memory:` 内存库
3. **mock 范围最小化**：仅 mock 跨越测试边界的外部依赖，不 mock 被测代码内部协作
4. **mock 实现贴近真实行为**：mock 返回值需符合真实接口契约，避免「绿测但实际崩溃」

### 3.2 各依赖类型 Mock 方案

#### 3.2.1 Electron API（`electron` 模块）

**适用模块**：`connection.ts`、IPC handlers、`startup-diagnostic.ts`、`ffmpeg-paths.ts`、`dir-manager.ts`

```typescript
// vi.mock('electron', () => ({
//   app: {
//     getPath: vi.fn((name: string) => `/mock/userdata/${name}`),
//     isPackaged: false,
//     getVersion: () => '2.3.0',
//   },
//   BrowserWindow: vi.fn(),
//   ipcMain: { handle: vi.fn(), on: vi.fn() },
//   shell: { openExternal: vi.fn(), showItemInFolder: vi.fn() },
//   dialog: { showMessageBox: vi.fn(), showOpenDialog: vi.fn() },
// }))
```

#### 3.2.2 文件系统（`fs/promises`、`fs`）

**适用模块**：`file-utils.ts` 的 `moveFile`、`scanner/index.ts`、`thumbnail/generator.ts`

策略：
- 优先使用真实 `os.tmpdir()` 临时目录写真实文件，验证行为正确性
- 仅在不可控场景（EXDEV 跨设备、ENOENT、EACCES）使用 `vi.mock('fs/promises')` 抛错

#### 3.2.3 数据库（`better-sqlite3`）

**适用模块**：`media-repository.ts`

策略：
- **不 mock**，使用 `new Database(':memory:')` 真实 SQLite
- `beforeEach` 中通过 `db.exec()` 重建 schema，确保用例隔离
- `afterEach` 中 `db.close()` 释放连接

#### 3.2.4 二进制库（`sharp`、`ffmpeg-static`、`ffprobe-static`）

**适用模块**：`phash.ts`（`calculatePHash`）、`thumbnail/generator.ts`、`video-probe.ts`、`ffmpeg-runner.ts`

策略：
- `sharp`：mock 为返回固定像素数据的对象，验证调用参数与返回值转换逻辑
- `fluent-ffmpeg`：mock 为事件发射器，模拟 progress / error / end 事件
- `ffprobe-static`：mock path 为固定字符串，不验证真实探测

#### 3.2.5 原生模块（`koffi`、`nuan5_decryption.dll`）

**适用模块**：`decryption-service.ts`

策略：
- 集成测试中加载真实 DLL，验证解密正确性
- 单元测试中 mock koffi 函数返回固定 buffer，仅验证调用契约

#### 3.2.6 渲染层 DOM API（`ImageData`、`Canvas`、`document`）

**适用模块**：`imageProcessor.ts` 的 `processImageData`、`lut.ts` 的 `applyLut3D`

策略（与现有 `lut.test.ts` 一致）：
- **不引入 jsdom**，手动构造 `{ width, height, data: Uint8ClampedArray }` mock 对象
- 符合「极简健壮」原则，避免新依赖

#### 3.2.7 React 上下文 / Provider

**适用模块**：`src/renderer/components/*`、`src/renderer/hooks/*`

策略：
- 使用 `@testing-library/react` 的 `render` 包装必要 Provider（`ThemeProvider`、`I18nProvider`）
- IPC 调用通过 `vi.mock('@/utils/xxx')` 替换为同步 stub

#### 3.2.8 子进程通信（`child_process`、`worker_threads`）

**适用模块**：`scanner-worker-bridge.ts`、`media-worker/manager.ts`

策略：
- mock `child_process.fork` 返回 `EventEmitter`，模拟 worker 消息
- 验证 bridge 层的消息序列化、超时处理、错误传递

### 3.3 Mock 工具选型

| 工具 | 版本 | 用途 | 是否新依赖 |
|---|---|---|---|
| `vitest` 内置 `vi.mock` / `vi.fn` / `vi.spyOn` | ^1.6.0 | 模块 mock、函数 stub、断言 | 已有 |
| `@vitest/coverage-v8` | ^1.6.0 | 覆盖率统计 | 已有 |
| `@testing-library/react` | ^16.0.0 | React 组件渲染与查询 | **P3 阶段新增** |
| `@testing-library/user-event` | ^14.0.0 | 模拟用户交互（点击/输入） | **P3 阶段新增** |
| `jsdom` | ^24.0.0 | L3/L4 层 DOM 环境 | **P3 阶段新增** |

> 新增依赖仅在进入 P3 阶段时安装，避免一开始就引入。

### 3.4 测试环境配置

`vitest.config.ts` 按 P0/P1/P2/P3 阶段渐进扩展：

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',         // 默认 node 环境
    environmentMatchGlobs: [
      ['src/renderer/**/*.test.tsx', 'jsdom'],   // P3 起：组件测试用 jsdom
      ['src/renderer/hooks/**/*.test.ts', 'jsdom']
    ],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'dist', 'release', '**/*.integration.test.ts'],
    globals: true,
    testTimeout: 10000,
    setupFiles: ['./tests/setup.ts'],           // P3 起：全局 setup（mock matchMedia 等）
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],       // P3 起：增加 lcov 供 CI 上传
      include: [
        // P0
        'src/main/utils/file-utils.ts',
        'src/main/utils/duplicate-scoring.ts',
        'src/renderer/utils/imageProcessor.ts',
        'src/renderer/utils/lut.ts',
        'src/main/database/media-repository.ts',
        // P1
        'src/main/utils/phash.ts',
        'src/main/utils/scene-category.ts',
        'src/main/utils/game-events.ts',
        'src/main/utils/media-constants.ts',
        'src/main/utils/concurrency.ts',
        'src/main/utils/ipc-validate.ts',
        'src/main/scanner/path-classifier.ts',
        // P2
        'src/main/scanner/index.ts',
        'src/main/services/share-clipboard-service.ts',
        'src/main/services/share-wifi-service.ts',
        'src/main/services/decryption-service.ts',
        'src/renderer/stores/mediaStore.ts',
        'src/renderer/stores/operationHistoryStore.ts',
        'src/renderer/stores/themeStore.ts',
        'src/renderer/stores/uiStore.ts',
        // P3+ 按 PR 逐步补充
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@common': path.resolve(__dirname, 'src/common')
    }
  }
})
```

---

## 四、CI 集成方案

### 4.1 流水线设计

采用 GitHub Actions（项目已托管 GitHub），分阶段并行执行：

```
push / PR
   │
   ├──► [lint]        eslint + prettier --check
   ├──► [typecheck]   tsc --noEmit
   ├──► [test-l1]     vitest run src/{main,renderer,common}/utils
   ├──► [test-l2]     vitest run src/main/{database,scanner,services}
   ├──► [test-l3]     vitest run src/renderer/{stores,hooks}
   ├──► [test-l4]     vitest run src/renderer/components
   ├──► [test-l5]     vitest run tests/e2e/** (only on main push)
   └──► [coverage]    vitest run --coverage (only on main push)
```

### 4.2 GitHub Actions 配置示例

`.github/workflows/test.yml`：

```yaml
name: Test

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.node-version'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test-unit:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
        shard: [l1, l2, l3, l4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.node-version'
          cache: 'npm'
      - run: npm ci
      - name: Run tests (${{ matrix.shard }})
        run: npm run test:shard:${{ matrix.shard }}
      - name: Upload coverage
        if: matrix.os == 'ubuntu-latest'
        uses: actions/upload-artifact@v4
        with:
          name: coverage-${{ matrix.shard }}
          path: coverage/

  test-coverage:
    needs: test-unit
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.node-version'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:coverage
      - name: Upload to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: false

  test-e2e:
    needs: test-unit
    runs-on: windows-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.node-version'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Run E2E
        run: npx vitest run tests/e2e
```

### 4.3 package.json 脚本扩展

```jsonc
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:shard:l1": "vitest run src/main/utils src/renderer/utils src/common src/shared",
    "test:shard:l2": "vitest run src/main/database src/main/scanner src/main/services",
    "test:shard:l3": "vitest run src/renderer/stores src/renderer/hooks",
    "test:shard:l4": "vitest run src/renderer/components",
    "test:shard:l5": "vitest run tests/e2e",
    "test:integration": "vitest run **/*.integration.test.ts"
  }
}
```

### 4.4 本地 pre-push hook（可选）

通过 husky 在本地 push 前运行 L1+L2+L3，保证基础回归：

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npm run test:shard:l1 && npm run test:shard:l2 && npm run test:shard:l3
```

### 4.5 覆盖率门槛与质量门禁

| 门禁项 | 阈值 | 失败行为 |
|---|---|---|
| 核心模块行覆盖（P0/P1） | ≥ 80% | 阻止合并 |
| 核心模块分支覆盖（P0/P1） | ≥ 70% | 阻止合并 |
| 全量测试通过率 | 100% | 阻止合并 |
| 新增代码覆盖率 | ≥ 80% | 阻止合并 |
| 测试用例命名规范 | 描述意图 | lint 警告 |
| 单测执行时长（L1+L2+L3） | < 30s | 警告但不阻止 |

---

## 五、各分层验收标准

### 5.1 L1 纯函数单元测试验收标准

| 验收项 | 标准 |
|---|---|
| 用例覆盖 | 每个 export 函数至少 3 类用例：正常 / 边界 / 异常 |
| 异常用例占比 | ≥ 30% |
| 行覆盖率 | ≥ 90% |
| 分支覆盖率 | ≥ 80% |
| 执行时长 | 全部 L1 用例 < 5s |
| 环境依赖 | 仅依赖 node 内置模块，无 mock |
| 用例命名 | `describe('函数名') + it('应在xxx场景下返回xxx')` |
| 断言方式 | 使用 `expect(actual).toEqual(expected)`，禁止 `toBe` 比较浮点 |
| 随机性 | 用例中不使用 `Date.now()` / `Math.random()`，需 mock 时间 |

### 5.2 L2 数据访问层测试验收标准

| 验收项 | 标准 |
|---|---|
| 用例覆盖 | 每个 public 方法至少 5 类用例：正常 / 边界 / 异常 / 幂等 / 事务 |
| 事务用例 | 涉及事务的方法必须有「抛错回滚」用例 |
| 数据库隔离 | 使用 `:memory:` 内存库，`beforeEach` 重建 schema |
| 行覆盖率 | ≥ 85% |
| 分支覆盖率 | ≥ 75% |
| 执行时长 | 全部 L2 用例 < 10s |
| SQL 注入 | 参数化查询，禁止字符串拼接（lint 规则保证） |
| Mock 范围 | 仅 mock `electron.app` / sharp / ffmpeg，不 mock `better-sqlite3` |
| 数据完整性 | 验证外键级联、软删除标记、`is_deleted` 过滤 |

### 5.3 L3 Store / Hook 测试验收标准

| 验收项 | 标准 |
|---|---|
| Store 用例覆盖 | 每个 action 至少 3 类用例：初始状态 / 派生状态 / 副作用 |
| Hook 用例覆盖 | 每个 hook 至少覆盖 mount / unmount / props 变化 / 销毁清理 |
| 状态隔离 | 每个 `it` 前重置 store（`resetStore` 或重新创建） |
| 行覆盖率 | ≥ 80% |
| 分支覆盖率 | ≥ 70% |
| 执行时长 | 全部 L3 用例 < 8s |
| 异步处理 | 所有异步 action 必须有 success / failure 用例 |
| 副作用清理 | useEffect 清理函数必须被调用（`cleanup` 断言） |

### 5.4 L4 组件交互测试验收标准

| 验收项 | 标准 |
|---|---|
| 渲染用例 | 每个组件至少验证默认 props 渲染 + 1 种 props 变体 |
| 交互用例 | 关键交互（点击/输入/拖拽）至少 2 类用例 |
| 可访问性 | 验证 `role`、`aria-label`、键盘操作可达 |
| 快照 | 仅对纯展示组件使用快照，交互组件禁用 |
| 行覆盖率 | ≥ 70% |
| 分支覆盖率 | ≥ 60% |
| 执行时长 | 全部 L4 用例 < 20s |
| 用户视角 | 测试用例描述用户行为而非实现细节（RTL 哲学） |
| 异步渲染 | 使用 `findBy*` 而非 `waitFor` + `getBy*` 组合 |
| Mock 范围 | 仅 mock IPC 调用与外部依赖，不 mock 内部组件 |

### 5.5 L5 集成 / E2E 测试验收标准

| 验收项 | 标准 |
|---|---|
| 用例覆盖 | 覆盖核心用户路径：扫描 → 浏览 → 编辑 → 导出 |
| 真实环境 | 使用真实 Electron、真实文件系统（临时目录） |
| 数据隔离 | 每个用例使用独立的 `userData` 目录与测试数据库 |
| 稳定性 | 同一用例连续 10 次执行成功率 100% |
| 执行时长 | 单个用例 < 30s，全部 L5 < 60s |
| 失败诊断 | 失败时自动保存截图、日志、主进程 stderr |
| CI 隔离 | 仅在 main 分支 push 时运行，PR 走 L1-L4 |
| 资源清理 | `afterAll` 中关闭所有 BrowserWindow、清理临时目录 |

### 5.6 整体验收标准

| 验收项 | 标准 |
|---|---|
| 全量用例数 | ≥ 1100（按预估 1131 ± 10%） |
| 全量通过率 | 100% |
| 核心模块覆盖率 | P0+P1 模块行覆盖 ≥ 80%、分支 ≥ 70% |
| 全量覆盖率 | 行覆盖 ≥ 70%、分支 ≥ 60% |
| 单次执行时长 | L1+L2+L3 < 30s，L1-L4 < 60s，L1-L5 < 120s |
| 测试稳定性 | CI 连续 50 次无 flaky |
| 文档完整性 | 每个测试文件头部注释说明所属层级与覆盖范围 |
| 命名规范 | 文件名 `<module>.test.ts(x)`，用例描述意图 |
| 异常用例占比 | 整体 ≥ 30% |

---

## 六、实施阶段与里程碑

| 阶段 | 周期 | 目标模块 | 用例数 | 验收 |
|---|---|---|---|---|
| **M1：P0 核心补全** | 第 1 周 | 5 个核心模块（file-utils / duplicate-scoring / imageProcessor / lut / media-repository） | 280 | L1+L2 达标 |
| **M2：P1 工具层** | 第 2 周 | 6 个工具模块（phash / scene-category / game-events / media-constants / concurrency / ipc-validate / path-classifier） | 200 | L1 达标 |
| **M3：P2 服务/Store** | 第 3 周 | 6 个服务/Store 模块 | 220 | L2+L3 达标 |
| **M4：P3 IPC/Hook/组件** | 第 4-5 周 | 35 个模块（引入 RTL+jsdom） | 350 | L3+L4 达标 |
| **M5：P4 调度/worker/缩略图** | 第 6 周 | 10 个模块 | 80 | L2 达标 |
| **M6：P5 OS 模块 + E2E** | 第 7 周 | 9 个模块 + 3 个 E2E | 50 | L5 达标 |
| **M7：CI 接入与门禁** | 第 8 周 | GitHub Actions + 覆盖率门禁 | - | 流水线绿灯 |

---

## 七、风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| `media-repository.ts` schema 创建遗漏字段 | 用例失败 | 在 `beforeEach` 中复用 `connection.ts` 的 `CREATE TABLE`，保持字段同步 |
| `imageProcessor.ts` 纯函数 export 影响 bundle | 几乎无影响 | tree-shaking 友好，未使用不打包 |
| `applyLut3D` 依赖 `ImageData` | node 环境失败 | 手动构造 `{width,height,data:Uint8ClampedArray}` mock |
| better-sqlite3 CI 编译失败 | 流水线红 | 使用 `npm ci` + 缓存 `node-gyp`，Windows 走 prebuilt binary |
| jsdom 不支持 `Canvas` / `matchMedia` | 组件测试失败 | 在 `tests/setup.ts` 全局 mock |
| E2E 在 CI 不稳定 | 误报 | 重试 3 次 + 失败截图 + 仅 main 分支运行 |
| 测试用例膨胀导致执行变慢 | 开发体验差 | 分片并行 + L5 仅在 main 触发 |
| mock 实现偏离真实行为 | 绿测但实际崩溃 | 集成测试 + E2E 兜底，mock 实现需 code review |
| Electron API 升级导致 mock 失效 | 用例失败 | CI 中跑 `npm ci` 锁版本，升级时同步更新 mock |

---

## 八、附录

### 8.1 现有测试文件清单（21 个）

| 文件 | 层级 | 状态 |
|---|---|---|
| `src/common/utils/common-utils.test.ts` | L1 | 已有 |
| `src/main/database/media-repository.test.ts` | L2 | 已有 |
| `src/main/scanner/index.test.ts` | L2 | 已有 |
| `src/main/services/share-clipboard-service.test.ts` | L2 | 已有 |
| `src/main/services/share-clipboard-service.integration.test.ts` | L5 | 已有 |
| `src/main/services/share-wifi-service.test.ts` | L2 | 已有 |
| `src/main/services/decryption-service.integration.test.ts` | L5 | 已有 |
| `src/main/utils/concurrency.test.ts` | L1 | 已有 |
| `src/main/utils/duplicate-scoring.test.ts` | L1 | 已有 |
| `src/main/utils/file-utils.test.ts` | L1 | 已有 |
| `src/main/utils/game-events.test.ts` | L1 | 已有 |
| `src/main/utils/ipc-validate.test.ts` | L1 | 已有 |
| `src/main/utils/media-constants.test.ts` | L1 | 已有 |
| `src/main/utils/phash.test.ts` | L1 | 已有 |
| `src/main/utils/scene-category.test.ts` | L1 | 已有 |
| `src/renderer/components/gallery/right-click-wiring.test.ts` | L4 | 已有 |
| `src/renderer/stores/mediaStore.test.ts` | L3 | 已有 |
| `src/renderer/stores/mediaStore.integration.test.ts` | L5 | 已有 |
| `src/renderer/stores/operationHistoryStore.test.ts` | L3 | 已有 |
| `src/renderer/utils/imageProcessor.test.ts` | L1 | 已有 |
| `src/renderer/utils/lut.test.ts` | L1 | 已有 |

### 8.2 测试用例命名规范

```typescript
// ✅ 推荐：描述意图
describe('listMedia', () => {
  it('应在默认视图下返回未软删除的媒体列表', () => {})
  it('应在 deletedOnly=true 时仅返回软删除记录', () => {})
  it('应在 sortBy 非白名单时回退到 created_at', () => {})
})

// ❌ 禁止：描述实现细节
describe('listMedia', () => {
  it('应该调用 db.prepare', () => {})
  it('应该返回数组', () => {})
})
```

### 8.3 测试文件头部注释模板

```typescript
/**
 * @layer L1
 * @module src/main/utils/duplicate-scoring
 * @coverage 评分计算 + 排序稳定性
 * @dependencies none
 * @remarks 纯函数测试，无外部依赖
 */
```

### 8.4 参考文档

- 《单元测试补全实施计划》`docs/dev-docs/单元测试补全实施计划.md`
- 《项目架构全景》`docs/项目架构全景.md`
- 《项目全量审查与轻量化优化方案》`docs/dev-docs/项目全量审查与轻量化优化方案.md`
- vitest 官方文档：https://vitest.dev
- React Testing Library：https://testing-library.com/docs/react-testing-library/intro
