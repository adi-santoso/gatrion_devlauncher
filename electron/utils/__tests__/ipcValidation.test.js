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
})
