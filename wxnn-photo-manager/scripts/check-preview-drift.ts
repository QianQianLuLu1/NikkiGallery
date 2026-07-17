/**
 * preview.html ↔ src/renderer/ 漂移检测脚本
 * 自动审计手写预览版与 exe 源码的关键漂移点，对应 MD 计划 P1-C1
 * 用法：npx tsx scripts/check-preview-drift.ts
 *
 * 检测维度：
 *   1. 侧边栏导航项漂移（preview SIDEBAR_NAV_ITEMS vs Sidebar.tsx navItems）
 *   2. CSS 变量漂移（preview :root/.soft-pink-luxury vs globals.css + themes/soft-pink-luxury.css）
 *   3. i18n 覆盖率（preview 硬编码中文 vs zh-CN.json key 数）
 *   4. exifr 版本一致性（preview CDN vs package.json）
 *
 * 退出码：0 = 无致命漂移；1 = 存在致命漂移（导航项缺失/解析失败）
 */
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')
const PREVIEW_PATH = path.join(ROOT, 'preview.html')
const SIDEBAR_TSX_PATH = path.join(ROOT, 'src', 'renderer', 'components', 'layout', 'Sidebar.tsx')
const GLOBALS_CSS_PATH = path.join(ROOT, 'src', 'renderer', 'styles', 'globals.css')
const THEME_PINK_CSS_PATH = path.join(ROOT, 'src', 'renderer', 'styles', 'themes', 'soft-pink-luxury.css')
const ZH_CN_PATH = path.join(ROOT, 'src', 'renderer', 'i18n', 'locales', 'zh-CN.json')
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json')

interface CheckResult {
  name: string
  status: 'PASS' | 'WARN' | 'FAIL'
  detail: string
}

const results: CheckResult[] = []

function readText(p: string): string {
  return fs.readFileSync(p, 'utf8')
}

function readJson<T>(p: string): T {
  return JSON.parse(readText(p)) as T
}

// ---------- 1. 导航项漂移 ----------
function checkNavItems(): void {
  const preview = readText(PREVIEW_PATH)
  const sidebarTsx = readText(SIDEBAR_TSX_PATH)

  // 从 preview.html 提取 SIDEBAR_NAV_ITEMS 的 id
  const navBlock = preview.match(/SIDEBAR_NAV_ITEMS\s*=\s*\[([\s\S]*?)\]/)
  const previewIds = new Set<string>()
  if (navBlock) {
    const idMatches = navBlock[1].matchAll(/id:\s*['"]([^'"]+)['"]/g)
    for (const m of idMatches) previewIds.add(m[1])
  }

  // 从 Sidebar.tsx 提取 navItems 数组的 id（不含 detail/editor 等子页面）
  // Sidebar.tsx 中形如：const navItems = [ { id: 'gallery', ... }, ... ]
  const exeNavMatch = sidebarTsx.match(/const navItems[^=]*=\s*\[([\s\S]*?)\]/)
  const exeIds = new Set<string>()
  if (exeNavMatch) {
    const idMatches = exeNavMatch[1].matchAll(/id:\s*['"]([^'"]+)['"]/g)
    for (const m of idMatches) exeIds.add(m[1])
  }

  if (previewIds.size === 0 || exeIds.size === 0) {
    results.push({
      name: '导航项',
      status: 'FAIL',
      detail: `解析失败：preview=${previewIds.size} 项，exe=${exeIds.size} 项`
    })
    return
  }

  const missingInPreview = [...exeIds].filter((id) => !previewIds.has(id))
  const extraInPreview = [...previewIds].filter((id) => !exeIds.has(id))

  if (missingInPreview.length === 0 && extraInPreview.length === 0) {
    results.push({
      name: '导航项',
      status: 'PASS',
      detail: `导航项一致（${previewIds.size} 项）`
    })
  } else {
    const parts: string[] = []
    if (missingInPreview.length > 0) parts.push(`preview 缺失：${missingInPreview.join(', ')}`)
    if (extraInPreview.length > 0) parts.push(`preview 多余：${extraInPreview.join(', ')}`)
    results.push({
      name: '导航项',
      status: 'FAIL',
      detail: parts.join('；')
    })
  }
}

// ---------- 2. CSS 变量漂移 ----------
function extractCssVars(css: string, selector: string): Set<string> {
  // 匹配 selector { ... } 块（容忍换行）
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]+)\\}`)
  const block = css.match(re)
  if (!block) return new Set()
  const vars = new Set<string>()
  const varRe = /(--[a-zA-Z0-9-]+)\s*:/g
  let m: RegExpExecArray | null
  while ((m = varRe.exec(block[1])) !== null) vars.add(m[1])
  return vars
}

function checkCssVars(): void {
  const preview = readText(PREVIEW_PATH)
  // exe 侧：:root 在 globals.css，.soft-pink-luxury 在 themes/soft-pink-luxury.css
  const globals = readText(GLOBALS_CSS_PATH)
  const themePink = fs.existsSync(THEME_PINK_CSS_PATH) ? readText(THEME_PINK_CSS_PATH) : ''

  const selectors = [':root', '.soft-pink-luxury']
  const parts: string[] = []
  let hasWarn = false

  for (const sel of selectors) {
    const previewVars = extractCssVars(preview, sel)
    // :root 从 globals.css 取，.soft-pink-luxury 从 themePink 取
    const exeSource = sel === ':root' ? globals : themePink
    const exeVars = extractCssVars(exeSource, sel)
    if (previewVars.size === 0 || exeVars.size === 0) {
      parts.push(`${sel}：解析失败（preview=${previewVars.size}, exe=${exeVars.size}）`)
      hasWarn = true
      continue
    }
    const missing = [...exeVars].filter((v) => !previewVars.has(v))
    const extra = [...previewVars].filter((v) => !exeVars.has(v))
    if (missing.length === 0 && extra.length === 0) {
      parts.push(`${sel}：一致（${previewVars.size} 个变量）`)
    } else {
      // CSS 变量漂移为 WARN：preview 可能不必引用每个 spacing token
      hasWarn = true
      const sub: string[] = []
      if (missing.length > 0) sub.push(`缺失 ${missing.length} 个：${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`)
      if (extra.length > 0) sub.push(`多余 ${extra.length} 个：${extra.slice(0, 5).join(', ')}${extra.length > 5 ? '...' : ''}`)
      parts.push(`${sel}：${sub.join('；')}`)
    }
  }

  results.push({
    name: 'CSS 变量',
    status: hasWarn ? 'WARN' : 'PASS',
    detail: parts.join(' | ')
  })
}

// ---------- 3. i18n 覆盖率 ----------
function countKeys(obj: unknown): number {
  let n = 0
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      if (v && typeof v === 'object') n += countKeys(v)
      else n += 1
    }
  }
  return n
}

function checkI18nCoverage(): void {
  const preview = readText(PREVIEW_PATH)
  const zhCN = readJson<unknown>(ZH_CN_PATH)
  const totalKeys = countKeys(zhCN)

  // 统计 preview.html 中硬编码中文片段数量（去重）
  const chineseRe = /[\u4e00-\u9fa5]{2,}/g
  const matches = preview.match(chineseRe) || []
  const uniqueChinese = new Set(matches)

  // 覆盖率：preview 中出现的 zh-CN value 数 / totalKeys
  // 收集 zh-CN 所有字符串 value
  const values: string[] = []
  function collect(obj: unknown): void {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const v of Object.values(obj as Record<string, unknown>)) {
        if (v && typeof v === 'object') collect(v)
        else if (typeof v === 'string' && /[\u4e00-\u9fa5]/.test(v)) values.push(v)
      }
    }
  }
  collect(zhCN)

  let hit = 0
  for (const v of values) {
    if (preview.includes(v)) hit += 1
  }
  const coverage = values.length > 0 ? Math.round((hit / values.length) * 100) : 0

  // 覆盖率低于 60% 报警（preview 手写，不可能 100% 对齐 value 文案）
  const status: CheckResult['status'] = coverage >= 60 ? 'PASS' : coverage >= 40 ? 'WARN' : 'FAIL'
  results.push({
    name: 'i18n 覆盖率',
    status,
    detail: `zh-CN key 数=${totalKeys}；preview 命中=${hit}/${values.length}（${coverage}%）；preview 硬编码中文片段=${uniqueChinese.size}`
  })
}

// ---------- 4. exifr 版本 ----------
function checkExifrVersion(): void {
  const preview = readText(PREVIEW_PATH)
  const pkg = readJson<{ dependencies: Record<string, string> }>(PACKAGE_JSON_PATH)

  const cdnMatch = preview.match(/exifr@(\d+\.\d+\.\d+)/)
  const cdnVersion = cdnMatch ? cdnMatch[1] : null
  const pkgVersion = pkg.dependencies?.exifr ?? null
  // package.json 中是 ^7.1.3 形式，提取实际版本号
  const pkgClean = pkgVersion ? pkgVersion.replace(/^[^0-9]+/, '') : null

  if (!cdnVersion || !pkgClean) {
    results.push({
      name: 'exifr 版本',
      status: 'WARN',
      detail: `解析失败：cdn=${cdnVersion}, package.json=${pkgClean}`
    })
    return
  }

  if (cdnVersion === pkgClean) {
    results.push({
      name: 'exifr 版本',
      status: 'PASS',
      detail: `版本一致：${cdnVersion}`
    })
  } else {
    results.push({
      name: 'exifr 版本',
      status: 'WARN',
      detail: `版本不一致：preview CDN=${cdnVersion}, package.json=${pkgClean}`
    })
  }
}

// ---------- 主流程 ----------
function main(): void {
  if (!fs.existsSync(PREVIEW_PATH)) {
    console.error(`❌ preview.html 不存在：${PREVIEW_PATH}`)
    process.exit(1)
  }

  checkNavItems()
  checkCssVars()
  checkI18nCoverage()
  checkExifrVersion()

  console.log('=== preview.html 漂移检测报告 ===\n')
  console.log('| 检测项 | 状态 | 详情 |')
  console.log('|---|---|---|')
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '🟡' : '❌'
    console.log(`| ${r.name} | ${icon} ${r.status} | ${r.detail} |`)
  }

  const failCount = results.filter((r) => r.status === 'FAIL').length
  const warnCount = results.filter((r) => r.status === 'WARN').length
  console.log(`\n总计：${results.length} 项；PASS=${results.length - failCount - warnCount}，WARN=${warnCount}，FAIL=${failCount}`)

  if (failCount > 0) {
    console.error('\n❌ 存在致命漂移，请修复后再次提交')
    process.exit(1)
  } else {
    console.log('\n✅ 无致命漂移')
    process.exit(0)
  }
}

main()
