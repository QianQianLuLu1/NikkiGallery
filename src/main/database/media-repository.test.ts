import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * MediaRepository 单元测试
 *
 * 策略：用 vi.mock 模拟 better-sqlite3，避免 native 模块编译依赖（Node ABI 兼容问题）
 * mock 内部实现一个简化的内存 SQL 引擎，覆盖 MediaRepository 实际使用的 SQL 模式：
 *   - CREATE TABLE
 *   - INSERT INTO ... VALUES (?, ?, ...)
 *   - UPDATE ... SET ... WHERE ... [AND ...] [IN (...)]
 *   - DELETE FROM ... WHERE ... [AND ...] [IN (...)]
 *   - SELECT cols FROM ... WHERE ... [GROUP BY] [ORDER BY] [LIMIT] [OFFSET]
 *   - COUNT(*) / MAX(col) / MIN(col) / SUM(col) 聚合
 *
 * 注意：mock 不解析完整 SQL 语法，仅识别 MediaRepository 中实际出现的 SQL 模板
 */

// ============================================================================
// Mock 实现：内存 SQLite（仅覆盖 MediaRepository 用到的 SQL 模式）
// ============================================================================

interface MockRow {
  [key: string]: unknown
}

interface MockTable {
  name: string
  columns: string[]
  rows: MockRow[]
  autoIncrement: number
}

interface PreparedStatement {
  sql: string
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint }
  get: (...params: unknown[]) => MockRow | undefined
  all: (...params: unknown[]) => MockRow[]
}

class MockDatabase {
  private tables = new Map<string, MockTable>()
  private autoIncCounters = new Map<string, number>()

  constructor(_path: string) {}

  pragma(_str: string): void {
    // 忽略所有 PRAGMA
  }

  exec(sql: string): void {
    // 多语句：按 ; 拆分后逐条处理，避免贪婪正则跨语句误匹配
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s)
    for (const stmt of statements) {
      this.execSingle(stmt)
    }
  }

  private execSingle(sql: string): void {
    // 解析 CREATE TABLE
    const createMatch = sql.match(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]+)\)$/i
    )
    if (createMatch) {
      const [, name, colsDef] = createMatch
      // 过滤掉注释行和约束关键字（FOREIGN KEY / PRIMARY KEY 等内联约束）
      const lines = colsDef.split('\n').map((l) => l.replace(/--.*/, '').trim())
      const joined = lines.join(' ')
      const cleanColumns = joined
        .split(/,(?![^()]*\))/) // 不分割括号内的逗号
        .map((c) => c.trim().split(/\s+/)[0].replace(/[`,]/g, ''))
        .filter(
          (c) =>
            c &&
            !c.startsWith('--') &&
            c.toUpperCase() !== 'FOREIGN' &&
            c.toUpperCase() !== 'PRIMARY' &&
            c.toUpperCase() !== 'UNIQUE' &&
            c.toUpperCase() !== 'CHECK'
        )
      this.tables.set(name, {
        name,
        columns: cleanColumns,
        rows: [],
        autoIncrement: 0
      })
      this.autoIncCounters.set(name, 0)
      return
    }
    // 其他 exec（如 CREATE INDEX、DROP TABLE 等）忽略
  }

  prepare(sql: string): PreparedStatement {
    return {
      sql,
      run: (...params: unknown[]) => this.executeRun(sql, params),
      get: (...params: unknown[]) => this.executeGet(sql, params),
      all: (...params: unknown[]) => this.executeAll(sql, params)
    }
  }

  transaction<T>(fn: () => T): () => T
  transaction<T, A extends unknown[]>(fn: (...args: A) => T): (...args: A) => T
  transaction(fn: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown {
    // 简化的事务：直接执行 fn（不真正实现回滚）
    // 注意：mock 不支持真实回滚；测试用例"事务中抛错回滚"需要单独处理
    return (...args: unknown[]) => fn(...args)
  }

  /**
   * 按逗号拆分（不分割括号内的逗号），用于 VALUES / SET 子句
   * 支持 datetime('now', 'localtime') 等带括号的表达式
   */
  private splitOnComma(s: string): string[] {
    const result: string[] = []
    let depth = 0
    let current = ''
    for (const ch of s) {
      if (ch === '(') {
        depth++
        current += ch
      } else if (ch === ')') {
        depth--
        current += ch
      } else if (ch === ',' && depth === 0) {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    if (current.trim()) result.push(current.trim())
    return result
  }

  /**
   * 解析 SQL 值表达式：? / NULL / 数字 / '字符串' / datetime('now')
   * 返回 { value, isParam } —— isParam=true 表示占用了 params 中一个位置
   */
  private parseValueExpr(
    expr: string,
    params: unknown[],
    paramIdx: number
  ): { value: unknown; isParam: boolean } {
    const e = expr.trim()
    if (e === '?') {
      return { value: params[paramIdx], isParam: true }
    }
    if (e.toUpperCase() === 'NULL') {
      return { value: null, isParam: false }
    }
    if (/^-?\d+(\.\d+)?$/.test(e)) {
      return { value: parseFloat(e), isParam: false }
    }
    // '字符串字面量'
    const strMatch = e.match(/^'([^']*)'$/)
    if (strMatch) {
      return { value: strMatch[1], isParam: false }
    }
    // "字符串字面量"（双引号）
    const strMatch2 = e.match(/^"([^"]*)"$/)
    if (strMatch2) {
      return { value: strMatch2[1], isParam: false }
    }
    // datetime('now') / datetime("now") / datetime('now', 'localtime')
    const dtMatch = e.match(/datetime\s*\(\s*['"]now['"]\s*(?:,\s*['"][^'"]*['"]\s*)?\s*\)/i)
    if (dtMatch) {
      // 返回 ISO 风格的本地时间字符串（SQLite datetime('now') 返回 UTC）
      const now = new Date()
      const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000)
      const str = utc.toISOString().replace('T', ' ').substring(0, 19)
      return { value: str, isParam: false }
    }
    // 其他未识别表达式（如 COALESCE、CASE 等）：置 null（不影响测试断言）
    return { value: null, isParam: false }
  }

  private executeRun(
    sql: string,
    params: unknown[]
  ): { changes: number; lastInsertRowid: number | bigint } {
    // INSERT INTO table (cols) VALUES (?, ?, ?, datetime('now'))
    // 用贪心正则捕获整段 VALUES 内容，再用 splitOnComma 处理嵌套括号
    const insertMatch = sql.match(
      /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([\s\S]+)\)\s*$/i
    )
    if (insertMatch) {
      const [, tableName, colsList, valuesList] = insertMatch
      const cols = colsList.split(',').map((c) => c.trim())
      const valueExprs = this.splitOnComma(valuesList)
      const table = this.tables.get(tableName)
      if (!table) throw new Error(`Table ${tableName} not found`)

      const row: MockRow = {}
      let paramIdx = 0
      cols.forEach((col, i) => {
        const expr = valueExprs[i] || '?'
        const { value, isParam } = this.parseValueExpr(expr, params, paramIdx)
        if (isParam) paramIdx++
        row[col] = value
      })

      // 处理 AUTOINCREMENT（id 列）
      if (cols.includes('id') && (row.id === undefined || row.id === null)) {
        const counter = (this.autoIncCounters.get(tableName) || 0) + 1
        this.autoIncCounters.set(tableName, counter)
        row.id = counter
      } else if (!cols.includes('id')) {
        const counter = (this.autoIncCounters.get(tableName) || 0) + 1
        this.autoIncCounters.set(tableName, counter)
        row.id = counter
      }

      table.rows.push(row)
      return {
        changes: 1,
        lastInsertRowid: row.id as number
      }
    }

    // UPDATE table SET col1 = ?, col2 = 'literal', col3 = datetime('now') WHERE ...
    const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+))?$/i)
    if (updateMatch) {
      const [, tableName, setClause, whereClause] = updateMatch
      const table = this.tables.get(tableName)
      if (!table) throw new Error(`Table ${tableName} not found`)

      // 拆分 SET 子句（不分割括号内逗号，如 datetime('now', 'localtime')）
      const setPairs = this.splitOnComma(setClause)
      let paramIdx = 0
      const setValues: Array<{ col: string; value: unknown }> = []
      for (const pair of setPairs) {
        const equalIdx = pair.indexOf('=')
        if (equalIdx === -1) continue
        const col = pair.substring(0, equalIdx).trim()
        const valueExpr = pair.substring(equalIdx + 1).trim()
        const { value, isParam } = this.parseValueExpr(valueExpr, params, paramIdx)
        if (isParam) paramIdx++
        setValues.push({ col, value })
      }

      // 过滤符合条件的行（WHERE 用 SET 之后剩余的参数）
      const whereParams = params.slice(paramIdx)
      const matchingRows = whereClause
        ? table.rows.filter((row) => this.matchWhere(row, whereClause, whereParams))
        : table.rows

      let changes = 0
      for (const row of matchingRows) {
        for (const { col, value } of setValues) {
          row[col] = value
        }
        changes++
      }
      return { changes, lastInsertRowid: 0 }
    }

    // DELETE FROM table WHERE ...
    const deleteMatch = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+([\s\S]+))?$/i)
    if (deleteMatch) {
      const [, tableName, whereClause] = deleteMatch
      const table = this.tables.get(tableName)
      if (!table) throw new Error(`Table ${tableName} not found`)

      if (!whereClause) {
        const changes = table.rows.length
        table.rows = []
        return { changes, lastInsertRowid: 0 }
      }

      const initialLength = table.rows.length
      table.rows = table.rows.filter((row) => !this.matchWhere(row, whereClause, params))
      const changes = initialLength - table.rows.length
      return { changes, lastInsertRowid: 0 }
    }

    return { changes: 0, lastInsertRowid: 0 }
  }

  private executeGet(sql: string, params: unknown[]): MockRow | undefined {
    const rows = this.executeAll(sql, params)
    return rows[0]
  }

  private executeAll(sql: string, params: unknown[]): MockRow[] {
    // SELECT cols FROM table [WHERE ...] [GROUP BY col] [ORDER BY col ASC/DESC, ...] [LIMIT n|?] [OFFSET n|?]
    const selectMatch = sql.match(
      /SELECT\s+([\s\S]+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+GROUP\s+BY\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([\s\S]+?))?(?:\s+LIMIT\s+(\d+|\?)(?:\s+OFFSET\s+(\d+|\?))?)?$/i
    )
    if (!selectMatch) return []

    const [, selectClause, tableName, whereClause, groupByClause, orderByClause, limit, offset] =
      selectMatch
    const table = this.tables.get(tableName)
    if (!table) throw new Error(`Table ${tableName} not found`)

    // 处理参数化 LIMIT ? 和 OFFSET ? —— 从 params 末尾弹出（WHERE 参数在前）
    // SQL 中 LIMIT 在 OFFSET 之前，故 params 顺序为 [...whereParams, limit, offset]
    // 先弹 offset（最末），再弹 limit
    let limitNum: number | undefined
    let offsetNum: number = 0
    if (limit !== undefined) {
      if (offset === '?') {
        const v = params.pop()
        offsetNum = typeof v === 'number' ? v : parseInt(String(v), 10)
      } else if (offset !== undefined) {
        offsetNum = parseInt(offset, 10)
      }
      if (limit === '?') {
        const v = params.pop()
        limitNum = typeof v === 'number' ? v : parseInt(String(v), 10)
      } else {
        limitNum = parseInt(limit, 10)
      }
      // SQLite 行为：负 OFFSET 视为 0；负 LIMIT 视为无上限
      if (offsetNum < 0) offsetNum = 0
      if (limitNum !== undefined && limitNum < 0) limitNum = undefined
    }

    // 过滤
    let rows = whereClause
      ? table.rows.filter((row) => this.matchWhere(row, whereClause, params))
      : [...table.rows]

    // 标记是否已聚合（聚合结果 aggRow 已包含正确字段，跳过后续投影）
    let isAggregated = false

    // GROUP BY 聚合
    if (groupByClause) {
      const groupCol = groupByClause.trim().split(/\s+/)[0]
      const groups = new Map<string, MockRow[]>()
      for (const row of rows) {
        const key = String(row[groupCol])
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(row)
      }
      // 检查是否是聚合查询
      const hasCount = /COUNT\s*\(\s*\*\s*\)/i.test(selectClause)
      const hasMax = /MAX\s*\(\s*(\w+)\s*\)/i.test(selectClause)
      const hasMin = /MIN\s*\(\s*(\w+)\s*\)/i.test(selectClause)
      const hasSum = /SUM\s*\(\s*(?:CASE[\s\S]+?ELSE\s+0\s+END|[\w.]+)\s*\)/i.test(selectClause)

      if (hasCount || hasMax || hasMin || hasSum) {
        const aggregatedRows: MockRow[] = []
        for (const [, groupRows] of groups) {
          const aggRow: MockRow = {}
          // 解析 select 中的字段
          const selectItems = selectClause.split(',').map((s) => s.trim())
          for (const item of selectItems) {
            const countMatch = item.match(/COUNT\s*\(\s*\*\s*\)\s*(?:as|AS)\s+(\w+)/i)
            const maxMatch = item.match(/MAX\s*\(\s*(\w+)\s*\)\s*(?:as|AS)\s+(\w+)/i)
            const minMatch = item.match(/MIN\s*\(\s*(\w+)\s*\)\s*(?:as|AS)\s+(\w+)/i)
            // SUM(CASE WHEN file_type='image' THEN 1 ELSE 0 END) as image_count
            const sumCaseMatch = item.match(
              /SUM\s*\(\s*CASE\s+WHEN\s+(\w+)\s*=\s*'(\w+)'\s+THEN\s+1\s+ELSE\s+0\s+END\s*\)\s*(?:as|AS)\s+(\w+)/i
            )
            const sumSimpleMatch = item.match(
              /COALESCE\s*\(\s*SUM\s*\(\s*(\w+)\s*\)\s*,\s*0\s*\)\s*(?:as|AS)\s+(\w+)/i
            )
            const plainColMatch = item.match(/^(\w+)(?:\s*(?:as|AS)\s+(\w+))?$/i)

            if (countMatch) {
              aggRow[countMatch[1]] = groupRows.length
            } else if (maxMatch) {
              const col = maxMatch[1]
              const alias = maxMatch[2]
              const values = groupRows.map((r) => r[col] as number).filter((v) => v !== null)
              aggRow[alias] = values.length > 0 ? values.reduce((a, b) => (a > b ? a : b)) : null
            } else if (minMatch) {
              const col = minMatch[1]
              const alias = minMatch[2]
              const values = groupRows.map((r) => r[col] as number).filter((v) => v !== null)
              aggRow[alias] = values.length > 0 ? values.reduce((a, b) => (a < b ? a : b)) : null
            } else if (sumCaseMatch) {
              const col = sumCaseMatch[1]
              const val = sumCaseMatch[2]
              const alias = sumCaseMatch[3]
              aggRow[alias] = groupRows.filter((r) => String(r[col]) === val).length
            } else if (sumSimpleMatch) {
              const col = sumSimpleMatch[1]
              const alias = sumSimpleMatch[2]
              const sum = groupRows.reduce((acc, r) => acc + ((r[col] as number) || 0), 0)
              aggRow[alias] = sum
            } else if (plainColMatch) {
              const col = plainColMatch[1]
              const alias = plainColMatch[2] || col
              aggRow[alias] = groupRows[0][col]
            }
          }
          aggregatedRows.push(aggRow)
        }
        rows = aggregatedRows
        isAggregated = true
      }
    } else {
      // 聚合但无 GROUP BY：MAX(col) as alias / MIN(col) as alias / COUNT(*) as count / 多聚合
      const maxOnlyMatch = selectClause.match(/^MAX\s*\(\s*(\w+)\s*\)\s*(?:as|AS)\s+(\w+)$/i)
      if (maxOnlyMatch) {
        const col = maxOnlyMatch[1]
        const alias = maxOnlyMatch[2]
        const values = rows
          .map((r) => r[col] as number)
          .filter((v) => v !== null && v !== undefined)
        return [{ [alias]: values.length > 0 ? values.reduce((a, b) => (a > b ? a : b)) : null }]
      }
      const minOnlyMatch = selectClause.match(/^MIN\s*\(\s*(\w+)\s*\)\s*(?:as|AS)\s+(\w+)$/i)
      if (minOnlyMatch) {
        const col = minOnlyMatch[1]
        const alias = minOnlyMatch[2]
        const values = rows
          .map((r) => r[col] as number)
          .filter((v) => v !== null && v !== undefined)
        return [{ [alias]: values.length > 0 ? values.reduce((a, b) => (a < b ? a : b)) : null }]
      }
      const countOnlyMatch = selectClause.match(/^COUNT\s*\(\s*\*\s*\)\s*(?:as|AS)\s+(\w+)$/i)
      if (countOnlyMatch) {
        const alias = countOnlyMatch[1]
        return [{ [alias]: rows.length }]
      }
      const multiAggMatch = selectClause.match(
        /COUNT\s*\(\s*\*\s*\)\s*(?:as|AS)\s+(\w+)\s*,\s*SUM\s*\(\s*CASE[\s\S]+?ELSE\s+0\s+END\s*\)\s*(?:as|AS)\s+(\w+)\s*,\s*SUM\s*\(\s*CASE[\s\S]+?ELSE\s+0\s+END\s*\)\s*(?:as|AS)\s+(\w+)\s*,\s*COALESCE\s*\(\s*SUM[\s\S]+?\s*,\s*0\s*\)\s*(?:as|AS)\s+(\w+)\s*,\s*MIN\s*\(\s*(\w+)\s*\)\s*(?:as|AS)\s+(\w+)\s*,\s*MAX\s*\(\s*(\w+)\s*\)\s*(?:as|AS)\s+(\w+)/i
      )
      if (multiAggMatch) {
        const totalCount = rows.length
        const imageCount = rows.filter((r) => r.file_type === 'image').length
        const videoCount = rows.filter((r) => r.file_type === 'video').length
        const totalSize = rows.reduce((acc, r) => acc + ((r.file_size as number) || 0), 0)
        const earliestTime =
          rows
            .map((r) => r.created_at as string)
            .filter((v) => v !== null && v !== undefined)
            .sort()[0] || null
        const latestTime =
          rows
            .map((r) => r.created_at as string)
            .filter((v) => v !== null && v !== undefined)
            .sort()
            .reverse()[0] || null
        return [
          {
            total_count: totalCount,
            image_count: imageCount,
            video_count: videoCount,
            total_size: totalSize,
            earliest_time: earliestTime,
            latest_time: latestTime
          }
        ]
      }
    }

    // ORDER BY —— 支持多列（如 "cnt DESC, latest_created DESC"）
    if (orderByClause) {
      const specs = orderByClause.split(',').map((s) => s.trim())
      // 从最后一列往前排序（稳定排序保证多列优先级正确）
      for (let i = specs.length - 1; i >= 0; i--) {
        const parts = specs[i].split(/\s+/)
        const sortCol = parts[0]
        const direction = (parts[1] || 'ASC').toUpperCase()
        rows.sort((a, b) => {
          const av = a[sortCol] as string | number | null | undefined
          const bv = b[sortCol] as string | number | null | undefined
          if (av === null || av === undefined) return direction === 'ASC' ? -1 : 1
          if (bv === null || bv === undefined) return direction === 'ASC' ? 1 : -1
          if (av < bv) return direction === 'ASC' ? -1 : 1
          if (av > bv) return direction === 'ASC' ? 1 : -1
          return 0
        })
      }
    }

    // LIMIT + OFFSET
    if (limitNum !== undefined) {
      rows = rows.slice(offsetNum, offsetNum + limitNum)
    }

    // 聚合查询直接返回（aggRow 已包含正确 alias 字段，不做投影）
    if (isAggregated) {
      return rows
    }

    // 字段投影（仅返回 SELECT 中指定的列，使用 alias）
    const selectItems = selectClause.split(',').map((s) => s.trim())
    const projected = rows.map((row) => {
      const out: MockRow = {}
      for (const item of selectItems) {
        // 简单列名 / 列名 AS alias
        const m = item.match(/^(\w+)(?:\s+(?:as|AS)\s+(\w+))?$/)
        if (m) {
          const col = m[1]
          const alias = m[2] || col
          if (row[col] !== undefined) {
            out[alias] = row[col]
          }
        }
        // COUNT(*) as count 已在聚合处理
        // 其他情况忽略（不在 SELECT 中的列）
      }
      return out
    })

    return projected
  }

  /**
   * 简化的 WHERE 匹配器
   * 支持：col = ?、col IS NULL、col IS NOT NULL、col != ''、col > ?、col IN (?, ?, ?)
   * 支持 AND 连接
   */
  private matchWhere(row: MockRow, whereClause: string, params: unknown[]): boolean {
    // 标准化：去除 'WHERE' 前缀（如有）
    const clause = whereClause.trim().replace(/^WHERE\s+/i, '')

    // 拆分 AND（不在括号内）
    const conditions = clause.split(/\s+AND\s+/i)

    let paramIdx = 0
    for (const cond of conditions) {
      const trimmed = cond.trim()
      // col = ?
      if (/^\w+\s*=\s*\?$/.test(trimmed)) {
        const col = trimmed.split(/\s*=\s*/)[0].trim()
        if (row[col] !== params[paramIdx++]) return false
      }
      // col = 'literal'
      else if (/^\w+\s*=\s*'[^']*'$/.test(trimmed)) {
        const m = trimmed.match(/^(\w+)\s*=\s*'([^']*)'$/)
        if (m && row[m[1]] !== m[2]) return false
      }
      // col IN (?, ?, ...)
      else if (/^\w+\s+IN\s*\(([^)]+)\)$/i.test(trimmed)) {
        const m = trimmed.match(/^(\w+)\s+IN\s*\(([^)]+)\)$/i)
        if (!m) return false
        const col = m[1]
        const placeholders = m[2].split(',').map((s) => s.trim())
        const values = placeholders.map(() => params[paramIdx++])
        if (!values.includes(row[col])) return false
      }
      // col IS NULL
      else if (/^\w+\s+IS\s+NULL$/i.test(trimmed)) {
        const col = trimmed.split(/\s+/)[0]
        if (row[col] !== null && row[col] !== undefined) return false
      }
      // col IS NOT NULL
      else if (/^\w+\s+IS\s+NOT\s+NULL$/i.test(trimmed)) {
        const col = trimmed.split(/\s+/)[0]
        if (row[col] === null || row[col] === undefined) return false
      }
      // col != '' (TEXT NOT NULL DEFAULT '其他')
      else if (/^\w+\s*!=\s*''$/.test(trimmed)) {
        const col = trimmed.split(/!=/)[0].trim()
        if (row[col] === '') return false
      }
      // col = 0 或 col = 1 (数值字面量)
      else if (/^\w+\s*=\s*\d+$/.test(trimmed)) {
        const m = trimmed.match(/^(\w+)\s*=\s*(\d+)$/)
        if (m && row[m[1]] !== parseInt(m[2], 10)) return false
      }
      // 其他未识别的条件：保守返回 true（避免误判）
      // console.warn('未识别的 WHERE 条件:', trimmed)
    }
    return true
  }
}

// 应用 mock
vi.mock('better-sqlite3', () => ({
  default: MockDatabase
}))

// ============================================================================
// 测试用例
// ============================================================================

import { MediaRepository } from './media-repository'

/** 创建内存数据库并初始化 schema */
function createInMemoryDb(): MockDatabase {
  const db = new MockDatabase(':memory:')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE media_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_ext TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      duration REAL,
      created_at TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      source_path TEXT NOT NULL,
      thumbnail TEXT,
      tags TEXT DEFAULT '[]',
      category_id INTEGER,
      rating INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      indexed_at TEXT NOT NULL,
      scene_category TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      scene_time TEXT DEFAULT 'unknown',
      outfit TEXT DEFAULT '',
      is_missing INTEGER NOT NULL DEFAULT 0,
      missing_count INTEGER NOT NULL DEFAULT 0,
      phash TEXT,
      account_uid TEXT NOT NULL DEFAULT 'default',
      album_type TEXT NOT NULL DEFAULT '其他',
      is_duplicate INTEGER NOT NULL DEFAULT 0,
      original_id INTEGER,
      media_source TEXT NOT NULL DEFAULT 'game'
    );

    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT,
      color TEXT,
      sort_order INTEGER DEFAULT 0,
      parent_id INTEGER,
      is_system INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE character_profiles (
      uid TEXT PRIMARY KEY,
      nickname TEXT NOT NULL DEFAULT '',
      avatar TEXT,
      created_at TEXT NOT NULL,
      last_active_at TEXT
    );

    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  return db
}

interface MediaOverrides {
  id?: number
  file_path?: string
  file_name?: string
  file_type?: string
  file_ext?: string
  file_size?: number
  width?: number | null
  height?: number | null
  duration?: number | null
  created_at?: string
  modified_at?: string
  source_path?: string
  thumbnail?: string | null
  tags?: string
  category_id?: number | null
  rating?: number
  is_favorite?: number
  notes?: string
  indexed_at?: string
  scene_category?: string | null
  is_deleted?: number
  deleted_at?: string | null
  scene_time?: string
  outfit?: string
  is_missing?: number
  missing_count?: number
  phash?: string | null
  account_uid?: string
  album_type?: string
  is_duplicate?: number
  original_id?: number | null
  media_source?: string
}

function insertMedia(db: MockDatabase, overrides: MediaOverrides = {}): number {
  const v = {
    file_path: '/test/photo.jpg',
    file_name: 'photo.jpg',
    file_type: 'image',
    file_ext: '.jpg',
    file_size: 1024,
    width: 1920,
    height: 1080,
    duration: null,
    created_at: '2024-01-01 10:00:00',
    modified_at: '2024-01-01 10:00:00',
    source_path: '/source',
    thumbnail: null,
    tags: '[]',
    category_id: null,
    rating: 0,
    is_favorite: 0,
    notes: '',
    indexed_at: '2024-01-01 10:00:00',
    scene_category: null,
    is_deleted: 0,
    deleted_at: null,
    scene_time: 'unknown',
    outfit: '',
    is_missing: 0,
    missing_count: 0,
    phash: null,
    account_uid: 'default',
    album_type: '其他',
    is_duplicate: 0,
    original_id: null,
    media_source: 'game',
    ...overrides
  }
  const cols = [
    'file_path',
    'file_name',
    'file_type',
    'file_ext',
    'file_size',
    'width',
    'height',
    'duration',
    'created_at',
    'modified_at',
    'source_path',
    'thumbnail',
    'tags',
    'category_id',
    'rating',
    'is_favorite',
    'notes',
    'indexed_at',
    'scene_category',
    'is_deleted',
    'deleted_at',
    'scene_time',
    'outfit',
    'is_missing',
    'missing_count',
    'phash',
    'account_uid',
    'album_type',
    'is_duplicate',
    'original_id',
    'media_source'
  ]
  const placeholders = cols.map(() => '?').join(', ')
  const values = cols.map((c) => v[c as keyof MediaOverrides])
  const result = db
    .prepare(`INSERT INTO media_files (${cols.join(', ')}) VALUES (${placeholders})`)
    .run(...values)
  return Number(result.lastInsertRowid)
}

function insertCategory(
  db: MockDatabase,
  overrides: Partial<{
    name: string
    icon: string
    color: string
    sort_order: number
    parent_id: number | null
    is_system: number
  }> = {}
): number {
  const v = {
    name: '测试分类',
    icon: 'icon',
    color: '#000000',
    sort_order: 1,
    parent_id: null,
    is_system: 0,
    ...overrides
  }
  const result = db
    .prepare(
      `INSERT INTO categories (name, icon, color, sort_order, parent_id, is_system, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(v.name, v.icon, v.color, v.sort_order, v.parent_id, v.is_system)
  return Number(result.lastInsertRowid)
}

function insertProfile(
  db: MockDatabase,
  overrides: Partial<{
    uid: string
    nickname: string
    avatar: string | null
    created_at: string
    last_active_at: string | null
  }> = {}
): string {
  const v = {
    uid: 'user-001',
    nickname: '角色1',
    avatar: null,
    created_at: '2024-01-01 10:00:00',
    last_active_at: null,
    ...overrides
  }
  db.prepare(
    `INSERT INTO character_profiles (uid, nickname, avatar, created_at, last_active_at) VALUES (?, ?, ?, ?, ?)`
  ).run(v.uid, v.nickname, v.avatar, v.created_at, v.last_active_at)
  return v.uid
}

describe('MediaRepository', () => {
  let db: MockDatabase
  let repo: MediaRepository

  beforeEach(() => {
    db = createInMemoryDb()
    repo = new MediaRepository(db as unknown as import('better-sqlite3').Database)
  })

  // ==========================================================================
  // 单行更新
  // ==========================================================================
  describe('单行更新', () => {
    it('updateRating 正常更新评分', async () => {
      const id = insertMedia(db, { rating: 0 })
      await repo.updateRating(id, 5)
      const row = db.prepare('SELECT rating FROM media_files WHERE id = ?').get(id) as {
        rating: number
      }
      expect(row.rating).toBe(5)
    })

    it('updateRating mediaId 不存在时不抛错', async () => {
      await expect(repo.updateRating(99999, 5)).resolves.toBeUndefined()
    })

    it('updateFavorite true → 1', async () => {
      const id = insertMedia(db, { is_favorite: 0 })
      await repo.updateFavorite(id, true)
      const row = db.prepare('SELECT is_favorite FROM media_files WHERE id = ?').get(id) as {
        is_favorite: number
      }
      expect(row.is_favorite).toBe(1)
    })

    it('updateFavorite false → 0', async () => {
      const id = insertMedia(db, { is_favorite: 1 })
      await repo.updateFavorite(id, false)
      const row = db.prepare('SELECT is_favorite FROM media_files WHERE id = ?').get(id) as {
        is_favorite: number
      }
      expect(row.is_favorite).toBe(0)
    })

    it('updateTags 空数组', async () => {
      const id = insertMedia(db)
      await repo.updateTags(id, [])
      const row = db.prepare('SELECT tags FROM media_files WHERE id = ?').get(id) as {
        tags: string
      }
      expect(JSON.parse(row.tags)).toEqual([])
    })

    it('updateTags 单元素与多元素', async () => {
      const id = insertMedia(db)
      await repo.updateTags(id, ['风景'])
      expect(
        (db.prepare('SELECT tags FROM media_files WHERE id = ?').get(id) as { tags: string }).tags
      ).toBe('["风景"]')

      await repo.updateTags(id, ['风景', '人物', '夜景'])
      expect(
        (db.prepare('SELECT tags FROM media_files WHERE id = ?').get(id) as { tags: string }).tags
      ).toBe('["风景","人物","夜景"]')
    })

    it('updateTags 含中文/特殊字符', async () => {
      const id = insertMedia(db)
      await repo.updateTags(id, ['暖暖"套装"', '<script>'])
      const row = db.prepare('SELECT tags FROM media_files WHERE id = ?').get(id) as {
        tags: string
      }
      const parsed = JSON.parse(row.tags)
      expect(parsed).toEqual(['暖暖"套装"', '<script>'])
    })

    it('updateNotes 空字符串与长文本', async () => {
      const id = insertMedia(db)
      await repo.updateNotes(id, '')
      expect(
        (db.prepare('SELECT notes FROM media_files WHERE id = ?').get(id) as { notes: string })
          .notes
      ).toBe('')

      const longText = 'a'.repeat(10000)
      await repo.updateNotes(id, longText)
      expect(
        (db.prepare('SELECT notes FROM media_files WHERE id = ?').get(id) as { notes: string })
          .notes
      ).toBe(longText)
    })

    it('updateCategory null 取消分类', async () => {
      const catId = insertCategory(db)
      const id = insertMedia(db, { category_id: catId })
      await repo.updateCategory(id, null)
      const row = db.prepare('SELECT category_id FROM media_files WHERE id = ?').get(id) as {
        category_id: number | null
      }
      expect(row.category_id).toBeNull()
    })

    it('updateCategory 正常赋值', async () => {
      const catId = insertCategory(db)
      const id = insertMedia(db)
      await repo.updateCategory(id, catId)
      const row = db.prepare('SELECT category_id FROM media_files WHERE id = ?').get(id) as {
        category_id: number | null
      }
      expect(row.category_id).toBe(catId)
    })

    it('updateOutfit 空字符串与套装名', async () => {
      const id = insertMedia(db, { outfit: '初始套装' })
      await repo.updateOutfit(id, '')
      expect(
        (db.prepare('SELECT outfit FROM media_files WHERE id = ?').get(id) as { outfit: string })
          .outfit
      ).toBe('')

      await repo.updateOutfit(id, '星海幻想')
      expect(
        (db.prepare('SELECT outfit FROM media_files WHERE id = ?').get(id) as { outfit: string })
          .outfit
      ).toBe('星海幻想')
    })

    it('updateSceneTime 更新场景时段', async () => {
      const id = insertMedia(db, { scene_time: 'unknown' })
      await repo.updateSceneTime(id, 'day')
      expect(
        (
          db.prepare('SELECT scene_time FROM media_files WHERE id = ?').get(id) as {
            scene_time: string
          }
        ).scene_time
      ).toBe('day')
    })
  })

  // ==========================================================================
  // 批量删除/恢复
  // ==========================================================================
  describe('批量删除/恢复', () => {
    it('hardDelete 删除后查不到', async () => {
      const id = insertMedia(db)
      await repo.hardDelete(id)
      const row = db.prepare('SELECT id FROM media_files WHERE id = ?').get(id)
      expect(row).toBeUndefined()
    })

    it('softDeleteBatch 空数组 no-op', async () => {
      await expect(repo.softDeleteBatch([])).resolves.toBeUndefined()
    })

    it('softDeleteBatch 单条软删除', async () => {
      const id = insertMedia(db, { is_deleted: 0 })
      await repo.softDeleteBatch([id])
      const row = db.prepare('SELECT is_deleted, deleted_at FROM media_files WHERE id = ?').get(id)
      expect(row?.is_deleted).toBe(1)
      expect(row?.deleted_at).not.toBeNull()
    })

    it('softDeleteBatch 多条批量软删除', async () => {
      const id1 = insertMedia(db, { file_path: '/test/1.jpg' })
      const id2 = insertMedia(db, { file_path: '/test/2.jpg' })
      const id3 = insertMedia(db, { file_path: '/test/3.jpg' })
      await repo.softDeleteBatch([id1, id2, id3])
      const rows = db
        .prepare('SELECT id FROM media_files WHERE is_deleted = 1 ORDER BY id')
        .all() as Array<{ id: number }>
      expect(rows.map((r) => r.id)).toEqual([id1, id2, id3])
    })

    it('softDeleteBatch 已软删除 id 幂等', async () => {
      const id = insertMedia(db)
      await repo.softDeleteBatch([id])
      const firstDeletedAt = (
        db.prepare('SELECT deleted_at FROM media_files WHERE id = ?').get(id) as {
          deleted_at: string
        }
      ).deleted_at

      await repo.softDeleteBatch([id])
      const secondDeletedAt = (
        db.prepare('SELECT deleted_at FROM media_files WHERE id = ?').get(id) as {
          deleted_at: string
        }
      ).deleted_at
      expect(secondDeletedAt).toBe(firstDeletedAt)
    })

    it('restoreBatch 空数组 no-op', async () => {
      await expect(repo.restoreBatch([])).resolves.toBeUndefined()
    })

    it('restoreBatch 单条恢复', async () => {
      const id = insertMedia(db, { is_deleted: 1, deleted_at: '2024-01-01 10:00:00' })
      await repo.restoreBatch([id])
      const row = db.prepare('SELECT is_deleted, deleted_at FROM media_files WHERE id = ?').get(id)
      expect(row?.is_deleted).toBe(0)
      expect(row?.deleted_at).toBeNull()
    })

    it('restoreBatch 多条批量恢复', async () => {
      const id1 = insertMedia(db, { file_path: '/t/1.jpg', is_deleted: 1, deleted_at: '2024' })
      const id2 = insertMedia(db, { file_path: '/t/2.jpg', is_deleted: 1, deleted_at: '2024' })
      await repo.restoreBatch([id1, id2])
      const rows = db
        .prepare('SELECT COUNT(*) as count FROM media_files WHERE is_deleted = 1')
        .get() as { count: number }
      expect(rows.count).toBe(0)
    })

    it('restoreBatch 非软删除 id 幂等', async () => {
      const id = insertMedia(db, { is_deleted: 0 })
      await expect(repo.restoreBatch([id])).resolves.toBeUndefined()
      const row = db.prepare('SELECT is_deleted FROM media_files WHERE id = ?').get(id) as {
        is_deleted: number
      }
      expect(row.is_deleted).toBe(0)
    })

    it('softDeleteForPermanentDelete 空数组 no-op', async () => {
      await expect(repo.softDeleteForPermanentDelete([])).resolves.toBeUndefined()
    })

    it('softDeleteForPermanentDelete 多条标记软删除', async () => {
      const id1 = insertMedia(db, { file_path: '/t/1.jpg' })
      const id2 = insertMedia(db, { file_path: '/t/2.jpg' })
      await repo.softDeleteForPermanentDelete([id1, id2])
      const rows = db
        .prepare('SELECT COUNT(*) as count FROM media_files WHERE is_deleted = 1')
        .get() as { count: number }
      expect(rows.count).toBe(2)
    })

    it('hardDeleteBatch 空数组 no-op', async () => {
      await expect(repo.hardDeleteBatch([])).resolves.toBeUndefined()
    })

    it('hardDeleteBatch 多条批量删除', async () => {
      const id1 = insertMedia(db, { file_path: '/t/1.jpg' })
      const id2 = insertMedia(db, { file_path: '/t/2.jpg' })
      const id3 = insertMedia(db, { file_path: '/t/3.jpg' })
      await repo.hardDeleteBatch([id1, id2, id3])
      const rows = db.prepare('SELECT COUNT(*) as count FROM media_files').get() as {
        count: number
      }
      expect(rows.count).toBe(0)
    })

    it('hardDeleteBatch 含不存在的 id 不抛错', async () => {
      const id = insertMedia(db)
      await expect(repo.hardDeleteBatch([id, 99999, 88888])).resolves.toBeUndefined()
      const row = db.prepare('SELECT id FROM media_files WHERE id = ?').get(id)
      expect(row).toBeUndefined()
    })

    it('cleanupMissingRecords 返回删除条数', async () => {
      insertMedia(db, { file_path: '/t/1.jpg', is_missing: 1 })
      insertMedia(db, { file_path: '/t/2.jpg', is_missing: 1 })
      insertMedia(db, { file_path: '/t/3.jpg', is_missing: 0 })
      const deleted = await repo.cleanupMissingRecords()
      expect(deleted).toBe(2)
    })

    it('cleanupMissingRecords 无缺失时返回 0', async () => {
      insertMedia(db, { is_missing: 0 })
      const deleted = await repo.cleanupMissingRecords()
      expect(deleted).toBe(0)
    })

    it('removeMissingRecord 删除 missing 记录返回 true', async () => {
      const id = insertMedia(db, { is_missing: 1 })
      expect(await repo.removeMissingRecord(id)).toBe(true)
      const row = db.prepare('SELECT id FROM media_files WHERE id = ?').get(id)
      expect(row).toBeUndefined()
    })

    it('removeMissingRecord 非 missing 记录返回 false', async () => {
      const id = insertMedia(db, { is_missing: 0 })
      expect(await repo.removeMissingRecord(id)).toBe(false)
      const row = db.prepare('SELECT id FROM media_files WHERE id = ?').get(id)
      expect(row).toBeDefined()
    })
  })

  // ==========================================================================
  // 查询接口
  // ==========================================================================
  describe('查询接口', () => {
    it('listMedia 默认视图仅返回 is_deleted=0', () => {
      insertMedia(db, { file_path: '/t/1.jpg', is_deleted: 0 })
      insertMedia(db, { file_path: '/t/2.jpg', is_deleted: 1 })
      const result = repo.listMedia({})
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].file_path).toBe('/t/1.jpg')
    })

    it('listMedia includeDeleted=true 返回所有记录', () => {
      insertMedia(db, { file_path: '/t/1.jpg', is_deleted: 0 })
      insertMedia(db, { file_path: '/t/2.jpg', is_deleted: 1 })
      const result = repo.listMedia({ includeDeleted: true })
      expect(result.rows).toHaveLength(2)
    })

    it('listMedia deletedOnly=true 仅返回已软删除记录', () => {
      insertMedia(db, { file_path: '/t/1.jpg', is_deleted: 0 })
      insertMedia(db, { file_path: '/t/2.jpg', is_deleted: 1 })
      const result = repo.listMedia({ deletedOnly: true })
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].file_path).toBe('/t/2.jpg')
    })

    it('listMedia 分页：usePagination=true 时返回 total/page/pageSize', () => {
      for (let i = 0; i < 5; i++) {
        insertMedia(db, { file_path: `/t/${i}.jpg`, is_deleted: 0 })
      }
      const result = repo.listMedia({ page: 0, pageSize: 2 })
      expect(result.rows).toHaveLength(2)
      expect(result.total).toBe(5)
      expect(result.page).toBe(0)
      expect(result.pageSize).toBe(2)
    })

    it('listMedia 默认视图命中 media_count 缓存', async () => {
      insertMedia(db, { file_path: '/t/1.jpg' })
      insertMedia(db, { file_path: '/t/2.jpg' })
      await repo.setMediaCountCache(99)
      const result = repo.listMedia({ page: 0, pageSize: 10 })
      expect(result.total).toBe(99)
    })

    it('listMedia 非默认视图实时 COUNT', () => {
      insertMedia(db, { file_path: '/t/1.jpg', is_deleted: 0 })
      insertMedia(db, { file_path: '/t/2.jpg', is_deleted: 1 })
      const result = repo.listMedia({ page: 0, pageSize: 10, deletedOnly: true })
      expect(result.total).toBe(1)
    })

    it('listMedia accountUid 过滤', () => {
      insertMedia(db, { file_path: '/t/1.jpg', account_uid: 'userA' })
      insertMedia(db, { file_path: '/t/2.jpg', account_uid: 'userB' })
      const result = repo.listMedia({ accountUid: 'userA' })
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].account_uid).toBe('userA')
    })

    it('listMedia accountUid=all 不应用过滤', () => {
      insertMedia(db, { file_path: '/t/1.jpg', account_uid: 'userA' })
      insertMedia(db, { file_path: '/t/2.jpg', account_uid: 'userB' })
      const result = repo.listMedia({ accountUid: 'all' })
      expect(result.rows).toHaveLength(2)
    })

    it('listMedia albumType 过滤', () => {
      insertMedia(db, { file_path: '/t/1.jpg', album_type: '游戏截图' })
      insertMedia(db, { file_path: '/t/2.jpg', album_type: '其他' })
      const result = repo.listMedia({ albumType: '游戏截图' })
      expect(result.rows).toHaveLength(1)
    })

    it('listMedia hideDuplicates 隐藏 is_duplicate=1 的记录', () => {
      insertMedia(db, { file_path: '/t/1.jpg', is_duplicate: 0 })
      insertMedia(db, { file_path: '/t/2.jpg', is_duplicate: 1 })
      const result = repo.listMedia({ hideDuplicates: true })
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].file_path).toBe('/t/1.jpg')
    })

    it('listMedia hideDuplicates 在 deletedOnly 下不应用', () => {
      insertMedia(db, { file_path: '/t/1.jpg', is_duplicate: 0, is_deleted: 1 })
      insertMedia(db, { file_path: '/t/2.jpg', is_duplicate: 1, is_deleted: 1 })
      const result = repo.listMedia({ deletedOnly: true, hideDuplicates: true })
      expect(result.rows).toHaveLength(2)
    })

    it('listMedia mediaSource 过滤', () => {
      insertMedia(db, { file_path: '/t/1.jpg', media_source: 'game' })
      insertMedia(db, { file_path: '/t/2.jpg', media_source: 'launcher' })
      const result = repo.listMedia({ mediaSource: 'game' })
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].media_source).toBe('game')
    })

    it('listMedia tags JSON 字段解析（合法 JSON）', () => {
      insertMedia(db, { file_path: '/t/1.jpg', tags: '["风景","人物"]' })
      const result = repo.listMedia({})
      expect(result.rows[0].tags).toEqual(['风景', '人物'])
    })

    it('listMedia tags 字段为损坏 JSON 时返回空数组（容错）', () => {
      insertMedia(db, { file_path: '/t/1.jpg', tags: 'not-json{' })
      const result = repo.listMedia({})
      expect(result.rows[0].tags).toEqual([])
    })

    it('setMediaCountCache 写入后 listMedia 间接读取', async () => {
      await repo.setMediaCountCache(42)
      const result = repo.listMedia({ page: 0, pageSize: 10 })
      expect(result.total).toBe(42)
    })

    it('refreshMediaCountCache 刷新为当前未软删除记录数', async () => {
      insertMedia(db, { file_path: '/t/1.jpg', is_deleted: 0 })
      insertMedia(db, { file_path: '/t/2.jpg', is_deleted: 0 })
      insertMedia(db, { file_path: '/t/3.jpg', is_deleted: 1 })
      await repo.refreshMediaCountCache()
      const result = repo.listMedia({ page: 0, pageSize: 10 })
      expect(result.total).toBe(2)
    })

    it('getMediaForSceneAnalysis 传 id 数组时返回这些 id 中的图片', () => {
      const id1 = insertMedia(db, { file_path: '/t/1.jpg', file_type: 'image' })
      const id2 = insertMedia(db, { file_path: '/t/2.jpg', file_type: 'video' })
      const result = repo.getMediaForSceneAnalysis([id1, id2])
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(id1)
    })

    it('getMediaForSceneAnalysis 不传 id 时返回所有 unknown 图片', () => {
      insertMedia(db, { file_path: '/t/1.jpg', file_type: 'image', scene_time: 'unknown' })
      insertMedia(db, { file_path: '/t/2.jpg', file_type: 'image', scene_time: 'day' })
      insertMedia(db, { file_path: '/t/3.jpg', file_type: 'video', scene_time: 'unknown' })
      const result = repo.getMediaForSceneAnalysis()
      expect(result).toHaveLength(1)
    })

    it('getMediaForSceneAnalysis 不传 id 时仅返回未删除的', () => {
      insertMedia(db, { file_path: '/t/1.jpg', file_type: 'image', scene_time: 'unknown' })
      insertMedia(db, {
        file_path: '/t/2.jpg',
        file_type: 'image',
        scene_time: 'unknown',
        is_deleted: 1
      })
      const result = repo.getMediaForSceneAnalysis()
      expect(result).toHaveLength(1)
    })

    it('getMediaPathsByIds 空数组返回空', () => {
      expect(repo.getMediaPathsByIds([])).toEqual([])
    })

    it('getMediaPathsByIds 多条查询', () => {
      const id1 = insertMedia(db, { file_path: '/t/1.jpg' })
      const id2 = insertMedia(db, { file_path: '/t/2.jpg' })
      const result = repo.getMediaPathsByIds([id1, id2])
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.file_path).sort()).toEqual(['/t/1.jpg', '/t/2.jpg'])
    })

    it('getSoftDeletedMediaPaths 仅返回 is_deleted=1 的记录', () => {
      insertMedia(db, { file_path: '/t/1.jpg', is_deleted: 0 })
      insertMedia(db, { file_path: '/t/2.jpg', is_deleted: 1 })
      insertMedia(db, { file_path: '/t/3.jpg', is_deleted: 1 })
      const result = repo.getSoftDeletedMediaPaths()
      expect(result).toHaveLength(2)
    })

    it('getOutfitAggStats 按套装分组统计', () => {
      insertMedia(db, {
        file_path: '/t/1.jpg',
        outfit: '套装A',
        created_at: '2024-01-01 10:00:00'
      })
      insertMedia(db, {
        file_path: '/t/2.jpg',
        outfit: '套装A',
        created_at: '2024-02-01 10:00:00'
      })
      insertMedia(db, {
        file_path: '/t/3.jpg',
        outfit: '套装B',
        created_at: '2024-03-01 10:00:00'
      })
      const result = repo.getOutfitAggStats()
      expect(result).toHaveLength(2)
      const suitA = result.find((r) => r.outfit === '套装A')
      expect(suitA?.count).toBe(2)
      expect(suitA?.latest_created).toBe('2024-02-01 10:00:00')
    })

    it('getOutfitAggStats 排除空 outfit', () => {
      insertMedia(db, { file_path: '/t/1.jpg', outfit: '' })
      insertMedia(db, { file_path: '/t/2.jpg', outfit: '套装A' })
      const result = repo.getOutfitAggStats()
      expect(result).toHaveLength(1)
      expect(result[0].outfit).toBe('套装A')
    })

    it('getOutfitAggStats 排除已软删除的', () => {
      insertMedia(db, {
        file_path: '/t/1.jpg',
        outfit: '套装A',
        is_deleted: 1
      })
      insertMedia(db, { file_path: '/t/2.jpg', outfit: '套装A', is_deleted: 0 })
      const result = repo.getOutfitAggStats()
      expect(result).toHaveLength(1)
      expect(result[0].count).toBe(1)
    })

    it('getLatestOutfitMedia 返回最新一张', () => {
      insertMedia(db, {
        file_path: '/t/1.jpg',
        outfit: '套装A',
        created_at: '2024-01-01 10:00:00',
        thumbnail: '/thumb/1.jpg'
      })
      insertMedia(db, {
        file_path: '/t/2.jpg',
        outfit: '套装A',
        created_at: '2024-02-01 10:00:00',
        thumbnail: '/thumb/2.jpg'
      })
      const result = repo.getLatestOutfitMedia('套装A')
      expect(result).toBeDefined()
      expect(result?.file_path).toBe('/t/2.jpg')
    })

    it('getLatestOutfitMedia 无数据返回 undefined', () => {
      expect(repo.getLatestOutfitMedia('不存在的套装')).toBeUndefined()
    })

    it('getLatestOutfitMedia 排除已软删除的', () => {
      insertMedia(db, {
        file_path: '/t/1.jpg',
        outfit: '套装A',
        created_at: '2024-02-01 10:00:00',
        is_deleted: 1
      })
      insertMedia(db, {
        file_path: '/t/2.jpg',
        outfit: '套装A',
        created_at: '2024-01-01 10:00:00',
        is_deleted: 0
      })
      const result = repo.getLatestOutfitMedia('套装A')
      expect(result?.file_path).toBe('/t/2.jpg')
    })

    it('getDuplicateCandidates 仅返回未软删除的', () => {
      insertMedia(db, { file_path: '/t/1.jpg', is_deleted: 0 })
      insertMedia(db, { file_path: '/t/2.jpg', is_deleted: 1 })
      const result = repo.getDuplicateCandidates()
      expect(result).toHaveLength(1)
      expect(result[0].file_path).toBe('/t/1.jpg')
    })

    it('getPhashRows 仅返回 phash 非空且未软删除的', () => {
      insertMedia(db, { file_path: '/t/1.jpg', phash: 'abcdef', is_deleted: 0 })
      insertMedia(db, { file_path: '/t/2.jpg', phash: null, is_deleted: 0 })
      insertMedia(db, { file_path: '/t/3.jpg', phash: 'ghijkl', is_deleted: 1 })
      const result = repo.getPhashRows()
      expect(result).toHaveLength(1)
      expect(result[0].phash).toBe('abcdef')
    })

    it('getGroupCounts 默认按 dimension 分组', () => {
      insertMedia(db, { file_path: '/t/1.jpg', album_type: '游戏截图' })
      insertMedia(db, { file_path: '/t/2.jpg', album_type: '游戏截图' })
      insertMedia(db, { file_path: '/t/3.jpg', album_type: '其他' })
      const result = repo.getGroupCounts('album_type', undefined, undefined)
      expect(result).toHaveLength(2)
      const screenshots = result.find((r) => r.key === '游戏截图')
      expect(screenshots?.count).toBe(2)
    })

    it('getGroupCounts accountUid 过滤', () => {
      insertMedia(db, { file_path: '/t/1.jpg', account_uid: 'userA', album_type: 'A' })
      insertMedia(db, { file_path: '/t/2.jpg', account_uid: 'userB', album_type: 'B' })
      const result = repo.getGroupCounts('album_type', 'userA', undefined)
      expect(result).toHaveLength(1)
      expect(result[0].key).toBe('A')
    })

    it('getGroupCounts mediaSource 过滤', () => {
      insertMedia(db, { file_path: '/t/1.jpg', media_source: 'game', album_type: 'A' })
      insertMedia(db, { file_path: '/t/2.jpg', media_source: 'launcher', album_type: 'B' })
      const result = repo.getGroupCounts('album_type', undefined, 'game')
      expect(result).toHaveLength(1)
      expect(result[0].key).toBe('A')
    })

    it('getGroupCounts accountUid=all 不过滤', () => {
      insertMedia(db, { file_path: '/t/1.jpg', account_uid: 'userA', album_type: 'A' })
      insertMedia(db, { file_path: '/t/2.jpg', account_uid: 'userB', album_type: 'B' })
      const result = repo.getGroupCounts('album_type', 'all', undefined)
      expect(result).toHaveLength(2)
    })

    it('getGroupCounts outfit 维度过滤空值', () => {
      insertMedia(db, { file_path: '/t/1.jpg', outfit: '' })
      insertMedia(db, { file_path: '/t/2.jpg', outfit: '套装A' })
      const result = repo.getGroupCounts('outfit', undefined, undefined)
      expect(result).toHaveLength(1)
      expect(result[0].key).toBe('套装A')
    })

    it('getGroupCounts 排除已软删除的', () => {
      insertMedia(db, { file_path: '/t/1.jpg', album_type: 'A', is_deleted: 1 })
      insertMedia(db, { file_path: '/t/2.jpg', album_type: 'A', is_deleted: 0 })
      const result = repo.getGroupCounts('album_type', undefined, undefined)
      expect(result).toHaveLength(1)
      expect(result[0].count).toBe(1)
    })
  })

  // ==========================================================================
  // 重复分组
  // ==========================================================================
  describe('重复分组', () => {
    it('getDuplicateGroupRows 仅返回 is_duplicate=1 AND is_deleted=0 AND original_id IS NOT NULL', () => {
      insertMedia(db, {
        file_path: '/t/1.jpg',
        is_duplicate: 1,
        is_deleted: 0,
        original_id: 100
      })
      insertMedia(db, {
        file_path: '/t/2.jpg',
        is_duplicate: 1,
        is_deleted: 1,
        original_id: 100
      })
      insertMedia(db, {
        file_path: '/t/3.jpg',
        is_duplicate: 1,
        is_deleted: 0,
        original_id: null
      })
      insertMedia(db, {
        file_path: '/t/4.jpg',
        is_duplicate: 0,
        is_deleted: 0,
        original_id: 100
      })
      const result = repo.getDuplicateGroupRows()
      expect(result).toHaveLength(1)
      expect(result[0].file_path).toBe('/t/1.jpg')
    })

    it('getOriginalsByIds 空数组返回空', () => {
      expect(repo.getOriginalsByIds([])).toEqual([])
    })

    it('getOriginalsByIds 多条查询', () => {
      const id1 = insertMedia(db, { file_path: '/t/1.jpg' })
      const id2 = insertMedia(db, { file_path: '/t/2.jpg' })
      const result = repo.getOriginalsByIds([id1, id2])
      expect(result).toHaveLength(2)
    })
  })

  // ==========================================================================
  // 分类
  // ==========================================================================
  describe('分类', () => {
    it('createCategory 返回新 id', async () => {
      const id = await repo.createCategory('新分类', 'icon', '#ff0000', null)
      expect(typeof id).toBe('number')
      expect(id).toBeGreaterThan(0)
    })

    it('createCategory sort_order 自增', async () => {
      const id1 = await repo.createCategory('分类1', 'icon', '#000', null)
      const id2 = await repo.createCategory('分类2', 'icon', '#000', null)
      const row1 = db.prepare('SELECT sort_order FROM categories WHERE id = ?').get(id1) as {
        sort_order: number
      }
      const row2 = db.prepare('SELECT sort_order FROM categories WHERE id = ?').get(id2) as {
        sort_order: number
      }
      expect(row2.sort_order).toBe(row1.sort_order + 1)
    })

    it('createCategory parent_id 设置', async () => {
      const parentId = await repo.createCategory('父分类', 'icon', '#000', null)
      const childId = await repo.createCategory('子分类', 'icon', '#000', parentId)
      const row = db.prepare('SELECT parent_id FROM categories WHERE id = ?').get(childId) as {
        parent_id: number | null
      }
      expect(row.parent_id).toBe(parentId)
    })

    it('updateCategoryFields 空 fields 跳过', async () => {
      const id = await repo.createCategory('测试', 'icon', '#000', null)
      await expect(repo.updateCategoryFields(id, [], [])).resolves.toBeUndefined()
    })

    it('updateCategoryFields 单字段更新', async () => {
      const id = await repo.createCategory('测试', 'icon', '#000', null)
      await repo.updateCategoryFields(id, ['name = ?'], ['新名字'])
      const row = db.prepare('SELECT name FROM categories WHERE id = ?').get(id) as {
        name: string
      }
      expect(row.name).toBe('新名字')
    })

    it('updateCategoryFields 多字段更新', async () => {
      const id = await repo.createCategory('测试', 'icon', '#000', null)
      await repo.updateCategoryFields(id, ['name = ?', 'color = ?'], ['新名字', '#ffffff'])
      const row = db.prepare('SELECT name, color FROM categories WHERE id = ?').get(id) as {
        name: string
        color: string
      }
      expect(row.name).toBe('新名字')
      expect(row.color).toBe('#ffffff')
    })

    it('deleteCategoryCascade 级联置 NULL media_files.category_id', async () => {
      const catId = await repo.createCategory('测试', 'icon', '#000', null)
      const mediaId = insertMedia(db, { category_id: catId })
      await repo.deleteCategoryCascade(catId)
      const catRow = db.prepare('SELECT id FROM categories WHERE id = ?').get(catId)
      expect(catRow).toBeUndefined()
      const mediaRow = db
        .prepare('SELECT category_id FROM media_files WHERE id = ?')
        .get(mediaId) as {
        category_id: number | null
      }
      expect(mediaRow.category_id).toBeNull()
    })

    it('deleteCategoryCascade 非系统分类正常删除', async () => {
      const catId = insertCategory(db, { name: '普通', is_system: 0 })
      await repo.deleteCategoryCascade(catId)
      const row = db.prepare('SELECT id FROM categories WHERE id = ?').get(catId)
      expect(row).toBeUndefined()
    })

    it('reorderCategories 批量更新 sort_order + parent_id', async () => {
      const id1 = insertCategory(db, { name: 'A', sort_order: 1 })
      const id2 = insertCategory(db, { name: 'B', sort_order: 2 })
      await repo.reorderCategories([
        { id: id1, sort_order: 2 },
        { id: id2, sort_order: 1, parent_id: id1 }
      ])
      const row1 = db
        .prepare('SELECT sort_order, parent_id FROM categories WHERE id = ?')
        .get(id1) as {
        sort_order: number
        parent_id: number | null
      }
      const row2 = db
        .prepare('SELECT sort_order, parent_id FROM categories WHERE id = ?')
        .get(id2) as {
        sort_order: number
        parent_id: number | null
      }
      expect(row1.sort_order).toBe(2)
      expect(row1.parent_id).toBeNull()
      expect(row2.sort_order).toBe(1)
      expect(row2.parent_id).toBe(id1)
    })

    it('reorderCategories 空数组 no-op', async () => {
      await expect(repo.reorderCategories([])).resolves.toBeUndefined()
    })

    it('listCategories 按 sort_order 排序', () => {
      insertCategory(db, { name: 'B', sort_order: 2 })
      insertCategory(db, { name: 'A', sort_order: 1 })
      insertCategory(db, { name: 'C', sort_order: 3 })
      const result = repo.listCategories()
      expect(result.map((c) => c.name)).toEqual(['A', 'B', 'C'])
    })
  })

  // ==========================================================================
  // 角色档案
  // ==========================================================================
  describe('角色档案', () => {
    it('listProfiles 按 created_at 升序', () => {
      insertProfile(db, { uid: 'b', nickname: 'B', created_at: '2024-02-01 10:00:00' })
      insertProfile(db, { uid: 'a', nickname: 'A', created_at: '2024-01-01 10:00:00' })
      const result = repo.listProfiles()
      expect(result.map((p) => p.uid)).toEqual(['a', 'b'])
    })

    it('addProfile 新增后 listProfiles 能查到', async () => {
      await repo.addProfile('new-uid', '新角色', null)
      const result = repo.listProfiles()
      expect(result.find((p) => p.uid === 'new-uid')).toBeDefined()
      expect(result.find((p) => p.uid === 'new-uid')?.nickname).toBe('新角色')
    })

    it('updateProfileFields 空 sets 跳过', async () => {
      insertProfile(db, { uid: 'u1', nickname: '原名' })
      await expect(repo.updateProfileFields('u1', [], [])).resolves.toBeUndefined()
      const result = repo.listProfiles()
      expect(result.find((p) => p.uid === 'u1')?.nickname).toBe('原名')
    })

    it('updateProfileFields 单字段更新', async () => {
      insertProfile(db, { uid: 'u1', nickname: '原名' })
      await repo.updateProfileFields('u1', ['nickname = ?'], ['新名'])
      const result = repo.listProfiles()
      expect(result.find((p) => p.uid === 'u1')?.nickname).toBe('新名')
    })

    it('updateProfileFields 多字段更新', async () => {
      insertProfile(db, { uid: 'u1', nickname: '原名', avatar: null })
      await repo.updateProfileFields(
        'u1',
        ['nickname = ?', 'avatar = ?'],
        ['新名', '/path/to/avatar.png']
      )
      const result = repo.listProfiles()
      const profile = result.find((p) => p.uid === 'u1')
      expect(profile?.nickname).toBe('新名')
      expect(profile?.avatar).toBe('/path/to/avatar.png')
    })

    it('deleteProfileAndReassign 将 media_files 迁移到 default + 删除档案', async () => {
      insertProfile(db, { uid: 'u1', nickname: '角色1' })
      insertProfile(db, { uid: 'default', nickname: '默认档案', created_at: '2023-01-01 10:00:00' })
      const mediaId = insertMedia(db, { file_path: '/t/1.jpg', account_uid: 'u1' })

      await repo.deleteProfileAndReassign('u1')

      const profiles = repo.listProfiles()
      expect(profiles.find((p) => p.uid === 'u1')).toBeUndefined()
      const media = db.prepare('SELECT account_uid FROM media_files WHERE id = ?').get(mediaId) as {
        account_uid: string
      }
      expect(media.account_uid).toBe('default')
    })

    it('touchProfileActive 更新 last_active_at', async () => {
      insertProfile(db, { uid: 'u1', last_active_at: null })
      await repo.touchProfileActive('u1')
      const row = db
        .prepare('SELECT last_active_at FROM character_profiles WHERE uid = ?')
        .get('u1') as {
        last_active_at: string | null
      }
      expect(row.last_active_at).not.toBeNull()
    })

    it('getProfileByUid 存在时返回 uid', () => {
      insertProfile(db, { uid: 'u1' })
      const result = repo.getProfileByUid('u1')
      expect(result).toEqual({ uid: 'u1' })
    })

    it('getProfileByUid 不存在时返回 undefined', () => {
      expect(repo.getProfileByUid('non-existent')).toBeUndefined()
    })

    it('transferFilesToProfile 空数组 no-op', async () => {
      await expect(repo.transferFilesToProfile([], 'target')).resolves.toBeUndefined()
    })

    it('transferFilesToProfile 批量更新 account_uid', async () => {
      insertProfile(db, { uid: 'target' })
      const id1 = insertMedia(db, { file_path: '/t/1.jpg', account_uid: 'source' })
      const id2 = insertMedia(db, { file_path: '/t/2.jpg', account_uid: 'source' })
      await repo.transferFilesToProfile([id1, id2], 'target')
      const rows = db
        .prepare('SELECT account_uid FROM media_files WHERE id = ?')
        .all(id1) as Array<{ account_uid: string }>
      expect(rows[0].account_uid).toBe('target')
      const rows2 = db
        .prepare('SELECT account_uid FROM media_files WHERE id = ?')
        .all(id2) as Array<{ account_uid: string }>
      expect(rows2[0].account_uid).toBe('target')
    })

    it('getProfileBaseStats 返回完整统计', () => {
      insertProfile(db, { uid: 'u1' })
      insertMedia(db, {
        file_path: '/t/1.jpg',
        account_uid: 'u1',
        file_type: 'image',
        file_size: 1024,
        created_at: '2024-01-01 10:00:00'
      })
      insertMedia(db, {
        file_path: '/t/2.jpg',
        account_uid: 'u1',
        file_type: 'video',
        file_size: 2048,
        created_at: '2024-02-01 10:00:00'
      })
      insertMedia(db, {
        file_path: '/t/3.jpg',
        account_uid: 'u1',
        is_deleted: 1
      })
      const stats = repo.getProfileBaseStats('u1')
      expect(stats.total_count).toBe(2)
      expect(stats.image_count).toBe(1)
      expect(stats.video_count).toBe(1)
      expect(stats.total_size).toBe(3072)
      expect(stats.earliest_time).toBe('2024-01-01 10:00:00')
      expect(stats.latest_time).toBe('2024-02-01 10:00:00')
    })

    it('getProfileBaseStats 空档案返回零值', () => {
      insertProfile(db, { uid: 'empty' })
      const stats = repo.getProfileBaseStats('empty')
      expect(stats.total_count).toBe(0)
      expect(stats.image_count).toBe(0)
      expect(stats.video_count).toBe(0)
      expect(stats.total_size).toBe(0)
      expect(stats.earliest_time).toBeNull()
      expect(stats.latest_time).toBeNull()
    })

    it('getProfileTopOutfits 默认 limit=5', () => {
      insertProfile(db, { uid: 'u1' })
      for (let i = 0; i < 6; i++) {
        insertMedia(db, {
          file_path: `/t/${i}.jpg`,
          account_uid: 'u1',
          outfit: `套装${i}`
        })
      }
      const result = repo.getProfileTopOutfits('u1')
      expect(result).toHaveLength(5)
    })

    it('getProfileTopOutfits 自定义 limit', () => {
      insertProfile(db, { uid: 'u1' })
      for (let i = 0; i < 3; i++) {
        insertMedia(db, {
          file_path: `/t/${i}.jpg`,
          account_uid: 'u1',
          outfit: `套装${i}`
        })
      }
      const result = repo.getProfileTopOutfits('u1', 10)
      expect(result).toHaveLength(3)
    })

    it('getProfileTopOutfits 按 cnt 降序', () => {
      insertProfile(db, { uid: 'u1' })
      insertMedia(db, { file_path: '/t/1.jpg', account_uid: 'u1', outfit: 'A' })
      insertMedia(db, { file_path: '/t/2.jpg', account_uid: 'u1', outfit: 'A' })
      insertMedia(db, { file_path: '/t/3.jpg', account_uid: 'u1', outfit: 'B' })
      const result = repo.getProfileTopOutfits('u1', 5)
      expect(result[0].key).toBe('A')
      expect(result[0].cnt).toBe(2)
    })

    it('getProfileTopOutfits 空数据返回空数组', () => {
      insertProfile(db, { uid: 'empty' })
      const result = repo.getProfileTopOutfits('empty')
      expect(result).toEqual([])
    })

    it('getProfileTopScenes 默认 limit=5', () => {
      insertProfile(db, { uid: 'u1' })
      for (let i = 0; i < 6; i++) {
        insertMedia(db, {
          file_path: `/t/${i}.jpg`,
          account_uid: 'u1',
          scene_category: `scene${i}`
        })
      }
      const result = repo.getProfileTopScenes('u1')
      expect(result).toHaveLength(5)
    })

    it('getProfileTopScenes 排除 scene_category IS NULL', () => {
      insertProfile(db, { uid: 'u1' })
      insertMedia(db, {
        file_path: '/t/1.jpg',
        account_uid: 'u1',
        scene_category: null
      })
      insertMedia(db, {
        file_path: '/t/2.jpg',
        account_uid: 'u1',
        scene_category: '室内'
      })
      const result = repo.getProfileTopScenes('u1')
      expect(result).toHaveLength(1)
      expect(result[0].key).toBe('室内')
    })

    it('getProfileTimeDistribution 按 scene_time 分组', () => {
      insertProfile(db, { uid: 'u1' })
      insertMedia(db, { file_path: '/t/1.jpg', account_uid: 'u1', scene_time: 'day' })
      insertMedia(db, { file_path: '/t/2.jpg', account_uid: 'u1', scene_time: 'day' })
      insertMedia(db, { file_path: '/t/3.jpg', account_uid: 'u1', scene_time: 'night' })
      const result = repo.getProfileTimeDistribution('u1')
      const dayRow = result.find((r) => r.key === 'day')
      const nightRow = result.find((r) => r.key === 'night')
      expect(dayRow?.cnt).toBe(2)
      expect(nightRow?.cnt).toBe(1)
    })

    it('getProfileTimeDistribution 排除已软删除的', () => {
      insertProfile(db, { uid: 'u1' })
      insertMedia(db, {
        file_path: '/t/1.jpg',
        account_uid: 'u1',
        scene_time: 'day',
        is_deleted: 1
      })
      insertMedia(db, {
        file_path: '/t/2.jpg',
        account_uid: 'u1',
        scene_time: 'day',
        is_deleted: 0
      })
      const result = repo.getProfileTimeDistribution('u1')
      const dayRow = result.find((r) => r.key === 'day')
      expect(dayRow?.cnt).toBe(1)
    })
  })

  // ==========================================================================
  // 事务访问器
  // ==========================================================================
  describe('transaction', () => {
    it('事务成功提交多条语句', async () => {
      const id1 = insertMedia(db, { file_path: '/t/1.jpg', rating: 0 })
      const id2 = insertMedia(db, { file_path: '/t/2.jpg', rating: 0 })
      const result = await repo.transaction([
        { sql: 'UPDATE media_files SET rating = ? WHERE id = ?', params: [5, id1] },
        { sql: 'UPDATE media_files SET rating = ? WHERE id = ?', params: [3, id2] }
      ])
      expect(result.changes).toBe(2)
      const rows = db
        .prepare('SELECT rating FROM media_files ORDER BY id')
        .all() as Array<{ rating: number }>
      expect(rows.map((r) => r.rating)).toEqual([5, 3])
    })

    it('空 statements 数组 no-op', async () => {
      const result = await repo.transaction([])
      expect(result.changes).toBe(0)
      expect(result.lastInsertRowid).toBe(0)
    })
  })
})
