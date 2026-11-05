/**
 * Shared pieces of the MCP tool registry: types, arg/project helpers, the
 * audit trail for write tools, and the tools/call dispatcher. Tool definitions
 * live in toolsRead.ts / toolsWrite.ts / toolsWriteMisc.ts; tools.ts is the
 * barrel that assembles them.
 */
import type { BrowserWindow } from 'electron'
import type { StorageManager, ActivityEntry } from '../managers/StorageManager'
import type { ProcessManager } from '../managers/ProcessManager'
import type { HealthManager } from '../managers/HealthManager'
import type { PreviewManager } from '../managers/PreviewManager'
import type { Project, AppConfig } from '../../src/types/shared'
import type { VpsManager } from '../managers/vps/VpsManager'
import Logger from '../utils/logger'
import { requestApproval } from './approval'
import { redactOutput, redactUrlCredentials } from '../managers/vps/vpsRedact'
import type { AiApprovalInput, AiApprovalDecision } from '../managers/vps/vpsAiApproval'

export type Permission = 'read' | 'write' | 'destructive'

/** Auto-updater surface the MCP update tools need (the full state machine). */
export interface McpUpdaterHandle {
  check: () => Promise<{ success: boolean; error?: string }>
  startDownload: () => Promise<{ success: boolean; error?: string }>
  quitAndInstall: () => { success: boolean; error?: string }
  getState: () => { state: string; progress?: unknown; error?: string | null }
}

export interface McpDeps {
  storageManager: StorageManager
  processManager: ProcessManager
  healthManager: HealthManager
  previewManager: PreviewManager
  getWindow: () => BrowserWindow | null
  /** Auto-updater state machine (packaged builds only). */
  getUpdater?: () => McpUpdaterHandle | null
  /** Apply OS-level settings (login item) after a destructive config change. */
  applyOSSettings?: (config: AppConfig) => Promise<void>
  /** VPS Command Center manager (only set for scoped VPS endpoints). */
  vpsManager?: VpsManager
  reviewVpsAction?: (input: AiApprovalInput) => Promise<AiApprovalDecision>
  /**
   * Present only on a per-session VPS scope endpoint. The bound server is the
   * *endpoint*, never an agent argument — this is the isolation primitive (F0).
   */
  vpsScope?: McpVpsScope
}

export interface McpVpsScope {
  scopeId: string
  serverId: string
  sessionId: string
}

export interface McpTool {
  name: string
  /** Long description shown to the model (tools/list). */
  description: string
  /** Short human label for the approval modal / UI. */
  label?: string
  inputSchema: Record<string, unknown>
  permission: Permission
  /** Optional short sentence shown in the approval modal (defaults to description). */
  summary?: (args: Record<string, unknown>, deps: McpDeps) => string | Promise<string>
  /**
   * Backend policy/sanity check that must pass *before* the approval prompt.
   * VPS tools use it so a read-only server never asks the user to approve an
   * operation that policy forbids anyway.
   */
  guard?: (args: Record<string, unknown>, deps: McpDeps) => Promise<void> | void
  handler: (args: Record<string, unknown>, deps: McpDeps) => Promise<unknown> | unknown
}

export const noop = (): void => {}

export async function resolveProject(deps: McpDeps, projectId: unknown): Promise<Project> {
  if (typeof projectId !== 'string' || !projectId.trim()) throw new Error('projectId is required')
  const projects = await deps.storageManager.loadProjects()
  const project = projects.find((p) => p.id === projectId)
  if (!project) throw new Error(`Project ${projectId} not found`)
  return project
}

/** Safe project shape — env vars / secret material is NEVER included. */
export function safeProject(project: Project, status?: { status: unknown; pid?: unknown; exitCode?: unknown; error?: unknown; message?: unknown } | null): Record<string, unknown> {
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    type: project.type,
    port: project.port,
    startCommand: project.startCommand,
    emoji: project.emoji,
    color: project.color,
    autoStart: project.autoStart,
    lastRun: project.lastRun,
    tags: project.tags,
    dependsOn: project.dependsOn,
    commands: (project.commands || []).map((c) => ({ id: c.id, name: c.name, command: c.command, primary: Boolean(c.primary) })),
    customCommands: (project.customCommands || []).map((c) => ({ id: c.id, label: c.label, command: c.command })),
    status: status
      ? {
          status: String(status.status).toLowerCase(),
          pid: typeof status.pid === 'number' ? status.pid : null,
          exitCode: status.exitCode ?? null,
          message: status.message ?? status.error ?? null,
        }
      : { status: 'stopped' },
  }
}

export function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required`)
  return value
}

export function optionalInt(args: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const raw = args[key]
  if (raw === undefined || raw === null) return fallback
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < min || raw > max) throw new Error(`${key} must be an integer between ${min} and ${max}`)
  return raw
}

/** Mask secret-bearing values so audits never leak credentials. */
function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const SECRET = /password|passwd|secret|token|api[_-]?key|authorization/i
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args || {})) {
    if (SECRET.test(key)) { out[key] = '***'; continue }
    if (key === 'entries' && Array.isArray(value)) {
      out[key] = value.map((entry) => {
        if (entry && typeof entry === 'object' && 'key' in (entry as Record<string, unknown>)) {
          const { key: k, ...rest } = entry as Record<string, unknown>
          return { key: k, ...(Object.keys(rest).length ? { value: '***' } : {}) }
        }
        return entry
      })
      continue
    }
    out[key] = value
  }
  return out
}

/**
 * Every MCP tool call is audited (activity feed + main.log). Read calls get a
 * brief entry; write/destructive entries include the redacted args/detail and
 * the user's approval decision (F4: full audit, D7).
 */
export async function audit(deps: McpDeps, tool: McpTool, args: Record<string, unknown>, detail: string, durationMs: number): Promise<void> {
  detail = redactUrlCredentials(redactOutput(detail))
  const entry: ActivityEntry = {
    type: 'agent',
    project: typeof args.projectId === 'string' ? args.projectId : '',
    message: tool.permission === 'read' ? `Agent (MCP) membaca ${tool.name}` : `Agent (MCP) menjalankan ${tool.name}`,
    detail,
    timestamp: new Date().toISOString(),
  }
  try {
    await deps.storageManager.appendActivities([entry])
  } catch { /* audit must never fail the tool call */ }
  Logger.info('MCP', `tool=${tool.name} permission=${tool.permission} durationMs=${durationMs} args=${redactUrlCredentials(redactOutput(JSON.stringify(redactArgs(args)))).slice(0, 300)} detail=${detail.slice(0, 200)}`)
}

/** Per-category permission matrix from app config (all on by default). */
export type PermissionMatrix = { read: boolean; write: boolean; destructive: boolean }

export async function loadPermissionMatrix(deps: McpDeps): Promise<PermissionMatrix> {
  try {
    const config = await deps.storageManager.loadConfig()
    const perms = (config as { agent?: { permissions?: Partial<PermissionMatrix> } } | null)?.agent?.permissions
    return {
      read: perms?.read !== false,
      write: perms?.write !== false,
      destructive: perms?.destructive !== false,
    }
  } catch {
    return { read: true, write: true, destructive: true }
  }
}

/**
 * Dispatch one MCP tools/call: resolve the tool, run its handler, and audit
 * every non-read call. Never rejects — errors become { success:false, error }.
 */
export async function dispatchTool(tools: McpTool[], deps: McpDeps, name: string, args: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
  args = JSON.parse(JSON.stringify(args)) as Record<string, unknown>
  const tool = tools.find((t) => t.name === name)
  if (!tool) return { success: false, error: `Unknown tool: ${name}` }
  const started = Date.now()
  const finish = (result: { success: boolean; data?: unknown; error?: string }, detail: string): { success: boolean; data?: unknown; error?: string } => {
    void audit(deps, tool, args, detail, Date.now() - started)
    return result
  }
  try {
    // Permission matrix from Settings — each category can be disabled.
    const matrix = await loadPermissionMatrix(deps)
    const boundServer = deps.vpsScope ? await deps.vpsManager?.store.getServer(deps.vpsScope.serverId) : null
    const fullAccess = boundServer?.policy === 'full-access'
    let decisionDetail = fullAccess ? 'mode=full-access' : 'mode=controlled'
    if (!fullAccess && !matrix[tool.permission]) {
      return finish({ success: false, error: `Permission denied: ${tool.permission} tools are disabled in Settings` }, 'permission denied')
    }
    // Policy guard runs BEFORE the approval prompt: never ask the user to
    // approve something the backend will reject anyway.
    if (tool.guard) await tool.guard(args, deps)
    // Destructive tools wait for explicit user approval before running.
    if (tool.permission === 'destructive') {
      const snapshot = async (): Promise<string> => {
        if (!deps.vpsScope || !deps.vpsManager) return ''
        const server = await deps.vpsManager.store.getServer(deps.vpsScope.serverId)
        return JSON.stringify({ server, connection: deps.vpsManager.getStatus(deps.vpsScope.serverId).connectedAt })
      }
      const before = await snapshot()
      const decision = fullAccess ? { approved: true, reason: 'full-access' }
        : boundServer?.policy === 'auto'
          ? deps.reviewVpsAction && deps.vpsScope
            ? await deps.reviewVpsAction({ tool: name, args, server: {
              name: boundServer.name, host: boundServer.host, port: boundServer.port, username: boundServer.username,
              environment: boundServer.environment, cwd: boundServer.defaultCwd,
            }, scopeId: deps.vpsScope.scopeId })
            : { approved: false, reason: 'AI approval reviewer is unavailable' }
          : await requestApproval(tool, deps, args)
      decisionDetail = `mode=${boundServer?.policy || 'controlled'} decision=${decision.approved ? 'approved' : 'denied'} reason=${decision.reason}`
      if (!decision.approved) {
        return finish({ success: false, error: decision.reason }, decisionDetail)
      }
      if (before !== await snapshot()) throw new Error('VPS target changed while approval was pending — request approval again')
      const currentMatrix = await loadPermissionMatrix(deps)
      if (!fullAccess && !currentMatrix[tool.permission]) throw new Error('Permission was revoked while approval was pending')
      if (tool.guard) await tool.guard(args, deps)
    }
    const data = await tool.handler(args, deps)
    return finish({ success: true, data }, tool.permission === 'read' ? 'read' : `${decisionDetail} args=${JSON.stringify(args).slice(0, 200)}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return finish({ success: false, error: message }, `error=${message.slice(0, 200)}`)
  }
}
