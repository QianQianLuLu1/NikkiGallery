/**
 * @layer L1
 * @module src/main/utils/safe-execute
 * @coverage safeExecute/safeExecuteSync/safeExecuteOrThrow/resultToIpcResponse/errorToIpcResponse/wrapAsync/wrapAsyncThrow/databaseErrorMapper/fileSystemErrorMapper
 * @dependencies mock: ./logger
 * @remarks 隔离 logger 后的纯逻辑测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock logger 模块（safe-execute 依赖 logger.fault 与 logger.warn）
// 使用 vi.hoisted 确保 mock 在 vi.mock 工厂执行前已初始化（vi.mock 会被提升到文件顶部）
const {
  loggerFaultMock,
  loggerWarnMock,
  loggerInfoMock,
  loggerErrorMock,
  loggerDebugMock
} = vi.hoisted(() => ({
  loggerFaultMock: vi.fn().mockResolvedValue('fake-fault-id'),
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerDebugMock: vi.fn()
}))

vi.mock('./logger', () => ({
  logger: {
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
    debug: loggerDebugMock,
    fault: loggerFaultMock
  }
}))

import {
  safeExecute,
  safeExecuteSync,
  safeExecuteOrThrow,
  resultToIpcResponse,
  errorToIpcResponse,
  wrapAsync,
  wrapAsyncThrow,
  databaseErrorMapper,
  fileSystemErrorMapper,
  AppError,
  DatabaseError,
  FileSystemError,
  InternalError
} from './safe-execute'
import {
  ValidationError,
  NotFoundError,
  PermissionError
} from '../../shared/errors/app-error'
import { ERROR_CODES, IPC_ERROR_CODES } from '../../shared/errors/error-codes'

describe('safe-execute', () => {
  beforeEach(() => {
    loggerFaultMock.mockClear()
    loggerWarnMock.mockClear()
    loggerInfoMock.mockClear()
    loggerErrorMock.mockClear()
    loggerDebugMock.mockClear()
    loggerFaultMock.mockResolvedValue('fake-fault-id')
  })

  describe('safeExecute', () => {
    it('成功执行返回 { success: true, data }', async () => {
      const result = await safeExecute(() => 42)
      expect(result).toEqual({ success: true, data: 42 })
    })

    it('成功执行异步函数返回 data', async () => {
      const result = await safeExecute(async () => 'hello')
      expect(result).toEqual({ success: true, data: 'hello' })
    })

    it('普通 Error 被包装为 InternalError 并写入 faults 日志', async () => {
      const result = await safeExecute(() => {
        throw new Error('boom')
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(InternalError)
        expect(result.error.message).toBe('boom')
      }
      expect(loggerFaultMock).toHaveBeenCalledTimes(1)
    })

    it('非 Error 值被 String() 化后包装为 InternalError', async () => {
      const result = await safeExecute(() => {
        throw 'string error' // eslint-disable-line no-throw-literal
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(InternalError)
        expect(result.error.message).toBe('string error')
      }
    })

    it('AppError 直接保留不重新包装', async () => {
      const original = new DatabaseError('db fail')
      const result = await safeExecute(() => {
        throw original
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe(original)
      }
    })

    it('DatabaseError 自动写入 faults 日志', async () => {
      await safeExecute(() => {
        throw new DatabaseError('db fail')
      })
      expect(loggerFaultMock).toHaveBeenCalledTimes(1)
    })

    it('FileSystemError 自动写入 faults 日志', async () => {
      await safeExecute(() => {
        throw new FileSystemError('fs fail')
      })
      expect(loggerFaultMock).toHaveBeenCalledTimes(1)
    })

    it('InternalError 自动写入 faults 日志', async () => {
      await safeExecute(() => {
        throw new InternalError('internal fail')
      })
      expect(loggerFaultMock).toHaveBeenCalledTimes(1)
    })

    it('ValidationError 不写入 faults 日志但也不调用 logger.warn（userFacing）', async () => {
      await safeExecute(() => {
        throw new ValidationError('validation fail')
      })
      expect(loggerFaultMock).not.toHaveBeenCalled()
      expect(loggerWarnMock).not.toHaveBeenCalled()
    })

    it('NotFoundError 不写入 faults 日志（userFacing）', async () => {
      await safeExecute(() => {
        throw new NotFoundError('not found')
      })
      expect(loggerFaultMock).not.toHaveBeenCalled()
    })

    it('PermissionError 不写入 faults 日志也不调用 logger.warn（userFacing）', async () => {
      await safeExecute(() => {
        throw new PermissionError('forbidden')
      })
      expect(loggerFaultMock).not.toHaveBeenCalled()
      expect(loggerWarnMock).not.toHaveBeenCalled()
    })

    it('显式 logFault=true 强制写入 faults 日志', async () => {
      await safeExecute(() => {
        throw new ValidationError('validation fail')
      }, { logFault: true })
      expect(loggerFaultMock).toHaveBeenCalledTimes(1)
    })

    it('显式 logFault=false 跳过 faults 日志写入', async () => {
      await safeExecute(() => {
        throw new DatabaseError('db fail')
      }, { logFault: false })
      expect(loggerFaultMock).not.toHaveBeenCalled()
    })

    it('operation 选项传递到 faults 日志上下文', async () => {
      await safeExecute(() => {
        throw new DatabaseError('db fail')
      }, { operation: 'backup:create' })
      expect(loggerFaultMock).toHaveBeenCalledWith(
        'manual',
        expect.any(DatabaseError),
        expect.objectContaining({ operation: 'backup:create' })
      )
    })

    it('context 选项合并到 faults 日志上下文', async () => {
      await safeExecute(() => {
        throw new DatabaseError('db fail')
      }, { operation: 'op', context: { userId: 123, action: 'delete' } })
      expect(loggerFaultMock).toHaveBeenCalledWith(
        'manual',
        expect.any(DatabaseError),
        expect.objectContaining({
          operation: 'op',
          userId: 123,
          action: 'delete'
        })
      )
    })

    it('faultType 选项传递到 faults 日志', async () => {
      await safeExecute(() => {
        throw new DatabaseError('db fail')
      }, { faultType: 'uncaughtException' })
      expect(loggerFaultMock).toHaveBeenCalledWith(
        'uncaughtException',
        expect.any(DatabaseError),
        expect.any(Object)
      )
    })

    it('自定义 errorMapper 将普通错误转为指定 AppError 子类', async () => {
      const result = await safeExecute(() => {
        const err = new Error('not here') as Error & { code: string }
        err.code = 'ENOENT'
        throw err
      }, {
        errorMapper: (e) => new FileSystemError('fs mapped', { code: (e as Error & { code?: string }).code })
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(FileSystemError)
        expect(result.error.details).toEqual({ code: 'ENOENT' })
      }
    })

    it('logger.fault 失败时不影响主流程（fire-and-forget）', async () => {
      loggerFaultMock.mockRejectedValueOnce(new Error('log write fail'))
      const result = await safeExecute(() => {
        throw new DatabaseError('db fail')
      })
      // 主流程仍返回失败结果，未被日志错误影响
      expect(result.success).toBe(false)
    })

    it('无 operation 的非用户面错误调用 logger.warn', async () => {
      // InternalError 非 userFacing，但 logFault 默认 true 会写 faults
      // 改用 logFault: false 触发 warn 分支
      await safeExecute(() => {
        throw new InternalError('internal fail')
      }, { logFault: false })
      expect(loggerWarnMock).toHaveBeenCalledTimes(1)
      expect(loggerWarnMock).toHaveBeenCalledWith(
        expect.stringContaining('[unknown]'),
        'internal fail'
      )
    })

    it('返回的 Result 类型支持类型窄化', async () => {
      const result = await safeExecute(() => 100)
      if (result.success) {
        // 此处 result.data 应为 number
        expect(result.data + 1).toBe(101)
      } else {
        throw new Error('不应进入失败分支')
      }
    })
  })

  describe('safeExecuteSync', () => {
    it('成功执行同步函数返回 data', () => {
      const result = safeExecuteSync(() => 42)
      expect(result).toEqual({ success: true, data: 42 })
    })

    it('抛出 Error 时返回 InternalError', () => {
      const result = safeExecuteSync(() => {
        throw new Error('sync boom')
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(InternalError)
        expect(result.error.message).toBe('sync boom')
      }
    })

    it('AppError 直接保留', () => {
      const original = new ValidationError('v fail')
      const result = safeExecuteSync(() => {
        throw original
      })
      if (!result.success) {
        expect(result.error).toBe(original)
      }
    })

    it('DatabaseError 触发 faults 日志', () => {
      safeExecuteSync(() => {
        throw new DatabaseError('db fail')
      })
      expect(loggerFaultMock).toHaveBeenCalledTimes(1)
    })

    it('logFault: false 跳过 faults 日志', () => {
      safeExecuteSync(() => {
        throw new DatabaseError('db fail')
      }, { logFault: false })
      expect(loggerFaultMock).not.toHaveBeenCalled()
    })

    it('非 Error 值被字符串化包装', () => {
      const result = safeExecuteSync(() => {
        throw 123 // eslint-disable-line no-throw-literal
      })
      if (!result.success) {
        expect(result.error.message).toBe('123')
      }
    })
  })

  describe('safeExecuteOrThrow', () => {
    it('成功时返回 data', async () => {
      const data = await safeExecuteOrThrow(() => 'value')
      expect(data).toBe('value')
    })

    it('失败时抛出 AppError', async () => {
      await expect(
        safeExecuteOrThrow(() => {
          throw new DatabaseError('db fail')
        })
      ).rejects.toBeInstanceOf(DatabaseError)
    })

    it('抛出的错误保留原 AppError 实例', async () => {
      const original = new NotFoundError('missing')
      try {
        await safeExecuteOrThrow(() => {
          throw original
        })
        throw new Error('should not reach')
      } catch (e) {
        expect(e).toBe(original)
      }
    })

    it('异步函数成功时返回 data', async () => {
      const data = await safeExecuteOrThrow(async () => 99)
      expect(data).toBe(99)
    })
  })

  describe('resultToIpcResponse', () => {
    it('成功 Result 转为成功 IpcResponse', () => {
      const result = { success: true, data: 'ok' } as const
      const ipc = resultToIpcResponse(result)
      expect(ipc).toEqual({ success: true, data: 'ok' })
    })

    it('失败 Result 转为失败 IpcResponse（含错误码）', () => {
      const err = new DatabaseError('db fail')
      const result = { success: false, error: err } as const
      const ipc = resultToIpcResponse(result)
      expect(ipc.success).toBe(false)
      if (!ipc.success) {
        expect(ipc.error.code).toBe(ERROR_CODES.DATABASE_ERROR)
        expect(ipc.error.message).toBe('db fail')
      }
    })

    it('FileSystemError 转 IpcResponse 携带 FILE_SYSTEM_ERROR 码', () => {
      const err = new FileSystemError('fs fail')
      const ipc = resultToIpcResponse({ success: false, error: err })
      if (!ipc.success) {
        expect(ipc.error.code).toBe(ERROR_CODES.FILE_SYSTEM_ERROR)
      }
    })

    it('ValidationError 转 IpcResponse 保留 userMessage', () => {
      const err = new ValidationError('v fail', undefined, { userMessage: '请检查输入' })
      const ipc = resultToIpcResponse({ success: false, error: err })
      if (!ipc.success) {
        expect(ipc.error.userMessage).toBe('请检查输入')
      }
    })
  })

  describe('errorToIpcResponse', () => {
    it('AppError 转为失败 IpcResponse', () => {
      const err = new DatabaseError('db fail')
      const ipc = errorToIpcResponse(err)
      expect(ipc.success).toBe(false)
      if (!ipc.success) {
        expect(ipc.error.code).toBe(ERROR_CODES.DATABASE_ERROR)
      }
    })

    it('普通 Error 转为 INTERNAL_ERROR IpcResponse', () => {
      const ipc = errorToIpcResponse(new Error('plain'))
      if (!ipc.success) {
        expect(ipc.error.code).toBe(IPC_ERROR_CODES.INTERNAL_ERROR)
        expect(ipc.error.message).toBe('plain')
      }
    })

    it('字符串错误转为 INTERNAL_ERROR IpcResponse', () => {
      const ipc = errorToIpcResponse('string error')
      if (!ipc.success) {
        expect(ipc.error.code).toBe(IPC_ERROR_CODES.INTERNAL_ERROR)
        expect(ipc.error.message).toBe('string error')
      }
    })

    it('null 错误转为 INTERNAL_ERROR IpcResponse', () => {
      const ipc = errorToIpcResponse(null)
      if (!ipc.success) {
        expect(ipc.error.code).toBe(IPC_ERROR_CODES.INTERNAL_ERROR)
        expect(ipc.error.message).toBe('null')
      }
    })

    it('undefined 错误转为 INTERNAL_ERROR IpcResponse', () => {
      const ipc = errorToIpcResponse(undefined)
      if (!ipc.success) {
        expect(ipc.error.code).toBe(IPC_ERROR_CODES.INTERNAL_ERROR)
      }
    })
  })

  describe('wrapAsync', () => {
    it('包装后的函数返回 Result 而非直接抛错', async () => {
      const fn = (x: number) => x * 2
      const wrapped = wrapAsync(fn)
      const result = await wrapped(21)
      expect(result).toEqual({ success: true, data: 42 })
    })

    it('包装异步函数', async () => {
      const fn = async (s: string) => s.toUpperCase()
      const wrapped = wrapAsync(fn)
      const result = await wrapped('hi')
      expect(result).toEqual({ success: true, data: 'HI' })
    })

    it('异常被捕获转为失败 Result', async () => {
      const fn = () => {
        throw new DatabaseError('db fail')
      }
      const wrapped = wrapAsync(fn, { operation: 'test' })
      const result = await wrapped()
      expect(result.success).toBe(false)
    })

    it('options 透传给 safeExecute', async () => {
      const fn = () => {
        throw new DatabaseError('db fail')
      }
      const wrapped = wrapAsync(fn, { operation: 'wrapped-op' })
      await wrapped()
      expect(loggerFaultMock).toHaveBeenCalledWith(
        'manual',
        expect.any(DatabaseError),
        expect.objectContaining({ operation: 'wrapped-op' })
      )
    })

    it('多参数函数正确传递', async () => {
      const fn = (a: number, b: number, c: number) => a + b + c
      const wrapped = wrapAsync(fn)
      const result = await wrapped(1, 2, 3)
      expect(result).toEqual({ success: true, data: 6 })
    })
  })

  describe('wrapAsyncThrow', () => {
    it('成功时返回 data', async () => {
      const wrapped = wrapAsyncThrow((x: number) => x + 1)
      const data = await wrapped(10)
      expect(data).toBe(11)
    })

    it('失败时抛出 AppError', async () => {
      const wrapped = wrapAsyncThrow(() => {
        throw new NotFoundError('missing')
      })
      await expect(wrapped()).rejects.toBeInstanceOf(NotFoundError)
    })

    it('options 透传', async () => {
      const wrapped = wrapAsyncThrow(() => {
        throw new DatabaseError('db fail')
      }, { operation: 'throw-op' })
      await expect(wrapped()).rejects.toBeInstanceOf(DatabaseError)
      expect(loggerFaultMock).toHaveBeenCalledWith(
        'manual',
        expect.any(DatabaseError),
        expect.objectContaining({ operation: 'throw-op' })
      )
    })
  })

  describe('databaseErrorMapper', () => {
    it('AppError 直接返回', () => {
      const err = new DatabaseError('db')
      expect(databaseErrorMapper(err)).toBe(err)
    })

    it('better-sqlite3 错误（含 SQLITE_ 前缀 code）转为 DatabaseError', () => {
      const raw = new Error('SQLITE_BUSY: database is locked') as Error & { code: string }
      raw.code = 'SQLITE_BUSY'
      const mapped = databaseErrorMapper(raw)
      expect(mapped).toBeInstanceOf(DatabaseError)
      expect(mapped.message).toContain('SQLITE_BUSY')
      expect(mapped.details).toEqual({ sqliteCode: 'SQLITE_BUSY' })
    })

    it('普通 Error 转为 InternalError（默认 mapper 兜底）', () => {
      const mapped = databaseErrorMapper(new Error('plain'))
      expect(mapped).toBeInstanceOf(InternalError)
    })

    it('非 Error 值转为 InternalError', () => {
      const mapped = databaseErrorMapper('string err')
      expect(mapped).toBeInstanceOf(InternalError)
      expect(mapped.message).toBe('string err')
    })

    it('保留原始错误作为 cause', () => {
      const raw = new Error('SQLITE_BUSY') as Error & { code: string }
      raw.code = 'SQLITE_BUSY'
      const mapped = databaseErrorMapper(raw)
      expect(mapped.cause).toBe(raw)
    })
  })

  describe('fileSystemErrorMapper', () => {
    it('AppError 直接返回', () => {
      const err = new FileSystemError('fs')
      expect(fileSystemErrorMapper(err)).toBe(err)
    })

    it('ENOENT 错误转为 FileSystemError', () => {
      const raw = new Error('no such file') as Error & { code: string }
      raw.code = 'ENOENT'
      const mapped = fileSystemErrorMapper(raw)
      expect(mapped).toBeInstanceOf(FileSystemError)
      expect(mapped.message).toContain('ENOENT')
      expect(mapped.details).toEqual({ fsCode: 'ENOENT' })
    })

    it('EACCES 错误转为 FileSystemError', () => {
      const raw = new Error('permission denied') as Error & { code: string }
      raw.code = 'EACCES'
      const mapped = fileSystemErrorMapper(raw)
      expect(mapped).toBeInstanceOf(FileSystemError)
      expect(mapped.details).toEqual({ fsCode: 'EACCES' })
    })

    it('EPERM 错误转为 FileSystemError', () => {
      const raw = new Error('operation not permitted') as Error & { code: string }
      raw.code = 'EPERM'
      const mapped = fileSystemErrorMapper(raw)
      expect(mapped).toBeInstanceOf(FileSystemError)
    })

    it('EISDIR 错误转为 FileSystemError', () => {
      const raw = new Error('is a directory') as Error & { code: string }
      raw.code = 'EISDIR'
      expect(fileSystemErrorMapper(raw)).toBeInstanceOf(FileSystemError)
    })

    it('ENOTDIR 错误转为 FileSystemError', () => {
      const raw = new Error('not a directory') as Error & { code: string }
      raw.code = 'ENOTDIR'
      expect(fileSystemErrorMapper(raw)).toBeInstanceOf(FileSystemError)
    })

    it('EMFILE 错误转为 FileSystemError', () => {
      const raw = new Error('too many open files') as Error & { code: string }
      raw.code = 'EMFILE'
      expect(fileSystemErrorMapper(raw)).toBeInstanceOf(FileSystemError)
    })

    it('ENOSPC 错误转为 FileSystemError', () => {
      const raw = new Error('no space left') as Error & { code: string }
      raw.code = 'ENOSPC'
      expect(fileSystemErrorMapper(raw)).toBeInstanceOf(FileSystemError)
    })

    it('EROFS 错误转为 FileSystemError', () => {
      const raw = new Error('read-only file system') as Error & { code: string }
      raw.code = 'EROFS'
      expect(fileSystemErrorMapper(raw)).toBeInstanceOf(FileSystemError)
    })

    it('EBUSY 错误转为 FileSystemError', () => {
      const raw = new Error('resource busy') as Error & { code: string }
      raw.code = 'EBUSY'
      expect(fileSystemErrorMapper(raw)).toBeInstanceOf(FileSystemError)
    })

    it('ENOTEMPTY 错误转为 FileSystemError', () => {
      const raw = new Error('directory not empty') as Error & { code: string }
      raw.code = 'ENOTEMPTY'
      expect(fileSystemErrorMapper(raw)).toBeInstanceOf(FileSystemError)
    })

    it('EEXIST 错误转为 FileSystemError', () => {
      const raw = new Error('file exists') as Error & { code: string }
      raw.code = 'EEXIST'
      expect(fileSystemErrorMapper(raw)).toBeInstanceOf(FileSystemError)
    })

    it('未知 code 的 Error 转为 InternalError（默认 mapper）', () => {
      const raw = new Error('unknown') as Error & { code: string }
      raw.code = 'UNKNOWN_CODE'
      const mapped = fileSystemErrorMapper(raw)
      expect(mapped).toBeInstanceOf(InternalError)
    })

    it('普通 Error 无 code 转为 InternalError', () => {
      const mapped = fileSystemErrorMapper(new Error('plain'))
      expect(mapped).toBeInstanceOf(InternalError)
    })

    it('非 Error 值转为 InternalError', () => {
      const mapped = fileSystemErrorMapper(42)
      expect(mapped).toBeInstanceOf(InternalError)
      expect(mapped.message).toBe('42')
    })

    it('保留原始错误作为 cause', () => {
      const raw = new Error('fail') as Error & { code: string }
      raw.code = 'ENOENT'
      const mapped = fileSystemErrorMapper(raw)
      expect(mapped.cause).toBe(raw)
    })
  })

  describe('导出的错误类型与常量', () => {
    it('重新导出 AppError 类', () => {
      const err = new AppError(IPC_ERROR_CODES.INTERNAL_ERROR, 'msg')
      expect(err).toBeInstanceOf(AppError)
      expect(err.code).toBe(IPC_ERROR_CODES.INTERNAL_ERROR)
    })

    it('重新导出 DatabaseError 类', () => {
      expect(new DatabaseError('msg')).toBeInstanceOf(AppError)
    })

    it('重新导出 FileSystemError 类', () => {
      expect(new FileSystemError('msg')).toBeInstanceOf(AppError)
    })

    it('重新导出 InternalError 类', () => {
      expect(new InternalError('msg')).toBeInstanceOf(AppError)
    })

    it('重新导出 ERROR_CODES 常量', () => {
      expect(ERROR_CODES.DATABASE_ERROR).toBe('APP_DATABASE_ERROR')
      expect(ERROR_CODES.FILE_SYSTEM_ERROR).toBe('APP_FILE_SYSTEM_ERROR')
    })

    it('重新导出 IPC_ERROR_CODES 常量', () => {
      expect(IPC_ERROR_CODES.INTERNAL_ERROR).toBe('IPC_INTERNAL_ERROR')
    })
  })
})
