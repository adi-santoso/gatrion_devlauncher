import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { killProcessTree } from '../processTree'

describe('killProcessTree — POSIX', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('graceful: SIGTERM to the group, escalates to SIGKILL when still alive', async () => {
    const calls = []
    vi.spyOn(process, 'kill').mockImplementation((target, signal) => {
      calls.push([target, signal])
      // Group stays alive during the grace period (signal 0 succeeds), so the
      // loop runs until the deadline and then escalates.
    })
    const pending = killProcessTree({ pid: 1234 }, false, 'linux')
    await vi.advanceTimersByTimeAsync(2000)
    await pending

    expect(calls[0]).toEqual([-1234, 'SIGTERM'])
    expect(calls).toContainEqual([-1234, 'SIGKILL'])
  })

  test('graceful: resolves as soon as the group is gone', async () => {
    vi.spyOn(process, 'kill').mockImplementation((target, signal) => {
      if (signal === 0) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' })
    })
    const pending = killProcessTree({ pid: 99 }, false, 'linux')
    await vi.advanceTimersByTimeAsync(500)
    await pending

    expect(process.kill).toHaveBeenCalledWith(-99, 'SIGTERM')
    expect(process.kill).not.toHaveBeenCalledWith(-99, 'SIGKILL')
  })

  test('force: SIGKILL immediately, no grace wait', async () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {})
    await killProcessTree({ pid: 42 }, true, 'linux')
    expect(process.kill).toHaveBeenCalledWith(-42, 'SIGKILL')
  })

  test('ESRCH on the first signal counts as success (process already gone)', async () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' })
    })
    await expect(killProcessTree({ pid: 7 }, false, 'linux')).resolves.toBeUndefined()
  })

  test('throws when the PID is unavailable', async () => {
    await expect(killProcessTree({}, false, 'linux')).rejects.toThrow(/PID/)
  })
})
