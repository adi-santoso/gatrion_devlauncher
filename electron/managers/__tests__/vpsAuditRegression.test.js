import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { EventEmitter } from 'events'
import VpsTransport from '../vps/VpsTransport'
import VpsJobRegistry from '../vps/vpsJobRegistry'
import { registerScope, writeScopedOmpConfig, revokeScopesForServer, __resetScopes } from '../vps/vpsScopes'
import { OmpRpcTransport } from '../ompRpc'

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vps-audit-'))
  process.env.DEVLAUNCHER_VPS_CONTEXT_DIR = dir
  __resetScopes()
})
afterEach(() => {
  delete process.env.DEVLAUNCHER_VPS_CONTEXT_DIR
  __resetScopes()
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

describe('VPS audit regressions', () => {
  test('transport retains bounded output even if the peer streams megabytes', async () => {
    const transport = new VpsTransport({})
    const channel = new EventEmitter()
    channel.stderr = new EventEmitter()
    channel.close = () => channel.emit('close')
    transport.connected = true
    transport.client = { exec: (_command, callback) => callback(null, channel) }
    const handle = transport.exec('noisy')
    for (let i = 0; i < 64; i++) channel.emit('data', Buffer.alloc(65536, 'A'))
    channel.emit('exit', 0)
    channel.emit('close')
    const result = await handle.result
    expect(result.stdout.length).toBeLessThanOrEqual(128 * 1024)
  })

  test('streamed events redact secrets and pruning preserves live jobs', async () => {
    const events = []
    const registry = new VpsJobRegistry(() => {}, (event) => events.push(JSON.stringify(event)))
    let complete
    const transport = {
      exec(command, options) {
        options.onData('DB_PASSWORD=hunt')
        options.onData('er2\n')
        const result = command === 'long'
          ? new Promise((resolve) => { complete = resolve })
          : Promise.resolve({ closed: true, exitCode: 0 })
        return { result, cancel: () => {} }
      },
    }
    const { job } = await registry.execute(transport, 'server', { command: 'long', cwd: '', origin: 'user', waitMs: 1 })
    for (let i = 0; i < 55; i++) await registry.execute(transport, 'server', { command: 'short', cwd: '', origin: 'user' })
    registry.list('server')
    expect(registry.get(job.id).state).toBe('running')
    expect(events.join('')).not.toContain('hunter2')
    complete({ closed: true, exitCode: 0 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(registry.get(job.id).state).toBe('succeeded')
  })

  test('a peer that ignores channel close cannot keep a timed-out command pending', async () => {
    const transport = new VpsTransport({})
    const channel = new EventEmitter()
    channel.stderr = new EventEmitter()
    channel.close = () => {} // remote does not acknowledge close
    transport.connected = true
    transport.client = { exec: (_command, callback) => callback(null, channel) }
    const result = await transport.exec('hang', { timeoutMs: 20 }).result
    expect(result).toMatchObject({ timedOut: true, closed: false, exitCode: null })
  })

  test('config stores an environment reference and rejects traversing session IDs', () => {
    expect(() => registerScope('server', '..')).toThrow(/session ID/)
    const scope = registerScope('server', 'session')
    const file = writeScopedOmpConfig(scope, 'http://127.0.0.1:1234/mcp/test')
    const config = fs.readFileSync(file, 'utf8')
    expect(config).not.toContain(scope.token)
    expect(config).toContain('${DEVLAUNCHER_VPS_TOKEN}')
  })

  test('switching sessions and reconnecting replace the RPC process and scope', async () => {
    const rpc = new OmpRpcTransport(() => {})
    const mock = path.resolve(__dirname, '../../../tests/fixtures/mock-omp-rpc.js')
    const exits = []
    const trackExit = (entry) => {
      exits.push(new Promise((resolve) => entry.proc.once('close', resolve)))
    }
    const prepare = (session) => {
      const scope = registerScope('server', session)
      writeScopedOmpConfig(scope, 'http://127.0.0.1:1234/mcp/test')
      return scope
    }
    try {
      const first = prepare('first')
      const a = await rpc.ensureRpc('vps:server', first.contextDir, null, mock)
      trackExit(a)
      const firstPid = a.proc.pid
      const second = prepare('second')
      const b = await rpc.ensureRpc('vps:server', second.contextDir, null, mock)
      trackExit(b)
      expect(b.proc.pid).not.toBe(firstPid)
      const secondPid = b.proc.pid
      expect(b.vpsScopeId).toBe(second.scopeId)
      revokeScopesForServer('server')
      const reconnected = prepare('second')
      const c = await rpc.ensureRpc('vps:server', reconnected.contextDir, null, mock)
      trackExit(c)
      expect(c.proc.pid).not.toBe(secondPid)
      expect(c.vpsScopeId).toBe(reconnected.scopeId)
      expect(c.spawnArgs).toContain('--no-tools')
      expect(c.spawnArgs).toContain('--extension')
    } finally {
      rpc.killAll()
      await Promise.all(exits)
    }
  })
})
