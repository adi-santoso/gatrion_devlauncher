/**
 * MCP feature lifecycle — owns the HTTP server and the omp config entry.
 * Started when the user enables "Agent can control DevLauncher" (Settings),
 * stopped (and the omp config entry removed) when disabled or on quit.
 */
import type { McpDeps } from './tools'
import { createTools } from './tools'
import { createVpsTools } from './vpsTools'
import { createMcpServer, type McpServerState, type McpScopeResolver } from './server'
import { writeOmpMcpEntry, removeOmpMcpEntry } from './ompConfig'
import { setApprovalSender, denyAllApprovals } from './approval'
import { getScope, listScopes, revokeScope } from '../managers/vps/vpsScopes'

export interface McpManager {
  start: () => Promise<{ ok: boolean; port?: number; error?: string }>
  stop: () => Promise<void>
  getState: () => McpServerState
}

export function setupMcpManager(deps: McpDeps): McpManager {
  const tools = createTools()
  // VPS tools are served only from per-session scoped endpoints: the target
  // server is bound to the endpoint, never chosen by tool arguments.
  const vpsTools = createVpsTools()
  const resolveScope: McpScopeResolver = (scopeId) => {
    const scope = getScope(scopeId)
    if (!scope) return null
    return {
      token: scope.token,
      tools: vpsTools,
      deps: {
        ...deps,
        vpsScope: { scopeId: scope.scopeId, serverId: scope.serverId, sessionId: scope.sessionId },
      },
    }
  }
  const server = createMcpServer(tools, deps, resolveScope)
  let started = false

  // Destructive tools push their approval request to the renderer; the modal
  // replies over mcp-approval-respond (wired in ipcHandlers).
  setApprovalSender((request) => {
    const win = deps.getWindow()
    if (!win || win.isDestroyed()) return false
    win.webContents.send('mcp-approval-request', request)
    return true
  })

  const start = async (): Promise<{ ok: boolean; port?: number; error?: string }> => {
    if (started) return { ok: true, port: server.getState().port ?? undefined }
    try {
      const handle = await server.start()
      writeOmpMcpEntry(handle.port, handle.token)
      started = true
      return { ok: true, port: handle.port }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  }

  const stop = async (): Promise<void> => {
    if (!started) return
    // Unstick any pending destructive calls before tearing the server down.
    denyAllApprovals()
    for (const scope of listScopes()) revokeScope(scope.scopeId)
    removeOmpMcpEntry()
    await server.stop()
    started = false
  }

  return { start, stop, getState: server.getState }
}
