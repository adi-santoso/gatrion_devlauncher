const js = require('@eslint/js')
const reactHooks = require('eslint-plugin-react-hooks')
const react = require('eslint-plugin-react')
const tseslint = require('typescript-eslint')

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'dist-react/**', 'out/**', 'build/**', 'coverage/**', 'temp-*.js'],
  },
  js.configs.recommended,
  {
    // TypeScript renderer — strict since Fase 0 (ROADMAP_TS)
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        alert: 'readonly', Blob: 'readonly', clearInterval: 'readonly', clearTimeout: 'readonly', confirm: 'readonly',
        console: 'readonly', CustomEvent: 'readonly', document: 'readonly', File: 'readonly', FileReader: 'readonly', global: 'readonly',
        Image: 'readonly', localStorage: 'readonly', module: 'readonly', navigator: 'readonly', process: 'readonly', queueMicrotask: 'readonly',
        requestAnimationFrame: 'readonly', ResizeObserver: 'readonly', setInterval: 'readonly', setTimeout: 'readonly',
        SpeechSynthesisUtterance: 'readonly', URL: 'readonly', window: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin, 'react-hooks': reactHooks, react },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      'react/react-in-jsx-scope': 'off', // React 17+ JSX transform
      'react/prop-types': 'off', // TypeScript props instead of PropTypes
      'react/no-unescaped-entities': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-control-regex': 'off', // ANSI-strip regexes are intentional
      'no-undef': 'off', // TS parser handles type references
      'no-unused-vars': 'off', // use the TS-aware rule below
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error', // unknown-first: no explicit any allowed
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        alert: 'readonly', Blob: 'readonly', clearInterval: 'readonly', clearTimeout: 'readonly', confirm: 'readonly',
        console: 'readonly', CustomEvent: 'readonly', document: 'readonly', File: 'readonly', FileReader: 'readonly', global: 'readonly',
        Image: 'readonly', localStorage: 'readonly', module: 'readonly', navigator: 'readonly', process: 'readonly', queueMicrotask: 'readonly',
        requestAnimationFrame: 'readonly', ResizeObserver: 'readonly', setInterval: 'readonly', setTimeout: 'readonly',
        SpeechSynthesisUtterance: 'readonly', URL: 'readonly', window: 'readonly',
      },
    },
    plugins: { 'react-hooks': reactHooks, react },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      'react/react-in-jsx-scope': 'off', // React 17+ JSX transform
      'react/prop-types': 'off', // project doesn't use PropTypes
      'react/no-unescaped-entities': 'off', // quotes/curly quotes in UI copy are intentional
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-control-regex': 'off',
    },
  },
  {
    // Main process — TypeScript since Fase 1 (Jalur B); still CommonJS-shaped
    files: ['electron/**/*.{js,ts}', 'tests/fixtures/**/*.js', 'tests/mocks/**/*.js', '*.cjs', 'playwright.config.js', 'e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      parser: tseslint.parser,
      globals: {
        console: 'readonly', process: 'readonly', Buffer: 'readonly', __dirname: 'readonly',
        require: 'readonly', module: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly', URL: 'readonly', fetch: 'readonly',
        document: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
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
    // Changelog library tests are ESM (vitest) even though scripts/ is CommonJS
    files: ['scripts/__tests__/*.test.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
  {
    files: ['electron.vite.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { __dirname: 'readonly', process: 'readonly', console: 'readonly', Buffer: 'readonly' },
    },
  },
  {
    files: ['vite.config.js', 'vitest.config.js', 'tests/setup.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { __dirname: 'readonly', afterEach: 'readonly', process: 'readonly', vi: 'readonly' },
    },
  },
]
