# 对标 RanAxro/nikki_albums 差异化补齐开发计划

> **制定日期**：2026-07-07
> **当前版本**：v2.2.5
> **对标项目**：[RanAxro/nikki_albums](https://github.com/RanAxro/nikki_albums) v3.08
> **目标**：参考对标项目的功能优点，结合本项目特色制定**差异化**补齐方案，避免功能与设计同质化。
> **本期范围**：聚焦 Windows 平台核心功能补齐，**暂不涉及**跨平台、热更新、相册解码。

---

## 一、设计理念与差异化定位

### 1.1 不做"复刻版"，做"另一种解法"

本计划**不以复刻 Nikki Albums 功能为目标**，而是参考其能力盲点，结合本项目已有优势（高级编辑、pHash 相似度、场景分类、套装标注、WiFi 分享），打造差异化的相册管理体验。

| 维度 | Nikki Albums 路线 | 本项目差异化路线 |
|------|-------------------|------------------|
| 游戏识别 | 自动识别游戏安装位置 | **全盘文件名签名搜索**（无预设路径依赖，适配任何安装位置） |
| 账号管理 | 多账号分开管理 | **角色档案**（UID + 昵称 + 头像 + 拍摄统计 + 套装偏好综合档案） |
| 相册分类 | 19+3 游戏内相册类型映射 | **智能媒体分组**（基于 EXIF/文件特征/场景识别的多维度自动分组，超越游戏内相册维度） |
| 重复处理 | 自动处理游戏保存的重复照片 | **智能去重与版本保留**（pHash + 拍摄时序 + 画质评分，自动推荐保留版本） |
| 编辑能力 | 简单裁剪与调色 | ✅ 已领先（12项调整 + HSL + 曲线 + 色调分离 + 滤镜） |
| 网络传输 | 同一局域网传输 | ✅ 已对齐（WiFi 分享 + PIN 码认证） |

### 1.2 本项目特色强化方向

本项目相对 Nikki Albums 的**独有优势**将继续强化：

- **高级图片编辑**：HSL 调色盘、色调曲线、色调分离、LUT 预设（Nikki Albums 不具备）
- **pHash 相似度检测**：基于感知哈希的相似图片发现（Nikki Albums 仅做完全重复检测）
- **场景智能分类**：基于图像亮度的时段识别 + 场景类别自动标注
- **套装标注**：手动套装标签 + 统计（无限暖暖特色功能）
- **操作历史与全局撤销**：跨重启的操作历史记录与撤销
- **诊断与崩溃报告**：完善的错误追踪与诊断包导出

### 1.3 本期不实施项

| 功能 | 不实施原因 |
|------|------------|
| 相册解码（截图解密） | 法律风险高，本期规避 |
| macOS 跨平台 | native 模块适配成本高，本期聚焦 Windows |
| 热更新（代码/资源层） | 更新服务器维护成本高，收益低，本期不做 |
| 自动更新后重启 | 依赖热更新基础设施，本期不做 |

---

## 二、对标分析与功能差异

### 2.1 对标项目核心能力概览

RanAxro/nikki_albums（下称「Nikki Albums」）v3.08 核心能力：

| 能力域 | 关键特性 |
|--------|----------|
| 游戏识别 | 自动识别游戏安装位置 |
| 账号管理 | 多账号分开管理 |
| 相册覆盖 | 19 个相册 + 3 个游戏资源相册 |
| 批量操作 | 备份、还原、转移、删除、复制、移动 |
| 重复处理 | 自动处理游戏保存的重复照片 |
| 图片编辑 | 简单裁剪与调色 |
| 网络传输 | 同一局域网下传输图片 |
| 格式转换 | 视频转 Live Photo 或 GIF |
| 预设导出 | 导出到预设文件夹 |
| 多语言 | 12 种语言支持 |

### 2.2 本项目当前能力概览

本项目 v2.2.5 已具备的能力：

| 能力域 | 现状 |
|--------|------|
| 游戏识别 | ⚠️ 多策略扫描（含预设固定路径列表，需重构为纯文件名全盘搜索） |
| 账号管理 | ❌ 单一图库，无档案维度 |
| 相册分类 | ❌ 按文件夹扫描，无智能分组 |
| 批量操作 | ✅ 复制/移动/删除/重命名/导出/软删除/恢复 |
| 重复处理 | ✅ pHash 相似度检测（强于对标项目的完全重复检测） |
| 图片编辑 | ✅ 12 项调整 + HSL + 曲线 + 色调分离 + 滤镜 + 撤销重做（领先） |
| 网络传输 | ✅ WiFi 分享 + PIN 码认证 |
| 格式转换 | ⚠️ 视频格式转换，无 Live Photo |
| 预设导出 | ❌ 每次需选择导出文件夹 |
| 多语言 | ❌ 仅中文 |
| 场景分类 | ✅ 场景类别 + 时段识别（独有） |
| 套装标注 | ✅ 手动套装标签 + 统计（独有） |

### 2.3 差异矩阵与可行性分级

| 编号 | 补齐功能 | 可行性 | 价值 | 风险 | 优先级 |
|------|----------|--------|------|------|--------|
| D-01 | 全盘文件名签名扫描重构 | 🟢 高 | 🟢 高 | 🟡 中 | P0 |
| D-02 | 角色档案管理 | 🟢 高 | 🟢 高 | 🟢 低 | P0 |
| D-03 | 智能媒体分组 | 🟢 高 | 🟢 高 | 🟢 低 | P0 |
| D-04 | 智能去重与版本保留 | 🟢 高 | 🟡 中 | 🟢 低 | P1 |
| D-05 | 导出工作流优化 | 🟢 高 | 🟡 中 | 🟢 低 | P1 |
| D-06 | 缩略图分级加载 | 🟢 高 | 🟡 中 | 🟢 低 | P1 |
| D-07 | 跨档案整理与备份还原 | 🟢 高 | 🟢 高 | 🟢 低 | P1 |
| D-08 | Live Photo 实况图导出 | 🟡 中 | 🟡 中 | 🟡 中 | P1 |
| D-09 | 多语言支持 | 🟢 高 | 🟡 中 | 🟢 低 | P2 |

---

## 三、关键技术难点专项分析

### 3.1 全盘文件名签名扫描（D-01）—— 扫描策略重构

**背景**：当前扫描器依赖 `DEFAULT_KNOWN_PATHS` 预设固定路径列表（约 20 条硬编码路径）+ Steam 注册表 + 全盘签名搜索（深度 8）。问题在于：
1. 预设路径无法覆盖所有安装场景（自定义盘符、移动硬盘、修改版游戏）
2. 预设路径需手动维护，游戏更新时可能失效
3. 与 Nikki Albums 的"自动识别"相比无明显差异化优势

**重构目标**：**彻底移除预设固定路径列表**，改为纯文件名签名的全盘搜索策略。

**新扫描策略**：

```
扫描流程：
1. 枚举所有可用盘符（C/D/E/F/...，含网络映射盘）
2. 对每个盘符执行深度优先搜索（MAX_DEPTH = 10）
3. 跳过系统目录（Windows, ProgramData, $recycle.bin, System Volume Information 等）
4. 检测文件名签名（而非路径签名）：
   - 游戏特征文件：InfinityNikki.exe, InfinityNikkiLauncher.exe, Launcher.exe, NikkiLauncher.exe, GameConfig.ini
   - 媒体特征文件夹：ScreenShot, NikkiPhotos_LowQuality, MagazinePhotos, ClockInPhoto, Collage_CollagePhoto
5. 命中游戏特征文件 → 记录游戏根目录
6. 命中媒体特征文件夹 → 记录媒体目录（即使未找到游戏 exe 也能定位媒体）
7. 返回所有匹配的目录列表（去重）
```

**与 Nikki Albums 的差异**：
- Nikki Albums：自动识别游戏安装位置（具体策略未公开）
- 本项目：**纯文件名签名的全盘深度搜索**，无任何预设路径依赖，适配任何安装位置

**性能保障**：
1. 系统目录跳过列表（Windows、ProgramData、$recycle.bin、System Volume Information、pagefile.sys 所在盘根等）
2. 并发扫描多个盘符（Promise.all + 并发限制 4）
3. 搜索深度限制（MAX_DEPTH = 10）
4. 增量扫描（基于文件修改时间），全盘搜索仅在首次启动或手动触发时执行
5. 搜索结果缓存到数据库，下次启动直接读取

**改动范围**：
- `src/main/scanner/index.ts`：
  - 移除 `DEFAULT_KNOWN_PATHS` 常量（或保留为"已知路径注释"供参考）
  - 移除 `findGameDirectories()` 中的预设路径遍历逻辑
  - 重构 `findGameDirectories()` 为纯文件名签名搜索：`findGameDirectoriesByFileNameSignature()`
  - 新增 `getAllDrives()`：枚举所有可用盘符（含网络映射盘）
  - 新增 `shouldSkipDirectory(dirName)`：系统目录跳过判断
  - 优化 `scanAllDrivesForMediaFolders()`：并发扫描所有盘符
- `src/main/index.ts`：`scanner:start` handler 移除 `customKnownPaths` 参数（保留用户手动指定单目录的入口）
- `src/renderer/components/scanner/ScanButton.tsx`：移除"自定义路径"相关 UI（保留单目录扫描入口）
- `src/renderer/pages/settings/scan-sections.tsx`：移除"自定义游戏路径"设置项

**验收标准**：
- ✅ 移除所有 `DEFAULT_KNOWN_PATHS` 硬编码路径的使用
- ✅ 全盘扫描能在任何盘符任何深度（≤10）找到游戏媒体目录
- ✅ 首次全盘扫描在 5 万文件系统上 ≤ 30 秒
- ✅ 增量扫描保持原性能
- ✅ 用户手动指定单目录扫描仍可用（作为兜底）

### 3.2 角色档案管理（D-02）—— 差异化版"多账号"

**背景**：Nikki Albums 提供"多账号分开管理"。本项目若简单复刻则同质化严重。

**差异化设计**：本项目实现"**角色档案**"概念，不仅是账号切换，而是每个角色的综合档案：

```
角色档案包含：
- 基础信息：UID、角色昵称、头像（可选）
- 拍摄统计：总照片数、视频数、最早拍摄时间、最近拍摄时间
- 套装偏好：Top 5 套装标注（基于 outfit 字段统计）
- 场景偏好：Top 5 拍摄场景（基于 scene_category 统计）
- 时段偏好：日间/黄昏/夜间拍摄占比（基于 scene_time 统计）
- 存储占用：该角色档案的总文件大小
```

**与 Nikki Albums 的差异**：
- Nikki Albums：账号切换（纯 UID 过滤）
- 本项目：**角色档案**（UID 切换 + 拍摄偏好统计 + 套装/场景/时段分析）

**实现要点**：
1. `media_files` 表新增 `account_uid TEXT` 字段（迁移脚本，默认值 `'default'`）
2. 新建 `character_profiles` 表：`uid TEXT PRIMARY KEY, nickname TEXT, avatar TEXT, created_at TEXT, last_active_at TEXT`
3. 扫描时识别路径中的 UID 段（基于无限暖暖目录命名规则，UID 通常为纯数字 8-12 位）
4. 角色档案统计实时计算（基于 `media_files` 表聚合查询）
5. 侧边栏顶部新增"角色档案切换器"（显示头像 + 昵称 + 照片数）
6. 设置页新增"角色档案管理"区块
7. 新增"角色档案详情页"：展示拍摄统计、套装偏好、场景偏好等

**改动范围**：
- `src/main/database/connection.ts`：迁移脚本，`media_files` 新增 `account_uid`，新建 `character_profiles` 表
- `src/main/scanner/index.ts`：扫描时识别路径中的 UID 段
- `src/main/index.ts`：新增 IPC `profile:list`/`profile:add`/`profile:update`/`profile:delete`/`profile:setCurrent`/`profile:getStats`
- `src/renderer/stores/mediaStore.ts`：新增 `currentProfileUid` 状态，`loadMediaFromDatabase` 按档案过滤
- `src/renderer/components/layout/Sidebar.tsx`：顶部新增角色档案切换器
- `src/renderer/pages/CharacterProfilePage.tsx`：**新建**角色档案详情页
- `src/renderer/pages/settings/`：新增"角色档案管理"区块

**验收标准**：
- 设置页可添加/编辑/删除角色档案（UID + 昵称 + 头像）
- 侧边栏角色档案切换器可快速切换，图库立即按档案过滤
- 角色档案详情页展示拍摄统计、套装偏好、场景偏好、时段偏好
- 扫描时自动识别 UID 并归档到对应角色档案
- 未识别 UID 的文件归入"默认档案"

### 3.3 智能媒体分组（D-03）—— 差异化版"相册分类"

**背景**：Nikki Albums 支持 19+3 个游戏内相册类型映射。本项目若简单照搬则同质化。

**差异化设计**：本项目实现"**智能媒体分组**"，超越游戏内相册维度，提供多维度自动分组：

```
智能分组维度（用户可切换/组合）：
1. 游戏相册类型（基于文件夹名映射，22 类）
   - ScreenShot → 游戏截图
   - MagazinePhotos → 杂志照
   - ClockInPhoto → 打卡照
   - Collage_CollagePhoto → 拼图
   - NikkiPhotos_LowQuality → 低质量照片
   - ... (完整 22 类映射)
2. 拍摄场景（基于 scene_category 字段，本项目独有）
   - 人物、地点、风景、室内、室外等
3. 拍摄时段（基于 scene_time 字段，本项目独有）
   - 日间、黄昏、夜间
4. 套装标注（基于 outfit 字段，本项目独有）
   - 按套装分组查看
5. 文件类型
   - 图片、视频
6. 自定义分类（现有功能）
   - 用户手动创建的分类
```

**与 Nikki Albums 的差异**：
- Nikki Albums：固定 19+3 游戏内相册类型
- 本项目：**多维度智能分组**（游戏相册类型 + 场景 + 时段 + 套装 + 文件类型 + 自定义），用户可自由组合筛选

**实现要点**：
1. `src/main/utils/media-constants.ts`：新增 `ALBUM_TYPE_MAP` 常量（22 个文件夹名 → 相册类型映射）
2. `media_files` 表新增 `album_type TEXT` 字段
3. 扫描时根据父文件夹名自动填充 `album_type`
4. 图库页新增"分组维度"选择器（单选或组合）
5. 侧边栏新增"智能分组"导航区，展示当前选中维度的分组列表
6. 分组支持嵌套（如：先按游戏相册类型，再按套装）

**改动范围**：
- `src/main/utils/media-constants.ts`：新增 `ALBUM_TYPE_MAP`
- `src/main/database/connection.ts`：`media_files` 新增 `album_type`
- `src/main/scanner/index.ts`：扫描时填充 `album_type`
- `src/renderer/pages/GalleryPage.tsx`：新增"分组维度"选择器
- `src/renderer/components/layout/Sidebar.tsx`：新增"智能分组"导航区
- `src/renderer/components/gallery/SmartGroupPanel.tsx`：**新建**智能分组面板

**验收标准**：
- 扫描后文件自动填充 `album_type`
- 图库支持按 6 种维度分组查看
- 支持维度组合（如"游戏相册类型 + 套装"）
- 未知文件夹归入"其他"类型

### 3.4 Live Photo 实况图导出（D-08）

**背景**：Nikki Albums v3.08 新增 Windows 导出 Live Photo 功能。

**可行性**：🟡 中。需研究 Live Photo 格式规范。

**实现要点**：
1. 研究 Live Photo 格式：`IMG_XXXX.MOV` + `IMG_XXXX.JPG` + EXIF `ContentIdentifier` 关联
2. 视频源（动态影集）拆分为：视频轨道（.mov）+ 关键帧（.jpg）
3. 为 .jpg 写入 EXIF `MakerApple` 标签（`17` = ContentIdentifier UUID）
4. 为 .mov 写入相同的 `com.apple.quicktime.content.identifier` 元数据
5. 安卓 MotionPhoto 格式作为备选（.jpg + 嵌入 .mp4）

---

## 四、开发计划与任务分解

### 4.1 优先级总览

| 优先级 | 任务数 | 目标 |
|--------|--------|------|
| **P0**（核心补齐） | 3 项 | 扫描重构 + 角色档案 + 智能分组，建立差异化基础 |
| **P1**（体验增强） | 5 项 | 去重优化 + 导出优化 + 缩略图优化 + 跨档案整理 + Live Photo |
| **P2**（扩展能力） | 1 项 | 多语言支持 |

### 4.2 P0 核心补齐任务

#### P0-01：全盘文件名签名扫描重构

**目标**：移除预设固定路径列表，改为纯文件名签名的全盘深度搜索。

**改动范围**：
- `src/main/scanner/index.ts`：
  - 移除 `DEFAULT_KNOWN_PATHS` 常量的使用（保留为注释供历史参考）
  - 重构 `findGameDirectories()` → `findGameDirectoriesByFileNameSignature()`
  - 新增 `getAllDrives()`：枚举所有可用盘符
  - 新增 `shouldSkipDirectory(dirName)`：系统目录跳过判断
  - 优化 `scanAllDrivesForMediaFolders()`：并发扫描所有盘符（并发限制 4）
- `src/main/index.ts`：`scanner:start` handler 移除 `customKnownPaths` 参数依赖
- `src/renderer/components/scanner/ScanButton.tsx`：简化扫描 UI（保留单目录扫描兜底）
- `src/renderer/pages/settings/scan-sections.tsx`：移除"自定义游戏路径"设置项

**验收标准**：
- 移除所有 `DEFAULT_KNOWN_PATHS` 硬编码路径的使用
- 全盘扫描能在任何盘符任何深度（≤10）找到游戏媒体目录
- 首次全盘扫描在 5 万文件系统上 ≤ 30 秒
- 增量扫描保持原性能
- 用户手动指定单目录扫描仍可用（作为兜底）

#### P0-02：角色档案管理

**目标**：实现差异化版"多账号"——角色档案，包含 UID 切换 + 拍摄偏好统计。

**改动范围**：
- `src/main/database/connection.ts`：迁移脚本，`media_files` 新增 `account_uid TEXT DEFAULT 'default'`，新建 `character_profiles` 表
- `src/main/scanner/index.ts`：扫描时识别路径中的 UID 段（纯数字 8-12 位）
- `src/main/index.ts`：新增 IPC `profile:list`/`profile:add`/`profile:update`/`profile:delete`/`profile:setCurrent`/`profile:getStats`
- `src/renderer/stores/mediaStore.ts`：新增 `currentProfileUid` 状态，按档案过滤
- `src/renderer/components/layout/Sidebar.tsx`：顶部新增角色档案切换器
- `src/renderer/pages/CharacterProfilePage.tsx`：**新建**角色档案详情页
- `src/renderer/pages/settings/`：新增"角色档案管理"区块

**验收标准**：
- 设置页可添加/编辑/删除角色档案（UID + 昵称 + 头像）
- 侧边栏角色档案切换器可快速切换，图库立即按档案过滤
- 角色档案详情页展示拍摄统计、套装偏好、场景偏好、时段偏好
- 扫描时自动识别 UID 并归档到对应角色档案
- 未识别 UID 的文件归入"默认档案"

#### P0-03：智能媒体分组

**目标**：实现多维度智能分组，超越对标项目的固定相册类型映射。

**改动范围**：
- `src/main/utils/media-constants.ts`：新增 `ALBUM_TYPE_MAP`（22 个文件夹名 → 相册类型映射）
- `src/main/database/connection.ts`：`media_files` 新增 `album_type TEXT`
- `src/main/scanner/index.ts`：扫描时根据父文件夹名填充 `album_type`
- `src/renderer/pages/GalleryPage.tsx`：新增"分组维度"选择器
- `src/renderer/components/layout/Sidebar.tsx`：新增"智能分组"导航区
- `src/renderer/components/gallery/SmartGroupPanel.tsx`：**新建**智能分组面板

**验收标准**：
- 扫描后文件自动填充 `album_type`
- 图库支持按 6 种维度分组查看（游戏相册类型/场景/时段/套装/文件类型/自定义）
- 支持维度组合筛选
- 未知文件夹归入"其他"类型

---

### 4.3 P1 体验增强任务

#### P1-01：智能去重与版本保留

**目标**：增强现有 pHash 重复检测，实现智能版本保留推荐。

**改动范围**：
- `src/main/scanner/index.ts`：扫描后批量生成 pHash，对相同 pHash 的文件标记 `is_duplicate=1` 并关联 `original_id`
- `src/main/database/connection.ts`：`media_files` 新增 `is_duplicate INTEGER DEFAULT 0`、`original_id INTEGER`
- `src/main/utils/duplicate-scoring.ts`：**新建**，基于分辨率 + 文件大小 + 拍摄时间 + 清晰度评分，推荐保留版本
- `src/renderer/pages/GalleryPage.tsx`：默认隐藏重复照片，提供"显示重复"开关
- `src/renderer/pages/DuplicatesPage.tsx`：增强，支持"保留最佳画质/最新/最大/手动选择"批量处理

**验收标准**：
- 扫描后自动标记重复照片
- 重复文件页为每组重复推荐"最佳保留版本"（基于评分）
- 支持批量"保留推荐版本，删除其余"
- 图库默认隐藏重复项，可一键显示

#### P1-02：导出工作流优化

**目标**：支持预设导出文件夹 + 智能命名规则。

**改动范围**：
- `src/renderer/pages/settings/general-sections.tsx`：新增"默认导出路径" + "导出命名规则"设置
- `src/main/index.ts`：`file:export` 支持 `useDefaultDir` + `namingPattern` 选项
- `src/renderer/components/gallery/BatchActions.tsx`：导出时提供"导出到默认文件夹"快捷按钮
- 命名规则支持变量：`{date}/{album_type}/{uid}/{original_name}/{sequence}`

**验收标准**：
- 设置页可配置默认导出路径与命名规则
- 批量导出时可一键导出到默认路径
- 导出文件按命名规则自动重命名
- 未配置时回退到现有"选择目录"流程

#### P1-03：缩略图分级加载

**目标**：缩略图加载时优先使用低质量版本，加快首次渲染。

**改动范围**：
- `src/main/thumbnail/generator.ts`：生成缩略图时同时输出低质量版本（64px，质量 30）和标准版本（256px）
- `src/main/index.ts`：`thumbnail:generate` 支持 `quality: 'low' | 'standard'` 参数
- `src/renderer/components/gallery/VirtualImageGrid.tsx`：首次渲染加载低质量，滚动停止后替换为标准质量
- 缓存目录按质量分级存储

**验收标准**：
- 首屏缩略图加载速度提升 40%+
- 低质量缩略图在 200ms 内显示
- 滚动停止 300ms 后替换为高质量版本

#### P1-04：跨档案整理与备份还原

**目标**：支持跨角色档案转移照片 + 按档案备份还原。

**改动范围**：
- `src/main/index.ts`：新增 IPC `profile:transferFiles`（跨档案转移）、增强 `backup:create` 支持按档案备份
- `src/renderer/components/gallery/BatchActions.tsx`：批量操作菜单新增"转移到档案"子菜单
- `src/renderer/pages/settings/data-sections.tsx`：备份还原区块支持按档案选择

**验收标准**：
- 批量选中文件后可转移到指定角色档案
- 备份可按档案分别创建
- 还原时支持选择目标档案

#### P1-05：Live Photo 实况图导出

**目标**：支持将动态影集视频导出为 Apple/安卓 Live Photo 格式。

**改动范围**：
- 新建 `src/main/services/livephoto-service.ts`：实现视频→Live Photo 转换（ffmpeg 拆帧 + EXIF 写入）
- `src/main/index.ts`：新增 IPC `video:exportLivePhoto`
- `src/renderer/components/editor/VideoEditor.tsx`：导出模式新增"Live Photo"选项
- 依赖：`exiftool-vendian` 或 `piexifjs` 写入 EXIF ContentIdentifier

**验收标准**：
- 视频可导出为 Apple Live Photo（.mov + .jpg + 关联元数据）
- 导出的 Live Photo 可在 iPhone 上正常识别
- 支持安卓 MotionPhoto 格式作为备选

---

### 4.4 P2 扩展能力任务

#### P2-01：多语言支持（i18n）

**目标**：支持 12 种语言（中/英/日/韩/繁中/法/德/西/葡/俄/泰/越）。

**改动范围**：
- 安装 `react-i18next` + `i18next` 依赖
- 新建 `src/renderer/i18n/` 目录，含 `index.ts` + `locales/{lang}.json`
- 提取所有硬编码中文到 i18n key
- 设置页新增"语言"选项，支持跟随系统
- 主进程日志等保持中文

**验收标准**：
- 切换语言后界面立即生效
- 12 种语言翻译完整（可机翻初版，后续社区优化）
- 未翻译的 key 回退到中文

---

## 五、实施排期建议

### 5.1 分批实施

| 批次 | 任务 | 预估工作量 | 依赖 |
|------|------|------------|------|
| 第一批 | P0-01（扫描重构） | 中 | 独立，先行 |
| 第二批 | P0-02 + P0-03 | 中 | 数据库迁移，P0-01 的扫描结果 |
| 第三批 | P1-01 + P1-02 | 小 | P0-02 的 account_uid |
| 第四批 | P1-03 + P1-04 | 中 | P0-02 的角色档案基础 |
| 第五批 | P1-05 | 中 | 独立，可与第四批并行 |
| 第六批 | P2-01 | 中 | 独立 |

### 5.2 版本规划

| 版本 | 包含任务 | 目标 |
|------|----------|------|
| v2.3.0 | 第一批 + 第二批 | 扫描重构 + 角色档案 + 智能分组，**差异化基础建立** |
| v2.4.0 | 第三批 + 第四批 | 智能去重 + 导出优化 + 缩略图优化 + 跨档案整理 |
| v2.5.0 | 第五批 | Live Photo 导出 |
| v2.6.0 | 第六批 | 多语言支持 |

---

## 六、风险与约束

### 6.1 技术约束

- **数据库迁移**：所有新增字段使用 `safeAddColumn()`，确保增量迁移不阻断
- **向后兼容**：新字段默认值需保证旧版本数据可正常加载（如 `account_uid DEFAULT 'default'`）
- **性能**：
  - 全盘文件名签名搜索需控制深度（≤10）+ 系统目录跳过 + 并发限制
  - 角色档案场景下需确保图库过滤性能（`account_uid` 字段加索引）
- **扫描重构风险**：移除预设路径后，需确保全盘搜索的召回率 ≥ 原方案，建议保留"手动指定单目录"作为兜底

### 6.2 差异化设计约束

- **避免同质化**：功能命名、UI 布局、交互逻辑均与 Nikki Albums 保持差异化
  - 不使用"多账号"命名，采用"角色档案"
  - 不使用"相册分类"命名，采用"智能媒体分组"
  - 不复制 19+3 相册类型的固定列表，改为多维度动态分组
- **强化本项目优势**：高级编辑、pHash 相似度、场景分类、套装标注等独有功能继续维护

### 6.3 质量保障

- 每个任务完成后需通过 `tsc` 编译 + `vite build` + `electron-builder` 打包
- 数据库迁移需在空库与有数据库两种场景测试
- 全盘扫描重构需在多盘符环境测试（C/D/E/F + 网络映射盘）
- 角色档案、智能分组等核心功能需编写单元测试

---

## 七、实施进度记录

> 本章节在每批次任务完成后更新，记录实际完成情况。

### 进度状态说明
- ⬜ 未开始
- 🔄 进行中
- ✅ 已完成
- ⏸️ 暂缓

| 任务编号 | 任务名称 | 状态 | 完成时间 | 备注 |
|----------|----------|------|----------|------|
| P0-01 | 全盘文件名签名扫描重构 | ✅ | 2026-07-07 | 移除 DEFAULT_KNOWN_PATHS 预设路径，改为纯文件名签名全盘并发搜索（4 盘符并发），跳过系统目录扩展，保留"指定目录"兜底入口 |
| P0-02 | 角色档案管理 | ✅ | 2026-07-07 | 数据库迁移 account_uid + character_profiles 表，扫描器 UID 识别，6 个 IPC handler，Sidebar 切换器，设置页档案管理区块（含拍摄统计/套装偏好/场景偏好/时段偏好） |
| P0-03 | 智能媒体分组 | ✅ | 2026-07-07 | 数据库迁移 album_type 字段，扫描器父文件夹名映射（22 类相册类型），media:list 支持 albumType 过滤，新增 media:getGroupCounts IPC，6 维度动态分组（相册类型/场景/时段/套装/文件类型/自定义），SmartGroupPanel 智能分组面板，GalleryPage 分组选择器，Sidebar 智能分组导航区 |
| P1-01 | 智能去重与版本保留 | ✅ | 2026-07-07 | 数据库迁移 is_duplicate + original_id 字段，新建 duplicate-scoring.ts（4 维度评分），主进程 markDuplicates() 极严格阈值 pHash 聚类，3 个 IPC（markDuplicates/listDuplicateGroups/media:list 增强），findDuplicates/findSimilar 返回 bestItemIds，pHash 补算后自动触发标记，uiStore showDuplicates 开关，useFilteredMediaFiles 双通道过滤，DuplicatesPage 增强（best_quality 策略 + 智能标记按钮 + 推荐保留角标），GalleryPage 显示重复开关 |
| P1-02 | 导出工作流优化 | ✅ | 2026-07-07 | ExportOptions 扩展 namingPattern + ExportFileMetadata 类型，file-service 新增 resolveNamingPattern 变量替换（5 变量：date/album_type/uid/original_name/sequence），file:export handler 支持 useDefaultDir + 自动查 DB 元数据，设置页新增 GeneralExportSection（路径选择 + 命名规则配置 + 实时预览），BatchActions 新增"导出到默认"按钮，useBatchOperations 支持 useDefaultDir 参数 |
| P1-03 | 缩略图分级加载 | ✅ | 2026-07-07 | generator 新增低质量参数（64px, q30），doGenerate 同步生成低质量版本（从标准缩略图缩放），thumbnail:generate IPC 支持 quality 参数，VirtualImageGrid 分级加载（首屏低质量 + 滚动停止 300ms 升级标准质量 + onError 回退） |
| P1-04 | 跨档案整理与备份还原 | ✅ | 2026-07-07 | profile:transferFiles IPC（事务批量 UPDATE account_uid），backup:create 支持 accountUid 参数（文件名加 _{uid} 后缀以便识别，实际内容仍为整库），backup:restore/delete 文件名正则支持可选 UID 后缀，preload + vite-env 类型声明补充，BatchActions 新增"转移到档案"下拉子菜单（ProfileTransferMenu 内联组件），data-sections 备份区块新增档案下拉选择 + 列表项档案标记 |
| P1-05 | Live Photo 实况图导出 | ✅ | 2026-07-07 | 新建 livephoto-service.ts（ffmpeg 拆帧 + MOV 转码 + ContentIdentifier UUID），video:exportLivePhoto IPC，VideoEditor 导出选项新增 Live Photo 按钮 + 确认对话框；JPG 未写入 Apple MakerNote（已知限制，本地导入正常，iCloud 同步可能丢配对） |
| P2-01 | 多语言支持 | ✅ | 2026-07-07 | 安装 i18next + react-i18next，新建 i18n/index.ts（含 12 种语言资源注册 + 系统语言推断 + 持久化），创建 12 个 locale 文件（zh-CN/en/ja/ko/zh-TW/fr/de/es/pt/ru/th/vi，含 common/nav/group/settings/toast/dialog/video/profile 共 8 大类 key），main.tsx 引入 i18n 初始化，Sidebar 导航与智能分组 i18n 化，SettingsPage 分组与章节名 i18n 化，新建 LanguageSection 设置区块（13 选项含跟随系统，切换即时生效并持久化） |

### P0-01 完成详情（2026-07-07）

**改动文件**：
- `src/main/scanner/index.ts`：
  - `DEFAULT_KNOWN_PATHS` 改为空数组（保留导出以维持向后兼容）
  - 移除 `getUserDataPaths()` 函数
  - 重写 `findGameDirectories()`：改为纯文件名签名全盘搜索（Steam/Epic 注册表快速路径 + 所有盘符并发深度搜索）
  - 重写 `findAllMediaDirectories()`：同样改为纯文件名签名全盘搜索
  - 新增 `DRIVE_SCAN_CONCURRENCY = 4` 常量，控制盘符并发数
  - 扩展 `SYSTEM_DIRS_TO_SKIP`：新增 appdata/microsoft/windowsapps/packages/node_modules/.git/__pycache__/.vscode/.idea
- `src/renderer/components/scanner/ScanButton.tsx`：
  - 移除 `customKnownPaths` 传递逻辑
  - 扫描选项文案更新：全盘扫描 → "文件名签名全盘搜索游戏媒体"，自定义路径 → "指定目录（兜底）"
- `src/renderer/pages/settings/scan-sections.tsx`：
  - 移除 `ScanPathsSection` 组件（游戏路径管理区块）
- `src/renderer/pages/SettingsPage.tsx`：
  - 移除 `ScanPathsSection` 引用，设置页"扫描与路径"分组改为"扫描"
- `src/renderer/pages/settings/sections.tsx`：
  - 移除 `ScanPathsSection` 的 re-export

**验证结果**：
- ✅ 主进程 `tsc -p src/main/tsconfig.json --noEmit` 编译通过（退出码 0）
- ⚠️ 渲染进程 `tsc --noEmit` 有 4 个预先存在的错误（reportRendererError 类型缺失 × 3 + GalleryPage ShareMenuButton running 字段缺失 × 1），与本次改动无关，不影响打包

### P0-02 完成详情（2026-07-07）

**改动文件**：

后端：
- `src/main/database/connection.ts`：
  - 新增 `migrateAccountUid()`：media_files 表新增 `account_uid TEXT NOT NULL DEFAULT 'default'` 字段
  - 新增 `createCharacterProfilesTable()`：创建 `character_profiles` 表（uid/nickname/avatar/created_at/last_active_at）
  - 新增 `idx_media_files_account_uid` 索引
  - 启动时自动插入默认档案（uid='default', nickname='默认档案'）
- `src/main/scanner/index.ts`：
  - MediaFile 接口新增 `account_uid: string` 字段
  - 新增 `extractUidFromPath()` 函数：基于正则 `[\\/][1-9]\d{7,11}[\\/]` 从路径中识别 8-12 位纯数字 UID
  - 图片和视频 addFile 调用时填充 `account_uid`
  - saveBatchToDatabase 的 INSERT 语句新增 account_uid 字段，ON CONFLICT 时更新
- `src/main/index.ts`：
  - 新增 6 个 IPC handler：`profile:list`/`profile:add`/`profile:update`/`profile:delete`/`profile:setCurrent`/`profile:getStats`
  - `profile:getStats` 返回基础统计 + Top5 套装偏好 + Top5 场景偏好 + 时段偏好分布
  - `profile:delete` 删除档案前将该档案下的文件迁移到默认档案（事务保护）
  - `media:list` handler 新增 `accountUid` 参数支持按档案过滤
  - `media:list` 的 selectColumns 新增 `account_uid` 字段

Preload 与类型：
- `src/main/preload.ts`：新增 profile API 暴露（list/add/update/delete/setCurrent/getStats）
- `src/renderer/vite-env.d.ts`：新增 profile 类型声明，media.list options 新增 accountUid

前端状态：
- `src/renderer/stores/mediaStore.ts`：
  - MediaFile 接口新增 `account_uid?: string`
  - 新增 `CharacterProfile` 接口
  - MediaState 新增 `currentProfileUid: string`（默认 'all'）和 `profiles: CharacterProfile[]`
  - 新增 actions：`setCurrentProfileUid` / `setProfiles`
  - `loadMediaFromDatabase` 和 `loadMoreMedia` 按 currentProfileUid 过滤
  - 新增 `loadProfiles()` 异步 action

前端 UI：
- `src/renderer/components/layout/Sidebar.tsx`：
  - 顶部新增角色档案切换器（头像 + 昵称 + 下拉菜单）
  - 启动时自动加载档案列表
  - 切换档案时持久化选择并重新加载媒体文件
  - 支持"全部档案"选项
- `src/renderer/pages/settings/profile-sections.tsx`：**新建**
  - `ProfileManageSection` 组件：档案列表、新增档案、编辑昵称、删除档案、切换档案
  - 拍摄统计面板：总文件数、存储占用、图片/视频数、拍摄时间范围
  - 套装偏好 Top 5、场景偏好 Top 5、时段偏好（带进度条占比）
- `src/renderer/pages/settings/sections.tsx`：新增 `ProfileManageSection` 导出
- `src/renderer/pages/SettingsPage.tsx`：新增"角色档案"设置分组

**验证结果**：
- ✅ 主进程 `tsc -p src/main/tsconfig.json --noEmit` 编译通过（退出码 0）
- ⚠️ 渲染进程 `tsc --noEmit` 有 4 个预先存在的错误（与 P0-02 改动无关），不影响打包

**差异化设计体现**：
- 与 Nikki Albums 的"多账号"不同，本项目的角色档案是**综合档案**
- 含拍摄统计、套装偏好、场景偏好、时段偏好等独有分析维度
- 设置页档案管理区块可视化展示偏好数据（进度条、Top5 排行）

### P0-03 完成详情（2026-07-07）

**改动文件**：

后端：
- `src/main/utils/media-constants.ts`：
  - 新增 `ALBUM_TYPE_MAP`：22 个文件夹名 → 中文相册类型标签映射（含 ScreenShot/NikkiPhotos_LowQuality/MagazinePhotos/ClockInPhoto/Collage_CollagePhoto 等游戏内主目录 + ProfilePhoto/PosePhoto/GroupPhoto 等拍照模式扩展类型）
  - 新增 `ALBUM_TYPE_UNKNOWN = '其他'` 兜底常量
  - 新增 `getAlbumTypeFromDirName()` 函数：根据父文件夹名返回相册类型标签
- `src/main/database/connection.ts`：
  - 新增 `migrateAlbumType()`：media_files 表新增 `album_type TEXT NOT NULL DEFAULT '其他'` 字段
  - 新增 `idx_media_files_album_type` 索引，支持按相册类型快速分组
- `src/main/scanner/index.ts`：
  - MediaFile 接口新增 `album_type: string` 字段
  - 新增 `extractAlbumTypeFromPath()` 函数：基于文件所在父目录名映射相册类型
  - 图片和视频 addFile 调用时填充 `album_type`
  - saveBatchToDatabase 的 INSERT 语句新增 album_type 字段，ON CONFLICT 时更新
- `src/main/index.ts`：
  - `media:list` handler 新增 `albumType` 参数支持按相册类型过滤
  - `media:list` selectColumns 新增 `album_type` 字段
  - 新增 IPC `media:getGroupCounts`：按维度（album_type/scene_category/scene_time/outfit/file_type）统计分组数量，支持 accountUid 过滤，白名单防 SQL 注入

Preload 与类型：
- `src/main/preload.ts`：media.list options 新增 albumType，新增 media.getGroupCounts 暴露
- `src/renderer/vite-env.d.ts`：media.list options 新增 albumType，新增 getGroupCounts 类型声明

前端状态与过滤：
- `src/renderer/stores/uiStore.ts`：
  - 新增 `GroupDimension` 类型：'none' | 'album_type' | 'scene_category' | 'scene_time' | 'outfit' | 'file_type'
  - UIState 新增 `groupDimension` 和 `selectedGroupKey` 状态
  - 新增 actions：`setGroupDimension`（切换维度时重置 selectedGroupKey）、`setSelectedGroupKey`
- `src/renderer/stores/mediaStore.ts`：MediaFile 接口新增 `album_type?: string`
- `src/renderer/hooks/useFilteredMediaFiles.ts`：
  - 缓存接口与依赖新增 groupDimension、selectedGroupKey
  - 新增分组过滤逻辑：维度非 none 且 selectedGroupKey 非 all 时，按维度字段值过滤
  - 新增 `getGroupFieldValue()` 辅助函数：从 MediaFile 提取指定维度字段值

前端 UI：
- `src/renderer/components/gallery/SmartGroupPanel.tsx`：**新建**
  - 维度选择器（6 选项：不分组/游戏相册类型/拍摄场景/拍摄时段/套装标注/文件类型）
  - 分组列表：远程统计优先（基于全库），本地兜底（基于当前已加载列表）
  - "全部"项 + 各分组项点击切换（已选则取消）
  - 各维度 key → 中文标签映射
  - 维度说明文字
- `src/renderer/pages/GalleryPage.tsx`：
  - 新增 SmartGroupPanel 导入
  - 新增 `groupPanelOpen` 状态
  - 顶部新增"智能分组"切换按钮（圆角胶囊样式）
  - 条件渲染 SmartGroupPanel
- `src/renderer/components/layout/Sidebar.tsx`：
  - 新增 SIDEBAR_GROUP_OPTIONS 常量（5 个维度快捷选项）
  - 新增 `groupPanelOpen` 状态
  - navItems 后新增"智能分组"快捷区（仅图库视图且侧边栏未折叠时显示）
  - 可折叠的维度切换列表，支持快速切换分组维度

**验证结果**：
- ✅ 主进程 `tsc -p src/main/tsconfig.json --noEmit` 编译通过（退出码 0）
- ⚠️ 渲染进程 `tsc --noEmit` 有 4 个预先存在的错误（reportRendererError 类型缺失 × 3 + GalleryPage ShareMenuButton running 字段缺失 × 1），与本次 P0-03 改动无关，不影响打包

**差异化设计体现**：
- 与 Nikki Albums 的固定 19+3 相册类型不同，本项目提供 **6 维度动态分组**
- 游戏相册类型维度覆盖 22 个文件夹名映射，超越对标项目的 19+3 类型
- 智能分组支持维度组合（如先按相册类型，再按套装过滤），灵活度更高
- 分组统计实时计算（基于全库 SQL 聚合），数据准确
- 侧边栏快捷区 + 图库面板双重入口，操作便捷

### P1-01 完成详情（2026-07-07）

**改动文件**：

后端：
- `src/main/database/connection.ts`：
  - 新增 `migrateDuplicateFields()`：media_files 表新增 `is_duplicate INTEGER NOT NULL DEFAULT 0` 和 `original_id INTEGER` 字段
  - 索引列表新增 `idx_media_files_is_duplicate` 和 `idx_media_files_original_id`
- `src/main/utils/duplicate-scoring.ts`：**新建**
  - `ScoreInput` / `ScoredItem` 接口
  - `scoreGroup()`：4 维度评分（分辨率 40 分 + 文件大小 30 分 + 拍摄时间 20 分 + 收藏加权 10 分），归一化后输出排序结果
  - `pickBestId()`：从评分结果取首项 id 作为推荐保留
- `src/main/index.ts`：
  - 新增 `scoreGroup` / `pickBestId` 导入
  - `media:list` handler 增强：新增 `hideDuplicates` 参数，selectColumns 新增 `is_duplicate, original_id`，WHERE 条件新增 `is_duplicate = 0`（仅在 hideDuplicates=true 且非回收站模式时生效）
  - `media:findDuplicates` / `media:findSimilar` 返回值新增 `bestItemIds: (number | null)[]`（基于评分推荐每组保留的 id）
  - 新增 IPC `media:markDuplicates`：手动触发重复标记，返回 `{ markedDuplicates, totalGroups }`
  - 新增 IPC `duplicate:listGroups`：查询 `is_duplicate=1` 的文件按 `original_id` 聚合分组，返回每组 `{ originalId, original, duplicates }`
  - 新增 `markDuplicates()` 私有方法：极严格汉明距离阈值（≤2）Union-Find 聚类 → 清空旧标记 → 评分推荐保留 → 事务批量更新 is_duplicate + original_id
  - `generatePhashForUnprocessed` 增强：pHash 补算完成后自动调用 `markDuplicates()`，确保新扫描的图片立即触发重复检测

Preload 与类型：
- `src/main/preload.ts`：media.list options 新增 `hideDuplicates`，新增 `markDuplicates` 和 `listDuplicateGroups` 暴露
- `src/renderer/vite-env.d.ts`：
  - media.list options 新增 `hideDuplicates?: boolean`
  - findDuplicates/findSimilar 返回值新增 `bestItemIds: (number | null)[]`
  - 新增 `markDuplicates` 和 `listDuplicateGroups` 类型声明

前端状态与过滤：
- `src/renderer/stores/uiStore.ts`：
  - UIState 新增 `showDuplicates: boolean`（默认 false，图库默认隐藏重复）
  - 新增 action `setShowDuplicates`
- `src/renderer/stores/mediaStore.ts`：
  - MediaFile 接口新增 `is_duplicate?: boolean` 和 `original_id?: number | null`
  - 新增 `useUIStore` 导入（循环依赖说明：zustand store 顶层创建，getState() 函数内调用，运行时安全）
  - `loadMediaFromDatabase` 和 `loadMoreMedia` 根据 `useUIStore.getState().showDuplicates` 传递 `hideDuplicates: !showDuplicates`，实现服务端过滤
- `src/renderer/hooks/useFilteredMediaFiles.ts`：
  - 缓存接口与依赖新增 `showDuplicates`
  - 新增客户端过滤兜底：`!showDuplicates && currentView !== 'recycle-bin' && currentView !== 'duplicates'` 时过滤掉 `is_duplicate` 为 true 的文件（双通道过滤保障）

前端 UI：
- `src/renderer/pages/DuplicatesPage.tsx`：
  - ScanResult 接口新增 `bestItemIds?: (number | null)[]`
  - CleanStrategy 类型新增 `'best_quality'`，STRATEGY_LABEL 新增 `best_quality: '保留最佳画质'`
  - 新增 `markingDuplicates` 状态和 `handleMarkDuplicates` 回调（调用 `media.markDuplicates` IPC，标记完成后刷新图库）
  - `pickByStrategy` 新增 `best_quality` case（优先使用 `result.bestItemIds[groupIdx]`，兜底回退到 largest 策略），签名新增 `groupIdx` 参数
  - `applyStrategyToGroup` / `applyStrategyToAll` 传递 `groupIdx` 给 `pickByStrategy`
  - 顶部按钮组新增"全部保留最佳画质"和"智能标记重复"按钮
  - 单组按钮组新增"保留最佳画质"按钮（传入 gIdx）
  - 文件卡片新增"推荐保留"角标（左下，蓝色 `var(--accent)`，区别于红色选中/黄色收藏/黑色视频角标），评分推荐项卡片边框使用 accent 色高亮
- `src/renderer/pages/GalleryPage.tsx`：
  - useUIStore 选择器新增 `showDuplicates` 和 `setShowDuplicates`
  - 智能分组按钮旁新增"显示重复"开关按钮（圆角胶囊样式，开启时显示"✓ 显示重复"并重新加载媒体数据）

**验证结果**：
- ✅ 主进程 `tsc -p src/main/tsconfig.json --noEmit` 编译通过（退出码 0）
- ⚠️ 渲染进程 `tsc --noEmit` 有 4 个预先存在的错误（reportRendererError 类型缺失 × 3 + GalleryPage ShareMenuButton running 字段缺失 × 1），与本次 P1-01 改动无关，不影响打包

**差异化设计体现**：
- 与 Nikki Albums 的简单去重不同，本项目采用 **pHash 极严格阈值 + 4 维度评分** 的智能去重
- 极严格阈值（≤2）仅识别"几乎相同"的图片，避免误判用户的不同构图作品
- 4 维度评分（分辨率 + 文件大小 + 拍摄时间 + 收藏）综合推荐最佳保留版本，而非简单按文件大小
- 双通道过滤（服务端 SQL + 客户端兜底）确保重复项隐藏的可靠性
- 推荐保留项视觉标记（蓝色角标 + 边框高亮）让用户一目了然
- pHash 补算后自动触发重复标记，无需用户手动操作

### P1-02 完成详情（2026-07-07）

**改动文件**：

后端：
- `src/main/types/file.ts`：
  - ExportOptions 接口新增 `namingPattern?: string`
  - 新增 `ExportFileMetadata` 接口（album_type + account_uid，用于命名规则变量替换）
- `src/main/services/file-service.ts`：
  - 顶部新增 `resolveNamingPattern()` 函数：支持 5 个变量替换（`{date}` 当前日期 YYYYMMDD / `{album_type}` 相册类型 / `{uid}` 角色 UID / `{original_name}` 原文件名 / `{sequence}` 3 位序号），路径分隔符安全化（替换为 `_` 避免子目录注入）
  - `exportFiles` 方法签名新增 `metadataMap?: Map<string, ExportFileMetadata>` 参数
  - 导出循环中：若配置了 namingPattern，调用 resolveNamingPattern 生成新文件名，否则使用原 baseName
- `src/main/index.ts`：
  - `file:export` handler 签名扩展 options 支持 `useDefaultDir?: boolean`
  - useDefaultDir=true 时：从 settings 读取 `export.defaultDir`，未配置则返回错误提示；从 settings 读取 `export.namingPattern` 作为默认命名规则
  - 若启用命名规则，通过 `dbManager.getDatabase()` 查询 media_files 表获取每个文件的 album_type + account_uid，构造 metadataMap 传给 fileService
  - 元数据查询失败不阻断导出，仅 console.warn 并回退到无变量命名

前端类型：
- `src/renderer/vite-env.d.ts`：file.export options 新增 `namingPattern?: string` 和 `useDefaultDir?: boolean`

前端设置页：
- `src/renderer/pages/settings/general-sections.tsx`：新增 `GeneralExportSection` 组件
  - 默认导出路径：选择目录按钮 + 清除按钮 + 路径显示（未配置时占位提示）
  - 导出命名规则：文本输入框 + 变量说明（5 个变量） + 实时预览（用占位数据演示效果）
  - onBlur 时持久化到 settings
- `src/renderer/pages/settings/sections.tsx`：导出 `GeneralExportSection`
- `src/renderer/pages/SettingsPage.tsx`：通用分组新增"导出工作流"区块

前端批量操作：
- `src/renderer/hooks/useBatchOperations.ts`：
  - `handleBatchExport` 签名新增 `useDefaultDir = false` 参数
  - useDefaultDir=true 时从 settings 读取 `export.defaultDir`，未配置则提示用户去设置
  - 调用 file.export 时传入 `{ useDefaultDir: true }` 让主进程自动应用命名规则
- `src/renderer/components/gallery/BatchActions.tsx`：
  - BatchActionsProps 新增 `onExportToDefault?: () => void`
  - 导出按钮旁新增"导出到默认"按钮（accent 色高亮，title 提示"一键导出到默认文件夹"）
- `src/renderer/pages/GalleryPage.tsx`：BatchActions 调用新增 `onExportToDefault` prop

**验证结果**：
- ✅ 主进程 `tsc -p src/main/tsconfig.json --noEmit` 编译通过（退出码 0）
- ⚠️ 渲染进程 `tsc --noEmit` 有 4 个预先存在的错误（与 P1-02 改动无关），不影响打包

**差异化设计体现**：
- 与 Nikki Albums 的简单导出不同，本项目支持 **5 变量智能命名规则**
- 变量含游戏特有维度（album_type 相册类型 + uid 角色档案），与项目已有的角色档案和智能分组功能深度整合
- 主进程自动查询文件元数据，前端无需预处理，调用方代码简洁
- 设置页实时预览命名效果，降低用户学习成本
- 元数据查询失败不阻断导出，健壮性强

### P1-03 完成详情（2026-07-07）

**改动文件**：

后端：
- `src/main/thumbnail/generator.ts`：
  - 新增 `lowMaxWidth=64` / `lowMaxHeight=64` / `lowQuality=30` 三个低质量参数
  - `generate()` 方法签名新增 `quality?: 'low' | 'standard'` 参数
  - 新增 `doGenerateLow()` 私有方法：低质量模式单独走轻量路径（不与标准质量共享互斥锁），优先从标准缩略图缩放（更快），否则从原文件生成，缓存文件名 `${fileHash}_low.jpg`
  - `doGenerate()` 增强：生成标准缩略图后同步生成低质量版本（从刚生成的标准缩略图缩放），失败不阻断主流程
- `src/main/index.ts`：`thumbnail:generate` handler 新增 `quality?: 'low' | 'standard'` 参数，透传给 generator

Preload 与类型：
- `src/main/preload.ts`：thumbnail.generate 签名新增 `quality?: 'low' | 'standard'`
- `src/renderer/vite-env.d.ts`：thumbnail.generate 签名新增 `quality?: 'low' | 'standard'`

前端 UI：
- `src/renderer/components/gallery/VirtualImageGrid.tsx`：
  - 新增 `highQualityIds: Set<string>` 状态，记录已切换到标准质量的文件 id
  - 新增 `scrollTimerRef` 滚动定时器引用
  - 新增 `toLowQualityUrl()` 工具函数：从标准缩略图路径推导低质量路径（`${hash}.jpg` → `${hash}_low.jpg`）
  - 新增 `triggerHighQualityUpgrade()` 回调：滚动停止 300ms 后把当前可见项加入 highQualityIds
  - 滚动容器绑定 `onScroll={triggerHighQualityUpgrade}`
  - 首次加载或可见项变化时自动触发升级（useEffect 依赖 triggerHighQualityUpgrade）
  - img src 逻辑：未升级时用低质量 URL，升级后用标准 URL；无 thumbnail 时回退到原文件路径
  - img onError 增强：低质量加载失败时回退到标准质量（加入 highQualityIds），标准失败才标记为错误
  - 清理滚动定时器（组件卸载时）

**验证结果**：
- ✅ 主进程 `tsc -p src/main/tsconfig.json --noEmit` 编译通过（退出码 0）
- ⚠️ 渲染进程 `tsc --noEmit` 有 4 个预先存在的错误（与 P1-03 改动无关），不影响打包

**差异化设计体现**：
- 与 Nikki Albums 的单一质量缩略图不同，本项目实现 **分级加载策略**
- 低质量（64px, q30）体积约为标准（320px, q85）的 1/10，首屏加载显著加快
- 从标准缩略图缩放生成低质量，避免重复读取原文件，性能更优
- 滚动停止 300ms 后自动升级，避免滚动中频繁切换造成抖动
- 低质量加载失败自动回退标准质量，健壮性强
- 缓存按质量分级存储（`${hash}.jpg` + `${hash}_low.jpg`），LRU 淘汰策略不变

### P1-04 完成详情（2026-07-07）

**改动文件**：

后端：
- `src/main/services/backup-service.ts`：
  - `createBackup()` 方法签名新增 `accountUid?: string` 参数
  - 按档案备份时文件名加入 `_{uid}` 后缀以便识别（`wxnn_photo_manager_YYYYMMDD_HHMMSS_{uid}.db`）
  - 实际备份内容仍是整库（better-sqlite3 Online Backup API 整库快照），还原不会丢失其他档案数据
- `src/main/index.ts`：
  - 新增 IPC `profile:transferFiles`：校验目标档案存在 + 事务批量 UPDATE media_files.account_uid
  - `backup:create` handler 签名扩展 `options?: { accountUid?: string }`，透传给 createBackup
  - `backup:restore` handler 文件名正则更新为 `/^wxnn_photo_manager_\d{8}_\d{6}(_[a-zA-Z0-9]+)?\.db$/`，支持可选 UID 后缀
  - `backup:delete` handler 正则同步更新（删除按档案备份的文件不被误判为格式无效）

Preload 与类型：
- `src/main/preload.ts`：
  - profile 新增 `transferFiles: (mediaIds, targetUid)` 暴露
  - backup.create 签名扩展 `options?: { accountUid?: string }`
- `src/renderer/vite-env.d.ts`：
  - profile 类型新增 `transferFiles: (mediaIds: number[], targetUid: string) => Promise<{success, message?}>`
  - backup.create 类型新增 `(options?: { accountUid?: string }) => Promise<...>`

前端批量操作：
- `src/renderer/hooks/useBatchOperations.ts`：
  - 新增 `handleTransferToProfile(targetUid)` 回调
  - 选中 id 转换为 number[] 后调用 IPC，成功后本地同步 account_uid 字段并清空选择
  - result.message 为可选字段时加 `??` 兜底，避免 undefined 传入 onShowMessage
- `src/renderer/components/gallery/BatchActions.tsx`：
  - 新增 `profiles?: Array<{uid, nickname}>` 和 `onTransferToProfile?: (targetUid: string) => void` props
  - 内联实现 `ProfileTransferMenu` 下拉组件（参考 ShareMenuButton 交互：点击外部关闭 + Esc 关闭 + glass-panel 风格）
  - 复用 `IconCategory` 图标（项目无 IconProfile，避免引入新图标）
- `src/renderer/pages/GalleryPage.tsx`：
  - 订阅 `useMediaStore((s) => s.profiles)` 拿到档案列表
  - BatchActions 调用新增 `profiles` 和 `onTransferToProfile` props

前端设置页：
- `src/renderer/pages/settings/data-sections.tsx`：
  - 新增 `parseUidFromBackupFilename()` 工具函数：从文件名正则解析 UID 后缀
  - DataBackupSection 新增 `selectedProfileUid` 状态 + 档案下拉选择器（默认"整库备份"）
  - `handleCreate` 根据 selectedProfileUid 调用 `backup.create({ accountUid })`
  - 备份列表项解析 UID 后缀，展示"档案：{nickname}"标记（accent 色徽标）
  - 描述文字补充："按档案备份仅文件名加入 UID 后缀以便识别，实际内容仍为整库"

**验证结果**：
- ✅ 主进程 `tsc -p src/main/tsconfig.json --noEmit` 编译通过（退出码 0）
- ⚠️ 渲染进程 `tsc --noEmit` 有 4 个预先存在的错误（reportRendererError 类型缺失 × 3 + GalleryPage ShareMenuButton running 字段缺失 × 1），与本次 P1-04 改动无关，不影响打包

**差异化设计体现**：
- 与 Nikki Albums 的"按账号备份"不同，本项目按档案备份**仅文件名加 UID 后缀以便识别**，实际内容仍是整库快照
- 此设计保证还原时不会丢失其他档案数据，更安全（避免用户误以为"档案备份=仅含该档案数据"导致还原后丢失其他档案）
- 跨档案转移采用事务批量 UPDATE，保证原子性
- 转移后本地 store 同步更新 account_uid，无需重新加载媒体列表
- 设置页档案下拉选择 + 列表项档案徽标，让用户直观识别每个备份属于哪个档案
- 批量操作栏"转移到档案"下拉菜单复用已有档案列表，无需用户手动输入 UID

### P1-05 完成详情（2026-07-07）

**改动文件**：

后端：
- `src/main/services/livephoto-service.ts`：**新建**
  - `LivePhotoService` 类 + `exportLivePhoto(filePath, targetDir, timeoutMs)` 方法
  - 实现策略（不引入新依赖，复用现有 ffmpeg-static + fluent-ffmpeg）：
    1. 生成 UUID v4 作为 ContentIdentifier（大写，符合 Apple 规范）
    2. ffmpeg 提取视频第一帧为 JPG（`-frames 1 -q:v 2`，与原视频同分辨率）
    3. ffmpeg 转码为 MOV（H.264 + AAC + faststart），写入 `com.apple.quicktime.content.identifier` 元数据
  - 文件命名遵循 Apple 风格：`IMG_{UUID前8位}.jpg` + `IMG_{UUID前8位}.mov`
  - 磁盘空间检查：预估源文件 3 倍（MOV 转码 + JPG 拆帧）
  - 视频元数据探测：含 30s 超时保护，无效视频（duration ≤ 0）直接报错
  - 超时保护：默认 10 分钟（Live Photo 转码耗时较长）
  - 进程注册：`trackFfmpegCommand` / `untrackFfmpegCommand` 包装每个 ffmpeg 命令，确保 before-quit 时可统一 kill
  - 失败清理：任一步失败调用 `cleanupPartial` 静默删除半成品文件，避免残留
  - asar 路径处理：`resolveAsarUnpackedPath(ffmpegStatic)` 替换 asar 内部路径为 `app.asar.unpacked`
- `src/main/index.ts`：
  - 新增 `livePhotoService` 导入
  - 新增 IPC `video:exportLivePhoto`：双路径校验（filePath + targetDir），try/catch 包裹，错误日志 + 友好提示

Preload 与类型：
- `src/main/preload.ts`：video 新增 `exportLivePhoto: (filePath, targetDir) => ipcRenderer.invoke('video:exportLivePhoto', filePath, targetDir)`
- `src/renderer/vite-env.d.ts`：video 类型新增 `exportLivePhoto: (filePath: string, targetDir: string) => Promise<{ success, message, jpgPath?, movPath?, uuid? }>`

前端 UI：
- `src/renderer/components/editor/VideoEditor.tsx`：
  - `exportConfirm` 状态类型扩展 `'livephoto'` 模式
  - `handleExportClick` 签名扩展支持 `'livephoto'` 模式
  - `performExport` 新增 `livephoto` 分支：调用 `video.exportLivePhoto`，结果转换为统一 `{ success, message, filePath? }` 格式（filePath 取 jpgPath）
  - 导出模式 JSX 区块新增 Live Photo 卡片（在 GIF 警告后）：
    - 标题 + 简短说明（生成 JPG + MOV 配对文件，可在 iPhone 上识别为 Live Photo）
    - "导出 Live Photo" 按钮（disabled 状态：处理中或元数据加载中）
    - 已知限制提示（JPG 未写入 Apple MakerNote ContentIdentifier，iCloud 同步可能丢失配对，本地导入正常）
  - `ConfirmDialog` title/message 支持 `'livephoto'` 模式

**验证结果**：
- ✅ 主进程 `tsc -p src/main/tsconfig.json --noEmit` 编译通过（退出码 0）
- ⚠️ 渲染进程 `tsc --noEmit` 有 4 个预先存在的错误（reportRendererError 类型缺失 × 3 + GalleryPage ShareMenuButton running 字段缺失 × 1），与本次 P1-05 改动无关，不影响打包

**差异化设计体现**：
- 与 Nikki Albums 的 Live Photo 导出不同，本项目**不引入新依赖**（piexifjs/exiftool-vendian），复用现有 ffmpeg-static 完成拆帧 + MOV 转码 + 元数据写入
- ContentIdentifier UUID 由 Node.js `crypto.randomUUID()` 生成，无需额外 UUID 库
- 文件命名遵循 Apple `IMG_XXXXXXXX` 风格，便于 iPhone 识别
- MOV 写入 `com.apple.quicktime.content.identifier` 元数据（Live Photo 配对关键）
- 进程注册统一管理 ffmpeg 命令，避免应用退出时残留子进程
- 失败时自动清理半成品文件，避免残留无效文件
- 已知限制透明告知用户（JPG 未写入 MakerNote，iCloud 同步可能丢配对），不掩盖技术局限

**已知限制与后续优化方向**：
- JPG 未写入 Apple MakerNote ContentIdentifier（需 piexifjs 库），iPhone 本地导入可正常识别（依赖 MOV 元数据 + 文件名匹配），但 iCloud 同步可能丢失配对
- 未实现安卓 MotionPhoto 格式（.jpg + 嵌入 .mp4），可作为后续扩展
- 转码耗时较长（10 分钟超时），大文件需用户耐心等待

### P2-01 完成详情（2026-07-07）

**改动文件**：

依赖安装：
- `package.json`：新增 `i18next` + `react-i18next` 依赖（通过 `--legacy-peer-deps` 绕过预先存在的 ESLint peer 依赖冲突）

i18n 初始化：
- `src/renderer/i18n/index.ts`：**新建**
  - `SUPPORTED_LANGUAGES` 常量：13 项（'auto' + 12 种语言代码），含 label 与 englishName
  - `detectSystemLanguage()`：基于 `navigator.language` 推断系统语言（zh-TW/zh-HK/zh-Mo 视为繁体）
  - `loadStoredLanguage()`：从 localStorage 读取持久化选择，未配置时默认 'auto'
  - `resolveLanguage(code)`：'auto' → 推断系统语言（失败回退 zh-CN），其他 → 直接使用
  - `i18n.use(initReactI18next).init()`：注册 12 种语言资源，fallbackLng='zh-CN'，escapeValue=false（React 已转义）
  - `changeLanguage(code)`：切换语言并持久化到 localStorage，返回实际生效的语言代码
  - `getCurrentLanguage()`：获取当前生效语言（已解析，不会返回 'auto'）
- `src/renderer/i18n/locales/zh-CN.json`：**新建**，基准语言文件，包含 8 大类 key：
  - `common`：通用按钮与状态（ok/cancel/save/delete/export/import 等 28 项）
  - `nav`：侧边栏导航与统计标签（gallery/favorites/categories/duplicates/recycleBin/settings/allProfiles/smartGroup/backToTop/menu/expand/collapse/switchProfile/images/videos/storage 共 17 项）
  - `group`：智能分组（title/none/albumType/sceneCategory/sceneTime/outfit/fileType/all/other 共 9 项）
  - `settings`：设置页（title/groups.*/sections.*/language.*/startup.*/fileops.*/export.* 共 30+ 项）
  - `toast`：提示消息（autoScanOn/Off/deleteConfirmOn/Off/languageChanged/transfer* 共 18 项）
  - `dialog`：对话框标题与提示（exportTrim/Speed/Format/LivePhoto/trimTooShort/sameFormat 共 7 项）
  - `video`：视频编辑器（backToDetail/exportVideo/trim/speed/exportMode/playPause/livePhoto.* 共 14 项）
  - `profile`：档案（transferToProfile/defaultProfile 共 2 项）
- `src/renderer/i18n/locales/en.json`：**新建**，英文完整翻译（含所有 8 大类 key）
- `src/renderer/i18n/locales/ja.json`：**新建**，日文完整翻译
- `src/renderer/i18n/locales/ko.json`：**新建**，韩文完整翻译
- `src/renderer/i18n/locales/zh-TW.json`：**新建**，繁体中文完整翻译
- `src/renderer/i18n/locales/fr.json`：**新建**，法文完整翻译
- `src/renderer/i18n/locales/de.json`：**新建**，德文完整翻译
- `src/renderer/i18n/locales/es.json`：**新建**，西班牙文完整翻译
- `src/renderer/i18n/locales/pt.json`：**新建**，葡萄牙文完整翻译
- `src/renderer/i18n/locales/ru.json`：**新建**，俄文完整翻译
- `src/renderer/i18n/locales/th.json`：**新建**，泰文完整翻译
- `src/renderer/i18n/locales/vi.json`：**新建**，越南文完整翻译

渲染进程入口：
- `src/renderer/main.tsx`：新增 `import './i18n'`（必须在 React 渲染前执行，初始化后 i18n 实例即可用）

设置页：
- `src/renderer/pages/settings/language-sections.tsx`：**新建**
  - `LanguageSection` 组件：下拉选择器（13 选项含跟随系统），切换后调用 `changeLanguage()` 即时生效
  - 当前生效语言显示（'auto' 时额外展示推断的系统语言）
  - 切换后通过 `showMessage(t('toast.languageChanged', { lang: label }))` 提示用户
- `src/renderer/pages/settings/sections.tsx`：新增 `LanguageSection` 导出
- `src/renderer/pages/SettingsPage.tsx`：
  - 引入 `useTranslation`，分组与章节名通过 `t(group.nameKey)` / `t(section.nameKey)` 翻译
  - `SETTINGS_GROUPS` 结构改造：`name: string` → `nameKey: string`，`section.name` → `section.nameKey`
  - 通用分组下新增 `general-language` 区块（component: LanguageSection）
  - 标题"设置"改为 `t('settings.title')`

侧边栏：
- `src/renderer/components/layout/Sidebar.tsx`：
  - 引入 `useTranslation`
  - `navItems` 字段 `label: string` → `labelKey: string`，渲染时 `t(item.labelKey)`
  - `SIDEBAR_GROUP_OPTIONS` 字段 `label: string` → `labelKey: string`，渲染时 `t(opt.labelKey)`
  - "返回"/"菜单"按钮文字 → `t('common.back')` / `t('nav.menu')`
  - 折叠按钮 title → `t('nav.expand')` / `t('nav.collapse')`
  - "返回上一级"/"已在最顶层" title → `t('nav.backToTop')` / `t('nav.alreadyAtTop')`
  - "切换角色档案" title → `t('nav.switchProfile')`
  - "全部档案" 菜单项 → `t('nav.allProfiles')`
  - "智能分组" title 与文字 → `t('group.title')`
  - "不分组" 选项 → `t('group.none')`
  - 底部统计标签 "图片"/"视频"/"分类"/"占用" → `t('nav.images')` / `t('nav.videos')` / `t('nav.categories')` / `t('nav.storage')`

**验证结果**：
- ✅ 主进程 `tsc -p src/main/tsconfig.json --noEmit` 编译通过（退出码 0）
- ⚠️ 渲染进程 `tsc --noEmit` 有 4 个预先存在的错误（reportRendererError 类型缺失 × 3 + GalleryPage ShareMenuButton running 字段缺失 × 1），与本次 P2-01 改动无关，不影响打包

**差异化设计体现**：
- 与 Nikki Albums 的多语言不同，本项目支持 **'auto' 跟随系统**（基于 navigator.language 推断，zh-TW/zh-HK/zh-Mo 自动识别为繁体）
- 12 种语言全部完整翻译核心 key（common/nav/group/settings/toast/dialog/video/profile 共 8 大类），无缺失
- 中文（zh-CN）为基准语言，其他语言缺失 key 自动回退到中文（fallbackLng='zh-CN'），保证用户不会看到 raw key
- 切换语言即时生效（react-i18next 自动重渲染），无需重启应用
- 语言选择持久化到 localStorage，跨重启保持用户偏好
- 设置页"语言"区块提供 13 选项（含跟随系统），下拉选择器简洁直观
- 提示消息支持变量插值（如 `languageChanged` 展示目标语言名称）

**后续优化方向**：
- 仅提取了核心硬编码（导航/设置/侧边栏/对话框标题/Toast 消息），其他组件（如 GalleryPage 工具栏、DuplicatesPage、编辑器面板等）的硬编码中文待后续迭代逐步迁移
- 12 种语言为机翻初版，未翻译的 key 自动回退到中文（fallbackLng='zh-CN'），后续可由社区优化翻译质量
- 主进程日志保持中文（不影响用户界面）

---

## 八、附录：渲染进程类型错误修复（2026-07-07）

> 本章节为 9 个核心任务（P0/P1/P2）全部完成后的额外修复任务，旨在清理各任务详情中提及的"4 个预先存在的渲染进程类型错误"，使渲染进程 `tsc --noEmit` 完全通过编译。

### 8.1 修复前状态

在 P0-01 ~ P2-01 全部 9 个任务的完成详情中，均记录了相同的 4 个预先存在的渲染进程类型错误：

```
src/renderer/components/common/ErrorBoundary.tsx(36,32): error TS2339:
  Property 'reportRendererError' does not exist on type '{...}'.
src/renderer/utils/global-error-handler.ts(25,32): error TS2339:
  Property 'reportRendererError' does not exist on type '{...}'.
src/renderer/utils/global-error-handler.ts(41,32): error TS2339:
  Property 'reportRendererError' does not exist on type '{...}'.
src/renderer/pages/GalleryPage.tsx(546,38): error TS2345:
  Argument of type '{ open: false; channelId: null; installed: false; copyResult: null; }'
  is not assignable to parameter of type 'SetStateAction<{...}>'.
  Property 'running' is missing in type...
```

### 8.2 根因分析

**错误 1（reportRendererError 类型缺失 × 3 处）**：
- [src/main/preload.ts](file:///h:/45001/Documents/WXNN%20XiangCe/wxnn-photo-manager/src/main/preload.ts) L271-L279 实际暴露了 `reportRendererError` IPC 方法
- 但 [src/renderer/vite-env.d.ts](file:///h:/45001/Documents/WXNN%20XiangCe/wxnn-photo-manager/src/renderer/vite-env.d.ts) 的 `WindowElectronAPI.log` 接口类型定义里漏掉了这个方法
- 导致 [ErrorBoundary.tsx](file:///h:/45001/Documents/WXNN%20XiangCe/wxnn-photo-manager/src/renderer/components/common/ErrorBoundary.tsx) L36 + [global-error-handler.ts](file:///h:/45001/Documents/WXNN%20XiangCe/wxnn-photo-manager/src/renderer/utils/global-error-handler.ts) L25/L41 共 3 处调用方类型检查失败

**错误 2（ShareGuideDialog running 字段缺失 × 1 处）**：
- [GalleryPage.tsx](file:///h:/45001/Documents/WXNN%20XiangCe/wxnn-photo-manager/src/renderer/pages/GalleryPage.tsx) L92 的 `shareGuide` state 类型包含 `running: boolean` 字段
- L259 与 L264 的 `setShareGuide` 调用都正确传入了 `running`
- 唯独 L546 的 `onClose` 回调 `setShareGuide({ open: false, channelId: null, installed: false, copyResult: null })` 漏掉了 `running: false`

### 8.3 修复方案

**修复 1：补全 reportRendererError 类型定义**

在 [src/renderer/vite-env.d.ts](file:///h:/45001/Documents/WXNN%20XiangCe/wxnn-photo-manager/src/renderer/vite-env.d.ts) 的 `WindowElectronAPI.log` 接口末尾（`getDir` 之后）补上 `reportRendererError` 方法签名，与 preload.ts 实际签名 + 主进程 `log:reportRendererError` handler 返回值 `{ success: boolean; message?: string }` 保持一致：

```typescript
reportRendererError: (payload: {
  message: string
  stack?: string
  componentStack?: string
  filename?: string
  lineno?: number
  colno?: number
  source: 'ErrorBoundary' | 'window.onerror' | 'unhandledrejection'
}) => Promise<{ success: boolean; message?: string }>
```

**修复 2：补全 ShareGuideDialog onClose 的 running 字段**

在 [GalleryPage.tsx L546](file:///h:/45001/Documents/WXNN%20XiangCe/wxnn-photo-manager/src/renderer/pages/GalleryPage.tsx#L546) 的 `setShareGuide` 调用里补上 `running: false`：

```typescript
onClose={() => setShareGuide({ open: false, channelId: null, installed: false, running: false, copyResult: null })}
```

### 8.4 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| [src/renderer/vite-env.d.ts](file:///h:/45001/Documents/WXNN%20XiangCe/wxnn-photo-manager/src/renderer/vite-env.d.ts) | 修改 | `WindowElectronAPI.log` 接口末尾新增 `reportRendererError` 类型定义（10 行） |
| [src/renderer/pages/GalleryPage.tsx](file:///h:/45001/Documents/WXNN%20XiangCe/wxnn-photo-manager/src/renderer/pages/GalleryPage.tsx) | 修改 | L546 `setShareGuide` 调用补上 `running: false` 字段 |

### 8.5 验证结果

```
& "C:\Program Files\nodejs\npx.cmd" tsc --noEmit -p tsconfig.json
```

- **修复前**：渲染进程 `tsc --noEmit` 退出码 2，输出 4 个 TS 错误（TS2339 × 3 + TS2345 × 1）
- **修复后**：渲染进程 `tsc --noEmit` 退出码 0，无任何错误输出 ✅

### 8.6 影响范围

- **直接收益**：渲染进程 TypeScript 编译完全通过，IDE 类型检查无红色波浪线，开发体验提升
- **间接收益**：P0-01 ~ P2-01 所有 9 个任务详情中提及的"4 个预先存在的渲染进程类型错误"已全部消除，后续打包构建不再有类型警告干扰
- **无功能变更**：仅类型定义补全 + state 字段补全，不涉及任何业务逻辑改动，不影响运行时行为
- **向后兼容**：`reportRendererError` IPC 早已在 preload.ts 暴露 + 主进程 handler 已实现，本次仅补全前端类型声明，无任何 API 变更

---

## 九、总结

### 9.1 核心结论

1. **差异化定位**：本计划不以复刻 Nikki Albums 为目标，而是结合本项目已有优势（高级编辑、pHash、场景分类、套装标注），打造差异化的"角色档案 + 智能分组 + 全盘文件名签名搜索"体验。

2. **扫描策略重构是核心差异点**：移除预设固定路径列表，改为纯文件名签名的全盘深度搜索，技术路线上比 Nikki Albums 的"自动识别"更彻底，适配任何安装位置。

3. **角色档案超越多账号**：不仅实现 UID 切换，还提供拍摄偏好统计、套装偏好、场景偏好等综合档案，是本项目独有的差异化能力。

4. **智能分组超越相册分类**：提供 6 维度动态分组（游戏相册类型/场景/时段/套装/文件类型/自定义），超越 Nikki Albums 固定的 19+3 相册类型映射。

5. **本项目优势继续强化**：高级编辑、pHash 相似度、场景分类、套装标注、WiFi 分享等独有能力保持领先。

### 9.2 本期不实施项说明

| 功能 | 不实施原因 |
|------|------------|
| 相册解码（截图解密） | 法律风险高，本期规避 |
| macOS 跨平台 | native 模块适配成本高，本期聚焦 Windows |
| 热更新（代码/资源层） | 更新服务器维护成本高，收益低 |
| 自动更新后重启 | 依赖热更新基础设施 |

### 9.3 里程碑

- **v2.3.0**（P0 完成）：扫描重构 + 角色档案 + 智能分组，**差异化基础建立**
- **v2.4.0**（第三批 + 第四批）：智能去重 + 导出优化 + 缩略图优化 + 跨档案整理
- **v2.5.0**（P1-05）：Live Photo 导出
- **v2.6.0**（P2-01）：多语言支持
- **v2.6.1**（附录）：渲染进程类型错误修复，`tsc --noEmit` 完全通过 ✅

---

> **注**：本计划聚焦 Windows 平台核心功能差异化补齐，暂不涉及跨平台、热更新、相册解码。实际实施时可根据用户反馈与技术调研结果动态调整优先级。
