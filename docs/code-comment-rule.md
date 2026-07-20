# 代码注释清理规范

> **适用范围**：`src/`、`scripts/`、根目录 `*.config.{ts,js}`、`tools/scripts/**`
> **核心信条**：只写「为什么」，不写「是什么」。如果代码本身读不懂，先重构代码。
> **维护者**：所有为 wxnn-photo-manager 贡献代码的开发者（包括 AI 助手）

---

## 一、总体原则

| 原则 | 含义 | 判定标准 |
| --- | --- | --- |
| **只写「为什么」** | 注释解释决策、取舍、外部约束、踩坑记录 | 删掉这条注释，读者还能看懂代码做什么，但可能不懂为何这样做 |
| **不写「是什么」** | 不复述函数名、变量名、下一行代码的字面行为 | 复述型注释一律删除 |
| **先重构再注释** | 若代码自身读不懂，重构命名、拆分函数，而不是补注释 | 函数名 + 类型签名能表达意图时，禁止补「翻译型」注释 |
| **错误必须显式** | catch 块即使静默也必须用 `// 跳过损坏的行` 一句话说明意图 | 不允许完全无注释的空 catch |

---

## 二、必须保留的注释类型

### 2.1 决策型注释（保留）

解释「为什么这样做、为什么不那样做」，常见于：

- 性能权衡：`// P2-3：新增内存缓存 + 目录 mtime 失效机制，避免万条故障列表每次全量 JSON.parse`
- 兼容性补丁：`// p-limit v7 为纯 ESM，主进程编译为 CommonJS 后 require() 失败，改用原生实现`
- 业务规则：`// 业务决策：从所有 faults-*.jsonl 文件读取，文件名按日期倒序遍历`
- 平台差异：`// Windows 10 1803+ 自带 tar.exe，避免 PowerShell Compress-Archive 的执行策略问题`

### 2.2 外部约束型注释（保留）

解释代码无法表达的外部因素：

- 第三方 API 怪癖：`// sharp v0.33 起要求 libvips 通道数 ≤ 4，多余通道需手动裁剪`
- 协议/规范要求：`// IPC 响应必须包含 request_id，否则渲染进程会话匹配失败`
- 法律/合规：`// 用户隐私数据不得写入日志，详见 docs/privacy-policy.md`

### 2.3 TODO / FIXME / HACK（保留，但需规范格式）

```ts
// TODO(owner): 简述待办事项 #issue编号
// FIXME(owner): 简述已知问题 #issue编号
// HACK(owner): 简述临时方案及预期替换时机
```

- `owner` 必填，使用 GitHub 用户名或团队名（AI 助手统一用 `ai`）
- 同一文件内 TODO 不超过 3 条，超出时拆分为 issue

### 2.4 文件级 JSDoc（保留）

模块用途说明，仅当模块承担跨文件职责时书写：

```ts
/**
 * 原生并发控制（替代 p-limit，避免 ESM/CJS 兼容问题）
 * p-limit v7 为纯 ESM，主进程编译为 CommonJS 后 require() 失败
 */
export async function runWithConcurrency<T>(...) { ... }
```

---

## 三、必须删除的注释类型

### 3.1 复述型注释（删除）

```ts
// ❌ 删除：复述下一行代码
const entries = await fs.promises.readdir(dir)
// 读取目录下所有条目

// ❌ 删除：复述函数名
export function formatSize(bytes: number): string {
  // 格式化文件大小
  ...
}

// ✅ 保留：解释决策
// 不使用 toLocaleString，避免不同 Node ICU 版本输出不一致
return `${mb.toFixed(decimals)} MB`
```

### 3.2 翻译型注释（删除）

把代码字面意思翻译成中文，未提供任何额外信息：

```ts
// ❌ 删除：纯翻译
const result = await db.query('SELECT * FROM media') // 查询 media 表
for (const item of result) { ... }                   // 遍历结果
```

### 3.3 历史遗留型注释（删除）

记录已不存在的代码或已删除的逻辑：

```ts
// ❌ 删除：历史记录
// 旧版本这里用了 setTimeout，已在 v2.1 移除

// ❌ 删除：被注释掉的代码块
// const oldResult = await oldScanner.scan()
// if (oldResult.length > 0) { ... }
```

历史信息由 Git 负责，不要在代码里维护。

### 3.4 装饰型注释（删除）

```ts
// ❌ 删除：装饰性分隔符
// ============================
// ====== 工具函数 ======
// ============================

// ❌ 删除：ASCII 边框
/*  ----------------------------------
 * |  这里是权限校验                  |
 *  ---------------------------------- */
```

需要分组时，拆成独立模块或使用空行分隔。

### 3.5 作者署名 / 时间戳注释（删除）

```ts
// ❌ 删除：署名
// @author QianLu 2024-01-15 创建

// ❌ 删除：修改记录
// 2024-03-20 修复扫描崩溃问题
// 2024-05-10 优化并发性能
```

作者和修改记录由 Git blame 负责。

### 3.6 显而易见的类型说明（删除）

TypeScript 类型签名能表达的内容，不需要再用注释复述：

```ts
// ❌ 删除：类型已说明
// @param bytes - 文件字节数
// @returns 格式化后的字符串
function formatSize(bytes: number): string { ... }
```

仅在以下情况保留 JSDoc `@param` / `@returns`：

- 参数有非显而易见的约束（如「必须为正整数」「不能为空字符串」）
- 返回值有特殊语义（如「失败时返回 null 而非抛异常」「返回的是共享引用，调用方不可修改」）

---

## 四、推荐保留的轻量注释

### 4.1 区块分隔标签（可选）

仅在单文件超过 200 行且逻辑分块明显时使用，用单行注释标签代替装饰边框：

```ts
// ---- 公共 API ----
export function scan() { ... }
export function stopScan() { ... }

// ---- 内部实现 ----
async function scanDirectory() { ... }
```

### 4.2 数字魔数解释（可选）

```ts
// 200ms 内的连续点击视为一次双击
const DOUBLE_CLICK_THRESHOLD = 200
```

若已抽为具名常量且名称表意清晰，则无需再补注释。

---

## 五、多语言注释规范

- **源代码注释**：使用中文，与项目主语言一致
- **国际化键值（i18n key）**：键名使用英文小写下划线，值由各语言 JSON 维护
- **公开 API 的 JSDoc**：导出给外部使用的 API，JSDoc 使用中文；类型签名用英文
- **错误码与日志消息**：使用英文，便于日志检索和国际化

---

## 六、ESLint 自动检查规则

已在 `eslint.config.js` 启用以下规则（建议，不强制报错）：

| 规则 | 级别 | 说明 |
| --- | --- | --- |
| `no-warning-comments` | warn | 限制 `TODO`/`FIXME` 数量，超出 5 条告警 |
| `eslint-plugin-jsdoc` | off | 暂不强制 JSDoc 完整性，避免引入额外依赖 |
| `@typescript-eslint/no-unused-vars` | warn | 删除注释后遗留的未使用变量将被标记 |

> **不启用自动删除注释的 ESLint 规则**：避免误伤「为什么」型注释。注释清理以人工 + 脚本辅助为主。

---

## 七、批量清理操作步骤

> 详见本文档第八节「清理脚本辅助」与第九节「提交规范」。

### 7.1 清理前准备

```bash
# 1. 确保工作区干净
git status

# 2. 切到独立分支，避免污染主干
git checkout -b chore/comment-cleanup

# 3. 安装最新依赖（确保 prettier/eslint 可用）
npm install
```

### 7.2 按目录分批清理

建议按以下顺序，每完成一个目录就提交一次，便于回滚：

| 批次 | 目录 | 优先级 | 说明 |
| --- | --- | --- | --- |
| 1 | `src/main/services/` | 高 | 业务逻辑密集，复述型注释最多 |
| 2 | `src/main/utils/` | 高 | 工具函数复述型注释多 |
| 3 | `src/main/ipc/handlers/` | 中 | IPC 处理器，注释相对简单 |
| 4 | `src/main/scanner/` | 中 | 扫描器逻辑复杂，需谨慎清理 |
| 5 | `src/renderer/components/common/` | 中 | UI 组件，复述型注释多 |
| 6 | `src/renderer/hooks/` | 中 | Hook 实现较清晰，注释少 |
| 7 | `src/renderer/pages/` | 低 | 页面组件，注释最少 |
| 8 | `src/renderer/stores/` | 低 | 状态管理，注释相对规范 |
| 9 | `src/shared/` | 低 | 共享类型，主要是 JSDoc |
| 10 | `scripts/` `tools/` | 低 | 脚本类，注释最少 |

### 7.3 单文件清理流程

1. **通读全文**：理解每个函数的职责和决策点
2. **标记删除候选**：用编辑器高亮标记「复述型」「翻译型」「装饰型」注释
3. **保留决策型**：含 `P0/P1/P2`、`业务决策`、`兼容性`、`踩坑` 关键词的注释必须保留
4. **删除候选注释**：逐条删除，同步检查相邻代码是否需要重构
5. **运行测试**：`npm test` 必须全绿
6. **运行 lint**：`npm run lint` 不能新增 warning
7. **格式化**：`npm run format` 统一风格
8. **本地构建**：`npm run build` 确保编译通过

### 7.4 清理后验证

```bash
# 全量测试
npm test

# 类型检查
npm run typecheck

# Lint 检查（不应新增 warning）
npm run lint

# 完整构建
npm run build
```

任何一项失败，回到该批次起点重新检查。

---

## 八、清理脚本辅助

为减少人工成本，提供以下辅助手段（不替代人工审查）：

### 8.1 检索明显冗余注释

在项目根目录执行：

```powershell
# 查找复述型注释（紧邻代码行、含中文动词开头）
# 例如：// 读取、// 遍历、// 判断、// 返回、// 设置
Select-String -Path "src\**\*.ts","src\**\*.tsx" -Pattern "^\s*//\s*(读取|遍历|判断|返回|设置|获取|检查|调用|创建|删除|更新|初始化)" -CaseSensitive:$false
```

### 8.2 检索装饰型注释

```powershell
# 查找 ASCII 装饰边框
Select-String -Path "src\**\*.ts","src\**\*.tsx" -Pattern "====|----|===="
```

### 8.3 检索被注释掉的代码块

```powershell
# 查找疑似被注释的代码（包含 = ; => 等代码符号）
Select-String -Path "src\**\*.ts","src\**\*.tsx" -Pattern "^\s*//\s.*(const|let|await|return|if|for|function)\s"
```

### 8.4 检索 TODO / FIXME 清单

```powershell
Select-String -Path "src\**\*.ts","src\**\*.tsx" -Pattern "TODO|FIXME|HACK|XXX" -CaseSensitive:$false
```

### 8.5 检索历史遗留署名

```powershell
# 查找作者署名与日期戳
Select-String -Path "src\**\*.ts","src\**\*.tsx" -Pattern "(@author|@\d{4}-\d{2}-\d{2}|20\d{2}-\d{2}-\d{2})"
```

> 脚本仅用于定位候选，是否删除由人工判定。误删「为什么」型注释会导致后续维护困难。

---

## 九、提交规范

### 9.1 单批次提交格式

每个目录清理完成后，使用以下 commit message：

```
chore(comments): 清理 <目录> 冗余注释

- 删除 N 条复述型注释
- 删除 N 条装饰型注释
- 保留 N 条决策型注释（P2-3、业务决策、兼容性补丁等）
- 不涉及逻辑变更，测试全绿

Refs: docs/code-comment-rule.md
```

### 9.2 禁止混合提交

- 不要在同一 commit 里同时清理注释和修改业务逻辑
- 不要在同一 commit 里跨多个目录清理（除非目录仅 1-2 个文件）
- 清理过程中如发现需要重构，单独提一个 `refactor:` commit

### 9.3 PR 描述模板

```markdown
## 注释清理批次 PR

### 清理范围
- 目录：`src/main/services/`
- 文件数：N
- 删除注释数：N
- 保留决策型注释数：N

### 验证结果
- [x] npm test 全绿
- [x] npm run typecheck 无错误
- [x] npm run lint 未新增 warning
- [x] npm run build 编译通过

### 抽样说明（保留的决策型注释示例）
- `log-service.ts:9` - 业务决策说明，保留
- `concurrency.ts:2` - ESM 兼容性补丁，保留
```

---

## 十、例外与豁免

以下文件 **不参与** 注释清理：

| 文件 / 目录 | 原因 |
| --- | --- |
| `dist/` `release/` | 构建产物，由源码重新生成 |
| `node_modules/` | 第三方依赖 |
| `docs/dev-docs/*.md` | 设计文档，注释即正文 |
| `*.test.ts` `*.test.tsx` | 测试文件，注释用于说明断言意图，保留 |
| `src/renderer/i18n/locales/*.json` | 国际化资源，键值即文案 |
| `src/main/preload.ts` 中 IPC 桥接注释 | 暴露给渲染进程的 API，注释作为契约文档保留 |

---

## 十一、自查清单

提交前请逐项确认：

- [ ] 删除的注释全部属于「复述型 / 翻译型 / 装饰型 / 历史遗留型 / 署名型」之一
- [ ] 保留的注释全部能回答「为什么这样做」或「为什么不那样做」
- [ ] 没有删除 TODO / FIXME（这些应该单独处理或转 issue）
- [ ] 没有删除文件级 JSDoc（模块用途说明）
- [ ] catch 块即使静默也保留了意图说明
- [ ] `npm test` 全绿
- [ ] `npm run typecheck` 无错误
- [ ] `npm run lint` 未新增 warning
- [ ] `npm run build` 编译通过
- [ ] commit message 符合 `chore(comments):` 格式

---

## 十二、参考

- [AI 辅助开发规范](./dev-docs/AI开发规范.md)
- [项目全量审查与轻量化优化方案](./dev-docs/项目全量审查与轻量化优化方案.md)
- Conventional Commits 1.0.0：https://www.conventionalcommits.org/zh-hans/v1.0.0/
- GitHub: 代码注释的最佳实践：https://github.com/github/semantic-code-analysis
