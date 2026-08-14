import { fileURLToPath } from 'url'
import { resolve, dirname } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(rootDir, 'electron/main.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(rootDir, 'electron/preload.ts') },
      },
    },
  },
  renderer: {
    root: '.',
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': resolve(rootDir, 'src') },
    },
    build: {
      outDir: 'dist-react',
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(rootDir, 'index.html'),
      },
    },
    server: {
      // Overridable so dev/e2e can avoid colliding with other projects on 5173
      port: Number(process.env.VITE_DEV_PORT) || 5173,
    },
  },
})
