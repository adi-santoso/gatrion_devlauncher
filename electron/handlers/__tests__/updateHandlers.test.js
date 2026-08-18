import { describe, test, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'node:module'

const { ipcMain, __reset } = createRequire(import.meta.url)('electron')

import { registerCoreIpcHandlers } from '../../ipcHandlers'

let handler
let updater

beforeEach(() => {
  updater = {
    check: vi.fn(async () => ({ success: true })),
    startDownload: vi.fn(async () => ({ success: true })),
    quitAndInstall: vi.fn(() => ({ success: true })),
    getState: vi.fn(() => ({ state: 'available', progress: null, error: null })),
  }
  registerCoreIpcHandlers({
    processManager: {},
    storageManager: {},
    healthManager: {},
    projectDetector: {},
    getWindow: () => null,
    getUpdater: () => updater,
    getMcp: () => null,
    applyOSSettings: async () => {},
  })
  handler = ipcMain._handlers.get('update-check')
})

afterEach(() => {
  __reset()
})

const trustedEvent = { senderFrame: { url: 'http://localhost:5173/' } }

describe('update-check', () => {
  test('delegates to updater.check() so electron-updater state is populated', async () => {
    const result = await handler(trustedEvent)
    expect(result).toEqual({ success: true })
    expect(updater.check).toHaveBeenCalledTimes(1)
  })

  test('forwards check failures to the renderer', async () => {
    updater.check.mockResolvedValueOnce({ success: false, error: 'no feed' })
    const result = await handler(trustedEvent)
    expect(result).toEqual({ success: false, error: 'no feed' })
  })

  test('rejects untrusted senders without touching the updater', async () => {
    const result = await handler({ senderFrame: { url: 'https://evil.example' } })
    expect(result.success).toBe(false)
    expect(updater.check).not.toHaveBeenCalled()
  })

  test('reports unavailable when no updater is wired', async () => {
    ipcMain._handlers.delete('update-check')
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
    const unavailable = ipcMain._handlers.get('update-check')
    const result = await unavailable(trustedEvent)
    expect(result).toEqual({ success: false, error: 'Auto-update is unavailable' })
  })
})
