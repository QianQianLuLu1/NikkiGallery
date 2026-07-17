/**
 * 场景分类（C-S2：re-export shared，保持主进程现有导入路径兼容）
 *
 * 源文件已抽取到 src/shared/scene-category.ts，供主进程与渲染进程共享。
 * 本文件仅作为 re-export 桥接，避免主进程各处修改 import 路径；
 * 同时让 scene-category.test.ts 仍可从 './scene-category' 导入。
 */
export * from '../../shared/scene-category'
