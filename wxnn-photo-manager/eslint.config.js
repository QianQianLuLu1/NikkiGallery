import js from '@eslint/js'
import ts from 'typescript-eslint'
import react from 'eslint-plugin-react'
import globals from 'globals'

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: ts.parser,
      parserOptions: {
        project: ['./tsconfig.json', './src/main/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true }
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2020
      }
    },
    plugins: {
      '@typescript-eslint': ts.plugin,
      react
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-undef': 'off'
    },
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['scripts/**/*.{ts,js}', '*.config.{ts,js}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2020
      }
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'release/**', 'node20/**', 'preview.html']
  }
]
