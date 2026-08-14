import { describe, test, expect, vi } from 'vitest'

import { createNpmRunner, assertSafePackageName, execNpm } from '../npmRunner'

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

describe('npmRunner — execNpm', () => {
  test('spawns npm through a shell (required for .cmd shims on Windows)', async () => {
    const spawn = vi.fn(() => makeChild({ code: 0, stdout: '{"is-number":{}}\n' }))
    const runner = createNpmRunner(spawn)
    const out = await runner.execNpm('C:/proj', ['outdated', '--json'], { timeoutMs: 5000 })
    expect(out).toContain('is-number')
    expect(spawn).toHaveBeenCalledWith('npm', ['outdated', '--json'], expect.objectContaining({ shell: true, windowsHide: true, cwd: 'C:/proj' }))
  })

  test('exit code 1 is treated as success (npm outdated reports outdated via exit 1)', async () => {
    const runner = createNpmRunner(() => makeChild({ code: 1, stdout: '{}' }))
    await expect(runner.execNpm('.', ['outdated', '--json'])).resolves.toBe('{}')
  })

  test('other non-zero exits reject with stderr', async () => {
    const runner = createNpmRunner(() => makeChild({ code: 2, stderr: 'npm ERR! something broke\n' }))
    await expect(runner.execNpm('.', ['update'])).rejects.toThrow(/something broke/)
  })

  test('kills the child and rejects on timeout', async () => {
    const child = makeChild({ autoClose: false }) // never closes
    const runner = createNpmRunner(() => child)
    await expect(runner.execNpm('.', ['update'], { timeoutMs: 50 })).rejects.toThrow(/timed out/)
    expect(child.kill).toHaveBeenCalled()
  })

  test('propagates synchronous spawn failures (spawn EINVAL) as a clear error', async () => {
    const error = Object.assign(new Error('spawn EINVAL'), { code: 'EINVAL' })
    const spawn = vi.fn(() => { throw error })
    const runner = createNpmRunner(spawn)
    await expect(runner.execNpm('.', ['--version'])).rejects.toThrow(/npm could not be started \(EINVAL\)/)
  })

  test('real default runner is exported (spawn not injected)', () => {
    expect(typeof execNpm).toBe('function')
  })
})

describe('npmRunner — assertSafePackageName', () => {
  test('accepts plain, scoped, and versioned-safe names', () => {
    expect(() => assertSafePackageName('lodash')).not.toThrow()
    expect(() => assertSafePackageName('@babel/core')).not.toThrow()
    expect(() => assertSafePackageName('react-native')).not.toThrow()
    expect(() => assertSafePackageName(null)).not.toThrow()
  })

  test('rejects shell metacharacters, blanks, and non-strings', () => {
    expect(() => assertSafePackageName('lodash; rm -rf /')).toThrow(/Invalid package name/)
    expect(() => assertSafePackageName('pkg & echo hi')).toThrow(/Invalid package name/)
    expect(() => assertSafePackageName('pkg$(whoami)')).toThrow(/Invalid package name/)
    expect(() => assertSafePackageName('   ')).toThrow(/Invalid package name/)
    expect(() => assertSafePackageName(123)).toThrow(/Invalid package name/)
    expect(() => assertSafePackageName({})).toThrow(/Invalid package name/)
  })
})
