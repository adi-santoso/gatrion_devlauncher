/**
 * VPS MCP tools — served ONLY from a per-session scoped endpoint
 * (`/mcp/<scopeId>`) whose target server is bound server-side. No tool accepts
 * a `serverId`, host, or credential: cross-server execution is structurally
 * impossible regardless of what the agent puts in its arguments (F0 §11.2).
 *
 * Policy is enforced in the backend (VpsManager.assertAgentAllowed) before any
 * remote work: arbitrary exec is never allowed in read-only mode. Mutating
 * tools are `destructive` so they route through the existing approval modal.
 */
import type { McpTool, McpDeps } from './toolsShared'
import { optionalInt, requireString } from './toolsShared'
import { buildRestartCommand } from '../managers/vps/remoteCommand'
import { getScope } from '../managers/vps/vpsScopes'

const MAX_MCP_OUTPUT = 4000

function scopeOf(deps: McpDeps): { scopeId: string; serverId: string; sessionId: string } {
  const scope = deps.vpsScope
  if (!scope || !deps.vpsManager) {
    throw new Error('This MCP endpoint is not bound to a VPS server')
  }
  if (!getScope(scope.scopeId)) throw new Error('VPS session scope has been revoked')
  return { scopeId: scope.scopeId, serverId: scope.serverId, sessionId: scope.sessionId }
}

/** Short, non-secret server summary for tool results. */
async function describeServer(deps: McpDeps, serverId: string): Promise<{ name: string; environment: string; host: string; username: string; port: number; policy: string; defaultCwd: string }> {
  const server = await deps.vpsManager!.store.getServer(serverId)
  if (!server) throw new Error('Bound server no longer exists')
  return {
    name: server.name,
    environment: server.environment,
    host: server.host,
    username: server.username,
    port: server.port,
    policy: server.policy,
    defaultCwd: server.defaultCwd,
  }
}

/** Policy guard for the scoped endpoint's bound server (runs before approval). */
function guardFor(capability: 'read' | 'exec' | 'change') {
  return async (_args: Record<string, unknown>, deps: McpDeps): Promise<void> => {
    const { serverId } = scopeOf(deps)
    const server = await deps.vpsManager!.store.getServer(serverId)
    if (!server) throw new Error('Bound server no longer exists')
    deps.vpsManager!.assertAgentAllowed(server, capability)
  }
}

export function createVpsTools(): McpTool[] {
  return [
    {
      name: 'vps_get_overview',
      description: 'Read the bound VPS: OS, kernel, hostname, uptime, CPU/RAM/disk metrics and working directory. No arguments.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      permission: 'read',
      guard: guardFor('read'),
      handler: async (_args, d) => {
        const { serverId } = scopeOf(d)
        const overview = await d.vpsManager!.getOverview(serverId)
        return { server: await describeServer(d, serverId), ...overview }
      },
    },
    {
      name: 'vps_list_services',
      description: 'List systemd services on the bound VPS with load/active/sub state (Linux + systemd target).',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      permission: 'read',
      guard: guardFor('read'),
      handler: async (_args, d) => {
        const { serverId } = scopeOf(d)
        return { services: await d.vpsManager!.listServices(serverId) }
      },
    },
    {
      name: 'vps_get_logs',
      description: 'Read recent journald logs for one service unit on the bound VPS (tail, bounded).',
      inputSchema: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'systemd unit name, e.g. nginx.service' },
          lines: { type: 'number', description: 'Lines to tail (1-2000, default 200)' },
        },
        required: ['service'],
        additionalProperties: false,
      },
      permission: 'read',
      guard: guardFor('read'),
      handler: async (args, d) => {
        const { serverId } = scopeOf(d)
        const service = requireString(args, 'service')
        const lines = optionalInt(args, 'lines', 200, 1, 2000)
        const result = await d.vpsManager!.getLogs(serverId, service, lines)
        return { service, ...result }
      },
    },
    {
      name: 'vps_get_job',
      description: 'Status of a remote job started from this chat session (state, exit code, bounded output tail).',
      inputSchema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'], additionalProperties: false },
      permission: 'read',
      guard: guardFor('read'),
      handler: async (args, d) => {
        const { serverId, sessionId } = scopeOf(d)
        const job = d.vpsManager!.getJob(requireString(args, 'jobId'), serverId)
        if (!job || job.sessionId !== sessionId) throw new Error('Job not found for this session')
        return summarizeJob(job)
      },
    },
    {
      name: 'vps_cancel_job',
      description: 'Request cancellation of one of this session\'s remote jobs. Reports requested vs confirmed — the remote process is not proven dead.',
      inputSchema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'], additionalProperties: false },
      permission: 'write',
      guard: guardFor('read'),
      handler: async (args, d) => {
        const { serverId, sessionId } = scopeOf(d)
        const jobId = requireString(args, 'jobId')
        const job = d.vpsManager!.getJob(jobId, serverId)
        if (!job || job.sessionId !== sessionId) throw new Error('Job not found for this session')
        const result = d.vpsManager!.cancelJob(jobId)
        return { ...result, jobId, note: 'Channel close is not a confirmed remote kill.' }
      },
    },
    {
      name: 'vps_exec',
      description: 'Run a shell command on the bound VPS. Requires user approval. Each call is a fresh shell — pass `cwd` explicitly.',
      label: 'Jalankan command di VPS',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command (max 8000 chars)' },
          cwd: { type: 'string', description: 'Absolute working directory on the server (optional)' },
          timeoutMs: { type: 'number', description: 'Remote timeout in ms (1000-300000, default 60000)' },
          mutating: { type: 'boolean', description: 'Set true when the command changes remote state' },
        },
        required: ['command'],
        additionalProperties: false,
      },
      permission: 'destructive',
      guard: guardFor('exec'),
      summary: async (args, d) => {
        const { serverId } = scopeOf(d)
        const server = await describeServer(d, serverId)
        const cwd = typeof args.cwd === 'string' && args.cwd ? args.cwd : server.defaultCwd || '(SSH login directory)'
        return `${server.environment.toUpperCase()} — ${server.name} (${server.username}@${server.host})\nCommand: ${String(args.command).slice(0, 500)}\ncwd: ${cwd}`
      },
      handler: async (args, d) => {
        const { serverId, sessionId } = scopeOf(d)
        const command = requireString(args, 'command')
        const cwd = typeof args.cwd === 'string' ? args.cwd : ''
        const timeoutMs = optionalInt(args, 'timeoutMs', 60000, 1000, 300000)
        const mutating = args.mutating === true
        const { job, completed } = await d.vpsManager!.execute(serverId, {
          command,
          cwd,
          timeoutMs,
          mutating,
          origin: 'agent',
          sessionId,
          capability: 'exec',
          waitMs: 90000,
        })
        return { ...summarizeJob(job), completed }
      },
    },
    {
      name: 'vps_restart_service',
      description: 'Restart one systemd service on the bound VPS (validated unit name). Requires user approval.',
      label: 'Restart service di VPS',
      inputSchema: { type: 'object', properties: { service: { type: 'string' } }, required: ['service'], additionalProperties: false },
      permission: 'destructive',
      guard: guardFor('change'),
      summary: async (args, d) => {
        const { serverId } = scopeOf(d)
        const server = await describeServer(d, serverId)
        return `${server.environment.toUpperCase()} — restart ${String(args.service)} on ${server.name} (${server.username}@${server.host})`
      },
      handler: async (args, d) => {
        const { serverId, sessionId } = scopeOf(d)
        const service = requireString(args, 'service')
        // Re-validate policy right before execution (approval may have been slow).
        const { job } = await d.vpsManager!.execute(serverId, {
          command: buildRestartCommand(service),
          mutating: true,
          origin: 'agent',
          sessionId,
          capability: 'change',
          waitMs: 30000,
        })
        return summarizeJob(job)
      },
    },
  ]
}

function summarizeJob(job: {
  id: string
  state: string
  exitCode: number | null
  command: string
  cwd: string
  truncated: boolean
  output: string
  mutating: boolean
  startedAt: string
  endedAt: string | null
}) {
  return {
    jobId: job.id,
    state: job.state,
    exitCode: job.exitCode,
    command: job.command.slice(0, 500),
    cwd: job.cwd,
    mutating: job.mutating,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    truncated: job.truncated,
    output: job.output.slice(-MAX_MCP_OUTPUT),
    /** Mutating jobs are never auto-retried; ambiguous outcomes stay `unknown`. */
    retrySafe: !job.mutating && job.state !== 'unknown',
  }
}
