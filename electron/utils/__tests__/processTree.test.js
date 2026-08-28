import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'

const spawnMock = vi.hoisted(() => {
  return { spawn: vi.fn() }
})

vi.mock('child_process', () => ({
  default: { spawn: spawnMock.spawn, exec: vi.fn() },
  spawn: spawnMock.spawn,
  exec: vi.fn(),
}))

import { killProcessTree, computeCpuPercent } from '../processTree'

/** Fake taskkill child: emits exit(0) on a microtask so listeners attach first. */
function fakeKiller() {
  const child = new EventEmitter()
  queueMicrotask(() => child.emit('exit', 0))
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  return child
}

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

describe('killProcessTree — Windows graceful escalation', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('graceful: taskkill without /F first, escalates to /F when still alive after the grace window', async () => {
    // A FRESH emitter per spawn call — otherwise the second taskkill would
    // attach to an already-exited child and never resolve.
    spawnMock.spawn.mockImplementation(() => fakeKiller())
    // The tree stays alive (signal 0 probe succeeds) until the grace window lapses.
    vi.spyOn(process, 'kill').mockReturnValue(true)

    await killProcessTree({ pid: 555 }, false, 'win32')

    const taskkill = spawnMock.spawn.mock.calls.filter((call) => call[0] === 'taskkill')
    expect(taskkill).toHaveLength(2)
    expect(taskkill[0][1]).toEqual(['/pid', '555', '/T'])
    expect(taskkill[1][1]).toEqual(['/pid', '555', '/T', '/F'])
  }, 10000)

  test('graceful: skips the /F escalation when the tree already exited', async () => {
    spawnMock.spawn.mockReturnValue(fakeKiller())
    vi.spyOn(process, 'kill').mockImplementation((_target, signal) => {
      if (signal === 0) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' })
    })

    await killProcessTree({ pid: 777 }, false, 'win32')

    const taskkill = spawnMock.spawn.mock.calls.filter((call) => call[0] === 'taskkill')
    expect(taskkill).toHaveLength(1)
    expect(taskkill[0][1]).toEqual(['/pid', '777', '/T'])
  })

  test('force: single taskkill with /F, no grace wait', async () => {
    spawnMock.spawn.mockReturnValue(fakeKiller())
    vi.spyOn(process, 'kill').mockReturnValue(true)

    await killProcessTree({ pid: 888 }, true, 'win32')

    const taskkill = spawnMock.spawn.mock.calls.filter((call) => call[0] === 'taskkill')
    expect(taskkill).toHaveLength(1)
    expect(taskkill[0][1]).toEqual(['/pid', '888', '/T', '/F'])
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
