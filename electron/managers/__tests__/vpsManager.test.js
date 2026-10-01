/**
 * VpsManager integration — drives a real SSH handshake against the in-process
 * ssh2 fixture (no network host, no real credential). Proves the F0 behaviours
 * are wired into the manager: host-key review before trust, structured reads,
 * job states (succeeded/failed/cancelled/unknown), policy, and cleanup.
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { createSshFixture } from '../../../tests/fixtures/ssh-server'
import VpsManager from '../vps/VpsManager'
import { __resetScopes, getScope } from '../vps/vpsScopes'

let fixture
let manager
let userData

const SERVER_INPUT = () => ({
  name: 'fixture-server',
  host: '127.0.0.1',
  port: fixture.port,
  username: 'fixture',
  environment: 'development',
  policy: 'controlled',
  authKind: 'key',
  defaultCwd: '/var/www/app',
  tags: ['test'],
})

async function connectTrusted(overrides = {}) {
  const server = await manager.addServer(
    { ...SERVER_INPUT(), ...overrides },
    { kind: 'key', privateKey: fixture.clientPrivateKey },
  )
  await expect(manager.connect(server.id)).rejects.toThrow(/Unknown host key/)
  const { pendingHostKey } = manager.getStatus(server.id)
  expect(pendingHostKey.fingerprint).toMatch(/^SHA256:/)
  const status = await manager.trustHostKey(server.id, pendingHostKey.fingerprint)
  expect(status.state).toBe('connected')
  return server
}

beforeEach(async () => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'devlauncher-vps-'))
  process.env.DEVLAUNCHER_VPS_CONTEXT_DIR = path.join(userData, 'vps-context')
  __resetScopes()
  fixture = await createSshFixture({ longCommandMatch: 'LONGJOB' })
  manager = new VpsManager(userData)
})

afterEach(async () => {
  manager.shutdown()
  await fixture.close()
  delete process.env.DEVLAUNCHER_VPS_CONTEXT_DIR
  fs.rmSync(userData, { recursive: true, force: true })
})

describe('VpsManager — registry & credentials', () => {
  test('stores server metadata without secrets and keeps the credential encrypted', async () => {
    const server = await manager.addServer(SERVER_INPUT(), { kind: 'key', privateKey: fixture.clientPrivateKey })
    const raw = fs.readFileSync(path.join(userData, 'vps-servers.json'), 'utf8')
    expect(raw).not.toContain('PRIVATE KEY')
    expect(raw).not.toContain('fixture-server-key')
    expect(server.authRef).toMatch(/^vps:/)
    expect(await manager.hasCredential(server.id)).toBe(true)

    const credRaw = fs.readFileSync(path.join(userData, 'vps-credentials.json'), 'utf8')
    expect(credRaw).not.toContain('PRIVATE KEY')
  })

  test('servers and credentials survive an app restart (new manager, same dir)', async () => {
    const server = await manager.addServer(SERVER_INPUT(), { kind: 'key', privateKey: fixture.clientPrivateKey })
    const restarted = new VpsManager(userData)
    const servers = await restarted.listServers()
    expect(servers.map((item) => item.id)).toEqual([server.id])
    expect(await restarted.hasCredential(server.id)).toBe(true)
    // A reconnect after restart still needs the (already trusted) key review.
    await expect(restarted.connect(server.id)).rejects.toThrow(/Unknown host key/)
    restarted.shutdown()
  })

  test('an unreachable host fails with a clear error and no pending key', async () => {
    const server = await manager.addServer(
      { ...SERVER_INPUT(), host: '127.0.0.1', port: 1 },
      { kind: 'key', privateKey: fixture.clientPrivateKey },
    )
    await expect(manager.connect(server.id)).rejects.toThrow(/ECONNREFUSED|connect|timed out/i)
    const status = manager.getStatus(server.id)
    expect(status.state).toBe('error')
    expect(status.error).toBeTruthy()
    expect(status.pendingHostKey).toBeNull()
  })

  test('rejects invalid input and duplicate names', async () => {
    await manager.addServer(SERVER_INPUT())
    await expect(manager.addServer({ ...SERVER_INPUT(), port: 0 })).rejects.toThrow(/Port/)
    await expect(manager.addServer({ ...SERVER_INPUT(), name: 'fixture-server' })).rejects.toThrow(/already exists/i)
  })
})

describe('VpsManager — host key trust', () => {
  test('refuses to connect to an unknown host key until it is trusted', async () => {
    const server = await manager.addServer(SERVER_INPUT(), { kind: 'key', privateKey: fixture.clientPrivateKey })
    await expect(manager.connect(server.id)).rejects.toThrow(/Unknown host key/)
    const status = manager.getStatus(server.id)
    expect(status.state).toBe('verifying-host')
    expect(status.pendingHostKey.fingerprint).toMatch(/^SHA256:/)
  })

  test('host-key probe never sends authentication to the peer', async () => {
    const probe = await manager.testConnection(SERVER_INPUT(), { kind: 'password', password: 'do-not-send' })
    expect(probe.success).toBe(true)
    expect(probe.hostKey.fingerprint).toMatch(/^SHA256:/)
    expect(fixture.authAttempts).toEqual([])
  })

  test('connection errors revoke capabilities and produce an error state', async () => {
    const server = await connectTrusted()
    const scope = manager.createScope(server.id, 'error-session')
    const transport = manager.connections.get(server.id).transport
    expect(() => transport.emit('connection-error', new Error('keepalive timeout'))).not.toThrow()
    expect(manager.getStatus(server.id)).toMatchObject({ state: 'error', error: 'keepalive timeout' })
    expect(getScope(scope.scopeId)).toBeNull()
  })

  test('editing the host disconnects and clears the previous trust', async () => {
    const server = await connectTrusted()
    await manager.updateServer(server.id, { host: 'other.invalid' })
    expect(manager.getStatus(server.id).state).toBe('disconnected')
    expect(await manager.store.getHostKey(server.id)).toBeNull()
  })

  test('rejects a trust call whose fingerprint does not match the pending key', async () => {
    const server = await manager.addServer(SERVER_INPUT(), { kind: 'key', privateKey: fixture.clientPrivateKey })
    await expect(manager.connect(server.id)).rejects.toThrow()
    await expect(manager.trustHostKey(server.id, 'SHA256:not-the-pending-key')).rejects.toThrow(/No pending host key/)
  })

  test('connects after trust and remembers the key', async () => {
    const server = await connectTrusted()
    expect(manager.getStatus(server.id).state).toBe('connected')
    // A reconnect uses the stored trust and skips the pending state entirely.
    manager.disconnect(server.id)
    const reconnected = await manager.connect(server.id)
    expect(reconnected.state).toBe('connected')
    expect(reconnected.pendingHostKey).toBeNull()
  })
})

describe('VpsManager — structured reads', () => {
  test('overview, services and logs come from the remote probe', async () => {
    const server = await connectTrusted()
    const overview = await manager.getOverview(server.id)
    expect(overview.available).toBe(true)
    expect(overview.hostname).toBe('fixture-host')
    expect(overview.kernel).toBe('6.8.0-fixture')
    expect(overview.metrics.memTotalMb).toBe(2000)
    expect(overview.metrics.diskUsedPercent).toBe(50)

    const services = await manager.listServices(server.id)
    expect(services.map((s) => s.name)).toContain('nginx.service')

    const logs = await manager.getLogs(server.id, 'api.service', 50)
    expect(logs.output).toContain('listening on :8080')
  })

  test('reports unavailable (not zero) while disconnected', async () => {
    const server = await manager.addServer(SERVER_INPUT(), { kind: 'key', privateKey: fixture.clientPrivateKey })
    const overview = await manager.getOverview(server.id)
    expect(overview.available).toBe(false)
    expect(overview.metrics.available).toBe(false)
    expect(overview.metrics.cpuPercent).toBeNull()
    expect(overview.metrics.stale).toBe(true)
  })
})

describe('VpsManager — jobs', () => {
  test('runs a command and records exit code + output', async () => {
    const server = await connectTrusted()
    const { job, completed } = await manager.execute(server.id, { command: 'uptime', origin: 'user', waitMs: 5000 })
    expect(completed).toBe(true)
    expect(job.state).toBe('succeeded')
    expect(job.exitCode).toBe(0)
    expect(job.output).toContain('ran:')
    expect(job.cwd).toBe('/var/www/app')
  })

  test('marks a non-zero exit as failed', async () => {
    await fixture.close()
    fixture = await createSshFixture({ handlers: [{ match: 'boom', result: { stdout: 'kaboom', exitCode: 3 } }] })
    manager = new VpsManager(userData)
    const server = await connectTrusted()
    const { job } = await manager.execute(server.id, { command: 'boom', origin: 'user', waitMs: 5000 })
    expect(job.state).toBe('failed')
    expect(job.exitCode).toBe(3)
  })

  test('cancel is reported as requested-not-confirmed and never as success', async () => {
    const server = await connectTrusted()
    const { job, completed } = await manager.execute(server.id, { command: 'LONGJOB', origin: 'user', waitMs: 200 })
    expect(completed).toBe(false)
    expect(job.state).toBe('running')

    const cancel = manager.cancelJob(job.id)
    expect(cancel).toEqual({ requested: true, confirmed: false, state: 'running' })

    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(manager.getJob(job.id).state).toBe('unknown')
    expect(manager.getJob(job.id).exitCode).toBeNull()
  })

  test('disconnect marks in-flight jobs unknown and stops the connection', async () => {
    const server = await connectTrusted()
    const { job } = await manager.execute(server.id, { command: 'LONGJOB', origin: 'user', waitMs: 200 })
    manager.disconnect(server.id)
    expect(manager.getStatus(server.id).state).toBe('disconnected')
    expect(manager.getJob(job.id).state).toBe('unknown')
  })

  test('a timed-out command is unknown, not succeeded', async () => {
    const server = await connectTrusted()
    const { job, completed } = await manager.execute(server.id, { command: 'LONGJOB', origin: 'user', timeoutMs: 150, waitMs: 3000 })
    expect(completed).toBe(true)
    expect(job.state).toBe('unknown')
    expect(job.exitCode).toBeNull()
  })
})

describe('VpsManager — agent policy', () => {
  test('read-only blocks agent exec but manual operations still work', async () => {
    const server = await connectTrusted({ policy: 'read-only' })
    const record = await manager.store.getServer(server.id)
    expect(() => manager.assertAgentAllowed(record, 'exec')).toThrow(/read-only/)
    expect(() => manager.assertAgentAllowed(record, 'change')).toThrow(/read-only/)
    expect(() => manager.assertAgentAllowed(record, 'read')).not.toThrow()

    await expect(
      manager.execute(server.id, { command: 'uptime', origin: 'agent', capability: 'exec', waitMs: 1000 }),
    ).rejects.toThrow(/read-only/)
    const manual = await manager.execute(server.id, { command: 'uptime', origin: 'user', waitMs: 5000 })
    expect(manual.job.state).toBe('succeeded')
  })

  test('agent-disabled blocks even structured reads', async () => {
    const server = await connectTrusted({ policy: 'agent-disabled' })
    const record = await manager.store.getServer(server.id)
    expect(() => manager.assertAgentAllowed(record, 'read')).toThrow(/disabled/)
  })
})

describe('VpsManager — scopes', () => {
  test('scope creation requires a live connection and is stable per session', async () => {
    const server = await manager.addServer(SERVER_INPUT(), { kind: 'key', privateKey: fixture.clientPrivateKey })
    expect(manager.createScope(server.id, 'sess-1')).toBeNull()
    await expect(manager.connect(server.id)).rejects.toThrow(/Unknown host key/)
    await manager.trustHostKey(server.id, manager.getStatus(server.id).pendingHostKey.fingerprint)
    const scope = manager.createScope(server.id, 'sess-1')
    expect(scope.token).toHaveLength(64)
    const again = manager.createScope(server.id, 'sess-1')
    expect(again.scopeId).toBe(scope.scopeId)
    expect(getScope(scope.scopeId).contextDir).toContain('sess-1')
  })

  test('deleting a server revokes its scopes and removes the credential', async () => {
    const server = await connectTrusted()
    const scope = manager.createScope(server.id, 'sess-9')
    await manager.deleteServer(server.id)
    expect(getScope(scope.scopeId)).toBeNull()
    expect(await manager.hasCredential(server.id)).toBe(false)
    expect(manager.getStatus(server.id).state).toBe('disconnected')
  })
})

describe('VpsManager — terminal', () => {
  test('opens a remote PTY, streams echo, and closes', async () => {
    const server = await connectTrusted()
    const { id } = await manager.openTerminal(server.id, { cols: 80, rows: 24 })
    expect(id).toBeTruthy()
    const chunks = []
    manager.on('terminal-data', (serverId, chunk) => { if (serverId === server.id) chunks.push(chunk) })
    expect(manager.writeTerminal(server.id, 'ping\n')).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(chunks.join('')).toContain('echo:ping')
    manager.closeTerminal(server.id)
    expect(manager.writeTerminal(server.id, 'x')).toBe(false)
  })
})
