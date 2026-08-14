import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'node:module'

const { ipcMain, __reset } = createRequire(import.meta.url)('electron')
const nodePty = createRequire(import.meta.url)('node-pty')

import { setupTerminalHandlers, killAllTerminals } from '../terminalHandlers'

const fakeEvent = { senderFrame: { url: 'http://localhost:5173/' } }

function makeWindow() {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  }
}

describe('terminalHandlers', () => {
  beforeEach(() => __reset())

  test('terminal-create spawns a pty and returns its id', async () => {
    const window = makeWindow()
    setupTerminalHandlers(window)
    const spawn = vi.spyOn(nodePty, 'spawn')
    const create = ipcMain._handlers.get('terminal-create')

    const result = await create(fakeEvent, { shell: 'powershell.exe', cwd: 'C:\\temp', cols: 100, rows: 40 })
    expect(result.success).toBe(true)
    expect(result.id).toMatch(/^term-/)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn.mock.calls[0][0]).toBe('powershell.exe')
    expect(spawn.mock.calls[0][2]).toMatchObject({ cols: 100, rows: 40, cwd: 'C:\\temp' })
  })

  test('terminal-create defaults shell/cwd/dimensions when omitted', async () => {
    const window = makeWindow()
    setupTerminalHandlers(window)
    const spawn = vi.spyOn(nodePty, 'spawn')
    await ipcMain._handlers.get('terminal-create')(fakeEvent, {})
    expect(spawn.mock.calls[0][2]).toMatchObject({ cols: 80, rows: 24 })
  })

  test('terminal-data and terminal-exit events forward to the renderer', async () => {
    const window = makeWindow()
    setupTerminalHandlers(window)
    const create = ipcMain._handlers.get('terminal-create')
    const { id } = await create(fakeEvent, {})

    // Capture the spawned fake terminal to emit events.
    const spawned = nodePty.spawn.mock.results[0].value
    spawned._emitData('hello\r\n')
    expect(window.webContents.send).toHaveBeenCalledWith('terminal-data', id, 'hello\r\n')

    spawned._emitExit(0)
    expect(window.webContents.send).toHaveBeenCalledWith('terminal-exit', id, 0)
  })

  test('terminal-input writes to the pty; unknown id errors', async () => {
    const window = makeWindow()
    setupTerminalHandlers(window)
    const create = ipcMain._handlers.get('terminal-create')
    const input = ipcMain._handlers.get('terminal-input')
    const { id } = await create(fakeEvent, {})

    const spawned = nodePty.spawn.mock.results[0].value
    const write = vi.spyOn(spawned, 'write')
    expect(await input(fakeEvent, id, 'ls -la')).toEqual({ success: true })
    expect(write).toHaveBeenCalledWith('ls -la')

    const missing = await input(fakeEvent, 'term-nope', 'x')
    expect(missing.success).toBe(false)
    expect(missing.error).toMatch(/not found/)
  })

  test('terminal-resize and terminal-kill act on the pty', async () => {
    const window = makeWindow()
    setupTerminalHandlers(window)
    const create = ipcMain._handlers.get('terminal-create')
    const input = ipcMain._handlers.get('terminal-input')
    const resize = ipcMain._handlers.get('terminal-resize')
    const kill = ipcMain._handlers.get('terminal-kill')
    const { id } = await create(fakeEvent, {})

    const spawned = nodePty.spawn.mock.results[0].value
    const resizeSpy = vi.spyOn(spawned, 'resize')
    await resize(fakeEvent, id, 120, 30)
    expect(resizeSpy).toHaveBeenCalledWith(120, 30)
    // Invalid dims are ignored, not forwarded.
    await resize(fakeEvent, id, 'big', 30)
    expect(resizeSpy).toHaveBeenCalledTimes(1)

    const killSpy = vi.spyOn(spawned, 'kill')
    expect(await kill(fakeEvent, id)).toEqual({ success: true })
    expect(killSpy).toHaveBeenCalled()

    // After kill the terminal is gone.
    expect((await input(fakeEvent, id, 'x')).success).toBe(false)
  })

  test('killAllTerminals kills and clears every session', async () => {
    const window = makeWindow()
    setupTerminalHandlers(window)
    await ipcMain._handlers.get('terminal-create')(fakeEvent, {})
    await ipcMain._handlers.get('terminal-create')(fakeEvent, {})
    const first = nodePty.spawn.mock.results[0].value
    const second = nodePty.spawn.mock.results[1].value
    const kills = [vi.spyOn(first, 'kill'), vi.spyOn(second, 'kill')]

    killAllTerminals()
    expect(kills[0]).toHaveBeenCalled()
    expect(kills[1]).toHaveBeenCalled()
  })
})
