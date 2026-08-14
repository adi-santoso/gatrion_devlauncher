import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { ipcMain, dialog, __reset, TEMP_USER_DATA } = createRequire(import.meta.url)('electron')

import { setupSystemHandlers, TOOLS } from '../systemHandlers'

const fakeEvent = { senderFrame: { url: 'http://localhost:5173/' } }

let tempDir

beforeEach(() => {
  __reset()
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-handlers-'))
})

describe('systemHandlers', () => {
  test('TOOLS covers the expected tool list', () => {
    expect(TOOLS.some((tool) => tool.name === 'git')).toBe(true)
    expect(TOOLS.some((tool) => tool.name === 'node')).toBe(true)
    expect(TOOLS.every((tool) => tool.label)).toBe(true)
  })

  test('export-diagnostics writes the bundle via the save dialog', async () => {
    // Seed some userData so the bundle has real content to read.
    fs.mkdirSync(path.join(TEMP_USER_DATA, 'logs'), { recursive: true })
    fs.writeFileSync(path.join(TEMP_USER_DATA, 'config.json'), JSON.stringify({ theme: 'dark' }))
    fs.writeFileSync(path.join(TEMP_USER_DATA, 'logs', 'main.log'), 'line1\nline2\n')

    setupSystemHandlers()
    const target = path.join(tempDir, 'diag.json')
    dialog.showSaveDialog = vi.fn(async () => ({ canceled: false, filePath: target }))

    const result = await ipcMain._handlers.get('export-diagnostics')(fakeEvent)
    expect(result.success).toBe(true)
    expect(result.filePath).toBe(target)

    const bundle = JSON.parse(fs.readFileSync(target, 'utf8'))
    expect(bundle.app.version).toBe('0.0.0-test')
    expect(bundle.config.theme).toBe('dark')
    expect(bundle.mainLog).toContain('line1')
  })

  test('export-diagnostics reports a canceled save dialog', async () => {
    setupSystemHandlers()
    dialog.showSaveDialog = vi.fn(async () => ({ canceled: true }))
    const result = await ipcMain._handlers.get('export-diagnostics')(fakeEvent)
    expect(result).toEqual({ success: false, canceled: true })
  })

  test('system-env-check probes every tool and returns found flags', async () => {
    setupSystemHandlers()
    const result = await ipcMain._handlers.get('system-env-check')(fakeEvent)
    expect(result.success).toBe(true)
    expect(result.tools).toHaveLength(TOOLS.length)
    for (const tool of result.tools) {
      expect(typeof tool.found).toBe('boolean')
      if (tool.found) expect(typeof tool.version).toBe('string')
    }
  }, 30000)
})
