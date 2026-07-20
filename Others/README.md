# 无限暖暖相册管理工具

一款专为「无限暖暖」游戏玩家设计的本地相册管理软件，支持自动扫描游戏截图与录屏文件，提供专业的图片浏览、分类管理和编辑功能。

## 功能特性

### 图库浏览

- 网格视图：响应式列数自适应（2-6列）
- 列表视图：详细信息展示（文件名、日期、大小、分辨率、评分）
- 时间线视图：按日期分组展示
- 全屏浏览：键盘导航（左右切换、Escape退出）
- 多选模式：Ctrl离散选择、Shift连续选择

### 文件操作

- 扫描游戏目录（自动定位 + 手动指定）
- 增量扫描（基于文件修改时间）
- 文件删除（移至回收站）
- 文件复制、移动、重命名
- 批量导出

### 智能分类

- 系统内置分类（人物、地点、场景、截图、录屏、最近、收藏）
- 自定义分类（创建、编辑、删除、颜色标签）
- 嵌套分类（最多3级，拖拽调整层级）
- 标签管理（添加、删除、常用标签建议）

### 图片编辑

- 基础调整（亮度、对比度、饱和度、色温、色调等12项）
- HSL调色盘（8色独立调整）
- 色调曲线（RGB/红/绿/蓝多通道，Canvas绘制）
- 色调分离（高光/阴影独立着色）
- 滤镜预设（8种预设）
- 撤销/重做（历史栈管理）

### 界面设计

- Windows 11 Fluent Design 风格
- 玻璃拟态效果（backdrop-filter: blur(30px)）
- 浅色/深色/跟随系统三种主题
- 页面过渡动画（前进/后退滑动效果）
- 悬停动画（缩放、阴影、颜色过渡）

## 技术栈

- **桌面框架**: Electron 28
- **前端框架**: React 18 + TypeScript
- **样式方案**: Tailwind CSS
- **状态管理**: Zustand
- **数据库**: SQLite (better-sqlite3)
- **构建工具**: Vite + TypeScript

## 项目结构

```
wxnn-photo-manager/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── index.ts       # 主入口
│   │   ├── preload.ts     # 预加载脚本
│   │   ├── database/      # SQLite 数据库
│   │   ├── scanner/       # 文件扫描器
│   │   ├── thumbnail/     # 缩略图生成
│   │   └── file-operations.ts
│   └── renderer/          # 渲染进程（前端）
│       ├── components/    # 组件
│       ├── pages/         # 页面
│       ├── stores/        # 状态管理
│       ├── hooks/         # 自定义 Hooks
│       └── styles/        # 全局样式
├── preview.html           # HTML 预览版
├── package.json
└── README.md
```

## 开发环境

### 前提条件

- Node.js 18+
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建

```bash
npm run build
```

### 打包

```bash
npm run dist:win
```

## 已知限制

### Live Photo 导出

- **iCloud 同步可能丢失配对**：导出的 JPG 文件未写入 Apple MakerNote ContentIdentifier（需额外引入 piexifjs 依赖），仅 MOV 文件包含 `com.apple.quicktime.content.identifier` 元数据。通过数据线本地导入 iPhone 时配对正常，但经 iCloud 同步后可能识别为独立文件而非 Live Photo。
- **转码耗时**：Live Photo 转码（H.264 + AAC MOV）较耗时，单次默认超时 10 分钟。

## 开发者信息

- **开发者**: QianLu
- **全网同名**: 纤璐不会玩摄影
- **抖音**: [v.douyin.com/XkTzyJeCFIU](https://v.douyin.com/XkTzyJeCFIU/)
- **哔哩哔哩**: [b23.tv/FtjgFrW](https://b23.tv/FtjgFrW)

## 许可证

MIT License
