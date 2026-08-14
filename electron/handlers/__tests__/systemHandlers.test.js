import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { ipcMain, dialog, shell, __reset, TEMP_USER_DATA } = createRequire(import.meta.url)('electron')

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

  test('get-main-log tails main.log from userData', async () => {
    fs.mkdirSync(path.join(TEMP_USER_DATA, 'logs'), { recursive: true })
    const lines = Array.from({ length: 12 }, (_, i) => `{"line":${i}}`)
    fs.writeFileSync(path.join(TEMP_USER_DATA, 'logs', 'main.log'), lines.join('\n'))
    setupSystemHandlers()
    const handler = ipcMain._handlers.get('get-main-log')

    const full = await handler(fakeEvent, undefined)
    expect(full.success).toBe(true)
    expect(full.lines).toEqual(lines)

    const limited = await handler(fakeEvent, 10)
    expect(limited.lines).toEqual(lines.slice(-10))
  })

  test('get-main-log returns an empty list when the file is missing', async () => {
    // Isolate: point the handler at an empty userData dir by removing the log.
    fs.rmSync(path.join(TEMP_USER_DATA, 'logs', 'main.log'), { force: true })
    setupSystemHandlers()
    const result = await ipcMain._handlers.get('get-main-log')(fakeEvent, undefined)
    expect(result).toEqual({ success: true, lines: [] })
  })

  test('crash dump channels list, clear and open the dumps folder', async () => {
    const crashDir = path.join(TEMP_USER_DATA, 'crashDumps')
    fs.mkdirSync(crashDir, { recursive: true })
    fs.writeFileSync(path.join(crashDir, 'app.dmp'), 'dmp-data')
    fs.writeFileSync(path.join(crashDir, 'renderer.dmp'), 'dmp-data')
    fs.writeFileSync(path.join(crashDir, 'notes.txt'), 'not a dump')
    setupSystemHandlers()
    const handlers = ipcMain._handlers

    const listed = await handlers.get('get-crash-dumps')(fakeEvent)
    expect(listed.success).toBe(true)
    expect(listed.dumps.map((d) => d.name).sort()).toEqual(['app.dmp', 'renderer.dmp'])
    expect(listed.dir).toBe(crashDir)

    shell.openPath = vi.fn(async () => '')
    const opened = await handlers.get('open-crash-dumps-folder')(fakeEvent)
    expect(opened.success).toBe(true)
    expect(shell.openPath).toHaveBeenCalledWith(crashDir)

    await handlers.get('clear-crash-dumps')(fakeEvent)
    const after = await handlers.get('get-crash-dumps')(fakeEvent)
    expect(after.dumps).toEqual([])
  })

  test('crash dump channels tolerate a missing folder', async () => {
    fs.rmSync(path.join(TEMP_USER_DATA, 'crashDumps'), { recursive: true, force: true })
    setupSystemHandlers()
    const handlers = ipcMain._handlers
    expect((await handlers.get('get-crash-dumps')(fakeEvent)).dumps).toEqual([])
    expect((await handlers.get('clear-crash-dumps')(fakeEvent)).success).toBe(true)
    expect((await handlers.get('open-crash-dumps-folder')(fakeEvent)).success).toBe(true)
  })
})
