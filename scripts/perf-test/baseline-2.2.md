# T15 性能基线报告 v2.2

> 本文档为 v2.2 版本的性能基线，用于后续版本对比与回归检测。
> 测试时间：2026-07-03（基线建立，待实际运行后填入数值）

## 测试环境

| 项目 | 配置 |
|---|---|
| 操作系统 | Windows 11 |
| CPU | 待填入 |
| 内存 | 待填入 |
| 磁盘 | 待填入（SSD/HDD） |
| 应用版本 | v2.2.0 |
| Node.js | v20.18.1 |
| Electron | 28.x |

## 测试数据集

| 项目 | 数值 |
|---|---|
| 图片数量 | 10,000 |
| 视频数量 | 5,000 |
| 总文件数 | 15,000 |
| 文件分布 | 最近 2 年内随机日期 |
| 套装标注 | 16 种套装循环分布 |
| 场景类型 | 6 种场景循环分布 |
| 数据集生成命令 | `npx ts-node --project tsconfig.scripts.json scripts/perf-test/generate-dataset.ts ./perf-data 10000 5000` |

## 验收标准

| 指标 | 阈值 | 实测值 | 状态 |
|---|---|---|---|
| 首次扫描耗时 | ≤ 5 分钟（300,000ms） | 待测 | ⏳ |
| 媒体列表加载（100 条） | ≤ 200ms | 待测 | ⏳ |
| 媒体列表加载（500 条） | ≤ 500ms | 待测 | ⏳ |
| 重复文件检测 | ≤ 60 秒（60,000ms） | 待测 | ⏳ |
| 缓存统计查询 | ≤ 200ms | 待测 | ⏳ |
| 滚动 FPS | ≥ 30 | 待测（需 DevTools Performance 面板手动测） | ⏳ |

## 测试方法

### 1. 准备测试数据集

```bash
# 在项目根目录执行
npx ts-node --project tsconfig.scripts.json scripts/perf-test/generate-dataset.ts ./perf-data 10000 5000
```

生成 15,000 个占位媒体文件（最小 JPEG + 最小 MP4 占位）。

### 2. 启动应用

```bash
# 开发模式
npm run dev
```

### 3. 清空数据库

启动后在设置 → 数据管理 → 清除数据，确保数据库为空。

### 4. 加载测试脚本

在应用 DevTools Console（Ctrl+Shift+I）中粘贴 `scripts/perf-test/perf-baseline.ts` 内容并执行。

### 5. 运行测试

```javascript
// 在 Console 中执行
await runPerfBaseline('C:\\path\\to\\perf-data')
```

### 6. 记录结果

将控制台输出的 JSON 结果复制到下方"详细测试结果"章节。

### 7. 滚动 FPS 测量

1. 打开 DevTools Performance 面板
2. 点击 Record
3. 在媒体网格视图中快速滚动 10 秒
4. 停止录制
5. 查看 FPS 指标，记录平均值

## 详细测试结果

> 以下为待填入的测试结果模板，实际运行后替换为真实数值

### 测试运行 1（基线）

执行时间：YYYY-MM-DD HH:mm

```json
[
  {
    "scenario": "首次扫描耗时",
    "metrics": {
      "durationMs": "待填入",
      "itemsProcessed": 15000,
      "throughputPerSec": "待填入"
    },
    "passed": true,
    "threshold": { "maxMs": 300000 }
  },
  {
    "scenario": "媒体列表加载（首页 100 条）",
    "metrics": { "durationMs": "待填入", "itemsProcessed": 15000 },
    "passed": true,
    "threshold": { "maxMs": 200 }
  },
  {
    "scenario": "媒体列表加载（大页 500 条）",
    "metrics": { "durationMs": "待填入", "itemsProcessed": 500 },
    "passed": true,
    "threshold": { "maxMs": 500 }
  },
  {
    "scenario": "重复文件检测（全量）",
    "metrics": { "durationMs": "待填入", "itemsProcessed": 15000 },
    "passed": true,
    "threshold": { "maxMs": 60000 }
  },
  {
    "scenario": "缓存统计查询",
    "metrics": { "durationMs": "待填入" },
    "passed": true,
    "threshold": { "maxMs": 200 }
  }
]
```

## 性能瓶颈分析

> 实际测试后填入观察到的瓶颈与优化建议

### 已知优化点

1. **扫描阶段**：使用 `runWithConcurrency` 控制并发，避免 IO 过载
2. **媒体列表**：前端虚拟滚动（VirtualImageGrid），仅渲染可见区域
3. **重复检测**：sha256 计算限制在文件头 64KB，避免全文件读取
4. **缩略图缓存**：LRU 淘汰策略，避免磁盘占用膨胀
5. **media:// 协议**：路径白名单内存缓存（TTL 5 分钟），避免每次请求全表扫描

### 待观察项

- 万级数据下首次扫描的 IO 瓶颈（机械硬盘 vs SSD 差异）
- 缩略图批量生成对主进程的影响
- 重复文件检测在大量相似图片下的耗时
- 长时间运行后的内存占用趋势

## 脚本说明

### generate-dataset.ts

测试数据集生成器，生成最小有效 JPEG 和最小 MP4 占位文件。

- 文件名格式：`YYYYMMDD_HHmmss_套装_场景_序号.jpg` / `YYYYMMDD_HHmmss_video_序号.mp4`
- 日期分布：最近 2 年内随机
- 套装分布：16 种循环
- 场景分布：6 种循环
- 文件 mtime 同步为生成日期，便于按日期筛选测试

### perf-baseline.ts

性能基线测试脚本，在应用 DevTools Console 中执行。

测试项目：
1. 首次扫描耗时（监听 `scanner:complete` 事件）
2. 媒体列表加载（首页 100 条）
3. 媒体列表加载（大页 500 条）
4. 重复文件检测（全量）
5. 缓存统计查询

每项测试记录：
- 耗时（ms）
- 处理量（项数）
- 吞吐量（项/秒，适用时）
- 是否通过阈值
- 阈值定义

## 后续版本对比

> 后续版本发布时，重新运行测试并与本基线对比

| 版本 | 扫描耗时 | 列表加载(100) | 列表加载(500) | 重复检测 | 缓存统计 | 备注 |
|---|---|---|---|---|---|---|
| v2.2.0 | 待测 | 待测 | 待测 | 待测 | 待测 | 基线 |
| v2.3.0 | - | - | - | - | - | - |

## 回归检测规则

- 任一指标退化超过 20% 视为性能回归，需排查原因
- 新增功能不得导致现有指标退化超过 10%
- 如某指标持续优化，可更新基线值并记录优化原因
