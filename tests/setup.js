import '@testing-library/jest-dom/vitest'
import Module from 'node:module'
import { createRequire } from 'node:module'
import os from 'node:os'

// In-workspace fixtures must not accidentally discover the application's Git
// repository when a test deliberately creates a non-repository directory.
process.env.GIT_CEILING_DIRECTORIES = os.tmpdir()

// vi.mock cannot intercept `require('electron')` inside this project's CJS
// main-process modules (Vite keeps those calls native), so route the bare ids
// through shared in-memory mocks at the Node loader level. Handler tests then
// reach the same instance via `require('electron')`.
const require = createRequire(import.meta.url)
const electronMock = require('./mocks/electron.js')
const nodePtyMock = require('./mocks/node-pty.js')

// jsdom does not implement layout observers used by responsive panels.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const originalLoad = Module._load
Module._load = function (request, ...rest) {
  if (request === 'electron') return electronMock
  if (request === 'node-pty') return nodePtyMock
  return originalLoad.call(this, request, ...rest)
}

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks()
  electronMock.__reset()
})
