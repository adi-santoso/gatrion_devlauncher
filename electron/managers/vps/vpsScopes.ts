/**
 * Per-session MCP scopes (F0 §11.2).
 *
 * omp reads MCP servers from the user-level `~/.omp/agent/mcp.json` for *all*
 * RPC processes, and from a project-scoped `.omp/mcp.json` relative to the
 * process `cwd`. A VPS chat session runs omp in its own managed context dir, so
 * that dir's `.omp/mcp.json` can point at an endpoint that serves exactly one
 * server — the target is the endpoint, never an agent-supplied argument.
 *
 * Tokens remain in memory and enter only the intended omp child environment.
 * Config files contain an environment placeholder and no bearer credential.
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { randomBytes } from 'crypto'

export interface VpsScope {
  scopeId: string
  token: string
  serverId: string
  sessionId: string
  contextDir: string
}

const scopes = new Map<string, VpsScope>()

function contextRoot(): string {
  if (process.env.DEVLAUNCHER_VPS_CONTEXT_DIR) return process.env.DEVLAUNCHER_VPS_CONTEXT_DIR
  const electron = (() => {
    try { return require('electron') as typeof import('electron') } catch { return null }
  })()
  const base = electron?.app?.getPath?.('userData') || path.join(os.homedir(), '.devlauncher')
  return path.join(base, 'vps-context')
}

/**
 * Register (or reuse) a scope bound to exactly one server. The scope is stable
 * per (server, session) so omp always runs in the same context dir for a given
 * session even after the config entry is released and re-written.
 */
export function registerScope(serverId: string, sessionId: string): VpsScope {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(sessionId)) throw new Error('Invalid VPS session ID')
  for (const existing of scopes.values()) {
    if (existing.serverId === serverId && existing.sessionId === sessionId) return existing
  }
  const scopeId = randomBytes(8).toString('hex')
  const scope: VpsScope = {
    scopeId,
    token: randomBytes(32).toString('hex'),
    serverId,
    sessionId,
    contextDir: path.join(contextRoot(), serverId, sessionId.replace(/[^A-Za-z0-9._-]/g, '_')),
  }
  scopes.set(scopeId, scope)
  return scope
}

export function getScope(scopeId: string): VpsScope | null {
  return scopes.get(scopeId) || null
}

export function listScopes(): VpsScope[] {
  return [...scopes.values()]
}

/** Credentials enter only the intended child environment, never a config file. */
export function scopeForContext(contextDir: string): VpsScope | null {
  return [...scopes.values()].find((scope) => scope.contextDir === contextDir) || null
}

export function revokeScope(scopeId: string): void {
  const scope = scopes.get(scopeId)
  if (!scope) return
  scopes.delete(scopeId)
  removeScopedOmpConfig(scope)
  // Keep the directory stable for transcript/session references and live children.
}

export function revokeScopesForServer(serverId: string): void {
  for (const scope of [...scopes.values()]) {
    if (scope.serverId === serverId) revokeScope(scope.scopeId)
  }
}

/**
 * Write the project-scoped omp MCP entry into the scope's context dir. The
 * credential is referenced through the child environment, never written here.
 */
export function writeScopedOmpConfig(scope: VpsScope, endpointUrl: string): string {
  const dir = path.join(scope.contextDir, '.omp')
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, 'mcp.json')
  const config = {
    mcpServers: {
      // Shadow the ambient local control endpoint in this remote-only session.
      devlauncher: { type: 'http', url: endpointUrl, enabled: false },
      devlauncher_vps: {
        type: 'http',
        url: endpointUrl,
        headers: { Authorization: 'Bearer ${DEVLAUNCHER_VPS_TOKEN}' },
        timeout: 120000,
      },
    },
  }
  const tmp = `${filePath}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n')
  fs.renameSync(tmp, filePath)
  fs.writeFileSync(path.join(scope.contextDir, 'vps-tool-guard.mjs'), VPS_TOOL_GUARD)
  return filePath
}

/** Explicit trusted extension: ambient MCPs and memory tools cannot escape the VPS tool surface. */
export const VPS_TOOL_GUARD = `export default function(api) {
  const allowed = name => /^mcp__devlauncher_vps_vps_(get_overview|list_services|get_logs|get_job|cancel_job|exec|restart_service)$/.test(name);
  const restrict = () => api.setActiveTools(api.getAllTools().map(tool => tool.name).filter(allowed));
  api.on('session_start', restrict);
  api.on('session_switch', restrict);
  api.on('before_agent_start', restrict);
  api.on('tool_call', event => {
    if (!allowed(event.toolName)) return { block: true, reason: 'VPS sessions permit only scoped remote tools' };
  });
}
`

/** Remove the scoped config file (keeps the context dir itself). */
export function releaseContextEntry(scope: VpsScope): void {
  try { fs.rmSync(path.join(scope.contextDir, '.omp', 'mcp.json'), { force: true }) } catch { /* best effort */ }
}

export function removeScopedOmpConfig(scope: VpsScope): void {
  releaseContextEntry(scope)
}

/** Test hook. */
export function __resetScopes(): void {
  scopes.clear()
}
