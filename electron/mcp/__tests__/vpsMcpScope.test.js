/**
 * MCP scope isolation — the roadmap's core F0 acceptance criterion:
 * "two sessions for two servers cannot execute on each other by manipulating
 * arguments". VPS tools are served only from a per-session endpoint whose bound
 * server is decided server-side; no tool accepts a serverId.
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { createSshFixture } from '../../../tests/fixtures/ssh-server'
import VpsManager from '../../managers/vps/VpsManager'
import { __resetScopes, getScope } from '../../managers/vps/vpsScopes'
import { createMcpServer } from '../server'
import { createTools } from '../tools'
import { createVpsTools } from '../vpsTools'
import { setApprovalSender, respondApproval, denyAllApprovals } from '../approval'

let fixture
let manager
let userData
let handle
let mcpServer
let approvals
let reviews
let reviewDecision
let permissions
let beforeReview

async function addConnected(name, policy) {
  const server = await manager.addServer(
    { name, host: '127.0.0.1', port: fixture.port, username: 'fixture', environment: 'staging', policy, authKind: 'key', defaultCwd: '/srv' },
    { kind: 'key', privateKey: fixture.clientPrivateKey },
  )
  await expect(manager.connect(server.id)).rejects.toThrow(/Unknown host key/)
  await manager.trustHostKey(server.id, manager.getStatus(server.id).pendingHostKey.fingerprint)
  return server
}

async function call(endpoint, token, method, params) {
  const res = await fetch(`http://127.0.0.1:${handle.port}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

function contentText(response) {
  return response.json?.result?.content?.[0]?.text || ''
}

beforeEach(async () => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'devlauncher-vps-mcp-'))
  process.env.DEVLAUNCHER_VPS_CONTEXT_DIR = path.join(userData, 'vps-context')
  __resetScopes()
  fixture = await createSshFixture({ longCommandMatch: 'LONGJOB' })
  manager = new VpsManager(userData)
  approvals = []
  reviews = []
  reviewDecision = { approved: true, reason: 'Matches requested maintenance' }
  permissions = { read: true, write: true, destructive: true }
  beforeReview = null
  setApprovalSender((request) => {
    approvals.push(request)
    // Approve asynchronously so the pending entry exists when we respond.
    setTimeout(() => respondApproval(request.id, 'approved'), 0)
    return true
  })

  const baseDeps = {
    storageManager: {
      loadConfig: async () => ({ agent: { permissions } }),
      appendActivities: async () => {},
    },
    getWindow: () => null,
    vpsManager: manager,
    reviewVpsAction: async (input) => { reviews.push(input); if (beforeReview) await beforeReview(); return reviewDecision },
  }
  const vpsTools = createVpsTools()
  mcpServer = createMcpServer(createTools(), baseDeps, (scopeId) => {
    const scope = getScope(scopeId)
    if (!scope) return null
    return {
      token: scope.token,
      tools: vpsTools,
      deps: { ...baseDeps, vpsScope: { scopeId: scope.scopeId, serverId: scope.serverId, sessionId: scope.sessionId } },
    }
  })
  handle = await mcpServer.start()
})

afterEach(async () => {
  denyAllApprovals()
  setApprovalSender(null)
  await mcpServer.stop()
  manager.shutdown()
  await fixture.close()
  delete process.env.DEVLAUNCHER_VPS_CONTEXT_DIR
  fs.rmSync(userData, { recursive: true, force: true })
})

describe('scoped MCP endpoint — isolation', () => {
  test('VPS tool schemas expose no server/host/credential argument', async () => {
    const serverA = await addConnected('server-a', 'controlled')
    const scope = manager.createScope(serverA.id, 'sess-a')
    const response = await call(`/mcp/${scope.scopeId}`, scope.token, 'tools/list')
    expect(response.status).toBe(200)
    const tools = response.json.result.tools
    expect(tools.map((tool) => tool.name)).toContain('vps_get_overview')
    for (const tool of tools) {
      const properties = tool.inputSchema?.properties || {}
      expect(Object.keys(properties)).not.toContain('serverId')
      expect(Object.keys(properties)).not.toContain('host')
      expect(Object.keys(properties)).not.toContain('username')
      expect(Object.keys(properties)).not.toContain('privateKey')
    }
  })

  test('a serverId argument cannot redirect execution to another server', async () => {
    const serverA = await addConnected('server-a', 'controlled')
    const serverB = await addConnected('server-b', 'controlled')
    const scopeA = manager.createScope(serverA.id, 'sess-a')

    const response = await call(`/mcp/${scopeA.scopeId}`, scopeA.token, 'tools/call', {
      name: 'vps_exec',
      // The agent tries to target B by argument — it must be ignored entirely.
      arguments: { command: 'ISOLATED', serverId: serverB.id, host: 'evil.example' },
    })

    expect(response.status).toBe(200)
    expect(response.json.result.isError).toBe(false)
    const payload = JSON.parse(contentText(response))
    expect(payload.state).toBe('succeeded')

    // The job exists on A only; B never ran anything.
    expect(manager.listJobs(serverA.id).map((job) => job.command)).toContain('ISOLATED')
    expect(manager.listJobs(serverB.id)).toHaveLength(0)
    // B's connection never received the command either.
    const ranOnFixture = fixture.commands.filter((command) => command.includes('ISOLATED'))
    expect(ranOnFixture).toHaveLength(1)
  })

  test('tokens are not interchangeable between the base and scoped endpoints', async () => {
    const serverA = await addConnected('server-a', 'controlled')
    const scope = manager.createScope(serverA.id, 'sess-a')

    expect((await call('/mcp', scope.token, 'tools/list')).status).toBe(401)
    expect((await call(`/mcp/${scope.scopeId}`, handle.token, 'tools/list')).status).toBe(401)
    expect((await call('/mcp/deadbeefdeadbeef', scope.token, 'tools/list')).status).toBe(404)
  })

  test('the project-scoped endpoint has no VPS tools', async () => {
    await addConnected('server-a', 'controlled')
    const list = await call('/mcp', handle.token, 'tools/list')
    expect(list.json.result.tools.map((tool) => tool.name)).not.toContain('vps_get_overview')

    const response = await call('/mcp', handle.token, 'tools/call', { name: 'vps_get_overview', arguments: {} })
    expect(response.json.result.isError).toBe(true)
    expect(contentText(response)).toMatch(/Unknown tool/)
  })
})

describe('scoped MCP endpoint — policy', () => {
  test('auto delegates to AI and denied commands never reach SSH', async () => {
    const server = await addConnected('auto-server', 'auto')
    const scope = manager.createScope(server.id, 'auto-session')
    reviewDecision = { approved: false, reason: 'Unrelated destructive command' }
    const denied = await call(`/mcp/${scope.scopeId}`, scope.token, 'tools/call', { name: 'vps_exec', arguments: { command: 'AUTO_DENIED' } })
    expect(denied.json.result.isError).toBe(true)
    expect(contentText(denied)).toMatch(/Unrelated destructive/)
    expect(fixture.commands.join('')).not.toContain('AUTO_DENIED')
    expect(reviews[0].scopeId).toBe(scope.scopeId)
    reviewDecision = { approved: true, reason: 'Requested by user' }
    const allowed = await call(`/mcp/${scope.scopeId}`, scope.token, 'tools/call', { name: 'vps_exec', arguments: { command: 'AUTO_ALLOWED' } })
    expect(allowed.json.result.isError).toBe(false)
    expect(fixture.commands.join('')).toContain('AUTO_ALLOWED')
    expect(approvals).toHaveLength(0)
  })

  test('full-access executes without modal or AI even when global tool categories are off', async () => {
    const server = await addConnected('full-server', 'full-access')
    const scope = manager.createScope(server.id, 'full-session')
    permissions = { read: false, write: false, destructive: false }
    const result = await call(`/mcp/${scope.scopeId}`, scope.token, 'tools/call', { name: 'vps_exec', arguments: { command: 'FULL_ALLOWED' } })
    expect(result.json.result.isError).toBe(false)
    expect(fixture.commands.join('')).toContain('FULL_ALLOWED')
    expect(approvals).toHaveLength(0)
    expect(reviews).toHaveLength(0)
    const overview = await call(`/mcp/${scope.scopeId}`, scope.token, 'tools/call', { name: 'vps_get_overview', arguments: {} })
    expect(overview.json.result.isError).toBe(false)
  })

  test('auto reviewer failure prevents SSH execution', async () => {
    const server = await addConnected('auto-mutated', 'auto')
    const scope = manager.createScope(server.id, 'auto-session')
    reviewDecision = Promise.reject(new Error('Reviewer unavailable'))
    reviewDecision.catch(() => {})
    const result = await call(`/mcp/${scope.scopeId}`, scope.token, 'tools/call', { name: 'vps_exec', arguments: { command: 'AUTO_FAILED' } })
    expect(result.json.result.isError).toBe(true)
    expect(fixture.commands.join('')).not.toContain('AUTO_FAILED')
  })

  test('auto approval is invalidated when mode changes during review', async () => {
    const server = await addConnected('auto-changing', 'auto')
    const scope = manager.createScope(server.id, 'auto-session')
    beforeReview = () => manager.updateServer(server.id, { policy: 'read-only' })
    const response = await call(`/mcp/${scope.scopeId}`, scope.token, 'tools/call', { name: 'vps_exec', arguments: { command: 'AUTO_STALE' } })
    expect(response.json.result.isError).toBe(true)
    expect(contentText(response)).toMatch(/target changed/)
    expect(fixture.commands.join('')).not.toContain('AUTO_STALE')
  })
  test('read-only rejects arbitrary exec before asking for approval', async () => {
    const serverA = await addConnected('readonly-server', 'read-only')
    const scope = manager.createScope(serverA.id, 'sess-ro')

    const exec = await call(`/mcp/${scope.scopeId}`, scope.token, 'tools/call', {
      name: 'vps_exec',
      arguments: { command: 'uptime' },
    })
    expect(exec.json.result.isError).toBe(true)
    expect(contentText(exec)).toMatch(/read-only/)
    expect(approvals.map((request) => request.tool)).not.toContain('vps_exec')

    // Structured reads are still allowed in read-only mode.
    const overview = await call(`/mcp/${scope.scopeId}`, scope.token, 'tools/call', {
      name: 'vps_get_overview',
      arguments: {},
    })
    expect(overview.json.result.isError).toBe(false)
  })

  test('agent-disabled blocks even read tools at the guard', async () => {
    const serverA = await addConnected('disabled-server', 'agent-disabled')
    const scope = manager.createScope(serverA.id, 'sess-off')
    const response = await call(`/mcp/${scope.scopeId}`, scope.token, 'tools/call', {
      name: 'vps_list_services',
      arguments: {},
    })
    expect(response.json.result.isError).toBe(true)
    expect(contentText(response)).toMatch(/disabled/)
  })

  test('approval payload identifies the bound server and cwd, and jobs stay session-scoped', async () => {
    const serverA = await addConnected('approval-server', 'controlled')
    const scope = manager.createScope(serverA.id, 'sess-approve')
    const response = await call(`/mcp/${scope.scopeId}`, scope.token, 'tools/call', {
      name: 'vps_exec',
      arguments: { command: 'uptime', cwd: '/srv/app' },
    })
    expect(response.json.result.isError).toBe(false)
    // The approval modal must name the bound server + environment + cwd.
    const request = approvals.find((item) => item.tool === 'vps_exec')
    expect(request.serverName).toBe('approval-server')
    expect(request.environment).toBe('staging')
    expect(request.cwd).toBe('/srv/app')
    expect(request.summary).toContain('/srv/app')

    const job = manager.listJobs(serverA.id)[0]
    expect(job.sessionId).toBe('sess-approve')
    // A different session cannot read another session's job.
    const scopeB = manager.createScope(serverA.id, 'sess-other')
    const other = await call(`/mcp/${scopeB.scopeId}`, scopeB.token, 'tools/call', {
      name: 'vps_get_job',
      arguments: { jobId: job.id },
    })
    expect(other.json.result.isError).toBe(true)
    expect(contentText(other)).toMatch(/not found for this session/i)
  })

  test('restart failures remain failed jobs instead of becoming echo successes', async () => {
    manager.shutdown()
    await fixture.close()
    fixture = await createSshFixture({ handlers: [{ match: 'systemctl restart', result: { stdout: 'Failed to restart missing.service\nexit:1\n', exitCode: 1 } }] })
    const server = await addConnected('restart-failure', 'controlled')
    const scope = manager.createScope(server.id, 'restart-session')
    const response = await call(`/mcp/${scope.scopeId}`, scope.token, 'tools/call', {
      name: 'vps_restart_service', arguments: { service: 'missing.service' },
    })
    expect(response.json.result.isError).toBe(false)
    expect(manager.listJobs(server.id)[0]).toMatchObject({ state: 'failed', exitCode: 1 })
    expect(fixture.commands[0]).toContain('systemctl is-active')
  })

  test('changing a target while approval is pending invalidates that approval', async () => {
    const server = await addConnected('pending-target', 'controlled')
    const scope = manager.createScope(server.id, 'pending-session')
    let request
    setApprovalSender((value) => { request = value; return true })
    const response = call(`/mcp/${scope.scopeId}`, scope.token, 'tools/call', {
      name: 'vps_exec', arguments: { command: 'APPROVALMARKER' },
    })
    for (let i = 0; i < 100 && !request; i++) await new Promise((resolve) => setTimeout(resolve, 10))
    expect(request).toBeTruthy()
    await manager.updateServer(server.id, { defaultCwd: '/different' })
    respondApproval(request.id, 'approved')
    expect(contentText(await response)).toMatch(/target changed/)
    expect(fixture.commands.some((command) => command.includes('APPROVALMARKER'))).toBe(false)
  })
})
