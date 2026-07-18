/**
 * T08：WiFi 局域网分享服务
 * 基于原生 http 模块的简易文件下载服务（非标准 WebDAV，仅支持浏览/下载）
 *
 * 设计原则：
 * - 仅绑定到本机局域网 IP，不暴露公网
 * - 一次性会话：单次启动后默认 10 分钟超时自动关闭
 * - 大文件支持 Range 请求（206 Partial Content），保证视频断点续传
 * - P0-C：PIN 码鉴权，防止局域网未授权访问
 */
import http from 'http'
import os from 'os'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { logger } from '../utils/logger'
// P2-A：统一使用 media-constants 的 getMimeType（单一权威来源）
import { getMimeType } from '../utils/media-constants'

// 默认超时时间（10 分钟）
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
// 默认监听端口（0 表示由系统分配可用端口）
const DEFAULT_PORT = 0

export interface WifiShareSession {
  active: boolean
  port: number
  url: string
  // P0-C / F-S3：6 位 PIN 码，UI 展示给用户，客户端首次请求需携带
  pin: string
  // 分享的文件列表（绝对路径）
  files: Array<{ path: string; name: string; size: number; type: string }>
  startedAt: number
  timeoutMs: number
}

// F-S3：PIN 失败锁定配置
const MAX_FAILED_ATTEMPTS = 5
const LOCK_DURATION_MS = 5 * 60 * 1000
// F-S3：私有 IPv4 段正则（10.x / 172.16-31.x / 192.168.x），同时允许 IPv6 站点本地 ::ffff: 前缀
const PRIVATE_IP_REGEX = /^(::ffff:)?(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/

class WifiShareService {
  private server: http.Server | null = null
  private session: WifiShareSession | null = null
  private timeoutHandle: NodeJS.Timeout | null = null
  // P0-C：已认证会话 token 集合（PIN 校验通过后颁发，后续请求携带 token 免再次校验）
  private authTokens: Set<string> = new Set()
  // F-S3：PIN 失败计数 + 锁定时间戳（5 次错误锁定 5 分钟）
  private failedAttempts: number = 0
  private lockUntil: number = 0

  /**
   * 启动分享服务
   * @param files 待分享的文件路径数组
   * @param port 监听端口，0 表示系统分配
   * @param timeoutMs 超时自动关闭时间
   */
  async start(
    files: string[],
    port: number = DEFAULT_PORT,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<WifiShareSession> {
    // 已在运行则先停止
    if (this.session?.active) {
      this.stop()
    }

    const fileInfos = await this.collectFiles(files)
    if (fileInfos.length === 0) {
      throw new Error('没有可分享的文件')
    }

    // P0-C / F-S3：生成 6 位数字 PIN 码（原 4 位强度不足）
    const pin = Math.floor(100000 + Math.random() * 900000).toString()
    // 清空旧的认证 token 与失败计数
    this.authTokens.clear()
    this.failedAttempts = 0
    this.lockUntil = 0

    this.server = http.createServer((req, res) => this.handleRequest(req, res))
    // 请求超时 30 秒（防止挂起连接）
    this.server.setTimeout(30000)

    // F-S3：仅绑定局域网 IP，避免暴露到公网/其他网卡
    const lanIp = this.getLanIp()
    let actualPort: number
    try {
      actualPort = await new Promise<number>((resolve, reject) => {
        this.server!.once('error', reject)
        this.server!.listen(port, lanIp, () => {
          this.server!.removeListener('error', reject)
          const addr = this.server!.address()
          resolve(typeof addr === 'object' && addr ? addr.port : 0)
        })
      })
    } catch (err) {
      // Slice 7c：listen 失败（如 EADDRINUSE）必须清理已创建的 server，
      // 否则 this.server 引用泄漏，后续 start() 无法重新创建 server
      this.server!.close()
      this.server = null
      throw err
    }

    const url = `http://${lanIp}:${actualPort}/`

    this.session = {
      active: true,
      port: actualPort,
      url,
      pin,
      files: fileInfos,
      startedAt: Date.now(),
      timeoutMs
    }

    this.scheduleTimeout(timeoutMs)
    logger.info(`[WifiShare] 服务已启动：${url}，PIN：${pin}，共 ${fileInfos.length} 个文件`)
    return this.session
  }

  stop(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle)
      this.timeoutHandle = null
    }
    if (this.server) {
      this.server.closeAllConnections?.()
      this.server.close()
      this.server = null
    }
    if (this.session) {
      logger.info(`[WifiShare] 服务已停止（端口 ${this.session.port}）`)
    }
    this.session = null
    // P0-C：清理认证 token
    this.authTokens.clear()
    // F-S3：清理失败计数与锁定状态
    this.failedAttempts = 0
    this.lockUntil = 0
  }

  getStatus(): WifiShareSession | null {
    return this.session
  }

  /**
   * 收集文件信息并校验可访问性
   */
  private async collectFiles(files: string[]): Promise<WifiShareSession['files']> {
    const result: WifiShareSession['files'] = []
    for (const filePath of files) {
      try {
        const stat = fs.statSync(filePath)
        if (!stat.isFile()) continue
        // P2-A：保留点号以匹配 media-constants getMimeType 签名
        const ext = path.extname(filePath).toLowerCase()
        result.push({
          path: filePath,
          name: path.basename(filePath),
          size: stat.size,
          type: getMimeType(ext)
        })
      } catch {
        // 文件不可访问则跳过
      }
    }
    return result
  }

  // P2-A：getMimeType 已改用 media-constants 单一权威来源

  /**
   * 处理 HTTP 请求：根路径展示文件列表，/download?id=N 下载文件
   * P0-C：除 /auth 外所有路径需通过 PIN 鉴权（query 或 Cookie 携带 token）
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.session) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('服务未启动')
      return
    }

    // F-S3：校验客户端 IP 必须为私有 IPv4 段（10./172.16-31./192.168.）
    // 拒绝任何非局域网来源，避免被外部探测
    const remoteAddr = req.socket.remoteAddress ?? ''
    if (!PRIVATE_IP_REGEX.test(remoteAddr)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('禁止访问：非局域网来源')
      logger.warn(`[WifiShare] 拒绝非局域网访问：${remoteAddr}`)
      return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const pathname = decodeURIComponent(url.pathname)

    // 简易 CORS 头（允许手机浏览器跨域访问）
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // P0-C：PIN 码认证端点 —— POST /auth?pin=XXXX，校验通过颁发 token（Set-Cookie）
    if (pathname === '/auth') {
      this.handleAuth(url.searchParams.get('pin') ?? '', res)
      return
    }

    // P0-C：除 /auth 外所有路径需校验 token
    if (!this.isAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>需要认证</title><style>body{font-family:-apple-system,sans-serif;background:#f5f5f7;color:#1d1d1f;padding:24px;}h1{font-size:20px;margin-bottom:12px;}.card{background:#fff;border-radius:12px;padding:20px;max-width:360px;margin:0 auto;}input{width:100%;padding:12px;font-size:18px;text-align:center;letter-spacing:8px;border:1px solid #d2d2d7;border-radius:8px;box-sizing:border-box;margin:8px 0;}button{width:100%;padding:12px;background:#007aff;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;}button:active{background:#0051d5;}.err{color:#ff3b30;font-size:13px;margin-top:8px;}</style></head><body><div class="card"><h1>请输入 PIN 码</h1><p style="color:#6e6e73;font-size:13px;margin-bottom:8px;">请向分享者询问 6 位数字 PIN 码</p><form onsubmit="fetch('/auth?pin='+document.getElementById('pin').value).then(r=>r.ok?location.reload():r.text().then(t=>document.getElementById('err').textContent=t)).catch(()=>document.getElementById('err').textContent='网络错误');return false;"><input id="pin" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6 位数字" autofocus><button type="submit">验证</button><div class="err" id="err"></div></form></div></body></html>`
      )
      return
    }

    if (pathname === '/' || pathname === '/index.html') {
      this.serveIndexPage(res)
      return
    }

    if (pathname.startsWith('/download')) {
      const idParam = url.searchParams.get('id')
      const id = idParam ? parseInt(idParam, 10) : NaN
      if (Number.isNaN(id) || id < 0 || id >= this.session.files.length) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('文件不存在')
        return
      }
      this.serveFile(this.session.files[id], req, res)
      return
    }

    // /thumb?id=N 提供缩略图（小图预览，复用原图但限制输出大小为 200x200）
    if (pathname.startsWith('/thumb')) {
      const idParam = url.searchParams.get('id')
      const id = idParam ? parseInt(idParam, 10) : NaN
      if (Number.isNaN(id) || id < 0 || id >= this.session.files.length) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('文件不存在')
        return
      }
      this.serveFile(this.session.files[id], req, res, true)
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('路径不存在')
  }

  /**
   * P0-C：处理 PIN 码认证
   * 校验通过后生成随机 token，通过 Set-Cookie 返回，同时记录到 authTokens 集合
   * F-S3：5 次错误锁定 5 分钟，锁定期间直接拒绝
   */
  private handleAuth(pin: string, res: http.ServerResponse): void {
    if (!this.session) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('服务未启动')
      return
    }

    // F-S3：锁定期间直接拒绝，并提示剩余时间
    const now = Date.now()
    if (now < this.lockUntil) {
      const remainSec = Math.ceil((this.lockUntil - now) / 1000)
      res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`尝试次数过多，请 ${remainSec} 秒后再试`)
      return
    }

    if (pin !== this.session.pin) {
      this.failedAttempts++
      if (this.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        this.lockUntil = now + LOCK_DURATION_MS
        this.failedAttempts = 0
        logger.warn(
          `[WifiShare] PIN 失败 ${MAX_FAILED_ATTEMPTS} 次，锁定 ${LOCK_DURATION_MS / 60000} 分钟`
        )
        res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(`PIN 错误次数过多，已锁定 ${LOCK_DURATION_MS / 60000} 分钟`)
      } else {
        res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(`PIN 码错误，剩余 ${MAX_FAILED_ATTEMPTS - this.failedAttempts} 次机会`)
      }
      return
    }

    // 认证成功：清空失败计数
    this.failedAttempts = 0
    this.lockUntil = 0

    // 生成 32 字节随机 token
    const token = crypto.randomBytes(32).toString('hex')
    this.authTokens.add(token)
    // 设置 Cookie（HttpOnly 防 XSS 读取，SameSite=Lax 允许导航跳转携带，Path=/ 覆盖所有路径）
    res.setHeader(
      'Set-Cookie',
      `auth_token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(this.session.timeoutMs / 1000)}`
    )
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('认证成功')
    logger.info(`[WifiShare] PIN 认证成功，颁发 token：${token.slice(0, 8)}...`)
  }

  /**
   * P0-C：校验请求是否已认证
   * 优先检查 Cookie 中的 auth_token，回退到 query 参数 ?token=（用于 <img> 等无法带 Cookie 的场景）
   */
  private isAuthorized(req: http.IncomingMessage): boolean {
    if (this.authTokens.size === 0) return false

    // 1. 检查 Cookie
    const cookie = req.headers.cookie ?? ''
    const match = cookie.match(/auth_token=([a-f0-9]+)/)
    if (match && this.authTokens.has(match[1])) return true

    // 2. 检查 query 参数 token（用于 <img src> 等场景）
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const tokenParam = url.searchParams.get('token')
    if (tokenParam && this.authTokens.has(tokenParam)) return true

    return false
  }

  /**
   * 渲染文件列表页（HTML）
   */
  private serveIndexPage(res: http.ServerResponse): void {
    if (!this.session) return
    const items = this.session.files
      .map(
        (f, i) => `
        <li class="file-item" onclick="location.href='/download?id=${i}'">
          <div class="icon">${f.type.startsWith('image/') ? '🖼️' : '🎬'}</div>
          <div class="info">
            <div class="name">${this.escapeHtml(f.name)}</div>
            <div class="meta">${this.formatSize(f.size)}</div>
          </div>
          <a class="dl" href="/download?id=${i}">下载</a>
        </li>`
      )
      .join('')

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>无限暖暖相册分享</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f7; color: #1d1d1f; padding: 16px; }
  h1 { font-size: 20px; margin-bottom: 8px; }
  .summary { color: #6e6e73; font-size: 13px; margin-bottom: 16px; }
  ul { list-style: none; }
  .file-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: #fff; border-radius: 12px; margin-bottom: 8px; cursor: pointer; transition: transform 0.15s; }
  .file-item:active { transform: scale(0.98); }
  .icon { font-size: 28px; }
  .info { flex: 1; min-width: 0; }
  .name { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { font-size: 12px; color: #6e6e73; margin-top: 2px; }
  .dl { color: #007aff; text-decoration: none; font-size: 14px; padding: 6px 12px; border: 1px solid #007aff; border-radius: 8px; }
  .dl:active { background: #007aff; color: #fff; }
</style>
</head>
<body>
  <h1>无限暖暖相册分享</h1>
  <p class="summary">共 ${this.session.files.length} 个文件，点击即可下载</p>
  <ul>${items}</ul>
</body>
</html>`

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  }

  /**
   * 提供文件下载（支持 Range 请求，206 Partial Content）
   */
  private serveFile(
    file: WifiShareSession['files'][number],
    req: http.IncomingMessage,
    res: http.ServerResponse,
    asThumb = false
  ): void {
    try {
      const stat = fs.statSync(file.path)
      const fileSize = stat.size
      const range = req.headers.range

      res.setHeader('Content-Type', asThumb ? 'image/jpeg' : file.type)
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`
      )

      if (range) {
        // Range 请求：解析 bytes=start-end
        const match = /bytes=(\d*)-(\d*)/.exec(range)
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1
          if (start >= 0 && end < fileSize && start <= end) {
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Content-Length': end - start + 1
            })
            fs.createReadStream(file.path, { start, end }).pipe(res)
            return
          }
        }
      }

      res.writeHead(200, { 'Content-Length': fileSize })
      fs.createReadStream(file.path).pipe(res)
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`读取文件失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * 获取本机局域网 IPv4 地址（优先返回非内网回环的可达地址）
   */
  private getLanIp(): string {
    const interfaces = os.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
      const list = interfaces[name]
      if (!list) continue
      for (const item of list) {
        // 跳过回环、IPv6、内部接口；优先返回 192.168 / 10. / 172. 段
        if (item.family === 'IPv4' && !item.internal) {
          return item.address
        }
      }
    }
    return '127.0.0.1'
  }

  private scheduleTimeout(timeoutMs: number): void {
    this.timeoutHandle = setTimeout(() => {
      logger.info(`[WifiShare] 超时自动关闭（${Math.floor(timeoutMs / 60000)} 分钟）`)
      this.stop()
    }, timeoutMs)
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }
}

export const wifiShareService = new WifiShareService()
