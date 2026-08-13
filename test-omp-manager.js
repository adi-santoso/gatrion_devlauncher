// Regression test for OmpManager — session registry + message normalization
// (RPC spawning itself is verified against the real omp binary during dev).
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const OmpManager = require('./electron/managers/OmpManager')

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-registry-'))
  const manager = new OmpManager(dir)
  await manager.init()

  // Registry lifecycle
  assert.strictEqual(manager.getSessions('p1').length, 0)
  const session = await manager.createSession('p1', 'Fix login')
  assert.strictEqual(session.title, 'Fix login')
  assert.strictEqual(manager.getSessions('p1').length, 1)

  // Session metadata updates persist
  await manager.touchSession('p1', session.id, { tokens: 41000, sessionPath: 'C:/sessions/abc.jsonl' })
  const updated = manager.getSessions('p1')[0]
  assert.strictEqual(updated.tokens, 41000)
  assert.strictEqual(updated.sessionPath, 'C:/sessions/abc.jsonl')

  // Persistence across instances
  await manager.saveRegistry()
  const reloaded = new OmpManager(dir)
  await reloaded.init()
  assert.strictEqual(reloaded.getSessions('p1').length, 1)
  assert.strictEqual(reloaded.getSessions('p1')[0].sessionPath, 'C:/sessions/abc.jsonl')

  // Delete
  await reloaded.deleteSession('p1', session.id)
  assert.strictEqual(reloaded.getSessions('p1').length, 0)

  // Message normalization — handle several plausible omp shapes defensively
  const cases = [
    { messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }], expected: 2 },
    { items: [{ from: 'user', text: 'q' }, { from: 'assistant', text: 'a' }], expected: 2 },
    { messages: [{ role: 'assistant', content: [{ type: 'text', text: 'part one' }] }], expected: 1 },
    { messages: [{ role: 'user', content: '' }, { role: 'assistant', content: 'only assistant' }], expected: 1 },
    { messages: [{ role: 'assistant', content: 'multi\nline' }], expected: 1 },
  ]
  for (const [index, data] of cases.entries()) {
    const normalized = manager.normalizeMessages(data)
    assert.strictEqual(normalized.length, data.expected, `case ${index}: expected ${data.expected} got ${normalized.length}`)
  }
  // Normalization is defensive about garbage
  assert.strictEqual(manager.normalizeMessages(null).length, 0)
  assert.strictEqual(manager.normalizeMessages({}).length, 0)

  manager.killAll()
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('OmpManager checks passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
