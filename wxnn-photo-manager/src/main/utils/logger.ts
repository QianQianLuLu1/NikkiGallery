import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { app } from 'electron'

// 日志级别
type LogLevel = 'info' | 'warn' | 'error' | 'debug'

// 故障类型
export type FaultType =
  | 'uncaughtException' // 主进程未捕获异常
  | 'unhandledRejection' // 未处理的 Promise 拒绝
  | 'rendererCrash' // 渲染进程崩溃
  | 'rendererError' // 渲染层 console.error
  | 'ipcError' // IPC 处理错误
  | 'manual' // 手动记录
  | 'rendererComponent' // ErrorBoundary 捕获的组件渲染异常
  | 'rendererPromise' // 渲染层未处理 Promise 拒绝
  | 'rendererResource' // 渲染层资源加载失败（window.onerror）
  | 'exitDiagnosis' // 进程退出诊断信息

// 故障记录（用于 UI 展示）
// P0-1 改进：扩展字段，每条故障都包含完整的环境信息，便于开发者定位问题
export interface FaultRecord {
  id: string
  timestamp: string // ISO 8601
  type: FaultType
  summary: string // 故障原因摘要（≤200字符）
  detail: string // 完整错误信息和堆栈
  context?: Record<string, unknown> // 操作上下文
  file: string // 故障所在文件名
  // 环境信息（logFault 自动填充，调用方无需关心）
  appVersion: string // package.json version
  electronVersion: string // process.versions.electron
  nodeVersion: string // process.versions.node
  platform: string // process.platform
  osVersion: string // os.release()
  pid: number // process.pid
  uptime: number // process.uptime() 秒
}

// 故障类型中文映射
export const FAULT_TYPE_LABELS: Record<FaultType, string> = {
  uncaughtException: '主进程异常',
  unhandledRejection: 'Promise 未处理',
  rendererCrash: '渲染进程崩溃',
  rendererError: '渲染层错误',
  ipcError: 'IPC 处理错误',
  manual: '手动记录',
  rendererComponent: '组件渲染异常',
  rendererPromise: '渲染层 Promise',
  rendererResource: '资源加载失败',
  exitDiagnosis: '退出诊断'
}

// 业务决策：日志总占用上限 2GB（P2-4 从 5GB 调整为 2GB，桌面应用足够）
// C-G11：project_memory 硬约束为"日志存储必须不超过 5GB"，2GB 上限满足该约束且更保守
// 超限时按 mtime 升序删除最旧日志文件，直至低于阈值
const MAX_TOTAL_LOG_SIZE = 2 * 1024 * 1024 * 1024
// P2-4：日志时间维度过期（90 天），超过自动清理
const MAX_LOG_AGE_MS = 90 * 24 * 60 * 60 * 1000
const MAX_SUMMARY_LENGTH = 200

// P1-3：最近日志环形缓冲区，故障发生时附带最近 N 条主日志作为上下文
const RECENT_LOG_BUFFER_SIZE = 50
const recentLogs: Array<{ timestamp: string; level: string; message: string }> = []

let logDir = ''
let sizeCheckScheduled = false

// 初始化日志目录（必须在 app.whenReady 之后调用）
export function initLogger(): void {
  if (logDir) return
  logDir = path.join(app.getPath('userData'), 'logs')
  fs.mkdirSync(logDir, { recursive: true })
}

export function getLogDirectory(): string {
  if (!logDir) initLogger()
  return logDir
}

/**
 * 自定义目录支持：设置日志目录路径
 * 必须在 initLogger() 之前调用（由 applyCustomDirectories 触发）
 * 设置后 initLogger() 的幂等守卫会跳过默认路径初始化
 */
export function setLogDirectory(dir: string): void {
  logDir = dir
}

// 获取当前日期字符串（UTC，保证跨时区一致）
function getDateStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// 常规日志文件（按日期滚动）
function getMainLogPath(): string {
  return path.join(logDir, `main-${getDateStr()}.log`)
}

// 故障日志文件（按日期滚动，JSONL 格式）
function getFaultLogPath(): string {
  return path.join(logDir, `faults-${getDateStr()}.jsonl`)
}

// P1-3：推入最近日志缓冲区（环形，超限自动淘汰最旧）
function pushToRecentBuffer(level: string, message: string): void {
  recentLogs.push({ timestamp: new Date().toISOString(), level, message })
  if (recentLogs.length > RECENT_LOG_BUFFER_SIZE) {
    recentLogs.shift()
  }
}

/** 获取最近日志缓冲区副本（用于故障上下文） */
export function getRecentLogs(): Array<{ timestamp: string; level: string; message: string }> {
  return [...recentLogs]
}

// 写入常规日志（异步、低开销，不阻塞主线程）
function writeLog(level: LogLevel, message: string, ...args: unknown[]): void {
  if (!logDir) initLogger()
  const timestamp = new Date().toISOString()
  const argsStr =
    args.length > 0
      ? ' ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
      : ''
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${argsStr}\n`
  // P1-3：同步推入环形缓冲区（内存操作，零开销）
  pushToRecentBuffer(level, message + argsStr)
  // 异步写入，失败时至少在控制台暴露问题，便于排查磁盘满/权限问题
  fs.promises.appendFile(getMainLogPath(), line, 'utf-8').catch((err) => {
    console.error('[Logger] 写入失败:', err)
  })
  // 同步输出到控制台（开发调试）
  const consoleFn = level === 'debug' ? console.log : console[level]
  consoleFn(message, ...args)
}

// P0-1：收集环境信息（logFault 调用时自动填充到 FaultRecord）
// 使用懒加载避免启动早期 app.getVersion() 不可用
let envInfoCache: {
  appVersion: string
  electronVersion: string
  nodeVersion: string
  platform: string
  osVersion: string
} | null = null

function collectEnvInfo(): {
  appVersion: string
  electronVersion: string
  nodeVersion: string
  platform: string
  osVersion: string
} {
  if (envInfoCache) return envInfoCache
  try {
    envInfoCache = {
      appVersion: app.getVersion?.() || 'unknown',
      electronVersion: process.versions.electron || 'unknown',
      nodeVersion: process.versions.node || 'unknown',
      platform: process.platform,
      osVersion: os.release()
    }
  } catch {
    // 启动早期 app.getVersion 可能不可用，回退到 unknown
    envInfoCache = {
      appVersion: 'unknown',
      electronVersion: process.versions.electron || 'unknown',
      nodeVersion: process.versions.node || 'unknown',
      platform: process.platform,
      osVersion: os.release()
    }
  }
  return envInfoCache
}

// 记录故障（异步、轻量）
// 性能策略：仅追加写入一行 JSON，O(1) 复杂度；2GB 检查通过节流异步触发
// P0-1：自动填充环境信息字段；P1-3：自动附带 recentLogs 上下文
export async function logFault(
  type: FaultType,
  error: unknown,
  context?: Record<string, unknown>
): Promise<string> {
  if (!logDir) initLogger()

  const id = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  const errObj = error instanceof Error ? error : new Error(String(error))
  const summary = (errObj.message || String(error)).slice(0, MAX_SUMMARY_LENGTH)

  // P1-3：将最近日志缓冲区附加到 context（仅对关键故障类型，避免日志膨胀）
  const finalContext: Record<string, unknown> = { ...(context || {}) }
  if (
    type === 'uncaughtException' ||
    type === 'unhandledRejection' ||
    type === 'rendererCrash' ||
    type === 'rendererComponent' ||
    type === 'exitDiagnosis'
  ) {
    finalContext.recentLogs = getRecentLogs()
  }

  // 构造完整详情（包含堆栈和上下文）
  const detailParts: string[] = [`Message: ${errObj.message}`, `Stack: ${errObj.stack || 'N/A'}`]
  if (finalContext && Object.keys(finalContext).length > 0) {
    detailParts.push(`Context: ${JSON.stringify(finalContext, null, 2)}`)
  }
  const detail = detailParts.join('\n')

  // P0-1：自动填充环境信息
  const env = collectEnvInfo()

  const record: FaultRecord = {
    id,
    timestamp,
    type,
    summary,
    detail,
    context: finalContext,
    file: `faults-${getDateStr()}.jsonl`,
    appVersion: env.appVersion,
    electronVersion: env.electronVersion,
    nodeVersion: env.nodeVersion,
    platform: env.platform,
    osVersion: env.osVersion,
    pid: process.pid,
    uptime: process.uptime()
  }

  // 异步追加 JSONL（每行一个故障，O(1) 写入）
  try {
    await fs.promises.appendFile(getFaultLogPath(), JSON.stringify(record) + '\n', 'utf-8')
  } catch (err) {
    // 写入失败时仅控制台告警，避免日志系统本身导致崩溃扩散
    console.error('[Logger] 故障日志写入失败:', err)
  }

  // 节流触发 2GB 大小检查（避免每次写入都扫描目录）
  scheduleSizeEnforcement()

  // 同步记录到主日志（便于运维排查时一站式查看）
  writeLog('error', `[Fault:${type}] ${summary}`)

  return id
}

// 节流的大小检查：同一 tick 内多次调用仅触发一次
function scheduleSizeEnforcement(): void {
  if (sizeCheckScheduled) return
  sizeCheckScheduled = true
  // 使用 setImmediate 在下一个事件循环执行，避免阻塞当前操作
  setImmediate(() => {
    sizeCheckScheduled = false
    enforceMaxSize().catch(() => {})
  })
}

// P2-4：2GB 上限检查 + 90 天时间维度过期清理
// 扫描整个日志目录，先按时间维度删除超过 90 天的日志，再按大小维度删除最旧文件
async function enforceMaxSize(): Promise<void> {
  try {
    const entries = await fs.promises.readdir(logDir)
    const stats = await Promise.all(
      entries
        .filter((name) => name.endsWith('.log') || name.endsWith('.jsonl'))
        .map(async (name) => {
          const filepath = path.join(logDir, name)
          const stat = await fs.promises.stat(filepath)
          return { name, filepath, size: stat.size, mtime: stat.mtime.getTime() }
        })
    )

    // P2-4：阶段 1 - 时间维度过期：删除超过 90 天的日志
    const now = Date.now()
    const expired = stats.filter((s) => now - s.mtime > MAX_LOG_AGE_MS)
    for (const file of expired) {
      try {
        await fs.promises.unlink(file.filepath)
        console.log(`[Logger] 90 天过期触发，删除日志: ${file.name}`)
      } catch {
        // 删除失败时跳过
      }
    }

    // P2-4：阶段 2 - 大小维度：剩余文件总大小超 2GB 时按 mtime 升序删除最旧
    const remaining = stats.filter((s) => !expired.includes(s))
    const totalSize = remaining.reduce((sum, s) => sum + s.size, 0)
    if (totalSize <= MAX_TOTAL_LOG_SIZE) return

    // 按 mtime 升序排序，依次删除最旧文件直至低于阈值
    const sorted = remaining.sort((a, b) => a.mtime - b.mtime)
    let currentSize = totalSize
    for (const file of sorted) {
      if (currentSize <= MAX_TOTAL_LOG_SIZE) break
      try {
        await fs.promises.unlink(file.filepath)
        currentSize -= file.size
        console.log(`[Logger] 2GB 上限触发，删除最旧日志: ${file.name}`)
      } catch {
        // 删除失败时跳过，避免阻塞清理流程
      }
    }
  } catch (err) {
    console.error('[Logger] 大小检查失败:', err)
  }
}

// 兼容原有 logger API，新增 fault 方法
export const logger = {
  info: (message: string, ...args: unknown[]) => writeLog('info', message, ...args),
  warn: (message: string, ...args: unknown[]) => writeLog('warn', message, ...args),
  error: (message: string, ...args: unknown[]) => writeLog('error', message, ...args),
  debug: (message: string, ...args: unknown[]) => writeLog('debug', message, ...args),
  fault: logFault
}
