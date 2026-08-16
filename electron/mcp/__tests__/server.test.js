import { describe, test, expect, beforeEach } from 'vitest'
import { createMcpServer, createRateLimiter, MCP_RATE_LIMIT } from '../server'
import { createTools } from '../tools'

const project = {
  id: 'p1',
  name: 'Demo',
  path: 'C:\\demo',
  type: 'node',
  port: 3000,
  startCommand: 'npm run dev',
  emoji: '🚀',
  color: '#fff',
  autoStart: false,
  lastRun: null,
  tags: ['web'],
  dependsOn: [],
  commands: [],
  customCommands: [],
  envVars: [],
}

function makeDeps() {
  return {
    storageManager: {
      loadProjects: async () => [project],
      loadConfig: async () => ({ theme: 'dark', language: 'en', agent: { controlEnabled: true } }),
      loadPresets: async () => [{ id: 'preset-1', name: 'Stack', projectIds: ['p1'] }],
      appendActivities: async () => {},
      updateConfig: async () => ({}),
    },
    processManager: {
      getProcessStatus: () => null,
      getLogs: async () => ['line 1', 'line 2'],
      startProcess: async () => ({ success: true }),
      stopProcess: async () => ({ success: true }),
      restartProcess: async () => ({ success: true }),
      stopAllProcesses: async () => [],
    },
    healthManager: { getStats: () => null },
    previewManager: {
      getConsoleBuffer: async () => [],
      show: () => {},
      reload: () => {},
      navigate: () => {},
    },
    getWindow: () => null,
  }
}

const post = async (url, token, body, extra = {}) => {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    ...extra,
  })
}

describe('createMcpServer', () => {
  let handle
  let deps

  beforeEach(() => {
    deps = makeDeps()
    handle = null
  })

  test('starts on 127.0.0.1 with a per-launch token', async () => {
    const server = createMcpServer(createTools(), deps)
    const started = await server.start()
    handle = started
    expect(started.port).toBeGreaterThan(0)
    expect(started.token).toMatch(/^[0-9a-f]{64}$/)
    expect(started.url).toBe(`http://127.0.0.1:${started.port}/mcp`)
    expect(server.getState().running).toBe(true)

    // Re-start is idempotent — same port/token while running.
    const again = await server.start()
    expect(again.port).toBe(started.port)
    expect(again.token).toBe(started.token)
  })

  test('rejects requests without the bearer token', async () => {
    const server = createMcpServer(createTools(), deps)
    const started = await server.start()
    handle = started
    const res = await post(started.url, null, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(res.status).toBe(401)
    expect(await res.text()).toBe('unauthorized')
  })

  test('rejects requests with a wrong token', async () => {
    const server = createMcpServer(createTools(), deps)
    const started = await server.start()
    handle = started
    const res = await post(started.url, 'deadbeef', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(res.status).toBe(401)
  })

  test('404 on non-/mcp path', async () => {
    const server = createMcpServer(createTools(), deps)
    const started = await server.start()
    handle = started
    const res = await post(`http://127.0.0.1:${started.port}/other`, started.token, {})
    expect(res.status).toBe(404)
  })

  test('405 on non-POST method', async () => {
    const server = createMcpServer(createTools(), deps)
    const started = await server.start()
    handle = started
    const res = await fetch(started.url, { method: 'PUT', headers: { Authorization: `Bearer ${started.token}` } })
    expect(res.status).toBe(405)
  })

  test('initialize handshake returns protocol + capabilities', async () => {
    const server = createMcpServer(createTools(), deps)
    const started = await server.start()
    handle = started
    const res = await post(started.url, started.token, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'omp', version: 'x' } },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.protocolVersion).toBe('2025-11-25')
    expect(body.result.capabilities.tools).toEqual({})
    expect(body.result.serverInfo.name).toBe('devlauncher')
  })

  test('tools/list returns the tool registry without handlers', async () => {
    const server = createMcpServer(createTools(), deps)
    const started = await server.start()
    handle = started
    const res = await post(started.url, started.token, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const body = await res.json()
    const names = body.result.tools.map((t) => t.name)
    expect(names).toContain('devlauncher_list_projects')
    expect(names).toContain('devlauncher_start_project')
    expect(names).toContain('devlauncher_git_status')
    for (const tool of body.result.tools) {
      expect(tool.inputSchema).toBeDefined()
      expect(tool.handler).toBeUndefined()
    }
  })

  test('tools/call dispatches a read tool', async () => {
    const server = createMcpServer(createTools(), deps)
    const started = await server.start()
    handle = started
    const res = await post(started.url, started.token, {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'devlauncher_list_projects', arguments: {} },
    })
    const body = await res.json()
    expect(body.result.isError).toBe(false)
    const data = JSON.parse(body.result.content[0].text)
    expect(data[0].id).toBe('p1')
    expect(data[0].name).toBe('Demo')
  })

  test('tools/call with an unknown tool returns isError', async () => {
    const server = createMcpServer(createTools(), deps)
    const started = await server.start()
    handle = started
    const res = await post(started.url, started.token, {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'devlauncher_nope', arguments: {} },
    })
    const body = await res.json()
    expect(body.result.isError).toBe(true)
    expect(body.result.content[0].text).toMatch(/Unknown tool/)
  })

  test('tools/call with a failing tool returns isError with the message', async () => {
    const server = createMcpServer(createTools(), deps)
    const started = await server.start()
    handle = started
    const res = await post(started.url, started.token, {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'devlauncher_get_project', arguments: { projectId: 'missing' } },
    })
    const body = await res.json()
    expect(body.result.isError).toBe(true)
    expect(body.result.content[0].text).toMatch(/not found/)
  })

  test('malformed JSON returns a JSON-RPC parse error', async () => {
    const server = createMcpServer(createTools(), deps)
    const started = await server.start()
    handle = started
    const res = await fetch(started.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${started.token}` },
      body: '{not json',
    })
    const body = await res.json()
    expect(body.error.code).toBe(-32700)
  })

  test('ping round-trips', async () => {
    const server = createMcpServer(createTools(), deps)
    const started = await server.start()
    handle = started
    const res = await post(started.url, started.token, { jsonrpc: '2.0', id: 9, method: 'ping' })
    const body = await res.json()
    expect(body.result).toEqual({})
  })

  test('rejects oversized payloads with 413', async () => {
    const server = createMcpServer(createTools(), deps)
    const started = await server.start()
    handle = started
    const big = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'x', arguments: { data: 'a'.repeat(600 * 1024) } } })
    const res = await fetch(started.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${started.token}` },
      body: big,
    })
    expect(res.status).toBe(413)
  })

  test('rate-limits after the sliding window fills up', async () => {
    const server = createMcpServer(createTools(), deps)
    const started = await server.start()
    handle = started
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })
    let status = 0
    for (let i = 0; i <= MCP_RATE_LIMIT.max; i += 1) {
      const res = await fetch(started.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${started.token}` },
        body,
      })
      status = res.status
    }
    expect(status).toBe(429)
  })

  test('rate limiter window slides (old requests expire)', () => {
    const limiter = createRateLimiter(1000, 2)
    expect(limiter.check('a')).toBe(true)
    expect(limiter.check('a')).toBe(true)
    expect(limiter.check('a')).toBe(false)
    // Different address has its own bucket.
    expect(limiter.check('b')).toBe(true)
    limiter.reset()
    expect(limiter.check('a')).toBe(true)
  })

  test('stop closes the listener and clears state', async () => {
    const server = createMcpServer(createTools(), deps)
    const started = await server.start()
    handle = started
    await server.stop()
    expect(server.getState().running).toBe(false)
    expect(server.getState().port).toBeNull()
    expect(server.getState().token).toBeNull()
    // Connection is refused after stop.
    await expect(post(started.url, started.token, { jsonrpc: '2.0', id: 1, method: 'ping' })).rejects.toThrow()
    // Idempotent.
    await server.stop()
  })

  test('createMcpServer without tools list fails on call', async () => {
    const server = createMcpServer([], deps)
    const started = await server.start()
    handle = started
    const res = await post(started.url, started.token, {
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'devlauncher_list_projects', arguments: {} },
    })
    const body = await res.json()
    expect(body.result.isError).toBe(true)
  })

  afterEach(async () => {
    if (handle) await handle.stop()
  })
})
