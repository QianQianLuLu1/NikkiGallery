<!-- 此文件包含 GitHub 产品介绍与 v2.1 版本发布文稿，提供中英双语版本 -->
<!-- This file contains the GitHub product introduction and v2.1 release notes, in both Chinese and English -->

---

# 无限暖暖相册管理工具 / Infinity Nikki Gallery Manager

<p align="center">
  <img src="https://img.shields.io/badge/Electron-28-47848F?logo=electron" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" />
  <img src="https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" />
</p>

---

## 目录 / Table of Contents

- [中文介绍](#中文介绍)
- [English Introduction](#english-introduction)
- [v2.1 版本发布文稿（中文）](#v21-版本发布文稿中文)
- [v2.1 Release Notes (English)](#v21-release-notes-english)

---

# 中文介绍

> 专为《无限暖暖》玩家打造的桌面端相册管理与编辑工具，让每一张游戏截图都能得到专业级的整理与修饰。

**无限暖暖相册管理工具** 是一款基于 Electron + React + TypeScript 开发的 Windows 桌面应用，旨在帮助玩家高效管理游戏中的截图与录像。从智能扫描、分类整理到专业修图，提供一站式解决方案。

---

## 核心功能

### 图库浏览

应用启动后自动扫描游戏截图目录，以网格形式呈现所有媒体文件。支持按类型筛选（全部 / 图片 / 视频）、多种排序方式（日期、名称、大小、分辨率、评分），并可通过关键词快速搜索。底部状态栏实时显示图片、视频数量及存储占用。

![图库浏览界面](screenshot-gallery.png)

### 专业图片编辑器

内置功能完善的图片编辑器，无需借助第三方软件即可完成修图：

- **基础调整**：亮度、对比度、饱和度、色温、色调、高光、阴影、清晰度、去雾等参数精细调节
- **HSL 分色调整**：针对红、橙、黄、绿等独立色相进行饱和度与明度控制
- **RGB 曲线**：支持红、绿、蓝及 RGB 综合曲线，实现高级色调映射
- **分离色调**：独立调节高光与阴影的色相和饱和度，营造电影感色彩
- **风格滤镜**：原生、清新、日系、森系、明亮、复古、胶片、怀旧等一键滤镜
- **LUT 支持**：可导入 `.cube` 格式 LUT 文件，内置港色、香港电影、暖调复古、冷调戏剧、高对比等专业调色预设
- **水印工具**：支持文字水印与图片水印，提供拍立得、日期标签、签名水印、版权声明等样式预设，可调节大小、透明度、旋转角度与位置

![基础调整面板](screenshot-editor-basic.png)

![滤镜预设](screenshot-editor-filters.png)

![水印功能](screenshot-editor-watermark.png)

### 智能分类管理

自动识别游戏内截图场景类型（缩略图、截图、旅行手账、世界巡游、趣拍海报原图等），并基于图像亮度分析自动区分时段（日景、晨景、暮景、夜景）。同时支持玩家自定义多级分类，拖拽即可调整层级关系。

![分类管理界面](screenshot-categories.png)

### 重复文件检测

提供双重检测机制：

- **精确重复**：基于文件内容 Hash，找出完全相同的文件
- **相似检测**：基于感知 Hash (pHash)，识别视觉上高度相似的图片，支持极严格到极宽松五级相似度阈值

检测完成后可批量执行保留最新、保留最大或保留收藏等清理策略，快速释放磁盘空间。

![相似图片检测](screenshot-duplicate-similar.png)

### 安全回收站

删除的文件先进入回收站，支持全选、反选与一键清空操作。在彻底删除前随时可恢复误删文件，避免珍贵截图意外丢失。

![回收站](screenshot-recyclebin.png)

### 丰富的设置选项

- **启动行为**：可选启动时自动扫描新增媒体文件
- **外观主题**：默认简约与柔粉轻奢两种风格一键切换
- **扫描与路径**：自定义游戏截图目录与扫描选项
- **数据管理**：数据库备份、缓存清理、数据重置
- **日志与诊断**：日志查看与崩溃报告管理，便于问题排查

![应用信息](screenshot-about.png)

---

## 技术栈

| 技术 | 版本 |
|------|------|
| Electron | 28 |
| React | 18 |
| TypeScript | 5.3 |

---

## 下载与安装

前往 [Releases](https://github.com/QianQianLuLu/NikkiGallery/releases) 页面下载最新版本的安装程序 `无限暖暖相册管理工具 Setup.exe`，双击运行即可完成安装。

---

## 社区与支持

- **GitHub 仓库**：[https://github.com/QianQianLuLu/NikkiGallery](https://github.com/QianQianLuLu/NikkiGallery)
- **QQ 交流群**：635492596
- **开发者**：纤璐不会玩摄影（全网同名）

---

## 开源协议

本项目基于 MIT 协议开源。

---

# English Introduction

> A desktop gallery management and editing tool tailor-made for *Infinity Nikki* players, bringing professional-grade organization and retouching to every in-game screenshot.

**Infinity Nikki Gallery Manager** is a Windows desktop application built with Electron, React, and TypeScript. It helps players efficiently manage screenshots and recordings from the game, offering an all-in-one solution from intelligent scanning and categorization to professional photo editing.

---

## Key Features

### Gallery Browsing

The app automatically scans your game screenshot folder on launch and presents all media files in a grid layout. Filter by type (All / Images / Videos), sort by date, name, size, resolution, or rating, and quickly search by keyword. The bottom status bar displays real-time stats for image count, video count, and storage usage.

![Gallery Browser](screenshot-gallery.png)

### Professional Photo Editor

A fully-featured built-in editor lets you retouch screenshots without third-party software:

- **Basic Adjustments**: Fine-tune brightness, contrast, saturation, color temperature, tint, highlights, shadows, clarity, and dehaze
- **HSL Color Control**: Independently adjust hue, saturation, and lightness for reds, oranges, yellows, greens, and more
- **RGB Curves**: Advanced tone mapping with individual red, green, blue, and composite RGB curves
- **Split Toning**: Independently colorize highlights and shadows for a cinematic look
- **Style Filters**: One-click presets including Original, Fresh, Japanese, Forest, Bright, Vintage, Film, and Nostalgic
- **LUT Support**: Import `.cube` LUT files with built-in professional presets such as Hong Kong Tone, HK Cinema, Warm Vintage, Cold Drama, and High Contrast
- **Watermark Tool**: Text and image watermarks with presets like Polaroid, Date Tag, Signature, and Copyright. Adjustable size, opacity, rotation, and position

![Basic Adjustments Panel](screenshot-editor-basic.png)

![Filter Presets](screenshot-editor-filters.png)

![Watermark Feature](screenshot-editor-watermark.png)

### Smart Categorization

Automatically identifies in-game screenshot types (Thumbnails, Screenshots, Travel Journal, World Tour, Fun Shot Originals, etc.) and analyzes image brightness to distinguish time-of-day categories (Daytime, Morning, Dusk, Night). Players can also create custom multi-level categories with drag-and-drop reordering.

![Category Management](screenshot-categories.png)

### Duplicate Detection

Dual detection mechanisms:

- **Exact Duplicates**: Content-based Hash matching to find identical files
- **Similar Images**: Perceptual Hash (pHash) detection for visually similar images, with five strictness levels from Ultra Strict to Ultra Loose

After scanning, batch cleanup strategies let you keep the newest, largest, or favorited version to quickly free up disk space.

![Similar Image Detection](screenshot-duplicate-similar.png)

### Safe Recycle Bin

Deleted files are moved to the recycle bin first, with select-all, invert-selection, and one-click empty options. Accidentally deleted screenshots can be recovered before permanent removal.

![Recycle Bin](screenshot-recyclebin.png)

### Comprehensive Settings

- **Launch Behavior**: Optionally auto-scan for new media on startup
- **Appearance Themes**: Switch between Default Minimal and Soft Pink Luxury styles
- **Scan & Paths**: Customize game screenshot directories and scanning options
- **Data Management**: Database backup, cache cleanup, and data reset
- **Logs & Diagnostics**: Log viewer and crash report management for troubleshooting

![About the App](screenshot-about.png)

---

## Tech Stack

| Technology | Version |
|------------|---------|
| Electron | 28 |
| React | 18 |
| TypeScript | 5.3 |

---

## Download & Install

Visit the [Releases](https://github.com/QianQianLuLu/NikkiGallery/releases) page to download the latest installer `无限暖暖相册管理工具 Setup.exe` and run it to install.

---

## Community & Support

- **GitHub Repository**: [https://github.com/QianQianLuLu/NikkiGallery](https://github.com/QianQianLuLu/NikkiGallery)
- **QQ Group**: 635492596
- **Developer**: QianLu (纤璐不会玩摄影)

---

## License

This project is open-sourced under the MIT License.

---

# v2.1 版本发布文稿（中文）

我们很高兴向大家发布 **无限暖暖相册管理工具 v2.1**！这一版本带来了专业级图片编辑器、智能场景分类、重复文件检测等一系列重磅功能，让你的游戏截图管理体验迈入全新阶段。

---

## 版本亮点

### 内置专业图片编辑器

v2.1 最大的升级是引入了功能完整的图片编辑器。现在你可以直接在应用内对截图进行精细调整，无需再打开 Photoshop 或其他修图软件。

编辑器提供了从基础参数到专业调色的完整工具链：

- **基础面板**：亮度、对比度、饱和度、自然饱和度、色温、色调、高光、阴影、白色色阶、黑色色阶、清晰度、去雾——12 项参数满足日常修图所需
- **HSL 面板**：按颜色通道独立调整色相、饱和度与明度，精准控制画面中的每一种色彩
- **曲线面板**：RGB 综合曲线与红、绿、蓝独立曲线，让色调映射更加灵活
- **分离色调**：为高光与阴影分别赋予不同的色彩倾向，一键营造电影氛围
- **滤镜面板**：8 款精心调校的一键风格滤镜，从清新到复古，总有一款适合你的截图
- **LUT 面板**：支持导入 `.cube` 格式 LUT 文件，并内置 5 款专业电影级调色预设
- **水印面板**：文字与图片水印自由组合，多种预设样式与位置选择，保护你的作品版权

![基础调整面板](screenshot-editor-basic.png)

![滤镜预设](screenshot-editor-filters.png)

![水印功能](screenshot-editor-watermark.png)

### 智能场景与时段分类

相册不再只是平铺的文件列表。v2.1 引入了基于文件名的智能场景识别，自动将截图归类为缩略图、截图、旅行手账、世界巡游、趣拍海报原图等游戏内场景类型。

同时，基于图像亮度的时段分析功能可以自动区分日景、晨景、暮景与夜景，让你在回忆游戏旅程时能够按时间氛围快速定位截图。

![分类管理界面](screenshot-categories.png)

### 重复与相似图片检测

随着游戏时间的积累，重复或高度相似的截图会占用大量磁盘空间。v2.1 新增的双重检测机制帮助你高效清理图库：

- **精确重复**：通过文件内容 Hash 比对，找出完全一致的重复文件
- **相似检测**：基于感知 Hash (pHash) 算法，识别视觉上相似的照片。提供从极严格 (s2) 到极宽松 (s15) 的五级阈值，满足不同的清理需求

检测完成后，一键批量保留最新、最大或已收藏的文件，其余安全移入回收站。

![相似图片检测](screenshot-duplicate-similar.png)

### 安全回收站机制

担心误删珍贵截图？v2.1 引入了回收站机制。所有删除操作都会先将文件移入回收站，你可以随时恢复误删内容，或彻底清空以释放空间。

![回收站](screenshot-recyclebin.png)

---

## 界面与体验优化

- **主题切换**：新增"柔粉轻奢"主题，与原有的"默认简约"风格形成对比，满足不同审美偏好
- **启动自动扫描**：可在设置中开启"启动时自动扫描"，每次打开应用即刻发现新增截图
- **丰富的设置项**：设置页面重构为通用、外观、扫描与路径、数据管理、日志与诊断、关于六大模块，结构更加清晰
- **实时状态栏**：底部状态栏持续显示图库中的图片数、视频数、分类数及总占用空间

![应用信息](screenshot-about.png)

---

## 下载

- 安装包：`无限暖暖相册管理工具 Setup 2.1.0.exe`
- 前往 [Releases](https://github.com/QianQianLuLu/NikkiGallery/releases) 下载

---

## 反馈与支持

如果在使用过程中遇到问题，或有新功能建议，欢迎通过以下渠道反馈：

- 在 GitHub 仓库提交 [Issue](https://github.com/QianQianLuLu/NikkiGallery/issues)
- 加入 QQ 交流群：**635492596**

感谢每一位玩家的支持与耐心等待，祝大家游戏愉快，拍出更多精彩瞬间！

---

# v2.1 Release Notes (English)

We are excited to announce the release of **Infinity Nikki Gallery Manager v2.1**! This version brings a professional photo editor, intelligent scene categorization, duplicate file detection, and more—elevating your screenshot management experience to a whole new level.

---

## Release Highlights

### Built-in Professional Photo Editor

The biggest upgrade in v2.1 is the fully-featured image editor. You can now fine-tune your screenshots directly within the app, without opening Photoshop or any other external software.

The editor provides a complete toolchain from basic adjustments to professional color grading:

- **Basic Panel**: Brightness, contrast, saturation, vibrance, color temperature, tint, highlights, shadows, whites, blacks, clarity, and dehaze—12 parameters for everyday retouching
- **HSL Panel**: Independently adjust hue, saturation, and lightness by color channel for precise control over every tone in the image
- **Curves Panel**: Composite RGB curve plus individual red, green, and blue curves for flexible tone mapping
- **Split Toning**: Assign different color tints to highlights and shadows for a cinematic atmosphere
- **Filters Panel**: 8 carefully tuned one-click style filters, from fresh to vintage—there's one for every screenshot
- **LUT Panel**: Import `.cube` LUT files with 5 built-in professional cinematic color grading presets
- **Watermark Panel**: Combine text and image watermarks with multiple preset styles and position options to protect your work

![Basic Adjustments Panel](screenshot-editor-basic.png)

![Filter Presets](screenshot-editor-filters.png)

![Watermark Feature](screenshot-editor-watermark.png)

### Intelligent Scene & Time-of-Day Categorization

Your gallery is no longer just a flat list of files. v2.1 introduces intelligent scene recognition based on filenames, automatically categorizing screenshots into in-game types such as Thumbnails, Screenshots, Travel Journal, World Tour, and Fun Shot Originals.

Meanwhile, brightness-based time-of-day analysis automatically distinguishes Daytime, Morning, Dusk, and Night scenes, letting you quickly locate screenshots by their atmospheric mood when reminiscing about your journey.

![Category Management](screenshot-categories.png)

### Duplicate & Similar Image Detection

As playtime accumulates, duplicate or highly similar screenshots can consume significant disk space. v2.1 introduces a dual detection mechanism to help you clean up your gallery efficiently:

- **Exact Duplicates**: Content Hash comparison finds perfectly identical files
- **Similar Detection**: Perceptual Hash (pHash) identifies visually similar photos. Five strictness levels from Ultra Strict (s2) to Ultra Loose (s15) accommodate different cleanup needs

After scanning, batch actions let you keep the newest, largest, or favorited files with one click, while the rest are safely moved to the recycle bin.

![Similar Image Detection](screenshot-duplicate-similar.png)

### Safe Recycle Bin

Worried about accidentally deleting precious screenshots? v2.1 introduces a recycle bin. All deletions move files to the bin first, where you can recover mistakes or permanently empty to free up space.

![Recycle Bin](screenshot-recyclebin.png)

---

## UI & Experience Improvements

- **Theme Switching**: A new "Soft Pink Luxury" theme joins the original "Default Minimal" style, catering to different aesthetic preferences
- **Auto-Scan on Launch**: Enable "Scan on startup" in settings to instantly discover new screenshots every time you open the app
- **Rich Settings**: The settings page has been reorganized into six modules: General, Appearance, Scan & Paths, Data Management, Logs & Diagnostics, and About, for clearer navigation
- **Real-time Status Bar**: The bottom bar continuously displays image count, video count, category count, and total storage usage

![About the App](screenshot-about.png)

---

## Download

- Installer: `无限暖暖相册管理工具 Setup 2.1.0.exe`
- Visit [Releases](https://github.com/QianQianLuLu/NikkiGallery/releases) to download

---

## Feedback & Support

If you encounter issues or have feature suggestions, we'd love to hear from you:

- Submit an [Issue](https://github.com/QianQianLuLu/NikkiGallery/issues) on GitHub
- Join our QQ Group: **635492596**

Thank you to every player for your support and patience. Enjoy the game, and capture more wonderful moments!

---

*© 2026 QianLu. All rights reserved.*
