import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { killProcessTree, computeCpuPercent } from '../processTree'

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

describe('computeCpuPercent — cross-tick CPU sampling', () => {
  afterEach(() => vi.useRealTimers())

  test('first snapshot returns 0 (no baseline yet)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    expect(computeCpuPercent('tree:1,2', 50)).toBe(0)
  })

  test('second snapshot reports CPU over real elapsed time, normalized per core', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    computeCpuPercent('tree:1,2', 0)
    // 5s later the tree consumed 5 CPU-seconds => 100% of one core (divided by cores).
    vi.setSystemTime(6000)
    const percent = computeCpuPercent('tree:1,2', 5)
    expect(percent).toBeGreaterThan(0)
    expect(percent).toBeLessThanOrEqual(100)
  })

  test('flat CPU between ticks reads ~0 (idle server)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    computeCpuPercent('tree:9', 100)
    vi.setSystemTime(6000)
    expect(computeCpuPercent('tree:9', 100)).toBe(0)
  })

  test('clamps at 100 even for very high burst load', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    computeCpuPercent('tree:7', 0)
    vi.setSystemTime(2000) // 1s elapsed, massive CPU jump
    expect(computeCpuPercent('tree:7', 1000)).toBe(100)
  })

  test('independent keys track separate baselines', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    computeCpuPercent('tree:1', 10)
    vi.setSystemTime(6000)
    computeCpuPercent('tree:2', 0) // other pid baseline starts clean
    expect(computeCpuPercent('tree:2', 0)).toBe(0)
  })
})
