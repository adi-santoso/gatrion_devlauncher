import { describe, test, expect, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { ipcMain, app, __reset } = createRequire(import.meta.url)('electron')

import { registerCoreIpcHandlers } from '../../ipcHandlers'

let tempDir
let handler

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devlauncher-reset-ipc-'))
  app._userDataPath = tempDir
  app._relaunched = false
  app._quitted = false
  registerCoreIpcHandlers({
    processManager: {},
    storageManager: {},
    healthManager: {},
    projectDetector: {},
    getWindow: () => null,
    getUpdater: () => null,
    getMcp: () => null,
    applyOSSettings: async () => {},
  })
  handler = ipcMain._handlers.get('reset-app-data')
})

afterEach(() => {
  __reset()
  fs.rmSync(tempDir, { recursive: true, force: true })
})

const trustedEvent = { senderFrame: { url: 'http://localhost:5173/' } }

describe('reset-app-data', () => {
  test('writes the pending marker and relaunches the app', async () => {
    const result = await handler(trustedEvent)
    expect(result).toEqual({ success: true })
    expect(fs.readFileSync(path.join(tempDir, '.reset-pending'), 'utf8')).toBeTruthy()
    expect(app._relaunched).toBe(true)
    expect(app._quitted).toBe(true)
  })

  test('rejects untrusted senders without writing the marker', async () => {
    const result = await handler({ senderFrame: { url: 'https://evil.example' } })
    expect(result.success).toBe(false)
    expect(fs.existsSync(path.join(tempDir, '.reset-pending'))).toBe(false)
    expect(app._relaunched).toBe(false)
  })
})
