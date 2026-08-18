import { describe, test, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'node:module'

const { ipcMain, __reset } = createRequire(import.meta.url)('electron')

import { registerCoreIpcHandlers } from '../../ipcHandlers'

const trustedEvent = { senderFrame: { url: 'http://localhost:5173/' } }

let handler
let onConfigChange
let updateConfig

beforeEach(() => {
  onConfigChange = vi.fn()
  updateConfig = vi.fn(async (updates) => ({ language: 'en', minimizeToTray: false, ...updates }))
  registerCoreIpcHandlers({
    processManager: {},
    storageManager: { updateConfig },
    healthManager: {},
    projectDetector: {},
    getWindow: () => null,
    getUpdater: () => null,
    getMcp: () => null,
    applyOSSettings: vi.fn(async () => {}),
    onConfigChange,
  })
  handler = ipcMain._handlers.get('update-config')
})

afterEach(() => {
  __reset()
})

describe('update-config', () => {
  test('notifies onConfigChange with the merged config (keeps close-handler cache fresh)', async () => {
    const result = await handler(trustedEvent, { minimizeToTray: true })
    expect(result.success).toBe(true)
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ minimizeToTray: true }))
    expect(updateConfig).toHaveBeenCalledWith({ minimizeToTray: true })
  })

  test('rejects untrusted senders without notifying onConfigChange', async () => {
    const result = await handler({ senderFrame: { url: 'https://evil.example' } }, { minimizeToTray: true })
    expect(result.success).toBe(false)
    expect(onConfigChange).not.toHaveBeenCalled()
  })
})
