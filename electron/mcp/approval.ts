/**
 * F3 approval flow for destructive MCP tools. A destructive tools/call parks
 * in `requestApproval` until the user answers the renderer modal (approve /
 * deny), the 120 s timeout elapses, or the window is gone. The decision is
 * returned to the caller (and audited) — deny is an ordinary tool error.
 *
 * The sender is wired by the MCP lifecycle (index.ts) to push requests over
 * `mcp-approval-request`; the renderer replies through the IPC handler
 * `mcp-approval-respond`, which lands here via `respondApproval`.
 */
import { randomBytes } from 'crypto'
import type { McpTool, McpDeps } from './toolsShared'
import { resolveProject } from './toolsShared'

export type ApprovalDecision = 'approved' | 'denied'

export interface McpApprovalRequest {
  id: string
  tool: string
  label: string
  projectId?: string
  projectName?: string
  summary: string
  /** args with secret-bearing values masked — safe to show in the UI */
  args: Record<string, unknown>
  timestamp: string
}

export type ApprovalResult = { approved: true; reason: 'approved' } | { approved: false; reason: string }

export const APPROVAL_TIMEOUT_MS = 120000

const SECRET_KEYS = /password|passwd|secret|token|api[_-]?key|authorization/i

/** Mask values of secret-looking keys so the modal never shows credentials. */
function maskSecrets(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args || {})) {
    if (SECRET_KEYS.test(key)) {
      out[key] = '***'
      continue
    }
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

let sender: ((request: McpApprovalRequest) => boolean) | null = null

interface PendingEntry {
  resolve: (decision: ApprovalDecision) => void
  timer: NodeJS.Timeout
}

const pending = new Map<string, PendingEntry>()

/** Wire the push channel to the renderer. Returns false when nothing received. */
export function setApprovalSender(fn: ((request: McpApprovalRequest) => boolean) | null): void {
  sender = fn
}

/**
 * Ask the user to approve a destructive tool call. Resolves when the user
 * answers, times out (auto-deny), or when no renderer is available.
 */
export async function requestApproval(tool: McpTool, deps: McpDeps, args: Record<string, unknown>): Promise<ApprovalResult> {
  const id = randomBytes(8).toString('hex')

  if (!sender) return { approved: false, reason: 'Approval channel is not available' }

  // Best-effort project name for the modal (never fails the request).
  const projectId = typeof args.projectId === 'string' && args.projectId ? args.projectId : undefined
  const projectName = projectId ? await approvalProjectName(deps, projectId) : undefined

  const request: McpApprovalRequest = {
    id,
    tool: tool.name,
    label: tool.label || tool.name,
    projectId,
    projectName,
    summary: tool.description,
    args: maskSecrets(args),
    timestamp: new Date().toISOString(),
  }

  const delivered = sender(request)
  if (!delivered) return { approved: false, reason: 'DevLauncher window is not available for approval' }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve({ approved: false, reason: 'Approval timed out — user did not respond' })
    }, APPROVAL_TIMEOUT_MS)
    pending.set(id, {
      resolve: (decision) => {
        clearTimeout(timer)
        pending.delete(id)
        resolve(decision === 'approved'
          ? { approved: true, reason: 'approved' }
          : { approved: false, reason: 'User menolak operasi ini' })
      },
      timer,
    })
  })
}

/** Resolve a pending approval from the renderer. Returns false if unknown/expired. */
export function respondApproval(id: string, decision: ApprovalDecision): boolean {
  const entry = pending.get(id)
  if (!entry) return false
  entry.resolve(decision)
  return true
}

/** Deny everything outstanding (e.g. when the MCP server stops / app quits). */
export function denyAllApprovals(): void {
  for (const id of [...pending.keys()]) respondApproval(id, 'denied')
}

export function pendingApprovalCount(): number {
  return pending.size
}

// Re-exported for tools that want to enrich the modal with a resolved project.
export async function approvalProjectName(deps: McpDeps, projectId: string): Promise<string | undefined> {
  try {
    const project = await resolveProject(deps, projectId)
    return project.name
  } catch {
    return undefined
  }
}
