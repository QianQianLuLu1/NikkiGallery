// P2-01：i18n 初始化配置
// 设计要点：
// 1. 中文（zh-CN）为基准语言，翻译最完整
// 2. 其他 11 种语言为机翻初版，缺失 key 自动回退到 zh-CN（i18next 默认 fallbackLng）
// 3. 语言选择持久化到 localStorage，启动时读取并应用
// 4. 'auto' 表示跟随系统语言（基于 navigator.language 匹配）

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'
import en from './locales/en.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'
import zhTW from './locales/zh-TW.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import es from './locales/es.json'
import pt from './locales/pt.json'
import ru from './locales/ru.json'
import th from './locales/th.json'
import vi from './locales/vi.json'

// P2-01：支持的语言列表（顺序影响设置页下拉展示顺序）
export const SUPPORTED_LANGUAGES = [
  { code: 'auto', label: '跟随系统', englishName: 'Auto' },
  { code: 'zh-CN', label: '简体中文', englishName: 'Simplified Chinese' },
  { code: 'zh-TW', label: '繁體中文', englishName: 'Traditional Chinese' },
  { code: 'en', label: 'English', englishName: 'English' },
  { code: 'ja', label: '日本語', englishName: 'Japanese' },
  { code: 'ko', label: '한국어', englishName: 'Korean' },
  { code: 'fr', label: 'Français', englishName: 'French' },
  { code: 'de', label: 'Deutsch', englishName: 'German' },
  { code: 'es', label: 'Español', englishName: 'Spanish' },
  { code: 'pt', label: 'Português', englishName: 'Portuguese' },
  { code: 'ru', label: 'Русский', englishName: 'Russian' },
  { code: 'th', label: 'ไทย', englishName: 'Thai' },
  { code: 'vi', label: 'Tiếng Việt', englishName: 'Vietnamese' }
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

// P2-01：根据浏览器 navigator.language 推断系统语言
// 返回 null 表示无法匹配到支持的语言（调用方回退到 zh-CN）
export function detectSystemLanguage(): string | null {
  const nav = navigator.language?.toLowerCase() ?? ''
  if (nav.startsWith('zh')) {
    // zh-TW / zh-HK / zh-Mo 视为繁体，其余视为简体
    return nav.includes('tw') || nav.includes('hk') || nav.includes('mo') ? 'zh-TW' : 'zh-CN'
  }
  if (nav.startsWith('en')) return 'en'
  if (nav.startsWith('ja')) return 'ja'
  if (nav.startsWith('ko')) return 'ko'
  if (nav.startsWith('fr')) return 'fr'
  if (nav.startsWith('de')) return 'de'
  if (nav.startsWith('es')) return 'es'
  if (nav.startsWith('pt')) return 'pt'
  if (nav.startsWith('ru')) return 'ru'
  if (nav.startsWith('th')) return 'th'
  if (nav.startsWith('vi')) return 'vi'
  return null
}

// P2-01：从 localStorage 读取已持久化的语言选择
// 'auto' 或具体语言代码；未配置时默认 'auto'
function loadStoredLanguage(): string {
  try {
    const stored = localStorage.getItem('app-language')
    if (stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored)) return stored
  } catch {
    // localStorage 不可用时静默回退
  }
  return 'auto'
}

// P2-01：解析最终生效的语言代码
// 'auto' → 推断系统语言（推断失败回退 zh-CN）
// 其他 → 直接使用
function resolveLanguage(code: string): string {
  if (code === 'auto') {
    return detectSystemLanguage() ?? 'zh-CN'
  }
  return code
}

const storedLang = loadStoredLanguage()
const initialLang = resolveLanguage(storedLang)

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
    en: { translation: en },
    ja: { translation: ja },
    ko: { translation: ko },
    fr: { translation: fr },
    de: { translation: de },
    es: { translation: es },
    pt: { translation: pt },
    ru: { translation: ru },
    th: { translation: th },
    vi: { translation: vi }
  },
  lng: initialLang,
  fallbackLng: 'zh-CN',
  interpolation: {
    // React 已默认转义，避免重复转义影响显示
    escapeValue: false
  },
  returnNull: false
})

// P2-01：暴露切换语言的工具函数
// 切换后持久化到 localStorage；'auto' 重新解析为系统语言
export async function changeLanguage(code: string): Promise<string> {
  const resolved = resolveLanguage(code)
  await i18n.changeLanguage(resolved)
  try {
    localStorage.setItem('app-language', code)
  } catch {
    // localStorage 不可用时静默忽略
  }
  return resolved
}

// P2-01：获取当前生效的语言代码（已解析，不会返回 'auto'）
export function getCurrentLanguage(): string {
  return i18n.language || 'zh-CN'
}

export default i18n
