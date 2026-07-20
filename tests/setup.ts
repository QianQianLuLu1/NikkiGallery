/**
 * Vitest 全局 setup
 *
 * 为 jsdom 环境补齐浏览器原生 API：
 * - matchMedia（Tailwind / 组件库常调用）
 * - IntersectionObserver（虚拟列表 / 懒加载依赖）
 * - ResizeObserver（useContainerSize 等 hook 依赖）
 * - URL.createObjectURL（图片预览依赖）
 *
 * 同时注入 window.electronAPI 占位对象，组件内 `window.electronAPI?.xxx` 不会抛错；
 * 各测试用例可通过 vi.spyOn 或重新赋值覆盖具体方法。
 */
import '@testing-library/jest-dom/vitest'
import { vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom 环境补齐
if (typeof window !== 'undefined') {
  // zustand persist 中间件依赖 localStorage；vitest 1.6 + jsdom 默认未注入
  if (!window.localStorage) {
    const memStore = new Map<string, string>()
    const localStorageStub = {
      getItem: (key: string) => memStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memStore.set(key, String(value))
      },
      removeItem: (key: string) => {
        memStore.delete(key)
      },
      clear: () => {
        memStore.clear()
      },
      key: (index: number) => Array.from(memStore.keys())[index] ?? null,
      get length() {
        return memStore.size
      }
    }
    Object.defineProperty(window, 'localStorage', {
      value: localStorageStub,
      writable: true,
      configurable: true
    })
    Object.defineProperty(global, 'localStorage', {
      value: localStorageStub,
      writable: true,
      configurable: true
    })
  }

  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  }

  if (!('IntersectionObserver' in window)) {
    class MockIntersectionObserver {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
      takeRecords = vi.fn(() => [])
      root = null
      rootMargin = ''
      thresholds = []
      constructor(_cb: IntersectionObserverCallback) {}
    }
    ;(window as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      MockIntersectionObserver
    ;(global as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      MockIntersectionObserver
  }

  if (!('ResizeObserver' in window)) {
    class MockResizeObserver {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
      constructor(_cb: ResizeObserverCallback) {}
    }
    ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver
    ;(global as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver
  }

  if (!window.URL.createObjectURL) {
    Object.defineProperty(window.URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:mock'),
      writable: true
    })
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      value: vi.fn(),
      writable: true
    })
  }

  // clipboard 兜底（jsdom 默认无 clipboard）
  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn(() => Promise.resolve()),
        readText: vi.fn(() => Promise.resolve(''))
      },
      writable: true,
      configurable: true
    })
  }
}

// window.electronAPI 占位（组件内可选链调用，未注入时也不会抛错）
if (typeof global !== 'undefined') {
  const placeholder = new Proxy(
    {},
    {
      get: () => vi.fn(() => Promise.resolve(undefined))
    }
  )
  ;(global as unknown as { electronAPI?: unknown }).electronAPI = placeholder
  // node 环境无 window，仅在 jsdom 环境注入
  if (typeof window !== 'undefined') {
    ;(window as unknown as { electronAPI?: unknown }).electronAPI = placeholder
  }
}

// 每个 it 后清理 DOM，避免状态泄漏（仅 jsdom 环境有效）
afterEach(() => {
  if (typeof document !== 'undefined') {
    cleanup()
    document.body.innerHTML = ''
  }
})
