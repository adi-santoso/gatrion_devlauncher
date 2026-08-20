import { describe, test, expect, vi } from 'vitest'
import { assertPayload, safeHandle } from '../ipcValidation'

function fakeIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle: (channel, callback) => handlers.set(channel, callback),
  }
}

describe('safeHandle', () => {
  test('registers the channel and returns the handler result on success', async () => {
    const ipcMain = fakeIpcMain()
    safeHandle(ipcMain, vi.fn(), 'test-ok', async () => ({ success: true, data: 42 }))
    const result = await ipcMain.handlers.get('test-ok')({ senderFrame: { url: 'x' } })
    expect(result).toEqual({ success: true, data: 42 })
  })

  test('asserts the sender before running the handler', async () => {
    const ipcMain = fakeIpcMain()
    const assertTrusted = vi.fn(() => { throw new Error('Unauthorized IPC sender') })
    const handler = vi.fn()
    safeHandle(ipcMain, assertTrusted, 'test-auth', handler)
    const result = await ipcMain.handlers.get('test-auth')({})
    expect(result).toEqual({ success: false, error: 'Unauthorized IPC sender' })
    expect(handler).not.toHaveBeenCalled()
  })

  test('never rejects: handler throws become { success: false, error }', async () => {
    const ipcMain = fakeIpcMain()
    safeHandle(ipcMain, vi.fn(), 'test-throw', async () => { throw new Error('boom') })
    const result = await ipcMain.handlers.get('test-throw')({ senderFrame: { url: 'x' } })
    expect(result).toEqual({ success: false, error: 'boom' })
  })

  test('validates payloads for channels with rules', async () => {
    const ipcMain = fakeIpcMain()
    const handler = vi.fn(async () => ({ success: true }))
    safeHandle(ipcMain, vi.fn(), 'terminal-input', handler)
    const bad = await ipcMain.handlers.get('terminal-input')({ senderFrame: { url: 'x' } }, 't1', 'y'.repeat(65537))
    expect(bad).toEqual({ success: false, error: expect.stringMatching(/too long/) })
    expect(handler).not.toHaveBeenCalled()
    const good = await ipcMain.handlers.get('terminal-input')({ senderFrame: { url: 'x' } }, 't1', 'ls')
    expect(good).toEqual({ success: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('assertPayload', () => {
  test('valid terminal-input payload passes', () => {
    expect(() => assertPayload('terminal-input', ['term-1', 'ls -la'])).not.toThrow()
  })

  test('rejects non-string terminal id', () => {
    expect(() => assertPayload('terminal-input', [123, 'ls'])).toThrow(/must be a string/)
  })

  test('rejects oversized terminal input (PTY flood guard)', () => {
    expect(() => assertPayload('terminal-input', ['term-1', 'x'.repeat(65537)])).toThrow(/too long/)
    expect(() => assertPayload('terminal-input', ['term-1', 'x'.repeat(65536)])).not.toThrow()
  })

  test('terminal-resize enforces integer bounds', () => {
    expect(() => assertPayload('terminal-resize', ['term-1', 80, 24])).not.toThrow()
    expect(() => assertPayload('terminal-resize', ['term-1', '80', 24])).toThrow(/must be an integer/)
    expect(() => assertPayload('terminal-resize', ['term-1', 0, 24])).toThrow(/>= 1/)
    expect(() => assertPayload('terminal-resize', ['term-1', 80, 999])).toThrow(/<= 500/)
  })

  test('terminal-kill requires a string id', () => {
    expect(() => assertPayload('terminal-kill', ['term-1'])).not.toThrow()
    expect(() => assertPayload('terminal-kill', [null])).toThrow(/must be a string/)
  })

  test('stop-project force must be a boolean and is optional', () => {
    expect(() => assertPayload('stop-project', ['p1', true])).not.toThrow()
    expect(() => assertPayload('stop-project', ['p1', 'yes'])).toThrow(/must be a boolean/)
    expect(() => assertPayload('stop-project', ['p1'])).not.toThrow()
    expect(() => assertPayload('stop-project', ['', true])).toThrow(/required/)
  })

  test('stop-custom-command requires an integer runId', () => {
    expect(() => assertPayload('stop-custom-command', [7])).not.toThrow()
    expect(() => assertPayload('stop-custom-command', ['7'])).toThrow(/must be an integer/)
  })

  test('start-all-projects accepts undefined projectIds (start everything)', () => {
    expect(() => assertPayload('start-all-projects', [undefined, { delayMs: 500 }])).not.toThrow()
    expect(() => assertPayload('start-all-projects', [['p1', 'p2'], undefined])).not.toThrow()
  })

  test('start-all-projects rejects non-array projectIds', () => {
    expect(() => assertPayload('start-all-projects', ['p1', {}])).toThrow(/must be an array/)
  })

  test('start-all-projects rejects non-object options', () => {
    expect(() => assertPayload('start-all-projects', [['p1'], 'fast'])).toThrow(/must be an object/)
  })

  test('channels without rules are a no-op', () => {
    expect(() => assertPayload('some-unlisted-channel', ['anything', 42])).not.toThrow()
  })

  // --- rules added when central validation was extended to every channel --

  test('desktop channels enforce string urls/paths', () => {
    expect(() => assertPayload('open-external-url', ['https://example.com'])).not.toThrow()
    expect(() => assertPayload('open-external-url', [42])).toThrow(/must be a string/)
    expect(() => assertPayload('reveal-in-explorer', ['C:\\x'])).not.toThrow()
    expect(() => assertPayload('reveal-in-explorer', [''])).toThrow(/required/)
  })

  test('preview channels: bounds object required, zoom is a float', () => {
    expect(() => assertPayload('preview-set-bounds', ['p1', { x: 0, y: 0, width: 800, height: 600 }])).not.toThrow()
    expect(() => assertPayload('preview-set-bounds', ['p1', null])).toThrow(/must be an object/)
    expect(() => assertPayload('preview-zoom', ['p1', 1.25])).not.toThrow()
    expect(() => assertPayload('preview-zoom', ['p1', '1.25'])).toThrow(/must be a number/)
    expect(() => assertPayload('preview-show', [undefined])).not.toThrow()
  })

  test('preview-nudge requires a non-empty project id', () => {
    expect(() => assertPayload('preview-nudge', ['p1'])).not.toThrow()
    expect(() => assertPayload('preview-nudge', [''])).toThrow(/required/)
    expect(() => assertPayload('preview-nudge', [42])).toThrow(/must be a string/)
  })

  test('check-port-conflict requires an integer in range', () => {
    expect(() => assertPayload('check-port-conflict', [3000])).not.toThrow()
    expect(() => assertPayload('check-port-conflict', ['3000'])).toThrow(/must be an integer/)
    expect(() => assertPayload('check-port-conflict', [0])).toThrow(/>= 1/)
    expect(() => assertPayload('check-port-conflict', [70000])).toThrow(/<= 65535/)
  })

  test('get-logs / git-log limit is an optional bounded integer', () => {
    expect(() => assertPayload('get-logs', ['p1'])).not.toThrow()
    expect(() => assertPayload('get-logs', ['p1', 500])).not.toThrow()
    expect(() => assertPayload('get-logs', ['p1', '500'])).toThrow(/must be an integer/)
    expect(() => assertPayload('git-log', ['/tmp', 150])).toThrow(/<= 100/)
  })

  test('git file lists are string arrays (empty = stage all)', () => {
    expect(() => assertPayload('git-stage', ['/tmp', []])).not.toThrow()
    expect(() => assertPayload('git-stage', ['/tmp', ['a.js', 'b.js']])).not.toThrow()
    expect(() => assertPayload('git-stage', ['/tmp', 'a.js'])).toThrow(/must be an array/)
    expect(() => assertPayload('git-stage', ['/tmp', ['a.js', 5]])).toThrow(/non-empty strings/)
  })

  test('npm-update allows a null package name (update all)', () => {
    expect(() => assertPayload('npm-update', ['/tmp', null])).not.toThrow()
    expect(() => assertPayload('npm-update', ['/tmp', 'lodash'])).not.toThrow()
    expect(() => assertPayload('npm-update', ['/tmp', 42])).toThrow(/must be a string/)
  })

  test('workspace-search-files bounds the query and optional path list', () => {
    expect(() => assertPayload('workspace-search-files', ['app', undefined])).not.toThrow()
    expect(() => assertPayload('workspace-search-files', ['app', ['/p1', '/p2']])).not.toThrow()
    expect(() => assertPayload('workspace-search-files', ['x'.repeat(101)])).toThrow(/too long/)
  })

  test('add-project requires an object payload', () => {
    expect(() => assertPayload('add-project', [{ name: 'x', path: '/tmp' }])).not.toThrow()
    expect(() => assertPayload('add-project', ['name'])).toThrow(/must be an object/)
  })

  test('omp-update-session-tokens: integer tokens, optional non-negative cost', () => {
    expect(() => assertPayload('omp-update-session-tokens', ['p1', 's1', 3500, 0.015])).not.toThrow()
    expect(() => assertPayload('omp-update-session-tokens', ['p1', 's1', 3500, null])).not.toThrow()
    expect(() => assertPayload('omp-update-session-tokens', ['p1', 's1', '3500'])).toThrow(/must be an integer/)
    expect(() => assertPayload('omp-update-session-tokens', ['p1', 's1', -1])).toThrow(/>= 0/)
    expect(() => assertPayload('omp-update-session-tokens', ['p1', 's1', 10, -0.5])).toThrow(/>= 0/)
  })

  test('omp-chat enforces message length and optional options object', () => {
    expect(() => assertPayload('omp-chat', ['p1', '/tmp', 'hello', { images: [] }])).not.toThrow()
    expect(() => assertPayload('omp-chat', ['p1', '/tmp', 'hello'])).not.toThrow()
    expect(() => assertPayload('omp-chat', ['p1', '/tmp', 'x'.repeat(20001)])).toThrow(/too long/)
    expect(() => assertPayload('omp-chat', ['p1', '/tmp', 'hello', 'bad'])).toThrow(/must be an object/)
  })

  test('omp channels tolerate an omitted optional cwd', () => {
    expect(() => assertPayload('omp-abort', ['p1'])).not.toThrow()
    expect(() => assertPayload('omp-get-models', ['p1', undefined])).not.toThrow()
    expect(() => assertPayload('omp-set-model', ['p1', undefined, 'anthropic', 'claude-sonnet-4'])).not.toThrow()
  })
})
