/**
 * VPS Command Center domain types — single source of truth for the VPS IPC
 * boundary (main process + renderer). Kept free of runtime code so both sides
 * can `import type`.
 *
 * Isolation note (F0): the agent target for a VPS is an *endpoint scope*, never
 * an argument. No type here carries credentials or a server id that the agent
 * can choose for execution.
 */

export type VpsEnvironment = 'production' | 'staging' | 'development'

export type VpsConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'verifying-host'
  | 'connected'
  | 'reconnecting'
  | 'error'

/** Per-server agent policy. Manual (user-driven) actions bypass agent policy. */
export type VpsPolicy = 'agent-disabled' | 'read-only' | 'controlled' | 'auto' | 'full-access'

export type VpsAuthKind = 'key' | 'password' | 'agent'

export interface VpsServer {
  id: string
  name: string
  host: string
  port: number
  username: string
  environment: VpsEnvironment
  policy: VpsPolicy
  authKind: VpsAuthKind
  /** Opaque key into the encrypted credential store. Never a secret itself. */
  authRef: string
  defaultCwd: string
  tags: string[]
  createdAt: string
  lastConnectedAt: string | null
}

/** Fields a user may set when creating/updating a server (no secrets). */
export type VpsServerInput = Pick<
  VpsServer,
  'name' | 'host' | 'port' | 'username' | 'environment' | 'policy' | 'authKind' | 'defaultCwd' | 'tags'
>

export interface VpsHostKeyInfo {
  algorithm: string
  fingerprint: string
  trustedAt: string
}

export interface VpsServerStatus {
  serverId: string
  state: VpsConnectionState
  error: string | null
  connectedAt: string | null
  /** Present while verifying an untrusted/unknown host key. */
  pendingHostKey: VpsHostKeyInfo | null
  hostKey: VpsHostKeyInfo | null
}

export interface VpsMetrics {
  /** false when /proc is unavailable (e.g. non-Linux target). */
  available: boolean
  /** true when the last successful sample is older than the polling budget. */
  stale: boolean
  cpuPercent: number | null
  memUsedMb: number | null
  memTotalMb: number | null
  diskUsedPercent: number | null
  loadAvg: [number, number, number] | null
  uptimeSec: number | null
  sampledAt: string | null
}

export interface VpsOverview {
  available: boolean
  error: string | null
  hostname: string | null
  os: string | null
  kernel: string | null
  cwd: string | null
  metrics: VpsMetrics
}

export interface VpsService {
  name: string
  load: string
  active: string
  sub: string
  description: string
}

export type VpsJobState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'unknown'

export type VpsJobOrigin = 'user' | 'agent'

export interface VpsJob {
  id: string
  serverId: string
  sessionId: string | null
  command: string
  cwd: string
  /** true when the command may change remote state (never auto-retried). */
  mutating: boolean
  origin: VpsJobOrigin
  state: VpsJobState
  exitCode: number | null
  startedAt: string
  endedAt: string | null
  truncated: boolean
  /** Bounded, redacted tail of stdout+stderr. */
  output: string
}

export interface VpsJobEvent {
  jobId: string
  serverId: string
  type: 'started' | 'output' | 'state'
  chunk?: string
  job: VpsJob
}

export interface VpsConnectResult {
  success: boolean
  status: VpsServerStatus
  error?: string
}

export interface VpsTestResult {
  success: boolean
  error?: string
  /** Fingerprint observed during the test — shown for review, not auto-trusted. */
  hostKey?: VpsHostKeyInfo
  authMethods?: string[]
}

export interface VpsConnectionEvent {
  serverId: string
  status: VpsServerStatus
}

/** Chat/agent target: a local project or a VPS server (D5). */
export type AgentTargetKind = 'project' | 'vps'
export interface AgentTarget {
  type: AgentTargetKind
  id: string
}
