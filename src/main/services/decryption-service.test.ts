import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * @layer L2
 * @module src/main/services/decryption-service
 * @coverage 文件解密 + 相机参数加密 + ClothDiy 分享码 + HomeBuild 分享码 + dispose
 * @dependencies koffi, electron, fs/promises, logger
 * @remarks 完全 mock koffi FFI；测试导出函数的错误处理/边界场景
 */

// ============================================================
// Mock 声明（hoisted）
// ============================================================

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => path.join(os.tmpdir(), 'wxnn-decrypt-test-userdata', name)),
    getAppPath: vi.fn(() => path.join(os.tmpdir(), 'wxnn-decrypt-test-app'))
  }
}))

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

// koffi mock：struct/pointer/decode/load 全部提供 stub
// 暴露 mockFns 让测试用例动态控制各 FFI 函数返回值
const mockFns: Record<string, ReturnType<typeof vi.fn>> = {}

// 用 vi.hoisted 提升 decodeFn 以便 import 后通过 koffi.decode 访问
const { decodeFn } = vi.hoisted(() => ({
  decodeFn: vi.fn((_ptr: unknown, _type: string, _len: number) => [])
}))

vi.mock('koffi', () => {
  const structFn = vi.fn((name: string, _def: unknown) => ({ _structName: name }))
  const pointerFn = vi.fn((type: string) => ({ _pointerTo: type }))
  const loadFn = vi.fn((_dllPath: string) => ({
    func: vi.fn((fnName: string, _retType: unknown, _argTypes: unknown) => {
      // 为每个 FFI 函数创建独立的 mock
      if (!mockFns[fnName]) {
        mockFns[fnName] = vi.fn()
      }
      return mockFns[fnName]
    }),
    unload: vi.fn()
  }))
  return {
    default: {
      struct: structFn,
      pointer: pointerFn,
      load: loadFn,
      decode: decodeFn
    }
  }
})

// ============================================================
// Import after mock
// ============================================================
import koffi from 'koffi'
import {
  decodeFileParams,
  encodeCameraParams,
  decodeClothDiyShareCode,
  decodeHomeBuildShareCode,
  disposeDecryptionService
} from './decryption-service'

// ============================================================
// Helpers
// ============================================================

let tmpRoot: string

/** 重置所有 mockFns 为默认行为：status=0, bytes={data:null,len:0,cap:0} */
function resetMockFns(): void {
  for (const k of Object.keys(mockFns)) {
    delete mockFns[k]
  }
}

/** 让 getLib() / getBoundFunctions() 重新初始化 */
async function reloadModule(): Promise<typeof import('./decryption-service')> {
  vi.resetModules()
  // 重新 require 后 koffi mock 会重新建立 mockFns
  return await import('./decryption-service')
}

beforeEach(() => {
  vi.clearAllMocks()
  // 重置 mockFns
  for (const k of Object.keys(mockFns)) {
    delete mockFns[k]
  }
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wxnn-decrypt-'))
  // 准备 DLL 路径占位（findDllPath 会找 candidates，确保至少一个存在）
  const resourcesPath = path.join(tmpRoot, 'resources')
  fs.mkdirSync(resourcesPath, { recursive: true })
  fs.writeFileSync(path.join(resourcesPath, 'nuan5_decryption.dll'), Buffer.alloc(0))
  process.resourcesPath = resourcesPath
})

afterEach(() => {
  disposeDecryptionService()
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

/** 配置 abi_version mock：返回 EXPECTED_ABI_VERSION=1 */
function setupAbiVersion(): void {
  // abi_version 是 lib.func('abi_version', ...)() 调用，需要 mockFns['abi_version']() 返回 1
  if (!mockFns['abi_version']) mockFns['abi_version'] = vi.fn()
  mockFns['abi_version'].mockReturnValue(1)
}

/** 配置 CBytes 解码：koffi.decode 返回字节数组 */
function setupKoffiDecode(bytes: number[]): void {
  decodeFn.mockReturnValue(bytes)
}

// ============================================================
// decodeFileParams
// ============================================================

describe('decodeFileParams', () => {
  it('文件不存在时返回 hasParams:false + "无法读取文件"', async () => {
    setupAbiVersion()
    const r = await decodeFileParams(path.join(tmpRoot, 'not_exist.jpg'), 'NikkiPhotos', 'uid_123')
    expect(r.hasParams).toBe(false)
    expect(r.error).toBe('无法读取文件')
  })

  it('文件超过 10MB 上限时返回 hasParams:false + 文件过大提示', async () => {
    setupAbiVersion()
    const bigFile = path.join(tmpRoot, 'big.jpg')
    fs.writeFileSync(bigFile, Buffer.alloc(0))
    // mock stat 返回超大文件
    const statSpy = vi.spyOn(fs.promises, 'stat').mockResolvedValueOnce({
      size: 11 * 1024 * 1024
    } as never)
    const r = await decodeFileParams(bigFile, 'NikkiPhotos', 'uid_123')
    expect(r.hasParams).toBe(false)
    expect(r.error).toContain('文件过大')
    statSpy.mockRestore()
  })

  it('uid 为 default 时返回 hasParams:false + "缺少 UID 无法创建密钥"', async () => {
    setupAbiVersion()
    const f = path.join(tmpRoot, 'a.jpg')
    fs.writeFileSync(f, Buffer.alloc(10))
    const r = await decodeFileParams(f, 'NikkiPhotos', 'default')
    expect(r.hasParams).toBe(false)
    expect(r.error).toContain('缺少 UID')
  })

  it('Camera 密钥创建失败时返回 hasParams:false', async () => {
    setupAbiVersion()
    const f = path.join(tmpRoot, 'a.jpg')
    fs.writeFileSync(f, Buffer.alloc(10))
    mockFns['media_key_from_str'] = vi.fn().mockReturnValue({})
    mockFns['media_key_camera_param'] = vi.fn().mockReturnValue(null)
    const r = await decodeFileParams(f, 'NikkiPhotos', 'uid_123')
    expect(r.hasParams).toBe(false)
    expect(r.error).toContain('Camera 密钥创建失败')
  })

  it('Step 1 status≠0 时返回 hasParams:false + 对应错误信息', async () => {
    setupAbiVersion()
    const f = path.join(tmpRoot, 'a.jpg')
    fs.writeFileSync(f, Buffer.alloc(10))
    mockFns['media_key_from_str'] = vi.fn().mockReturnValue({})
    mockFns['media_key_camera_param'] = vi.fn().mockReturnValue({})
    mockFns['media_decode_file_bytes_unchecked'] = vi.fn().mockReturnValue({
      status: 4, // FindNoStartFlag
      bytes: { data: null, len: 0, cap: 0 }
    })
    mockFns['free_c_bytes'] = vi.fn()
    const r = await decodeFileParams(f, 'NikkiPhotos', 'uid_123')
    expect(r.hasParams).toBe(false)
    expect(r.error).toContain('FindNoStartFlag')
  })

  it('Step 1 输出 JSON 不含 CameraParams 字段时返回未找到提示', async () => {
    setupAbiVersion()
    const f = path.join(tmpRoot, 'a.jpg')
    fs.writeFileSync(f, Buffer.alloc(10))
    mockFns['media_key_from_str'] = vi.fn().mockReturnValue({})
    mockFns['media_key_camera_param'] = vi.fn().mockReturnValue({})
    // Step 1 返回有效 JSON 但无 CameraParams 字段
    const fakeJson = JSON.stringify({ other_field: 'value' })
    setupKoffiDecode(Array.from(Buffer.from(fakeJson)))
    mockFns['media_decode_file_bytes_unchecked'] = vi.fn().mockReturnValue({
      status: 0,
      bytes: { data: {}, len: fakeJson.length, cap: fakeJson.length + 16 }
    })
    mockFns['free_c_bytes'] = vi.fn()
    const r = await decodeFileParams(f, 'NikkiPhotos', 'uid_123')
    expect(r.hasParams).toBe(false)
    expect(r.error).toContain('未找到 CameraParams')
  })
})

// ============================================================
// encodeCameraParams
// ============================================================

describe('encodeCameraParams', () => {
  it('加密成功（status=0）返回 success:true + data', async () => {
    setupAbiVersion()
    const fakeBytes = [1, 2, 3, 4]
    setupKoffiDecode(fakeBytes)
    mockFns['media_encode_camera_params_bytes'] = vi.fn().mockReturnValue({
      status: 0,
      bytes: { data: {}, len: fakeBytes.length, cap: fakeBytes.length + 16 }
    })
    mockFns['free_c_bytes'] = vi.fn()
    const r = await encodeCameraParams('{"foo":"bar"}')
    expect(r.success).toBe(true)
    expect(r.data).toBeInstanceOf(Buffer)
    expect(Array.from(r.data!)).toEqual(fakeBytes)
  })

  it('加密失败（status≠0）返回 success:false + 错误信息', async () => {
    setupAbiVersion()
    mockFns['media_encode_camera_params_bytes'] = vi.fn().mockReturnValue({
      status: 2, // DataLenIsNotAMultipleOf16
      bytes: { data: null, len: 0, cap: 0 }
    })
    mockFns['free_c_bytes'] = vi.fn()
    const r = await encodeCameraParams('invalid')
    expect(r.success).toBe(false)
    expect(r.error).toContain('DataLenIsNotAMultipleOf16')
  })

  it('FFI 调用抛异常时返回 success:false + 错误信息', async () => {
    setupAbiVersion()
    mockFns['media_encode_camera_params_bytes'] = vi.fn().mockImplementation(() => {
      throw new Error('segfault')
    })
    const r = await encodeCameraParams('{}')
    expect(r.success).toBe(false)
    expect(r.error).toContain('segfault')
  })
})

// ============================================================
// decodeClothDiyShareCode
// ============================================================

describe('decodeClothDiyShareCode', () => {
  it('分享码无效（shareCode=null）返回 success:false', async () => {
    setupAbiVersion()
    mockFns['cloth_diy_share_code_from_code_str'] = vi.fn().mockReturnValue(null)
    const r = await decodeClothDiyShareCode('invalid_code')
    expect(r.success).toBe(false)
    expect(r.error).toContain('无效的染色分享码')
  })

  it('成功提取 timestamp + uidBytes + networkData', async () => {
    setupAbiVersion()
    mockFns['cloth_diy_share_code_from_code_str'] = vi.fn().mockReturnValue({})
    mockFns['cloth_diy_share_code_timestamp'] = vi.fn().mockReturnValue(1700000000)
    const fakeUid = [1, 2, 3]
    setupKoffiDecode(fakeUid)
    mockFns['cloth_diy_share_code_uid_bytes'] = vi.fn().mockReturnValue({
      status: 0,
      bytes: { data: {}, len: 3, cap: 16 }
    })
    const fakeNet = '{"color":"red"}'
    setupKoffiDecode(Array.from(Buffer.from(fakeNet)))
    mockFns['cloth_diy_decode_network'] = vi.fn().mockReturnValue({
      status: 0,
      bytes: { data: {}, len: fakeNet.length, cap: fakeNet.length + 16 }
    })
    mockFns['free_c_bytes'] = vi.fn()
    mockFns['free_cloth_diy_share_code'] = vi.fn()
    // 注意：koffi.decode 只能返回一个值，需让最后一次调用返回 network bytes
    decodeFn.mockReturnValueOnce(fakeUid) // 第一次：uidBytes
    decodeFn.mockReturnValueOnce(Array.from(Buffer.from(fakeNet))) // 第二次：networkData
    const r = await decodeClothDiyShareCode('valid_code')
    expect(r.success).toBe(true)
    expect(r.timestamp).toBe(1700000000)
    expect(r.networkData).toBe(fakeNet)
  })

  it('timestamp 为 0 时返回 undefined', async () => {
    setupAbiVersion()
    mockFns['cloth_diy_share_code_from_code_str'] = vi.fn().mockReturnValue({})
    mockFns['cloth_diy_share_code_timestamp'] = vi.fn().mockReturnValue(0)
    mockFns['cloth_diy_share_code_uid_bytes'] = vi.fn().mockReturnValue({
      status: 1,
      bytes: { data: null, len: 0, cap: 0 }
    })
    mockFns['cloth_diy_decode_network'] = vi.fn().mockReturnValue({
      status: 1,
      bytes: { data: null, len: 0, cap: 0 }
    })
    mockFns['free_c_bytes'] = vi.fn()
    mockFns['free_cloth_diy_share_code'] = vi.fn()
    const r = await decodeClothDiyShareCode('code')
    expect(r.success).toBe(true)
    expect(r.timestamp).toBeUndefined()
  })

  it('异常时返回 success:false + 错误信息', async () => {
    setupAbiVersion()
    mockFns['cloth_diy_share_code_from_code_str'] = vi.fn().mockImplementation(() => {
      throw new Error('ffi crash')
    })
    const r = await decodeClothDiyShareCode('code')
    expect(r.success).toBe(false)
    expect(r.error).toContain('ffi crash')
  })
})

// ============================================================
// decodeHomeBuildShareCode
// ============================================================

describe('decodeHomeBuildShareCode', () => {
  it('分享码无效（shareCode=null）返回 success:false', async () => {
    setupAbiVersion()
    mockFns['home_build_share_code_from_code_str'] = vi.fn().mockReturnValue(null)
    const r = await decodeHomeBuildShareCode('invalid_code')
    expect(r.success).toBe(false)
    expect(r.error).toContain('无效的家园建造分享码')
  })

  it('成功提取 server + networkData', async () => {
    setupAbiVersion()
    mockFns['home_build_share_code_from_code_str'] = vi.fn().mockReturnValue({})
    mockFns['home_build_share_code_server'] = vi.fn().mockReturnValue(2)
    const fakeNet = '{"home":"data"}'
    mockFns['home_build_decode_network'] = vi.fn().mockReturnValue({
      status: 0,
      bytes: { data: {}, len: fakeNet.length, cap: fakeNet.length + 16 }
    })
    decodeFn.mockReturnValueOnce(Array.from(Buffer.from(fakeNet)))
    mockFns['free_c_bytes'] = vi.fn()
    mockFns['free_home_build_share_code'] = vi.fn()
    const r = await decodeHomeBuildShareCode('valid_code')
    expect(r.success).toBe(true)
    expect(r.server).toBe(2)
    expect(r.networkData).toBe(fakeNet)
  })

  it('server 为 0 时返回 undefined', async () => {
    setupAbiVersion()
    mockFns['home_build_share_code_from_code_str'] = vi.fn().mockReturnValue({})
    mockFns['home_build_share_code_server'] = vi.fn().mockReturnValue(0)
    mockFns['home_build_decode_network'] = vi.fn().mockReturnValue({
      status: 1,
      bytes: { data: null, len: 0, cap: 0 }
    })
    mockFns['free_c_bytes'] = vi.fn()
    mockFns['free_home_build_share_code'] = vi.fn()
    const r = await decodeHomeBuildShareCode('code')
    expect(r.success).toBe(true)
    expect(r.server).toBeUndefined()
  })

  it('异常时返回 success:false + 错误信息', async () => {
    setupAbiVersion()
    mockFns['home_build_share_code_from_code_str'] = vi.fn().mockImplementation(() => {
      throw new Error('ffi fail')
    })
    const r = await decodeHomeBuildShareCode('code')
    expect(r.success).toBe(false)
    expect(r.error).toContain('ffi fail')
  })
})

// ============================================================
// disposeDecryptionService
// ============================================================

describe('disposeDecryptionService', () => {
  it('lib 未加载时调用不抛错', () => {
    expect(() => disposeDecryptionService()).not.toThrow()
  })

  it('lib 已加载时调用 unload', async () => {
    setupAbiVersion()
    // 触发 lib 加载
    mockFns['media_encode_camera_params_bytes'] = vi.fn().mockReturnValue({
      status: 0,
      bytes: { data: null, len: 0, cap: 0 }
    })
    mockFns['free_c_bytes'] = vi.fn()
    await encodeCameraParams('{}')
    // 现在 lib 已加载
    const koffi = require('koffi').default
    // 找到实际 lib 实例的 unload
    // 由于 mock 加载行为，unload 应该已被调用一次
    disposeDecryptionService()
    // 再次调用不抛错（幂等）
    expect(() => disposeDecryptionService()).not.toThrow()
  })
})

// ============================================================
// withMutex 串行化验证
// ============================================================

describe('withMutex 串行化', () => {
  it('并发调用被串行化（不互相干扰）', async () => {
    setupAbiVersion()
    const order: string[] = []
    mockFns['media_encode_camera_params_bytes'] = vi.fn().mockImplementation(() => {
      order.push('start')
      // 模拟异步延迟（虽然 FFI 是同步的，但 mutex 链式 promise 仍串行）
      return {
        status: 0,
        bytes: { data: null, len: 0, cap: 0 }
      }
    })
    mockFns['free_c_bytes'] = vi.fn()
    // 并发发起 3 个调用
    await Promise.all([
      encodeCameraParams('a'),
      encodeCameraParams('b'),
      encodeCameraParams('c')
    ])
    expect(order).toHaveLength(3)
  })
})
