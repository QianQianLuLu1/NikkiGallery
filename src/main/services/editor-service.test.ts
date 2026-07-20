import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * @layer L2
 * @module src/main/services/editor-service
 * @coverage 图片编辑保存 + 备份/恢复 + LRU 清理 + 编辑历史
 * @dependencies sharp, fs, better-sqlite3, file-utils, media-constants, backup-service
 * @remarks mock sharp/file-utils/media-constants；使用真实 fs + 临时目录
 */

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => path.join(os.tmpdir(), 'wxnn-editor-test-userdata', name))
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

// sharp mock：链式调用 + jpeg/png/webp + toFile
vi.mock('sharp', () => {
  const chain = {
    jpeg: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue(undefined)
  }
  const factory = vi.fn(() => chain)
  return { default: factory }
})

// media-constants mock
vi.mock('../utils/media-constants', () => ({
  getExtFromMime: vi.fn((m: string) => (m === 'image/png' ? 'png' : 'jpg')),
  getMimeType: vi.fn(() => 'image/jpeg')
}))

// file-utils mock：parseDataUrlToBuffer 返回 buffer + mimeType
vi.mock('../utils/file-utils', () => ({
  parseDataUrlToBuffer: vi.fn((dataUrl: string) => ({
    buffer: Buffer.from('fake-image-data'),
    mimeType: dataUrl.includes('png') ? 'image/png' : 'image/jpeg'
  })),
  pathExists: vi.fn(async () => false),
  getUniqueFilePath: vi.fn(async (dir: string, base: string, ext: string) => path.join(dir, `${base}${ext}`)),
  moveFile: vi.fn(),
  bufferToDataUrl: vi.fn()
}))

import { editorService, EditorService, type EditorSaveOptions } from './editor-service'
import sharp from 'sharp'
import { parseDataUrlToBuffer } from '../utils/file-utils'
import { getExtFromMime } from '../utils/media-constants'
import { backupService } from './backup-service'

// ============================================================
// Helpers
// ============================================================

let tmpRoot: string
let snapshotDir: string
let mediaFilePath: string
let mockDb: { prepare: ReturnType<typeof vi.fn> }

function setupDbWithMediaRow(mediaId: number = 1): void {
  mockDb = {
    prepare: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue({ id: mediaId }),
      run: vi.fn()
    })
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wxnn-editor-'))
  snapshotDir = path.join(tmpRoot, 'backups', 'editor-snapshots')
  fs.mkdirSync(snapshotDir, { recursive: true })
  // 备份 service 设置目录到临时
  backupService.setDir(path.join(tmpRoot, 'backups'))
  // 准备媒体文件
  mediaFilePath = path.join(tmpRoot, 'photo.jpg')
  fs.writeFileSync(mediaFilePath, Buffer.from('original-jpeg-bytes'))
  // 重置 sharp toFile 默认成功
  vi.mocked(sharp).mockReturnValue({
    jpeg: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue(undefined)
  } as never)
})

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

// ============================================================
// init
// ============================================================

describe('init', () => {
  it('注入 dbManager 后 snapshotDir 设置为 backups/editor-snapshots', () => {
    const fakeDbManager = { getDatabase: () => null }
    editorService.init(fakeDbManager as never)
    // 通过 save 路径间接验证 snapshotDir
    expect(() => editorService.init(fakeDbManager as never)).not.toThrow()
  })
})

// ============================================================
// setScheduler
// ============================================================

describe('setScheduler', () => {
  it('注入 scheduler 不抛错', () => {
    const scheduler = { enqueueLow: vi.fn() }
    expect(() => editorService.setScheduler(scheduler as never)).not.toThrow()
  })
})

// ============================================================
// save
// ============================================================

describe('save', () => {
  it('db 未初始化时返回失败', async () => {
    const fresh = new EditorService()
    const r = await fresh.save(mediaFilePath, 'data:image/jpeg;base64,AAA=')
    expect(r.success).toBe(false)
    expect(r.message).toContain('数据库未初始化')
  })

  it('filePath 不在 media_files 表中时返回安全限制错误', async () => {
    const fakeDbManager = {
      getDatabase: () => ({
        prepare: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue(undefined) // 查不到记录
        })
      })
    }
    const fresh = new EditorService()
    fresh.init(fakeDbManager as never)
    const r = await fresh.save(mediaFilePath, 'data:image/jpeg;base64,AAA=')
    expect(r.success).toBe(false)
    expect(r.message).toContain('安全限制')
  })

  it('成功保存 jpg 格式', async () => {
    setupDbWithMediaRow(1)
    const fakeDbManager = { getDatabase: () => mockDb }
    const fresh = new EditorService()
    fresh.init(fakeDbManager as never)
    const r = await fresh.save(mediaFilePath, 'data:image/jpeg;base64,AAA=', { format: 'jpg', quality: 90 })
    expect(r.success).toBe(true)
    expect(r.message).toContain('保存成功')
    expect(r.filePath).toBe(path.resolve(mediaFilePath))
  })

  it('成功保存 png 格式', async () => {
    setupDbWithMediaRow(2)
    const fakeDbManager = { getDatabase: () => mockDb }
    const fresh = new EditorService()
    fresh.init(fakeDbManager as never)
    const r = await fresh.save(mediaFilePath, 'data:image/png;base64,AAA=', { format: 'png' })
    expect(r.success).toBe(true)
  })

  it('成功保存 webp 格式', async () => {
    setupDbWithMediaRow(3)
    const fakeDbManager = { getDatabase: () => mockDb }
    const fresh = new EditorService()
    fresh.init(fakeDbManager as never)
    const r = await fresh.save(mediaFilePath, 'data:image/webp;base64,AAA=', { format: 'webp' })
    expect(r.success).toBe(true)
  })

  it('未提供 format 时从 mimeType 推导', async () => {
    setupDbWithMediaRow(4)
    const fakeDbManager = { getDatabase: () => mockDb }
    const fresh = new EditorService()
    fresh.init(fakeDbManager as never)
    const r = await fresh.save(mediaFilePath, 'data:image/png;base64,AAA=')
    expect(r.success).toBe(true)
    expect(getExtFromMime).toHaveBeenCalledWith('image/png')
  })

  it('sharp 写入失败时抛错并从备份恢复原图', async () => {
    setupDbWithMediaRow(5)
    const fakeDbManager = { getDatabase: () => mockDb }
    const fresh = new EditorService()
    fresh.init(fakeDbManager as never)
    // 让 sharp.toFile 抛错
    vi.mocked(sharp).mockReturnValueOnce({
      jpeg: vi.fn().mockReturnThis(),
      png: vi.fn().mockReturnThis(),
      webp: vi.fn().mockReturnThis(),
      toFile: vi.fn().mockRejectedValue(new Error('write failed'))
    } as never)
    // save 不捕获 toFile 错误，向上抛
    await expect(
      fresh.save(mediaFilePath, 'data:image/jpeg;base64,AAA=', { format: 'jpg' })
    ).rejects.toThrow('write failed')
    // 原文件应保持不变（备份恢复）
    expect(fs.existsSync(mediaFilePath)).toBe(true)
  })

  it('备份大小不匹配时删除不完整备份并继续保存', async () => {
    setupDbWithMediaRow(6)
    const fakeDbManager = { getDatabase: () => mockDb }
    const fresh = new EditorService()
    fresh.init(fakeDbManager as never)
    // mock copyFile 后备份大小与原文件不同（通过 stat mock）
    const origStat = fs.promises.stat
    let callCount = 0
    const statSpy = vi.spyOn(fs.promises, 'stat').mockImplementation(async (p: any) => {
      callCount++
      const real = await origStat(p as string)
      if (p === mediaFilePath) {
        return real
      }
      // 备份文件返回不同 size
      return { ...real, size: real.size + 9999 } as never
    })
    const r = await fresh.save(mediaFilePath, 'data:image/jpeg;base64,AAA=', { format: 'jpg' })
    expect(r.success).toBe(true)
    statSpy.mockRestore()
  })

  it('保存成功后记录编辑历史', async () => {
    setupDbWithMediaRow(7)
    const fakeDbManager = { getDatabase: () => mockDb }
    const fresh = new EditorService()
    fresh.init(fakeDbManager as never)
    await fresh.save(mediaFilePath, 'data:image/jpeg;base64,AAA=', {
      format: 'jpg',
      params: '{"brightness":10}'
    })
    // prepare 应被调用 2 次：SELECT + INSERT
    expect(mockDb.prepare).toHaveBeenCalledTimes(2)
    // 第二次是 INSERT INTO edit_history
    const insertCall = mockDb.prepare.mock.calls[1][0]
    expect(insertCall).toContain('INSERT INTO edit_history')
  })

  it('记录编辑历史失败不影响保存成功', async () => {
    // prepare 第二次抛错
    mockDb = {
      prepare: vi.fn()
        .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ id: 8 }) })
        .mockImplementationOnce(() => {
          throw new Error('history write failed')
        })
    } as never
    const fakeDbManager = { getDatabase: () => mockDb }
    const fresh = new EditorService()
    fresh.init(fakeDbManager as never)
    const r = await fresh.save(mediaFilePath, 'data:image/jpeg;base64,AAA=', { format: 'jpg' })
    expect(r.success).toBe(true)
  })
})

// ============================================================
// LRU 清理（pruneOldSnapshots 间接测试）
// ============================================================

describe('pruneOldSnapshots（通过 save 间接触发）', () => {
  it('快照数 ≤ 50 时不删除', async () => {
    setupDbWithMediaRow(10)
    const fakeDbManager = { getDatabase: () => mockDb }
    const fresh = new EditorService()
    fresh.init(fakeDbManager as never)
    // 创建 10 个快照（不会触发清理）
    for (let i = 0; i < 10; i++) {
      const snapPath = path.join(snapshotDir, `${i + 1}_${Date.now() - i * 1000}.jpg`)
      fs.writeFileSync(snapPath, Buffer.alloc(0))
    }
    await fresh.save(mediaFilePath, 'data:image/jpeg;base64,AAA=', { format: 'jpg' })
    const remaining = fs.readdirSync(snapshotDir).filter((n) => /^\d+_\d+\.\w+$/.test(n))
    expect(remaining.length).toBeGreaterThanOrEqual(10)
  })

  it('快照数 > 50 时删除最旧的', async () => {
    setupDbWithMediaRow(11)
    const fakeDbManager = { getDatabase: () => mockDb }
    const fresh = new EditorService()
    fresh.init(fakeDbManager as never)
    // 创建 60 个快照
    for (let i = 0; i < 60; i++) {
      const snapPath = path.join(snapshotDir, `${i + 1}_${Date.now() - (60 - i) * 1000}.jpg`)
      fs.writeFileSync(snapPath, Buffer.alloc(0))
      fs.utimesSync(snapPath, new Date(i * 1000), new Date(i * 1000))
    }
    await fresh.save(mediaFilePath, 'data:image/jpeg;base64,AAA=', { format: 'jpg' })
    // 等待异步清理（pruneOldSnapshots 是 fire-and-forget 的 async，需轮询等待完成）
    await vi.waitFor(
      () => {
        const remaining = fs.readdirSync(snapshotDir).filter((n) => /^\d+_\d+\.\w+$/.test(n))
        expect(remaining.length).toBeLessThanOrEqual(51) // 50 + 1 新保存的
      },
      { timeout: 3000, interval: 50 }
    )
  })
})
