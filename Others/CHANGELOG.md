# Changelog | 变更日志

All notable changes to this project will be documented in this file.
本项目所有重要变更都将记录在此文件中。

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/spec/v2.0.0.html).
本文件格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
并遵循 [语义化版本](https://semver.org/lang/zh-CN/spec/v2.0.0.html) 规范。

---

## [Unreleased] | 未发布

新增、即将在下个版本发布的功能或修复。

### Added | 新增

- 新增功能或特性。示例：在图片库首页加入毛玻璃搜索栏，支持按时间倒序筛选。
- 新增 API、配置项或交互入口。示例：`scanner.findEpicGamePaths()` 方法，用于查询 Epic 安装路径。

### Changed | 变更

- 对已有功能的修改。示例：将「全盘扫描」UI 文案改为「自动定位游戏目录」，更准确反映功能。
- 重构、性能或视觉调整。示例：页面切换动画改为 8px 右移 + 淡入（220ms），避免闪烁。

### Deprecated | 弃用

- 当前版本仍可用，但将在后续版本移除的功能。示例：`scanner.findGamePath()` 弃用，请改用 `findGamePaths()`（复数）。

### Removed | 移除

- 已在本版本中删除的功能。示例：移除整页 View Transitions API 调用，恢复 CSS page-enter 动画。

### Fixed | 修复

- Bug 修复。示例：修复 `app.whenReady()` 之前调用 `app.getPath('userData')` 导致配置写入异常的问题。
- 修复 `before-quit` 800ms 等待竞态问题，移除所有 `setTimeout` 延迟退出。

### Security | 安全

- 安全相关修复或加固。示例：所有外部输入（用户、API、文件）默认不可信，统一增加校验、判空、默认值。

---

## [1.0.0] - YYYY-MM-DD

首个正式版本。首个对外发布的稳定版本。

### Added | 新增

- 项目初始化，完成 NikkiGallery 相册管理应用核心功能。
- 实现 Steam / Epic / 默认路径 / 全盘签名多级游戏目录定位。
- 实现图片、视频媒体扫描与缩略图索引（better-sqlite3 + sharp + ffmpeg）。
- 实现 Windows 11 Fluent Design 风格 UI，毛玻璃卡片 + 圆角 + 轻阴影。

### Changed | 变更

- 采用 Electron + TypeScript + React 技术栈，统一主进程与渲染层架构。

### Fixed | 修复

- 修复单实例锁未释放导致二次启动失败的问题。

---

## 版本类型说明 | Version Types

遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/spec/v2.0.0.html)：

- **主版本号（MAJOR）**：不兼容的 API 修改。示例：`1.0.0` → `2.0.0`
- **次版本号（MINOR）**：向下兼容的新增功能。示例：`1.0.0` → `1.1.0`
- **修订号（PATCH）**：向下兼容的问题修复。示例：`1.0.0` → `1.0.1`

## 变更分类说明 | Change Categories

| 分类 | 中文含义 | 使用场景 |
| --- | --- | --- |
| Added | 新增 | 新增功能、特性、API、配置项 |
| Changed | 变更 | 对已有功能的修改、重构、性能优化 |
| Deprecated | 弃用 | 当前可用但即将移除的功能 |
| Removed | 移除 | 本版本已删除的功能 |
| Fixed | 修复 | Bug 修复 |
| Security | 安全 | 安全漏洞修复或安全加固 |

## 编写规范 | Writing Guidelines

1. 每个版本以 `## [版本号] - YYYY-MM-DD` 格式标题，未发布版本使用 `## [Unreleased]`。
2. 每个分类以 `### 分类名` 作为子标题，分类顺序保持 Added → Changed → Deprecated → Removed → Fixed → Security。
3. 条目使用 `-` 列表，简明描述「做了什么」与「为什么」，避免无意义提交信息。
4. 关联 Issue / PR 时，在条目末尾附加 `(#123)` 链接。
5. 破坏性变更以 `**BREAKING:**` 前缀标注，并说明迁移方式。
6. 发布版本时，将 `[Unreleased]` 区块整体复制为新区块并填入发布日期，清空 `[Unreleased]`。
7. 旧版本仅保留必要摘要，详细历史可归档至 `CHANGELOG-archive.md`。

## 链接定义 | Link References

<!-- 在文件末尾维护版本号锚点链接，便于自动跳转 -->

[Unreleased]: https://github.com/your-org/NikkiGallery/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/your-org/NikkiGallery/releases/tag/v1.0.0

---

## English Version | 英文说明

This file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### How to update

1. Add new entries under `## [Unreleased]` as you develop.
2. On release, copy the `[Unreleased]` block to a new `## [x.y.z] - YYYY-MM-DD`
   block, then clear `[Unreleased]`.
3. Keep category order: Added → Changed → Deprecated → Removed → Fixed → Security.
4. Use `-` bullet lists; describe both **what** and **why**.
5. Reference issues/PRs with `(#123)` suffix.
6. Prefix breaking changes with `**BREAKING:**` and provide migration notes.
7. Update the link references at the bottom for the new release tag.

### Category reference

- **Added** for new features.
- **Changed** for changes in existing functionality.
- **Deprecated** for soon-to-be removed features.
- **Removed** for now removed features.
- **Fixed** for any bug fixes.
- **Security** for vulnerability fixes and hardening.
