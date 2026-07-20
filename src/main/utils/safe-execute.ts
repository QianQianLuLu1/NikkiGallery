/**
 * 主进程全局异常捕获执行工具
 *
 * 设计目标：
 * - 提供统一的 try/catch 包装，避免业务代码散落的 try-catch 块
 * - 自动捕获同步/异步函数抛出的异常，转为 AppError
 * - 自动对接 logger：对内部错误（Database/FileSystem/Internal）写入 faults 日志
 * - 提供 Result<T> 类型返回，便于调用方按函数式风格处理
 * - 兼容 IPC handler 场景：可生成 IpcResponse 直接返回
 *
 * 使用约定：
 * - 服务层（DatabaseService/FileService 等）应使用 safeExecute 包装可能失败的调用
 * - wrapHandler 已自动捕获 AppError，业务 handler 无需再包一层 safeExecute
 * - 仅在需要"恢复执行 + 记录错误"的场景使用 safeExecuteOrThrow / safeExecuteOrResult
 */
import { logger, type FaultType } from './logger'
import {
  AppError,
  DatabaseError,
  FileSystemError,
  InternalError,
  isAppError,
  toIpcError,
  type AppErrorIpcPayload
} from '../../shared/errors/app-error'
import {
  ERROR_CODES,
  categoryOfCode,
  ErrorCategory,
  isUserFacing
} from '../../shared/errors/error-codes'
import { IPC_ERROR_CODES, type IpcResponse } from '../../shared/types/ipc-types'

/**
 * 结果类型：成功 | 失败
 *
 * 调用方使用模式匹配处理：
 * ```ts
 * const result = await safeExecute(() => riskyOp())
 * if (result.success) {
 *   return result.data
 * } else {
 *   // result.error 是 AppError
 * }
 * ```
 */
export type Result<T, E = AppError> =
  | { success: true; data: T }
  | { success: false; error: E }

/**
 * safeExecute 选项
 */
export interface SafeExecuteOptions {
  /**
   * 操作名称，用于日志标识（如 'backup:create'）
   * 不传则不记录到 faults 日志，仅返回错误
   */
  operation?: string
  /**
   * 错误转换器：将非 AppError 异常转为特定 AppError 子类
   * 默认转换器将所有未知错误转为 InternalError
   *
   * 调用方可针对 better-sqlite3 / fs 等错误做精细化映射
   */
  errorMapper?: (error: unknown) => AppError
  /**
   * 是否写入 faults 日志（默认 true）
   * 对用户取消、参数校验等非异常场景应设为 false
   */
  logFault?: boolean
  /**
   * 故障类型标签（仅 logFault=true 时生效）
   * 默认 'manual'，关键路径可设为 'unhandledRejection' 等
   */
  faultType?: FaultType
  /**
   * 上下文信息（仅 logFault=true 时附加到 faults 记录）
   */
  context?: Record<string, unknown>
}

/**
 * 默认错误转换器：将任意错误转为 InternalError
 *
 * - AppError 子类：直接保留
 * - 普通 Error：包装为 InternalError，保留原始 message 与 cause
 * - 非错误值：String() 化后包装
 */
function defaultErrorMapper(error: unknown): AppError {
  if (isAppError(error)) {
    return error
  }
  if (error instanceof Error) {
    return new InternalError(error.message, undefined, { cause: error })
  }
  return new InternalError(String(error), undefined, { cause: error })
}

/**
 * 计算日志级别：
 * - Validation / NotFound：debug（业务正常路径，不打扰）
 * - Permission：warn（潜在的安全风险）
 * - Database / FileSystem / Internal：error（写入 faults 日志）
 */
function shouldLogFault(error: AppError): boolean {
  const category = categoryOfCode(error.code)
  return (
    category === ErrorCategory.Database ||
    category === ErrorCategory.FileSystem ||
    category === ErrorCategory.Internal
  )
}

/**
 * 安全执行（异步版本）
 *
 * 自动捕获函数抛出的异常并转为 AppError，按需写入 faults 日志。
 *
 * @example
 * ```ts
 * const result = await safeExecute(async () => {
 *   return await dbManager.backup()
 * }, { operation: 'backup:create' })
 *
 * if (!result.success) {
 *   // result.error 是 AppError，可转 IPC 响应
 *   return toIpcResponse(result)
 * }
 * return result.data
 * ```
 */
export async function safeExecute<T>(
  fn: () => Promise<T> | T,
  options: SafeExecuteOptions = {}
): Promise<Result<T>> {
  const {
    operation,
    errorMapper = defaultErrorMapper,
    logFault: logFaultOpt,
    faultType = 'manual',
    context
  } = options

  try {
    const data = await fn()
    return { success: true, data }
  } catch (rawError) {
    const appError = isAppError(rawError) ? rawError : errorMapper(rawError)

    // 计算是否写入 faults 日志：
    // 1. 显式传入 logFault 选项时优先使用
    // 2. 未传入时按错误类别自动判断（Database/FileSystem/Internal 写入）
    const shouldLog = logFaultOpt ?? shouldLogFault(appError)
    if (shouldLog) {
      // 异步记录故障日志，不阻塞返回（错误链已捕获，日志失败不影响业务）
      // logger.fault 内部已使用异步 I/O，这里 fire-and-forget 即可
      void logger
        .fault(faultType, appError, {
          ...(operation ? { operation } : {}),
          ...context
        })
        .catch((logErr: unknown) => {
          // 日志写入失败时仅控制台告警，避免日志系统本身导致崩溃扩散
          console.error('[SafeExecute] 故障日志写入失败:', logErr)
        })
    } else if (!isUserFacing(categoryOfCode(appError.code))) {
      // 非用户面错误也不写 faults 时，至少在主日志中记录
      logger.warn(`[${operation ?? 'unknown'}] 操作失败:`, appError.message)
    }

    return { success: false, error: appError }
  }
}

/**
 * 安全执行（同步版本）
 *
 * 用于包装同步函数，与 safeExecute 行为一致但不支持 await。
 */
export function safeExecuteSync<T>(
  fn: () => T,
  options: SafeExecuteOptions = {}
): Result<T> {
  const {
    operation,
    errorMapper = defaultErrorMapper,
    logFault: logFaultOpt,
    faultType = 'manual',
    context
  } = options

  try {
    const data = fn()
    return { success: true, data }
  } catch (rawError) {
    const appError = isAppError(rawError) ? rawError : errorMapper(rawError)

    const shouldLog = logFaultOpt ?? shouldLogFault(appError)
    if (shouldLog) {
      // 同步上下文中使用 fire-and-forget 触发异步日志
      void logger
        .fault(faultType, appError, {
          ...(operation ? { operation } : {}),
          ...context
        })
        .catch((logErr: unknown) => {
          console.error('[SafeExecute] 故障日志写入失败:', logErr)
        })
    } else if (!isUserFacing(categoryOfCode(appError.code))) {
      logger.warn(`[${operation ?? 'unknown'}] 操作失败:`, appError.message)
    }

    return { success: false, error: appError }
  }
}

/**
 * 安全执行（抛出版本）
 *
 * 自动包装异常为 AppError 后抛出，便于上层 try/catch 统一处理。
 * 适合需要继续向上传播错误的场景（如 service 层调 service 层）。
 *
 * @example
 * ```ts
 * const data = await safeExecuteOrThrow(async () => {
 *   return await fs.promises.readFile(path)
 * }, { operation: 'readFile' })
 * ```
 */
export async function safeExecuteOrThrow<T>(
  fn: () => Promise<T> | T,
  options: SafeExecuteOptions = {}
): Promise<T> {
  const result = await safeExecute(fn, options)
  if (result.success) {
    return result.data
  }
  throw result.error
}

/**
 * 将 Result<T> 转为 IpcResponse<T>
 *
 * IPC handler 场景下，使用 safeExecute 包装业务调用后可直接返回 IpcResponse：
 * ```ts
 * return resultToIpcResponse(await safeExecute(() => service.op()))
 * ```
 */
export function resultToIpcResponse<T>(result: Result<T>): IpcResponse<T> {
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error.toIpcError() }
}

/**
 * 将任意错误转为 IpcResponse（never）失败响应
 *
 * 用于非 safeExecute 上下文中需要手动构造 IPC 失败响应的场景。
 */
export function errorToIpcResponse(error: unknown): IpcResponse<never> {
  const payload: AppErrorIpcPayload = toIpcError(error)
  return { success: false, error: payload }
}

/**
 * 包装异步函数，返回带错误处理的版本
 *
 * 用于 service 类方法的装饰器式包装：
 * ```ts
 * const safeBackup = wrapAsync(backupService.create.bind(backupService), {
 *   operation: 'backup:create'
 * })
 * const result = await safeBackup(options)
 * ```
 */
export function wrapAsync<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult> | TResult,
  options: SafeExecuteOptions = {}
): (...args: TArgs) => Promise<Result<TResult>> {
  return async (...args: TArgs) => {
    return safeExecute(() => fn(...args), options)
  }
}

/**
 * 包装异步函数，返回带错误处理的版本（抛出版）
 *
 * 与 wrapAsync 区别：失败时抛出 AppError 而非返回 Result。
 */
export function wrapAsyncThrow<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult> | TResult,
  options: SafeExecuteOptions = {}
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    return safeExecuteOrThrow(() => fn(...args), options)
  }
}

/**
 * 携带 code 属性的 Error 形态（如 better-sqlite3 错误、Node.js fs 错误）
 */
interface ErrorWithCode extends Error {
  code?: string
}

/**
 * better-sqlite3 错误识别：判断是否为数据库错误
 *
 * better-sqlite3 抛出的错误有特定的 code 属性（如 SQLITE_BUSY、SQLITE_CONSTRAINT 等）
 */
function isBetterSqlite3Error(error: unknown): error is ErrorWithCode {
  if (!(error instanceof Error)) return false
  // better-sqlite3 错误携带 code 属性，且 code 以 'SQLITE_' 开头
  const code = (error as ErrorWithCode).code
  return typeof code === 'string' && code.startsWith('SQLITE_')
}

/**
 * Node.js 文件系统错误识别：判断是否为 fs 错误
 *
 * Node.js fs 模块抛出的错误有特定的 code 属性（如 ENOENT、EACCES、EMFILE 等）
 */
function isFileSystemErrorCode(error: unknown): error is ErrorWithCode {
  if (!(error instanceof Error)) return false
  const code = (error as ErrorWithCode).code
  if (typeof code !== 'string') return false
  // 常见的 fs 错误码前缀
  return (
    code === 'ENOENT' ||
    code === 'EACCES' ||
    code === 'EPERM' ||
    code === 'EISDIR' ||
    code === 'ENOTDIR' ||
    code === 'EMFILE' ||
    code === 'ENOSPC' ||
    code === 'EROFS' ||
    code === 'EBUSY' ||
    code === 'ENOTEMPTY' ||
    code === 'EEXIST'
  )
}

/**
 * 数据库错误映射器
 *
 * 将 better-sqlite3 抛出的错误转为 DatabaseError，保留原始 cause。
 */
export function databaseErrorMapper(error: unknown): AppError {
  if (isAppError(error)) return error
  if (isBetterSqlite3Error(error)) {
    return new DatabaseError(
      `数据库错误: ${error.message}`,
      { sqliteCode: error.code },
      { cause: error }
    )
  }
  return defaultErrorMapper(error)
}

/**
 * 文件系统错误映射器
 *
 * 将 Node.js fs 模块抛出的错误转为 FileSystemError，保留原始 cause。
 */
export function fileSystemErrorMapper(error: unknown): AppError {
  if (isAppError(error)) return error
  if (isFileSystemErrorCode(error)) {
    const fsCode = error.code ?? 'UNKNOWN'
    return new FileSystemError(
      `文件操作失败 (${fsCode}): ${error.message}`,
      { fsCode },
      { cause: error }
    )
  }
  return defaultErrorMapper(error)
}

// 重新导出常用错误码与类型，便于调用方一站式引用
export {
  AppError,
  DatabaseError,
  FileSystemError,
  InternalError,
  ERROR_CODES,
  IPC_ERROR_CODES
}
