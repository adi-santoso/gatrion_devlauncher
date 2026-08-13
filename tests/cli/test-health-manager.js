// Regression test for HealthManager (crash history, run sessions, daily trends)
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const HealthManager = require('../../electron/managers/HealthManager')

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'health-test-'))
  const manager = new HealthManager(dir)
  await manager.init()

  // Empty state
  const empty = manager.getStats('p1')
  assert.strictEqual(empty.totalRuns, 0)
  assert.strictEqual(empty.crashes.length, 0)

  // Run + crash recording
  manager.recordRunStart('p1')
  manager.recordRunEnd('p1', 0)
  manager.recordRunStart('p1')
  manager.recordCrash('p1', { code: 1, message: 'exited unexpectedly' })
  manager.recordRunEnd('p1', 1)

  const stats = manager.getStats('p1')
  assert.strictEqual(stats.totalRuns, 2)
  assert.strictEqual(stats.crashes.length, 1)
  assert.strictEqual(stats.crashes[0].code, 1)
  assert.strictEqual(stats.runs[0].code, 1)
  assert.ok(stats.totalUptimeMs >= 0)

  // Crash cap at 100
  for (let i = 0; i < 120; i += 1) manager.recordCrash('p1', { code: i })
  const capped = manager.getStats('p1')
  assert.strictEqual(capped.crashes.length, 100)
  assert.strictEqual(capped.crashes[0].code, 119) // newest first

  // Resource samples → daily aggregation
  const today = new Date().toISOString().slice(0, 10)
  manager.recordResource('p1', 10, 100)
  manager.recordResource('p1', 20, 200)
  manager.recordResource('p1', 30, 300)
  const daily = manager.getStats('p1').daily
  assert.strictEqual(daily.length, 1)
  assert.strictEqual(daily[0].date, today)
  assert.strictEqual(daily[0].avgCpu, 20)
  assert.strictEqual(daily[0].maxCpu, 30)
  assert.strictEqual(daily[0].avgMem, 200)

  // Flush + reload from disk
  await manager.dispose()
  const reloaded = new HealthManager(dir)
  await reloaded.init()
  assert.strictEqual(reloaded.getStats('p1').totalRuns, 2)
  assert.strictEqual(reloaded.getStats('p1').crashes.length, 100)

  // Clear
  reloaded.clear('p1')
  assert.strictEqual(reloaded.getStats('p1').totalRuns, 0)
  await reloaded.dispose()

  fs.rmSync(dir, { recursive: true, force: true })
  console.log('HealthManager checks passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
