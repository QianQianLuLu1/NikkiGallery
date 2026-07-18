import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * T16：vitest 配置
 *
 * 测试范围：主进程纯函数工具模块 + 渲染层 zustand store
 * 不测：依赖 Electron API / better-sqlite3 / sharp 的模块（需 mock，复杂度过高）
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'release'],
    globals: true,
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/main/utils/media-constants.ts',
        'src/main/utils/scene-category.ts',
        'src/main/utils/game-events.ts',
        'src/main/utils/phash.ts',
        'src/main/utils/concurrency.ts',
        'src/main/utils/file-utils.ts',
        'src/main/utils/duplicate-scoring.ts',
        'src/main/database/media-repository.ts',
        'src/renderer/stores/operationHistoryStore.ts',
        'src/renderer/stores/mediaStore.ts',
        'src/renderer/utils/lut.ts',
        'src/renderer/utils/imageProcessor.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@common': path.resolve(__dirname, 'src/common')
    }
  }
})
