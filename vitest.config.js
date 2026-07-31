import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test-setup.js'],
    include: [
      'src/**/*.{test,spec}.{js,jsx}', 
      'electron/managers/__tests__/*.test.js',
      'electron/managers/__tests__/*.test.mjs'
    ],
    exclude: ['node_modules/**', 'dist/**', 'build/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'src/**/*.d.ts',
        'test-*.js',
        '**/__tests__/**'
      ]
    },
    mockReset: true,
    clearMocks: true
  }
})
