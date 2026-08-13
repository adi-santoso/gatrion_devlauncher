const js = require('@eslint/js')
const reactHooks = require('eslint-plugin-react-hooks')

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'dist-react/**', 'build/**', 'coverage/**', 'temp-*.js'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        alert: 'readonly', Blob: 'readonly', clearInterval: 'readonly', clearTimeout: 'readonly', confirm: 'readonly',
        console: 'readonly', document: 'readonly', File: 'readonly', FileReader: 'readonly', global: 'readonly',
        Image: 'readonly', module: 'readonly', navigator: 'readonly', process: 'readonly', queueMicrotask: 'readonly',
        ResizeObserver: 'readonly', setInterval: 'readonly', setTimeout: 'readonly',
        URL: 'readonly', window: 'readonly',
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-control-regex': 'off',
    },
  },
  {
    files: ['electron/**/*.js', 'test-*.js', '*.cjs', 'playwright.config.js', 'e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        console: 'readonly', process: 'readonly', Buffer: 'readonly', __dirname: 'readonly',
        require: 'readonly', module: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly', URL: 'readonly', fetch: 'readonly',
        document: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-control-regex': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-catch': 'off',
    },
  },
  {
    // Vitest files inside electron/ use ESM even though the rest of electron/ is CommonJS
    files: ['electron/**/__tests__/*.test.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
  {
    // Icon/build helper scripts run under plain Node
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        console: 'readonly', process: 'readonly', Buffer: 'readonly', __dirname: 'readonly',
        require: 'readonly', module: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    files: ['vite.config.js', 'vitest.config.js', 'test-setup.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { __dirname: 'readonly', afterEach: 'readonly', process: 'readonly', vi: 'readonly' },
    },
  },
  {
    files: ['test-integration.js'],
    languageOptions: { globals: { window: 'readonly' } },
  },
]
