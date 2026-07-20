/**
 * P1-A7：统一 ffmpeg/ffprobe 二进制路径解析
 *
 * 原实现：video-service.ts、livephoto-service.ts、generator.ts 各自重复定义 ffmpegBinaryPath，
 * video-probe.ts 单独定义 ffprobeBinaryPath。路径解析逻辑分散，修改需同步多处。
 *
 * 现统一从此模块导出，调用方只需 import { ffmpegPath, ffprobePath } 即可。
 *
 * P2-A1：将 native-path.ts 的 resolveAsarUnpackedPath 合并到此模块，
 * 消除单函数文件的碎片化（native-path.ts 仅此一个函数且仅此处调用）。
 */
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

/**
 * asar 打包后，require('ffmpeg-static') 返回 asar 内部路径，
 * 但 child_process.spawn 无法执行 asar 内的文件，需替换为 asar.unpacked 路径。
 *
 * P1-A7：改用正则确保只替换 'app.asar' 后面是路径分隔符或字符串结尾的情况，
 * 避免误替换 'app.asar.backup' 等包含 'app.asar' 子串的路径。
 */
export function resolveAsarUnpackedPath(p: string): string {
  return p.replace(/app\.asar(?=[\\/]|$)/g, 'app.asar.unpacked')
}

// ffmpeg-static 在极端环境（打包配置错误）下可能返回 undefined，回退到 PATH 中的 'ffmpeg'
export const ffmpegPath: string = ffmpegStatic ? resolveAsarUnpackedPath(ffmpegStatic) : 'ffmpeg'

// ffprobe-static 在异常环境下 path 可能为 undefined，回退到 PATH 中的 'ffprobe'（与 ffmpegPath 防御策略一致）
export const ffprobePath: string = ffprobeStatic?.path
  ? resolveAsarUnpackedPath(ffprobeStatic.path)
  : 'ffprobe'
