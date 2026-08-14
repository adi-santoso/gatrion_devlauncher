import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import HealthManager from '../HealthManager'

describe('HealthManager', () => {
  let tempDir
  let manager

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `health-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    manager = new HealthManager(tempDir)
  })

  afterEach(async () => {
    await manager.dispose()
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('records runs, crashes and resources and aggregates stats', async () => {
    manager.recordRunStart('p1')
    await new Promise((resolve) => setTimeout(resolve, 5))
    manager.recordRunEnd('p1', 0)
    manager.recordCrash('p1', { code: 1, message: 'boom' })

    const stats = manager.getStats('p1')
    expect(stats.totalRuns).toBe(1)
    expect(stats.totalUptimeMs).toBeGreaterThan(0)
    expect(stats.crashes).toHaveLength(1)
    expect(stats.crashes[0].message).toBe('boom')
  })

  test('caps crash history at 100 and run history at 200', () => {
    for (let i = 0; i < 120; i++) manager.recordCrash('p1', { code: i })
    expect(manager.getStats('p1').crashes).toHaveLength(100)

    for (let i = 0; i < 220; i++) {
      manager.recordRunStart('p1')
      manager.recordRunEnd('p1', 0)
    }
    expect(manager.getStats('p1').totalRuns).toBe(200)
  })

  test('daily stats bucket samples per day with averages', () => {
    const now = Date.now()
    manager.recordResource('p1', 10.4, 100.6)
    manager.recordResource('p1', 20.4, 200.6)
    const daily = manager.getDailyStats('p1')
    expect(daily).toHaveLength(1)
    expect(daily[0].avgCpu).toBe(15)
    expect(daily[0].maxCpu).toBe(20)
    expect(daily[0].avgMem).toBe(151)
    expect(daily[0].samples).toBe(2)
    expect(now).toBeGreaterThan(0)
  })

  test('persists to disk and reloads on init', async () => {
    await fs.mkdir(tempDir, { recursive: true })
    manager.recordCrash('p1', { code: 7 })
    await manager.flush()

    const reloaded = new HealthManager(tempDir)
    await reloaded.init()
    expect(reloaded.getStats('p1').crashes[0].code).toBe(7)
    await reloaded.dispose()
  })

  test('init tolerates a corrupt file', async () => {
    await fs.mkdir(tempDir, { recursive: true })
    await fs.writeFile(path.join(tempDir, 'health.json'), '{not json', 'utf8')
    const reloaded = new HealthManager(tempDir)
    await reloaded.init()
    expect(reloaded.data.projects).toEqual({})
    await reloaded.dispose()
  })

  test('clear resets a project but not others', () => {
    manager.recordCrash('p1', {})
    manager.recordCrash('p2', {})
    manager.clear('p1')
    expect(manager.getStats('p1').crashes).toHaveLength(0)
    expect(manager.getStats('p2').crashes).toHaveLength(1)
  })

  test('flush never rejects on write failure', async () => {
    manager.filePath = path.join(tempDir, 'missing-dir', 'health.json')
    await expect(manager.flush()).resolves.toBeUndefined()
  })
})
