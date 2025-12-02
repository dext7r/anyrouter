import js from '@eslint/js'
import globals from 'globals'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        // Cloudflare Workers globals
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        console: 'readonly',
        // jQuery (for admin page)
        $: 'readonly',
        jQuery: 'readonly',
      },
    },
    rules: {
      // 基础规则
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',

      // 代码风格
      semi: ['error', 'never'],
      quotes: ['error', 'single', { avoidEscape: true }],
      'comma-dangle': ['error', 'only-multiline'],
      indent: ['error', 2, { SwitchCase: 1 }],

      // 最佳实践
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'multi-line'],
      'no-throw-literal': 'error',
    },
  },
  {
    // pages 目录是 HTML 模板，放宽规则
    files: ['src/pages/**/*.js'],
    rules: {
      'no-useless-escape': 'off',
      indent: 'off',
      quotes: 'off',
    },
  },
  {
    ignores: [
      'node_modules/',
      'anyrouter.js',
      '_worker.js',
      '.wrangler/',
    ],
  },
]
