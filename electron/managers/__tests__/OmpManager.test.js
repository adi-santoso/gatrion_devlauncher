import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import OmpManager, { hasConfiguredProvider } from '../OmpManager'

const MOCK_SCRIPT = path.resolve(__dirname, '../../../tests/fixtures/mock-omp-rpc.js')
const EXIT_SCRIPT = path.resolve(__dirname, '../../../tests/fixtures/mock-omp-exit.js')
const PROJECT_ID = 'proj-test'
const PROJECT_CWD = process.cwd()

describe('OmpManager (mock omp RPC)', () => {
  let tempDir
  let manager

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omp-test-'))
    process.env.OMP_RPC_MOCK_SCRIPT = MOCK_SCRIPT
    manager = new OmpManager(tempDir)
  })

  afterEach(async () => {
    delete process.env.OMP_RPC_MOCK_SCRIPT
    try {
      manager.killAll()
    } catch { /* already gone */ }
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('init loads an empty registry and resolves without crashing', async () => {
    await manager.init()
    expect(manager.getSessions(PROJECT_ID)).toEqual([])
  })

  test('init reloads a persisted registry', async () => {
    await manager.init()
    const created = await manager.createSession(PROJECT_ID, 'Persisted chat')
    await manager.touchSession(PROJECT_ID, created.id, { tokens: 1234, sessionPath: 'C:/sessions/s1.jsonl' })

    const reloaded = new OmpManager(tempDir)
    await reloaded.init()
    const sessions = reloaded.getSessions(PROJECT_ID)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].tokens).toBe(1234)
    expect(sessions[0].sessionPath).toBe('C:/sessions/s1.jsonl')
  }, 15000)

  test('registry: touchSession updates metadata and ignores non-finite tokens', async () => {
    await manager.init()
    const session = await manager.createSession(PROJECT_ID)
    const updated = await manager.touchSession(PROJECT_ID, session.id, {
      title: 'Renamed',
      pinned: true,
      tokens: 42,
      sessionPath: 'C:/sessions/x.jsonl',
    })
    expect(updated.tokens).toBe(42)
    expect(updated.pinned).toBe(true)
    expect(updated.title).toBe('Renamed')

    // Non-finite / missing tokens must not clobber the stored count.
    await manager.touchSession(PROJECT_ID, session.id, { tokens: Number.NaN })
    await manager.touchSession(PROJECT_ID, session.id, {})
    expect(manager.getSessions(PROJECT_ID)[0].tokens).toBe(42)

    // Unknown session → null, no crash
    expect(await manager.touchSession(PROJECT_ID, 'nope', { tokens: 1 })).toBeNull()
  })

  test('registry: deleteSession removes only the targeted session', async () => {
    await manager.init()
    const a = await manager.createSession(PROJECT_ID, 'A')
    const b = await manager.createSession(PROJECT_ID, 'B')
    await manager.deleteSession(PROJECT_ID, a.id)
    const sessions = manager.getSessions(PROJECT_ID)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(b.id)
  })

  test('clearProject kills the RPC process and removes all sessions (persisted)', async () => {
    await manager.init()
    await manager.createSession(PROJECT_ID, 'A')
    await manager.createSession(PROJECT_ID, 'B')
    await manager.ensureRpc(PROJECT_ID, PROJECT_CWD)
    expect(manager.rpcs.has(PROJECT_ID)).toBe(true)

    await manager.clearProject(PROJECT_ID)
    expect(manager.rpcs.has(PROJECT_ID)).toBe(false)
    expect(manager.getSessions(PROJECT_ID)).toEqual([])

    // The cleanup is persisted — a reloaded manager sees no orphan sessions.
    const reloaded = new OmpManager(tempDir)
    await reloaded.init()
    expect(reloaded.getSessions(PROJECT_ID)).toEqual([])
    // Other projects are untouched.
    await reloaded.createSession('other-project', 'Keep me')
    expect(reloaded.getSessions('other-project')).toHaveLength(1)
  })

  test('clearProject on an unknown project is a safe no-op', async () => {
    await manager.init()
    await expect(manager.clearProject('ghost-project')).resolves.toBeUndefined()
  })

  test('rejects in-flight RPC requests when the process exits without responding', async () => {
    // rpcMockScript is read at construction — point this instance at the
    // exit fixture (ready frame, then die on the first command).
    manager.rpcMockScript = EXIT_SCRIPT
    await manager.init()
    // The exit fixture announces readiness, then dies on the first command.
    await manager.ensureRpc(PROJECT_ID, PROJECT_CWD)
    const request = manager._send(PROJECT_ID, { type: 'get_state' }, 10000)
    await expect(request).rejects.toThrow(/exited/)
  }, 15000)

  test('ensureRpc spawns the mock agent and reports ready', async () => {
    await manager.init()
    const entry = await manager.ensureRpc(PROJECT_ID, PROJECT_CWD)
    expect(entry.ready).toBe(true)
    expect(entry.proc).toBeTruthy()
    // Re-calling returns the same live process
    const again = await manager.ensureRpc(PROJECT_ID, PROJECT_CWD)
    expect(again).toBe(entry)
  })

  test('ensureRpc rejects when no binary and no mock script are available', async () => {
    delete process.env.OMP_RPC_MOCK_SCRIPT
    manager.rpcMockScript = null
    await manager.init()
    // Force binaryPath to null (temp dir has no omp, PATH lookup may find one)
    manager.binaryPath = null
    await expect(manager.ensureRpc(PROJECT_ID, PROJECT_CWD)).rejects.toThrow('omp is not installed')
  })

  test('chat: creates a session, persists sessionPath, and streams agent events', async () => {
    await manager.init()
    const events = []
    manager.on('event', ({ projectId, event }) => {
      if (projectId === PROJECT_ID) events.push(event)
    })

    const { sessionId, session } = await manager.chat(PROJECT_ID, PROJECT_CWD, 'Hello mock agent')
    expect(sessionId).toBeTruthy()
    expect(session.sessionPath).toBeTruthy()
    expect(session.sessionPath).toContain('.mock-session.jsonl')

    // The mock streams a full turn ~150ms after the prompt.
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(events.some((event) => event.type === 'agent_start')).toBe(true)
    const end = events.find((event) => event.type === 'agent_end')
    expect(end).toBeTruthy()
    const deltas = events.filter((event) => event.type === 'message_update').map((event) => event.assistantMessageEvent?.delta)
    expect(deltas.join('')).toContain('Mock reply to: Hello mock agent')

    // The agent_end frame carries usage for the renderer to persist
    const endMessage = end.messages.find((item) => item.role === 'assistant')
    expect(endMessage.usage.totalTokens).toBe(334)
  })

  test('chat on an existing session reuses it instead of creating a new one', async () => {
    await manager.init()
    const first = await manager.chat(PROJECT_ID, PROJECT_CWD, 'First')
    const second = await manager.chat(PROJECT_ID, PROJECT_CWD, 'Second', { sessionId: first.sessionId })
    expect(second.sessionId).toBe(first.sessionId)
    expect(manager.getSessions(PROJECT_ID)).toHaveLength(1)
  })

  test('getMessages returns [] when the mock session has no history', async () => {
    await manager.init()
    await manager.chat(PROJECT_ID, PROJECT_CWD, 'hello')
    const messages = await manager.getMessages(PROJECT_ID, PROJECT_CWD)
    expect(messages).toEqual([])
  })

  test('switchToSession ignores empty paths and sends valid ones', async () => {
    await manager.init()
    await manager.ensureRpc(PROJECT_ID, PROJECT_CWD)
    expect(await manager.switchToSession(PROJECT_ID, '')).toBeUndefined()
    expect(await manager.switchToSession(PROJECT_ID, 'C:/sessions/s1.jsonl')).toBeTruthy()
  })

  test('high-level commands roundtrip through the mock', async () => {
    await manager.init()
    const state = await manager.getState(PROJECT_ID, PROJECT_CWD)
    expect(state.sessionFile).toContain('.mock-session.jsonl')
    expect(state.contextUsage.tokens).toBe(128)

    const models = await manager.getAvailableModels(PROJECT_ID, PROJECT_CWD)
    expect(models.models[0].id).toBe('mock-1')

    await expect(manager.steer(PROJECT_ID, PROJECT_CWD, 'continue')).resolves.toBeTruthy()
    await expect(manager.abort(PROJECT_ID, PROJECT_CWD)).resolves.toBeTruthy()
    await expect(manager.setThinkingLevel(PROJECT_ID, PROJECT_CWD, 'low')).resolves.toBeTruthy()
    await expect(manager.setAutoCompaction(PROJECT_ID, PROJECT_CWD, true)).resolves.toBeTruthy()
    await expect(manager.setAutoRetry(PROJECT_ID, PROJECT_CWD, true)).resolves.toBeTruthy()
    await expect(manager.setFastMode(PROJECT_ID, PROJECT_CWD, true)).resolves.toBeTruthy()
    await expect(manager.compact(PROJECT_ID, PROJECT_CWD)).resolves.toBeTruthy()
    await expect(manager.branch(PROJECT_ID, PROJECT_CWD, 'entry-1')).resolves.toBeTruthy()
    await expect(manager.getAvailableCommands(PROJECT_ID, PROJECT_CWD)).resolves.toEqual([])
  })

  test('_send rejects when the RPC process is not running', async () => {
    await manager.init()
    await expect(manager._send(PROJECT_ID, { type: 'get_state' })).rejects.toThrow('omp process is not running')
  })

  test('killRpc tears down the child process and killAll is idempotent', async () => {
    await manager.init()
    await manager.ensureRpc(PROJECT_ID, PROJECT_CWD)
    manager.killRpc(PROJECT_ID)
    expect(manager.rpcs.has(PROJECT_ID)).toBe(false)
    manager.killRpc(PROJECT_ID) // no-op
    manager.killAll() // no-op
  })

  describe('hasConfiguredProvider', () => {
    test('detects a provider entry written by the Settings form', () => {
      expect(hasConfiguredProvider({ providers: { myproxy: { baseUrl: 'http://localhost:8080/v1', api: 'openai-completions' } } })).toBe(true)
    })

    test('rejects missing/empty/unknown shapes', () => {
      expect(hasConfiguredProvider(null)).toBe(false)
      expect(hasConfiguredProvider(42)).toBe(false)
      expect(hasConfiguredProvider({})).toBe(false)
      expect(hasConfiguredProvider({ providers: {} })).toBe(false)
      expect(hasConfiguredProvider({ providers: [] })).toBe(false)
      expect(hasConfiguredProvider({ providers: { entry: { api: 'openai-completions' } } })).toBe(false)
    })
  })

  describe('normalizeMessages', () => {
    test('handles plain string content and role variants', () => {
      const out = manager.normalizeMessages([
        { role: 'user', content: 'hi' },
        { type: 'assistant', content: 'hello' },
        { from: 'assistant', content: 'third' },
        { role: 'system', content: 'skipped-as-user' },
      ])
      expect(out).toEqual([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'assistant', content: 'third' },
        { role: 'user', content: 'skipped-as-user' },
      ])
    })

    test('joins array content parts and drops empties', () => {
      const out = manager.normalizeMessages([
        { role: 'assistant', content: [{ type: 'text', text: 'part one' }, { type: 'tool_use', name: 'bash' }, { text: 'part two' }] },
      ])
      expect(out).toEqual([{ role: 'assistant', content: 'part one\npart two' }])
    })

    test('accepts { messages } and plain array envelopes, ignores nulls and blanks', () => {
      expect(manager.normalizeMessages({ messages: [{ role: 'user', content: 'x' }] })).toHaveLength(1)
      expect(manager.normalizeMessages([null, { role: 'user', content: '' }, undefined])).toEqual([])
      expect(manager.normalizeMessages(null)).toEqual([])
      expect(manager.normalizeMessages({ items: [{ role: 'user', content: 'y' }] })).toHaveLength(1)
    })
  })
})
