import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: [
      'src/**/*.{test,spec}.{js,jsx}', 
      'electron/managers/__tests__/*.test.js',
      'electron/managers/__tests__/*.test.mjs',
      'electron/utils/__tests__/*.test.js',
      'electron/handlers/__tests__/*.test.js'
    ],
    exclude: ['node_modules/**', 'dist/**', 'build/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'src/**/*.d.ts',
        'tests/cli/**',
        '**/__tests__/**'
      ],
      // Regression floor: fail CI if coverage drops below the current baseline
      // (set slightly under today's measured numbers to allow normal churn).
      thresholds: {
        statements: 28,
        branches: 60,
        functions: 32,
        lines: 28,
      },
    },
    mockReset: true,
    clearMocks: true
  }
})
