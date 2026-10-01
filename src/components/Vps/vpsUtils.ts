/**
 * Shared helpers for the VPS Command Center UI.
 *
 * The agent target for a VPS session is namespaced (`vps:<serverId>`) so it can
 * never collide with a project id; existing project sessions need no migration.
 */
import type { Project } from '../../types/shared'
import type { VpsConnectionState, VpsEnvironment, VpsPolicy, VpsServer } from '../../types/vps'

export const VPS_TARGET_PREFIX = 'vps:'

export function vpsTargetId(serverId: string): string {
  return `${VPS_TARGET_PREFIX}${serverId}`
}

export function isVpsTargetId(targetId: string | null | undefined): boolean {
  return typeof targetId === 'string' && targetId.startsWith(VPS_TARGET_PREFIX)
}

export function serverIdFromTarget(targetId: string): string {
  return targetId.startsWith(VPS_TARGET_PREFIX) ? targetId.slice(VPS_TARGET_PREFIX.length) : targetId
}

/** Synthetic Project so the existing chat surface can host a VPS session. */
export function vpsPseudoProject(server: VpsServer, contextDir: string): Project {
  return {
    id: vpsTargetId(server.id),
    name: server.name,
    path: contextDir,
    type: 'CUSTOM',
    port: null,
    startCommand: '',
    commands: [],
    envVars: [],
    emoji: server.environment === 'production' ? '🔒' : '🖥️',
    color: server.environment === 'production' ? '#F87171' : '#7C6DF2',
    autoStart: false,
    createdAt: server.createdAt,
    lastRun: server.lastConnectedAt,
    tags: server.tags,
    customCommands: [],
    dependsOn: [],
    previewHost: 'localhost',
    schemaVersion: 1,
  } as Project
}

const STATE_LABEL: Record<VpsConnectionState, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  'verifying-host': 'Verify host key',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  error: 'Error',
}

export function connectionLabel(state: VpsConnectionState): string {
  return STATE_LABEL[state] || state
}

export function connectionColor(state: VpsConnectionState): string {
  if (state === 'connected') return 'text-success'
  if (state === 'error') return 'text-danger'
  if (state === 'connecting' || state === 'reconnecting' || state === 'verifying-host') return 'text-warning'
  return 'text-ink-faint'
}

export function environmentBadge(environment: VpsEnvironment): string {
  if (environment === 'production') return 'bg-danger/15 text-danger border-danger/30'
  if (environment === 'staging') return 'bg-warning/15 text-warning border-warning/30'
  return 'bg-accent/15 text-accent border-accent/30'
}

export function policyLabel(policy: VpsPolicy): string {
  if (policy === 'agent-disabled') return 'Agent off'
  if (policy === 'read-only') return 'Read-only'
  return 'Controlled'
}

/** Format bytes-ish MB values compactly. */
export function formatMb(value: number | null): string {
  if (value === null || value === undefined) return '—'
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`
  return `${Math.round(value)} MB`
}

export function formatPercent(value: number | null): string {
  return value === null || value === undefined ? '—' : `${value}%`
}

export function formatUptime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id
}
