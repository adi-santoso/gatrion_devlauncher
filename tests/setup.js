import '@testing-library/jest-dom/vitest'
import Module from 'node:module'
import { createRequire } from 'node:module'

// vi.mock cannot intercept `require('electron')` inside this project's CJS
// main-process modules (Vite keeps those calls native), so route the bare ids
// through shared in-memory mocks at the Node loader level. Handler tests then
// reach the same instance via `require('electron')`.
const require = createRequire(import.meta.url)
const electronMock = require('./mocks/electron.js')
const nodePtyMock = require('./mocks/node-pty.js')

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
