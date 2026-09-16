import { describe, test, expect, vi } from 'vitest'

import { createToolRunner, execTool } from '../packageRunner'
import path from 'node:path'

function makeChild({ code = 0, stdout = '', stderr = '', error = null, autoClose = true } = {}) {
  const child = {
    stdout: { on: (event, cb) => { if (event === 'data') process.nextTick(() => cb(stdout)) } },
    stderr: { on: (event, cb) => { if (event === 'data') process.nextTick(() => cb(stderr)) } },
    on: (event, cb) => {
      if (event === 'close' && autoClose) process.nextTick(() => cb(code))
      if (event === 'error' && error) process.nextTick(() => cb(error))
    },
    kill: vi.fn(),
  }
  return child
}

describe('packageRunner — execTool', () => {
  test('runs project-local Python directly even when the path has spaces', async () => {
    const spawn = vi.fn(() => makeChild({ stdout: '[]' }))
    const python = path.resolve('project with spaces/.venv/Scripts/python.exe')
    await createToolRunner(spawn).execTool(python, process.cwd(), ['-m', 'pip', 'list'])
    expect(spawn).toHaveBeenCalledWith(python, ['-m', 'pip', 'list'], expect.objectContaining({ shell: false }))
  })

  test('rejects a signal termination instead of reporting a successful scan', async () => {
    const runner = createToolRunner(() => makeChild({ code: null }))
    await expect(runner.execTool('composer', '.', ['outdated'])).rejects.toThrow()
  })
  test('spawns the tool joined with args through a shell', async () => {
    const spawn = vi.fn(() => makeChild({ code: 0, stdout: '{}' }))
    const runner = createToolRunner(spawn)
    const out = await runner.execTool('go', 'C:/proj', ['list', '-m', '-u'], { timeoutMs: 5000 })
    expect(out).toBe('{}')
    expect(spawn).toHaveBeenCalledWith('go list -m -u', expect.objectContaining({ shell: true, windowsHide: true, cwd: 'C:/proj' }))
  })

  test('accepts custom okCodes (e.g. npm/pip exit 0 or 1)', async () => {
    const runner = createToolRunner(() => makeChild({ code: 1, stdout: 'data' }))
    await expect(runner.execTool('pip', '.', ['list'], { okCodes: [0, 1] })).resolves.toBe('data')
  })

  test('non-zero exits reject with stderr', async () => {
    const runner = createToolRunner(() => makeChild({ code: 2, stderr: 'go: module not found\n' }))
    await expect(runner.execTool('go', '.', ['list'])).rejects.toThrow(/module not found/)
  })

  test('kills the child and rejects on timeout', async () => {
    const child = makeChild({ autoClose: false })
    const runner = createToolRunner(() => child)
    await expect(runner.execTool('composer', '.', ['update'], { timeoutMs: 50 })).rejects.toThrow(/timed out/)
    expect(child.kill).toHaveBeenCalled()
  })

  test('propagates synchronous spawn failures as a clear error', async () => {
    const error = Object.assign(new Error('spawn EINVAL'), { code: 'EINVAL' })
    const spawn = vi.fn(() => { throw error })
    const runner = createToolRunner(spawn)
    await expect(runner.execTool('cargo', '.', ['--version'])).rejects.toThrow(/cargo could not be started \(EINVAL\)/)
  })

  test('real default runner is exported (spawn not injected)', () => {
    expect(typeof execTool).toBe('function')
  })
})
