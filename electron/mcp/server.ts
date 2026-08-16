/**
 * Minimal MCP server over HTTP (Streamable HTTP transport) — hand-rolled, no
 * dependency. Serves one endpoint (POST /mcp) speaking JSON-RPC 2.0:
 * `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, `ping`.
 *
 * Security: binds 127.0.0.1 only, every request must carry
 * `Authorization: Bearer <token>` where the token is generated per launch.
 */
import * as http from 'http'
import { randomBytes } from 'crypto'
import type { McpTool, McpDeps } from './tools'
import { dispatchTool } from './tools'

export const MCP_PROTOCOL_VERSION = '2025-11-25'

/** Hard cap on a single tools/call body (agent payloads can be large). */
export const MCP_MAX_BODY_BYTES = 512 * 1024
/** Sliding-window rate limit: at most `max` requests per `windowMs`. */
export const MCP_RATE_LIMIT = { windowMs: 10000, max: 120 }
/** Max concurrent in-flight MCP requests (guards slow/hung handlers). */
export const MCP_MAX_INFLIGHT = 16

export interface McpServerHandle {
  port: number
  token: string
  url: string
  stop: () => Promise<void>
}

export interface McpServerState {
  running: boolean
  port: number | null
  token: string | null
}

/**
 * Sliding-window limiter keyed by remote address. Tracks the timestamps of
 * recent requests; `check` prunes old entries and returns false when the
 * window is full. Localhost-only server, so this guards against runaway
 * loops / buggy clients rather than network attackers.
 */
export function createRateLimiter(windowMs = MCP_RATE_LIMIT.windowMs, max = MCP_RATE_LIMIT.max) {
  const hits = new Map<string, number[]>()
  return {
    check(address: string): boolean {
      const now = Date.now()
      const list = (hits.get(address) || []).filter((t) => now - t < windowMs)
      if (list.length >= max) {
        hits.set(address, list)
        return false
      }
      list.push(now)
      hits.set(address, list)
      return true
    },
    reset(): void {
      hits.clear()
    },
  }
}

export function createMcpServer(tools: McpTool[], deps: McpDeps): { start: () => Promise<McpServerHandle>; stop: () => Promise<void>; getState: () => McpServerState } {
  let server: http.Server | null = null
  let token = randomBytes(32).toString('hex')
  let port: number | null = null
  const rateLimiter = createRateLimiter()
  let inflight = 0

  const sendError = (res: http.ServerResponse, id: unknown, code: number, message: string): void => {
    if (res.writableEnded) return
    res.setHeader('Content-Type', 'application/json')
    res.statusCode = 200
    res.end(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }))
  }

  const handleBody = async (body: string, res: http.ServerResponse): Promise<void> => {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(body)
    } catch {
      sendError(res, null, -32700, 'Parse error')
      return
    }
    const id = message.id
    const method = message.method
    if (typeof method !== 'string') {
      sendError(res, id, -32600, 'Invalid Request')
      return
    }
    const params = (message.params && typeof message.params === 'object' ? message.params : {}) as Record<string, unknown>

    const ok = (result: unknown): void => {
      if (res.writableEnded) return
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, result }))
    }

    switch (method) {
      case 'initialize': {
        const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : MCP_PROTOCOL_VERSION
        ok({
          protocolVersion: requested,
          capabilities: { tools: {} },
          serverInfo: { name: 'devlauncher', version: '0.2.1' },
        })
        return
      }
      case 'notifications/initialized':
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, result: {} }))
        return
      case 'ping':
        ok({})
        return
      case 'tools/list':
        ok({ tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) })
        return
      case 'tools/call': {
        const name = typeof params.name === 'string' ? params.name : ''
        const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>
        const result = await dispatchTool(tools, deps, name, args)
        if (result.success) {
          ok({ content: [{ type: 'text', text: JSON.stringify(result.data ?? { success: true }) }], isError: false })
        } else {
          ok({ content: [{ type: 'text', text: result.error || 'Tool failed' }], isError: true })
        }
        return
      }
      default:
        sendError(res, id, -32601, `Method not found: ${method}`)
    }
  }

  const start = (): Promise<McpServerHandle> => new Promise((resolve, reject) => {
    if (server) {
      resolve({ port: port!, token, url: `http://127.0.0.1:${port}/mcp`, stop })
      return
    }
    token = randomBytes(32).toString('hex')
    const srv = http.createServer((req, res) => {
      // Localhost only — never accept connections from other interfaces.
      const address = req.socket.remoteAddress || ''
      if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') {
        res.statusCode = 403
        res.end('forbidden')
        return
      }
      // Bearer token auth on every request.
      const header = req.headers.authorization || ''
      if (header !== `Bearer ${token}`) {
        res.statusCode = 401
        res.end('unauthorized')
        return
      }
      // Rate limit + concurrency guard (checked before any work happens).
      if (!rateLimiter.check(address)) {
        res.statusCode = 429
        res.setHeader('Retry-After', Math.ceil(MCP_RATE_LIMIT.windowMs / 1000))
        res.end('rate limited')
        return
      }
      if (inflight >= MCP_MAX_INFLIGHT) {
        res.statusCode = 429
        res.end('too many concurrent requests')
        return
      }
      // Payload size cap — reject oversized bodies before buffering them.
      const declaredLength = Number(req.headers['content-length'] || 0)
      if (declaredLength > MCP_MAX_BODY_BYTES) {
        res.statusCode = 413
        res.end('payload too large')
        return
      }
      if (req.method === 'GET') {
        // Streamable HTTP also defines GET for SSE — we do not stream; a GET
        // just returns the endpoint info so probes don't hang.
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, result: { capabilities: { tools: {} } } }))
        return
      }
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end('method not allowed')
        return
      }
      if ((req.url || '').split('?')[0] !== '/mcp') {
        res.statusCode = 404
        res.end('not found')
        return
      }
      let body = ''
      let tooLarge = false
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8')
        if (Buffer.byteLength(body, 'utf8') > MCP_MAX_BODY_BYTES) tooLarge = true
      })
      req.on('end', () => {
        inflight += 1
        const done = () => { inflight = Math.max(0, inflight - 1) }
        res.on('close', done)
        if (tooLarge) {
          res.statusCode = 413
          res.end('payload too large')
          return
        }
        void handleBody(body, res).finally(done)
      })
      req.on('error', () => {
        if (!res.writableEnded) { res.statusCode = 400; res.end('bad request') }
      })
    })
    server = srv
    srv.on('error', (error) => { server = null; reject(error) })
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') port = addr.port
      if (!port) { server = null; reject(new Error('Failed to allocate MCP port')); return }
      resolve({ port, token, url: `http://127.0.0.1:${port}/mcp`, stop })
    })
  })

  const stop = (): Promise<void> => new Promise((resolve) => {
    if (!server) { resolve(); return }
    const srv = server
    server = null
    port = null
    rateLimiter.reset()
    srv.close(() => resolve())
    // Force-close lingering sockets after a short grace period.
    setTimeout(() => srv.closeAllConnections?.(), 500)
  })

  const getState = (): McpServerState => ({ running: server !== null, port, token: server ? token : null })

  return { start, stop, getState }
}
