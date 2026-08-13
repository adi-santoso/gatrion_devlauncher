// Regression test for OmpManager — session registry + message normalization
// (RPC spawning itself is verified against the real omp binary during dev).
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const OmpManager = require('../../electron/managers/OmpManager')

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

  // chat() must capture the session file from get_state when creating a new
  // session (new_session itself does not return it) so the session can be
  // resumed later via switch_session. Stub the process layer — no spawn.
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-chat-'))
  const chatManager = new OmpManager(dir2)
  await chatManager.init()
  chatManager.ensureRpc = async () => {}
  chatManager._send = async (projectId, command) => {
    if (command.type === 'get_state') return { sessionFile: 'C:/sessions/new.jsonl', sessionId: 'uuid-1' }
    return { cancelled: false }
  }
  const created = await chatManager.chat('p1', 'C:/proj', 'hello')
  assert.strictEqual(created.session.sessionPath, 'C:/sessions/new.jsonl', 'new session path captured from get_state')
  assert.strictEqual(chatManager.getSessions('p1')[0].sessionPath, 'C:/sessions/new.jsonl', 'path persisted in registry')

  // Reopening an existing session switches to its stored path before prompting
  let switchedTo = null
  chatManager._send = async (projectId, command) => {
    if (command.type === 'switch_session') switchedTo = command.sessionPath
    return { cancelled: false }
  }
  await chatManager.chat('p1', 'C:/proj', 'hello again', { sessionId: created.sessionId, sessionPath: 'C:/sessions/new.jsonl' })
  assert.strictEqual(switchedTo, 'C:/sessions/new.jsonl', 'existing session resumed via switch_session')
  chatManager.killAll()
  fs.rmSync(dir2, { recursive: true, force: true })

  manager.killAll()
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('OmpManager checks passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
