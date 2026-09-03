import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'node:module'

const { ipcMain, __reset } = createRequire(import.meta.url)('electron')

import { setupPreviewCredentialHandlers } from '../previewCredentialHandlers'

const fakeEvent = { senderFrame: { url: 'http://localhost:5173/' } }

function makeCredentialManager() {
  return {
    getCredentials: vi.fn(async () => [{ username: 'admin', password: 'secret' }]),
    saveCredential: vi.fn(async () => {}),
    removeCredential: vi.fn(async () => {}),
  }
}

describe('previewCredentialHandlers', () => {
  beforeEach(() => __reset())

  test('get delegates and returns the credential list', async () => {
    const mgr = makeCredentialManager()
    setupPreviewCredentialHandlers(mgr)
    const handler = ipcMain._handlers.get('preview-get-credentials')
    const result = await handler(fakeEvent, 'http://localhost:3000')
    expect(mgr.getCredentials).toHaveBeenCalledWith('http://localhost:3000')
    expect(result).toEqual([{ username: 'admin', password: 'secret' }])
  })

  test('save saves and returns success', async () => {
    const mgr = makeCredentialManager()
    setupPreviewCredentialHandlers(mgr)
    const handler = ipcMain._handlers.get('preview-save-credential')
    const result = await handler(fakeEvent, 'http://localhost:3000', 'admin', 'secret123')
    expect(mgr.saveCredential).toHaveBeenCalledWith('http://localhost:3000', 'admin', 'secret123')
    expect(result).toEqual({ success: true })
  })

  test('remove removes and returns success', async () => {
    const mgr = makeCredentialManager()
    setupPreviewCredentialHandlers(mgr)
    const handler = ipcMain._handlers.get('preview-remove-credential')
    const result = await handler(fakeEvent, 'http://localhost:3000', 'admin')
    expect(mgr.removeCredential).toHaveBeenCalledWith('http://localhost:3000', 'admin')
    expect(result).toEqual({ success: true })
  })

  test('invalid payload fails validation without calling the manager', async () => {
    const mgr = makeCredentialManager()
    setupPreviewCredentialHandlers(mgr)
    const handler = ipcMain._handlers.get('preview-save-credential')
    const result = await handler(fakeEvent, 'http://localhost:3000', '', 'secret123')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/username is required/)
    expect(mgr.saveCredential).not.toHaveBeenCalled()
  })
})