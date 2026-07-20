# AI 辅助开发规范

> **目标读者**：所有为 wxnn-photo-manager 贡献代码的开发者（包括 AI 助手）
> **核心原则**：先复用，再实现；小步快走；写完即测；只解决当前问题。

---

## 一、新增功能的标准提问模板

### 1.1 提需求时必须回答的 5 个问题

在动手写任何代码之前，请先用以下模板自检（或要求 AI 自检）：

```
【需求】<一句话描述要做什么>
【输入】<来自哪里：用户输入 / IPC / 数据库 / 文件 / API>
【输出】<期望结果：UI 变化 / 返回值 / 副作用>
【边界】<异常情况：空值 / 超时 / 并发 / 失败兜底>
【复用检查】<已查看 src/common/utils 和 src/renderer/components/common，无可用现有实现>
```

### 1.2 提问示例

**好示例**：

```
【需求】在 DuplicatesPage 添加"按套装分组"按钮
【输入】按钮点击事件 + 当前重复文件列表
【输出】列表按 outfit 字段重新分组渲染
【边界】outfit 为空字符串的文件归入"未标注"组；切换分组时保留滚动位置
【复用检查】已查看 components/common/，未发现现成分组按钮，将复用 btn-secondary 类
```

**差示例**（不要这样提问）：

```
帮我加个分组功能
```

### 1.3 接到需求后的标准流程

1. **先调研**：用 `Grep` 搜索项目中是否已有类似实现（关键词：函数名、UI 文案、CSS 类名）
2. **再设计**：确定要新增的文件、修改的文件、影响的页面
3. **小步实施**：每次只改一个功能点，跑测试验证后再继续
4. **写完即测**：`npm test` 必须全绿才能提交

---

## 二、复用优先：禁止重复实现

### 2.1 公共工具函数清单（`src/common/utils/`）

**位置**：`src/common/utils/`
**导入方式**：`import { formatSize, generateId, deepClone } from '@common/utils'`

| 函数名 | 用途 | 替代的重复模式 |
| --- | --- | --- |
| `formatSize(bytes, decimals?)` | 文件大小格式化（B/KB/MB/GB/TB） | 替代 backup-service / share-wifi-service / renderer/utils/format.ts 三套实现 |
| `formatFileSize(bytes, decimals?)` | formatSize 的语义别名 | 保留与历史 API 同名，便于迁移 |
| `generateId(prefix?)` | 生成唯一 ID | 替代 4+ 处内联的 `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` |
| `deepClone(value)` | 深拷贝（优先 structuredClone） | 替代 FilterPanel / useEditHistory / filter.ts 中 `JSON.parse(JSON.stringify(...))` |
| `pad(n, len=2)` | 数字左侧补零 | 替代 6+ 处内联的 `const pad = (n) => String(n).padStart(2, '0')` |
| `truncate(s, maxLen=20)` | 字符串截断 + 省略号 | 新增功能可复用 |
| `formatDate(input)` | 格式化为 YYYY-MM-DD | 替代 backup-service / file-service 等多套日期格式化 |
| `formatDateTime(input)` | 本地化日期时间字符串 | 同上 |
| `formatTimestamp(input)` | YYYY-MM-DD HH:MM:SS | 同上 |
| `formatCompactTimestamp(input?)` | YYYYMMDD_HHMMSS（文件名用） | 替代 backup-service / file-service / generate-dataset |
| `formatDateOrDash(input, fallback?)` | 空值返回兜底 | 替代 RecycleBinPage / DuplicatesPage 重复实现 |
| `formatDuration(seconds, options?)` | 时长格式化（m:ss 或 mm:ss.s） | 替代 VideoPlayer / VideoEditor 重复实现 |
| `getDirName(filePath)` | 提取目录（兼容 \\ 与 /） | 替代 renderer/utils/file.ts |
| `joinPath(dir, name)` | 拼接路径（纯字符串） | 同上 |
| `getExtName(filePath)` | 提取小写扩展名 | 同上 |
| `getBaseName(filePath)` | 提取文件名 | 同上 |

### 2.2 公共 UI 组件清单（`src/renderer/components/common/`）

**导入方式**：`import { Spinner, BaseDialog, EmptyState } from '@/components/common/xxx'`

| 组件名 | 用途 | 替代的重复模式 |
| --- | --- | --- |
| `Spinner` | 加载圈 | 替代 10+ 处 `border-2 border-current border-t-transparent rounded-full animate-spin` |
| `IconButton` | 图标按钮（复用 `.icon-btn` CSS） | 替代 5+ 处重复的关闭按钮 |
| `MediaThumbnail` | 媒体缩略图（img + MissingBadge + 占位图标 + onError） | 替代 8 处重复的缩略图渲染 |
| `BaseDialog` | 对话框骨架（含可选 title/footer） | 已有，扩展后支持自动渲染 Header/Footer |
| `EmptyState` | 空态/加载态/错误态三态 | 已有，扩展后支持 status='loading'/'error' |
| `MissingBadge` | 丢失文件角标 | 已有，无需改动 |
| `MediaThumbPlaceholder` | 媒体占位图标（image/video/warning） | 已有，无需改动 |
| `Toast` | 全局通知 | 已有，无需改动 |
| `ContextMenu` | 右键菜单 | 已有，无需改动 |
| `ConfirmDialog` | 确认对话框 | 已有，无需改动 |
| `ErrorBoundary` | 错误边界 | 已有，无需改动 |

### 2.3 设置页公共组件（`src/renderer/pages/settings/shared.tsx`）

| 组件名 | 用途 |
| --- | --- |
| `SectionShell` | 设置分块容器（已有） |
| `SettingsRow` | 通用设置行：标签 + 描述 + 控件 |
| `SettingsToggle` | 开关类设置行：标签 + 描述 + checkbox |
| `SettingsCard` | 信息行卡片：圆角 + 浅色背景 |

### 2.4 复用检查清单（必走）

写代码前，对照下表自检：

- [ ] 我要写的工具函数，`@common/utils/` 是否已有？
- [ ] 我要写的工具函数，`src/renderer/utils/` 或 `src/main/utils/` 是否已有？
- [ ] 我要写的 UI 组件，`src/renderer/components/common/` 是否已有？
- [ ] 我要用的 CSS 类，`src/renderer/styles/globals.css` 是否已定义？（如 `btn-primary`、`btn-secondary`、`icon-btn`、`glass-card`、`input-field`）
- [ ] 我要做的设置行，`shared.tsx` 的 `SettingsRow` / `SettingsToggle` / `SettingsCard` 能否满足？

**任何一项答"是"，就必须复用，禁止重复实现。**

### 2.5 何时可以新增公共组件

满足以下任一条件才允许新增公共组件：

1. 同一模式在 **3 处及以上** 重复出现
2. 现有公共组件无法满足需求，且改造现有组件会影响调用方
3. 新功能属于跨页面共用能力（如新弹窗类型）

新增时必须：
- 放在 `src/renderer/components/common/` 下
- 文件顶部注释说明：替代了哪些重复模式、使用示例
- 在本规范的"公共 UI 组件清单"中追加记录

---

## 三、写完必须先跑格式化和测试

### 3.1 提交前必跑命令

```bash
# 1. 格式化（必跑）
npm run format

# 2. 类型检查（必跑）
npm run typecheck

# 3. 单元测试（必跑）
npm test

# 4. 覆盖率（推荐）
npm run test:coverage
```

**所有命令必须 0 错误 0 警告**才能提交代码。

### 3.2 测试要求

- 新增的纯函数工具必须有单元测试，放在同级目录的 `xxx.test.ts`
- 新增的 React 组件**不需要**强制写测试（项目暂未配置 jsdom 测试环境）
- 测试文件命名：`<源文件名>.test.ts`，与源文件同级
- 测试用例覆盖：正常路径 + 边界（空值/NaN/异常输入）+ 健壮性（外部输入不可信）

### 3.3 格式化要求

- 使用项目已有 Prettier 配置，禁止自定义格式
- 提交前 `npm run format:check` 必须通过
- TypeScript 严格模式（`strict: true`），禁止使用 `any`（除非外部 API 返回类型未知）

---

## 四、小步迭代：禁止大改整个模块

### 4.1 单次修改的范围限制

每次提交（commit）应该只解决 **一个** 问题：

| 类型 | 允许范围 | 禁止 |
| --- | --- | --- |
| Bug 修复 | 修复 1 个 bug + 必要的回归测试 | 顺手重构周边代码 |
| 新功能 | 1 个完整功能点 + 测试 | 同时实现多个相关功能 |
| 重构 | 1 个文件或 1 组紧密相关的函数 | 跨模块大重构 |
| 依赖升级 | 1 个依赖 + 验证 | 同时升级多个依赖 |

### 4.2 修改前的自检清单

- [ ] 我这次修改影响几个文件？建议 ≤ 5 个
- [ ] 我修改的是核心逻辑还是周边逻辑？
- [ ] 我有没有顺手"优化"无关代码？
- [ ] 修改后能否独立运行测试验证？

### 4.3 修改后的验证清单

- [ ] `npm run format` 通过
- [ ] `npm run typecheck` 通过
- [ ] `npm test` 全部通过
- [ ] 手动验证：受影响页面的核心交互仍正常
- [ ] HTML 预览版与 exe 版本行为一致（如适用）

---

## 五、代码风格约定

### 5.1 命名

- **函数/变量**：camelCase（如 `formatSize`、`isLoading`）
- **类型/接口/组件**：PascalCase（如 `MediaRepository`、`BaseDialog`、`MediaRow`）
- **常量**：UPPER_SNAKE_CASE（如 `MAX_SIGNATURE_SEARCH_DEPTH`）
- **私有类成员**：以 `_` 开头不强制，但内部辅助函数建议前缀 `private` 或独立模块

### 5.2 注释

- **只写"为什么"**：决策原因、外部约束、绕过坑的理由
- **不写"是什么"**：代码本身应该自解释
- **必须写注释的场景**：
  - 修复 bug：注释引用 issue 编号或描述触发条件
  - 性能优化：说明优化前后数据对比
  - 临时妥协：标注 `// TODO(原因): 后续如何修复`
  - 跨进程共享：标注模块同时被 main 和 renderer 使用

### 5.3 错误处理

- 所有外部输入（用户、API、文件）默认不可信
- 错误必须被处理：返回有意义的值或向上抛，**禁止吞掉**
- 资源用完就关：监听器、定时器、连接、文件句柄

### 5.4 函数设计

- 函数小、参数少、嵌套浅
- 分支用提前返回（Guard Clauses）
- 发现两个几乎一样的函数，考虑共用

---

## 六、版本控制约定

### 6.1 提交信息格式

```
<type>(<scope>): <subject>

<body>
```

**type** 取值：
- `feat`：新功能
- `fix`：bug 修复
- `refactor`：重构（不改外部行为）
- `test`：新增/修改测试
- `docs`：文档
- `chore`：构建/工具/依赖

**示例**：
```
feat(gallery): 添加按套装分组按钮

- 复用 SettingsRow 组件
- outfit 为空时归入"未标注"组
- 添加 5 个单元测试覆盖分组逻辑
```

### 6.2 分支命名

- 功能分支：`feat/<简短描述>`，如 `feat/outfit-grouping`
- 修复分支：`fix/<bug-描述>`，如 `fix/duplicate-scoring-stability`
- 禁止直接推送 `main` 分支

---

## 七、规范更新规则

本规范是活文档，遇到以下情况必须更新：

1. 新增公共工具函数或组件 → 更新第二章清单
2. 发现新的重复模式 → 在第二章追加"待抽取"标记
3. 调整测试/格式化命令 → 更新第三章
4. 团队决议调整代码风格 → 更新第五章

更新规范时，在文件顶部追加版本号与日期：

```
> 版本：v1.0 | 更新日期：2026-07-18 | 变更：首次创建
```

---

## 八、附录：公共模块索引

### 8.1 工具函数

```
src/common/utils/
├── format.ts          # formatSize, formatFileSize
├── id.ts              # generateId
├── object.ts          # deepClone
├── string.ts          # pad, truncate
├── date.ts            # formatDate, formatDateTime, formatTimestamp,
│                      # formatCompactTimestamp, formatDateOrDash, formatDuration
├── path.ts            # getDirName, joinPath, getExtName, getBaseName
├── index.ts           # 统一 re-export
└── common-utils.test.ts # 测试验证
```

### 8.2 公共 UI 组件

```
src/renderer/components/common/
├── BaseDialog.tsx          # 对话框骨架（支持 title/footer）
├── EmptyState.tsx          # 空态/加载态/错误态三态
├── Spinner.tsx             # 加载圈（4 种尺寸）
├── IconButton.tsx          # 图标按钮（复用 .icon-btn）
├── MediaThumbnail.tsx      # 媒体缩略图（img + 角标 + 占位）
├── MissingBadge.tsx        # 丢失文件角标
├── MediaThumbPlaceholder.tsx # 媒体占位图标
├── ConfirmDialog.tsx        # 确认对话框
├── ContextMenu.tsx         # 右键菜单
├── Toast.tsx               # 全局通知
├── ErrorBoundary.tsx       # 错误边界
├── ErrorFallback.tsx       # 错误兜底 UI
└── ...其他专业组件
```

### 8.3 设置页公共组件

```
src/renderer/pages/settings/shared.tsx
├── SectionShell           # 设置分块容器
├── SettingsRow            # 通用设置行（标签 + 描述 + 控件）
├── SettingsToggle         # 开关类设置行
└── SettingsCard           # 信息行卡片
```

### 8.4 已有 CSS 公共类

定义在 `src/renderer/styles/globals.css`：

- 按钮：`.btn-primary` / `.btn-secondary` / `.btn-danger` / `.btn-ghost`
- 图标按钮：`.icon-btn`
- 卡片：`.glass-card`
- 输入：`.input-field` / `.select` / `.search-input`
- 社交：`.social-btn`
- 标签：`.category-tag`

---

## 九、规范的强制力

- **本规范不是建议，是要求**
- Code Review 时必须对照本规范检查
- 违反第二章"复用优先"的代码：**直接打回**
- 违反第三章"写完即测"的提交：**禁止合并**
- 违反第四章"小步迭代"的 PR：**要求拆分**

---

> **最后一句**：写代码前先看清单，写完后先跑测试，每次只改一个小功能。
