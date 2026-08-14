import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { ipcMain, shell, __reset } = createRequire(import.meta.url)('electron')

import { setupDesktopHandlers } from '../desktopHandlers'

const fakeEvent = { senderFrame: { url: 'http://localhost:5173/' } }

let tempDir

beforeEach(() => {
  __reset()
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-handlers-'))
})

function register() {
  setupDesktopHandlers()
  return {
    openExternalUrl: ipcMain._handlers.get('open-external-url'),
    revealInExplorer: ipcMain._handlers.get('reveal-in-explorer'),
    openInEditor: ipcMain._handlers.get('open-in-editor'),
  }
}

describe('desktopHandlers', () => {
  test('open-external-url opens http/https URLs via shell', async () => {
    const { openExternalUrl } = register()
    shell.openExternal = vi.fn(async () => {})
    const result = await openExternalUrl(fakeEvent, 'https://example.com/path?q=1')
    expect(result).toEqual({ success: true })
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com/path?q=1')
  })

  test('open-external-url rejects non-http(s) protocols', async () => {
    const { openExternalUrl } = register()
    shell.openExternal = vi.fn(async () => {})
    const result = await openExternalUrl(fakeEvent, 'file:///etc/passwd')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Only http/)
    expect(shell.openExternal).not.toHaveBeenCalled()
  })

  test('open-external-url rejects malformed or missing urls', async () => {
    const { openExternalUrl } = register()
    expect((await openExternalUrl(fakeEvent, 'not a url')).success).toBe(false)
    expect((await openExternalUrl(fakeEvent, undefined)).success).toBe(false)
    expect((await openExternalUrl(fakeEvent, 42)).success).toBe(false)
  })

  test('reveal-in-explorer reveals existing paths only', async () => {
    const { revealInExplorer } = register()
    shell.showItemInFolder = vi.fn()
    expect(await revealInExplorer(fakeEvent, tempDir)).toEqual({ success: true })
    expect(shell.showItemInFolder).toHaveBeenCalledWith(tempDir)

    const missing = await revealInExplorer(fakeEvent, path.join(tempDir, 'nope'))
    expect(missing.success).toBe(false)
    expect(missing.error).toMatch(/does not exist/)

    expect((await revealInExplorer(fakeEvent, 42)).success).toBe(false)
    expect((await revealInExplorer(fakeEvent, '')).success).toBe(false)
  })

  test('open-in-editor opens existing paths and surfaces shell errors', async () => {
    const { openInEditor } = register()
    shell.openPath = vi.fn(async () => '')
    expect(await openInEditor(fakeEvent, tempDir)).toEqual({ success: true })
    expect(shell.openPath).toHaveBeenCalledWith(tempDir)

    shell.openPath = vi.fn(async () => 'Access is denied')
    const failed = await openInEditor(fakeEvent, tempDir)
    expect(failed.success).toBe(false)
    expect(failed.error).toBe('Access is denied')

    const missing = await openInEditor(fakeEvent, path.join(tempDir, 'nope'))
    expect(missing.success).toBe(false)
    expect(missing.error).toMatch(/does not exist/)
  })
})
