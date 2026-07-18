import { describe, it, expect } from 'vitest'

/**
 * 公共工具函数验证测试
 *
 * 目标：确保 src/common/utils/ 下的所有函数可正常使用
 * 不追求覆盖率，只验证关键行为与边界
 */

import {
  formatSize,
  formatFileSize,
  generateId,
  deepClone,
  pad,
  truncate,
  formatDate,
  formatTimestamp,
  formatCompactTimestamp,
  formatDateOrDash,
  formatDuration,
  getDirName,
  joinPath,
  getExtName,
  getBaseName
} from './index'

describe('format utils', () => {
  it('formatSize 正确格式化各档单位', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(1024)).toBe('1.00 KB')
    expect(formatSize(1024 * 1024)).toBe('1.00 MB')
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.00 GB')
    expect(formatSize(1024 ** 4)).toBe('1.00 TB')
  })

  it('formatSize 健壮性：非有限数与负数返回 0 B', () => {
    expect(formatSize(NaN)).toBe('0 B')
    expect(formatSize(Infinity)).toBe('0 B')
    expect(formatSize(-1)).toBe('0 B')
  })

  it('formatFileSize 是 formatSize 的语义别名', () => {
    expect(formatFileSize(1024)).toBe(formatSize(1024))
  })
})

describe('id utils', () => {
  it('generateId 不带前缀返回唯一字符串', () => {
    const a = generateId()
    const b = generateId()
    expect(a).not.toBe(b)
    expect(typeof a).toBe('string')
    expect(a.length).toBeGreaterThan(8)
  })

  it('generateId 带前缀格式正确', () => {
    const id = generateId('toast')
    expect(id.startsWith('toast-')).toBe(true)
    // 格式：toast-${timestamp}-${rand6}
    const parts = id.split('-')
    expect(parts.length).toBe(3)
    expect(parts[1]).toMatch(/^\d+$/)
    expect(parts[2].length).toBeGreaterThan(0)
  })

  it('generateId 同前缀两次调用结果不同', () => {
    expect(generateId('low')).not.toBe(generateId('low'))
  })
})

describe('object utils', () => {
  it('deepClone 正确深拷贝纯对象', () => {
    const original = { a: 1, b: { c: 2 }, d: [1, 2, 3] }
    const copy = deepClone(original)
    expect(copy).toEqual(original)
    expect(copy).not.toBe(original)
    expect(copy.b).not.toBe(original.b)
    expect(copy.d).not.toBe(original.d)
  })

  it('deepClone 正确深拷贝 Date 对象', () => {
    const original = { date: new Date('2026-07-18T10:30:00Z') }
    const copy = deepClone(original)
    expect(copy.date).toEqual(original.date)
    expect(copy.date).not.toBe(original.date)
    expect(copy.date instanceof Date).toBe(true)
  })

  it('deepClone 不影响原始对象', () => {
    const original = { nested: { value: 1 } }
    const copy = deepClone(original)
    copy.nested.value = 999
    expect(original.nested.value).toBe(1)
  })
})

describe('string utils', () => {
  it('pad 默认补 2 位', () => {
    expect(pad(5)).toBe('05')
    expect(pad(12)).toBe('12')
  })

  it('pad 可指定长度', () => {
    expect(pad(5, 4)).toBe('0005')
    expect(pad(123, 2)).toBe('123') // 超长不截断
  })

  it('truncate 超长截断', () => {
    expect(truncate('hello', 10)).toBe('hello')
    expect(truncate('hello world', 8)).toBe('hello w…')
    expect(truncate('hello world', 5)).toBe('hell…')
  })

  it('truncate 默认长度 20', () => {
    const long = 'a'.repeat(25)
    const result = truncate(long)
    expect(result.length).toBe(20)
    expect(result.endsWith('…')).toBe(true)
  })
})

describe('date utils', () => {
  const fixedDate = new Date(2026, 6, 18, 10, 30, 45) // 2026-07-18 10:30:45 本地时间

  it('formatDate 返回 YYYY-MM-DD', () => {
    expect(formatDate(fixedDate)).toBe('2026-07-18')
  })

  it('formatDate 接受字符串和数字', () => {
    expect(formatDate(fixedDate.getTime())).toBe('2026-07-18')
    // ISO 字符串包含时区信息，仅验证格式
    expect(formatDate('2026-07-18T10:30:00')).toMatch(/^2026-07-1[78]$/)
  })

  it('formatDate 无效输入返回原字符串', () => {
    expect(formatDate('invalid')).toBe('invalid')
  })

  it('formatTimestamp 返回 YYYY-MM-DD HH:MM:SS', () => {
    expect(formatTimestamp(fixedDate)).toBe('2026-07-18 10:30:45')
  })

  it('formatCompactTimestamp 返回 YYYYMMDD_HHMMSS', () => {
    expect(formatCompactTimestamp(fixedDate)).toBe('20260718_103045')
  })

  it('formatCompactTimestamp 默认当前时间', () => {
    const result = formatCompactTimestamp()
    expect(result).toMatch(/^\d{8}_\d{6}$/)
  })

  it('formatDateOrDash 空值返回兜底', () => {
    expect(formatDateOrDash(null)).toBe('—')
    expect(formatDateOrDash(undefined)).toBe('—')
    expect(formatDateOrDash('')).toBe('—')
  })

  it('formatDateOrDash 自定义兜底', () => {
    expect(formatDateOrDash(null, '无')).toBe('无')
  })

  it('formatDateOrDash 有效日期正常格式化', () => {
    // formatDateOrDash 委托 formatDateTime（toLocaleString('zh-CN')），格式如 '2026/7/18 10:30:45'
    expect(formatDateOrDash(fixedDate)).toContain('2026')
    expect(formatDateOrDash(fixedDate)).toContain('10:30:45')
  })

  it('formatDuration 短时长 m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(95)).toBe('1:35')
  })

  it('formatDuration 超过 1 小时 H:MM:SS', () => {
    expect(formatDuration(3661)).toBe('1:01:01')
  })

  it('formatDuration withDecimal mm:ss.s', () => {
    expect(formatDuration(95, { withDecimal: true })).toBe('01:35.0')
  })

  it('formatDuration 健壮性：NaN/负数视为 0', () => {
    expect(formatDuration(NaN)).toBe('0:00')
    expect(formatDuration(-1)).toBe('0:00')
    expect(formatDuration(Infinity)).toBe('0:00')
  })
})

describe('path utils', () => {
  it('getDirName 兼容 \\ 与 /', () => {
    expect(getDirName('C:\\foo\\bar.txt')).toBe('C:\\foo')
    expect(getDirName('C:/foo/bar.txt')).toBe('C:/foo')
    expect(getDirName('bar.txt')).toBe('')
  })

  it('joinPath 不重复添加分隔符', () => {
    expect(joinPath('C:\\foo', 'bar.txt')).toBe('C:\\foo\\bar.txt')
    expect(joinPath('C:\\foo\\', 'bar.txt')).toBe('C:\\foo\\bar.txt')
    expect(joinPath('C:/foo', 'bar.txt')).toBe('C:/foo/bar.txt')
    expect(joinPath('', 'bar.txt')).toBe('bar.txt')
  })

  it('getExtName 返回小写扩展名', () => {
    expect(getExtName('photo.JPG')).toBe('.jpg')
    expect(getExtName('photo.jpg')).toBe('.jpg')
    expect(getExtName('photo')).toBe('')
    expect(getExtName('.gitignore')).toBe('')
  })

  it('getBaseName 提取文件名', () => {
    expect(getBaseName('C:\\foo\\bar.txt')).toBe('bar.txt')
    expect(getBaseName('C:/foo/bar.txt')).toBe('bar.txt')
    expect(getBaseName('bar.txt')).toBe('bar.txt')
  })
})
