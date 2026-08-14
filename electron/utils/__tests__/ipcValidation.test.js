import { describe, test, expect } from 'vitest'
import { assertPayload } from '../ipcValidation'

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
