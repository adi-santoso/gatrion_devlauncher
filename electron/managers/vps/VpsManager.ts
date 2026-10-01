/**
 * VpsManager — owns VPS server lifecycle for the main process.
 *
 * Responsibilities (D2/D4):
 *  - one persistent SSH connection per server, channels per operation
 *  - SSH secrets resolved from the encrypted store, never exposed elsewhere
 *  - agent policy enforcement (agent-disabled / read-only / controlled)
 *  - remote job registry with bounded, redacted output and honest states
 *  - structured read probes (overview/services/logs) and controlled restart
 *
 * It is deliberately separate from ProcessManager: local project lifecycle and
 * VPS lifecycle share no state (D4).
 */
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import type {
  VpsConnectionState,
  VpsHostKeyInfo,
  VpsJob,
  VpsJobOrigin,
  VpsMetrics,
  VpsOverview,
  VpsServer,
  VpsServerInput,
  VpsServerStatus,
  VpsService,
  VpsTestResult,
} from '../../../src/types/vps'
import Logger from '../../utils/logger'
import VpsStore from './vpsStore'
import VpsCredentialStore, { sanitizeSecret, type VpsSecret } from './vpsCredentials'
import VpsTransport, { type HostKeyInfo } from './VpsTransport'
import { createBoundedBuffer } from './vpsRedact'
import {
  buildLogsCommand,
  buildOverviewScript,
  buildRestartCommand,
  buildServicesCommand,
  cpuPercentBetween,
  parseOverview,
  parseRestartResult,
  parseServices,
} from './remoteCommand'
import VpsJobRegistry, { MAX_OUTPUT_BYTES } from './vpsJobRegistry'
import { registerScope, revokeScopesForServer, type VpsScope } from './vpsScopes'

export { MAX_OUTPUT_BYTES, MAX_JOBS_PER_SERVER, JOB_RETENTION_MS } from './vpsJobRegistry'
export type { CancelResult } from './vpsJobRegistry'

const OVERVIEW_TIMEOUT_MS = 15000
const METRICS_STALE_MS = 30000
const MAX_SERVICES = 300

export type AgentCapability = 'read' | 'exec' | 'change'

interface Connection {
  serverId: string
  transport: VpsTransport
  state: VpsConnectionState
  error: string | null
  connectedAt: string | null
  pendingHostKey: VpsHostKeyInfo | null
  hostKey: VpsHostKeyInfo | null
  terminalId: string | null
  terminalOpening: Promise<{ id: string }> | null
  cpuTimes: { idle: number; total: number } | null
  overview: VpsOverview | null
}

const unavailableMetrics = (): VpsMetrics => ({
  available: false,
  stale: true,
  cpuPercent: null,
  memUsedMb: null,
  memTotalMb: null,
  diskUsedPercent: null,
  loadAvg: null,
  uptimeSec: null,
  sampledAt: null,
})

export class VpsManager extends EventEmitter {
  store: VpsStore
  credentials: VpsCredentialStore
  private connections = new Map<string, Connection>()
  private jobRegistry: VpsJobRegistry

  constructor(userDataDir?: string) {
    super()
    this.store = new VpsStore(userDataDir)
    this.credentials = new VpsCredentialStore(userDataDir)
    this.jobRegistry = new VpsJobRegistry(
      (job) => this.emit('job', job),
      (event) => this.emit('job-event', event),
    )
  }

  // ── registry ───────────────────────────────────────────────────────────

  listServers(): Promise<VpsServer[]> {
    return this.store.loadServers()
  }

  async addServer(input: Partial<VpsServerInput>, secret?: Partial<VpsSecret>): Promise<VpsServer> {
    const cleanSecret = secret && secret.kind ? sanitizeSecret(secret) : null
    const server = await this.store.addServer(input)
    if (cleanSecret) await this.credentials.set(server.authRef, cleanSecret)
    return server
  }

  async updateServer(id: string, patch: Partial<VpsServerInput>): Promise<VpsServer> {
    const old = await this.store.getServer(id)
    const updated = await this.store.updateServer(id, patch)
    if (old && (old.host !== updated.host || old.port !== updated.port || old.username !== updated.username)) {
      this.disconnect(id)
      await this.store.forgetHostKey(id)
    }
    return updated
  }

  async setCredential(id: string, secret: Partial<VpsSecret>): Promise<void> {
    const server = await this.store.getServer(id)
    if (!server) throw new Error(`Server ${id} not found`)
    await this.credentials.set(server.authRef, sanitizeSecret(secret))
  }

  async hasCredential(id: string): Promise<boolean> {
    const server = await this.store.getServer(id)
    return server ? this.credentials.has(server.authRef) : false
  }

  async deleteServer(id: string): Promise<void> {
    const server = await this.store.getServer(id)
    if (!server) throw new Error(`Server ${id} not found`)
    this.jobRegistry.markUnknownForServer(id)
    this.closeConnection(id)
    revokeScopesForServer(id)
    await this.credentials.delete(server.authRef)
    await this.store.deleteServer(id)
  }

  // ── status ─────────────────────────────────────────────────────────────

  getStatus(serverId: string): VpsServerStatus {
    const conn = this.connections.get(serverId)
    if (!conn) {
      return { serverId, state: 'disconnected', error: null, connectedAt: null, pendingHostKey: null, hostKey: null }
    }
    return {
      serverId,
      state: conn.state,
      error: conn.error,
      connectedAt: conn.connectedAt,
      pendingHostKey: conn.pendingHostKey,
      hostKey: conn.hostKey,
    }
  }

  getStatuses(): VpsServerStatus[] {
    return [...this.connections.keys()].map((id) => this.getStatus(id))
  }

  private setState(serverId: string, patch: Partial<Connection>): void {
    const conn = this.connections.get(serverId)
    if (!conn) return
    Object.assign(conn, patch)
    this.emit('status', this.getStatus(serverId))
  }

  // ── connection ─────────────────────────────────────────────────────────

  /** Probe a connection without persisting anything (host key only reviewed). */
  async testConnection(input: Partial<VpsServerInput>, secret: Partial<VpsSecret> | null): Promise<VpsTestResult> {
    const host = String(input?.host || '').trim()
    const username = String(input?.username || '').trim()
    const port = Number(input?.port) || 22
    if (!host || !username) return { success: false, error: 'Host and username are required' }
    let clean: VpsSecret | null = null
    if (secret && secret.kind) {
      try {
        clean = sanitizeSecret(secret)
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
    return this.probe({ host, port, username, secret: clean })
  }

  private probe(config: { host: string; port: number; username: string; secret: VpsSecret | null }): Promise<VpsTestResult> {
    return new Promise((resolve) => {
      let observed: HostKeyInfo | null = null
      const transport = new VpsTransport({
        ...config,
        // Probe only the handshake. Never authenticate to an untrusted peer.
        secret: null,
        verifyHostKey: (info) => { observed = info; return false },
      })
      transport
        .connect()
        .then(() => {
          transport.disconnect()
          resolve({ success: true, hostKey: observed ? { ...observed, trustedAt: new Date().toISOString() } : undefined })
        })
        .catch((error: Error) => {
          transport.disconnect()
          resolve({
            success: Boolean(observed),
            error: observed ? undefined : error.message,
            hostKey: observed ? { ...observed, trustedAt: new Date().toISOString() } : undefined,
          })
        })
    })
  }

  /** Connect a saved server; the host key must already be trusted (or pinned). */
  async connect(serverId: string, trustedFingerprint?: string): Promise<VpsServerStatus> {
    const server = await this.store.getServer(serverId)
    if (!server) throw new Error(`Server ${serverId} not found`)
    const secret = await this.credentials.get(server.authRef)
    if (!secret) throw new Error('No saved credential for this server — add a key or password first')
    const known = await this.store.getHostKey(serverId)
    const accepted = new Set<string>()
    if (known) accepted.add(known.fingerprint)
    if (trustedFingerprint) accepted.add(trustedFingerprint)

    this.disconnect(serverId)
    const holder: { pending: VpsHostKeyInfo | null; observed: HostKeyInfo | null } = { pending: null, observed: null }
    const transport = new VpsTransport({
      host: server.host,
      port: server.port,
      username: server.username,
      secret,
      verifyHostKey: (info) => {
        holder.observed = info
        if (accepted.has(info.fingerprint)) return true
        holder.pending = { algorithm: info.algorithm, fingerprint: info.fingerprint, trustedAt: new Date().toISOString() }
        return false
      },
    })
    const conn: Connection = {
      serverId,
      transport,
      state: 'connecting',
      error: null,
      connectedAt: null,
      pendingHostKey: null,
      hostKey: null,
      terminalId: null,
      terminalOpening: null,
      cpuTimes: null,
      overview: null,
    }
    this.connections.set(serverId, conn)
    this.emit('status', this.getStatus(serverId))

    transport.on('close', () => {
      const current = this.connections.get(serverId)
      if (current !== conn || current.state === 'disconnected') return
      this.jobRegistry.markUnknownForServer(serverId)
      this.setState(serverId, { state: 'disconnected', connectedAt: null, terminalId: null })
      revokeScopesForServer(serverId)
      this.emit('terminal-close', serverId)
      Logger.warn('VPS', `connection closed serverId=${serverId}`)
    })
    transport.on('connection-error', (error: Error) => {
      if (this.connections.get(serverId) !== conn) return
      this.jobRegistry.markUnknownForServer(serverId)
      revokeScopesForServer(serverId)
      this.setState(serverId, { state: 'error', error: error.message, terminalId: null })
      transport.disconnect()
      this.emit('terminal-close', serverId)
    })
    transport.on('shell-data', (shellId: string, chunk: string) => {
      if (conn.terminalId === shellId) this.emit('terminal-data', serverId, chunk)
    })
    transport.on('shell-close', (shellId: string) => {
      if (conn.terminalId !== shellId) return
      conn.terminalId = null
      this.emit('terminal-close', serverId)
    })

    try {
      await transport.connect()
      const observed = holder.observed
      const hostKey: VpsHostKeyInfo | null = observed
        ? { algorithm: observed.algorithm, fingerprint: observed.fingerprint, trustedAt: new Date().toISOString() }
        : known
      if (observed && trustedFingerprint && observed.fingerprint === trustedFingerprint && (!known || known.fingerprint !== observed.fingerprint)) {
        await this.store.trustHostKey(serverId, { algorithm: observed.algorithm, fingerprint: observed.fingerprint })
      }
      this.setState(serverId, {
        state: 'connected',
        error: null,
        connectedAt: new Date().toISOString(),
        pendingHostKey: null,
        hostKey,
      })
      await this.store.markConnected(serverId)
      return this.getStatus(serverId)
    } catch (error) {
      const message = (error as Error).message
      if (holder.pending) {
        this.setState(serverId, { state: 'verifying-host', error: 'Host key is not trusted yet', pendingHostKey: holder.pending })
        throw new Error(`Unknown host key ${holder.pending.fingerprint} — review and trust it first`)
      }
      this.setState(serverId, { state: 'error', error: message })
      throw new Error(message)
    }
  }

  async trustHostKey(serverId: string, fingerprint: string): Promise<VpsServerStatus> {
    const pending = this.connections.get(serverId)?.pendingHostKey
    if (!pending || pending.fingerprint !== fingerprint) {
      throw new Error('No pending host key matches that fingerprint')
    }
    return this.connect(serverId, fingerprint)
  }

  async forgetHostKey(serverId: string): Promise<void> {
    await this.store.forgetHostKey(serverId)
  }

  disconnect(serverId: string): void {
    const conn = this.connections.get(serverId)
    if (!conn) return
    this.jobRegistry.markUnknownForServer(serverId)
    this.closeConnection(serverId)
    revokeScopesForServer(serverId)
    this.emit('status', this.getStatus(serverId))
  }

  private closeConnection(serverId: string): void {
    const conn = this.connections.get(serverId)
    if (!conn) return
    const hadTerminal = Boolean(conn.terminalId)
    conn.transport.disconnect()
    this.connections.delete(serverId)
    if (hadTerminal) this.emit('terminal-close', serverId)
  }

  // ── policy ─────────────────────────────────────────────────────────────

  /** Enforce the per-server agent policy at the backend (never prompt-based). */
  assertAgentAllowed(server: VpsServer, capability: AgentCapability): void {
    if (server.policy === 'agent-disabled') throw new Error('Agent access is disabled for this server')
    if (capability !== 'read' && server.policy === 'read-only') {
      throw new Error(`Server "${server.name}" is read-only for the agent`)
    }
  }

  // ── jobs ───────────────────────────────────────────────────────────────

  getJob(id: string, serverId?: string): VpsJob | null {
    return this.jobRegistry.get(id, serverId)
  }

  listJobs(serverId: string, limit = 20): VpsJob[] {
    return this.jobRegistry.list(serverId, limit)
  }

  /** Run a command as a tracked remote job. Resolves after `waitMs` or completion. */
  async execute(
    serverId: string,
    opts: {
      command: string
      cwd?: string
      timeoutMs?: number
      waitMs?: number
      mutating?: boolean
      origin?: VpsJobOrigin
      sessionId?: string | null
      capability?: AgentCapability
    },
  ): Promise<{ job: VpsJob; completed: boolean }> {
    const server = await this.store.getServer(serverId)
    if (!server) throw new Error(`Server ${serverId} not found`)
    const origin = opts.origin || 'user'
    if (origin === 'agent') this.assertAgentAllowed(server, opts.capability || 'exec')
    const conn = this.connections.get(serverId)
    if (!conn || conn.state !== 'connected') throw new Error('Server is not connected')

    return this.jobRegistry.execute(conn.transport, serverId, {
      command: opts.command,
      cwd: opts.cwd || server.defaultCwd || '',
      timeoutMs: opts.timeoutMs,
      waitMs: opts.waitMs,
      mutating: opts.mutating,
      origin,
      sessionId: opts.sessionId,
    })
  }

  /**
   * Request cancellation. Closing the channel is not a confirmed remote kill
   * (F0), so the result distinguishes requested from confirmed.
   */
  cancelJob(id: string): { requested: boolean; confirmed: boolean; state: string } {
    return this.jobRegistry.cancel(id)
  }

  // ── structured reads ───────────────────────────────────────────────────

  getCachedOverview(serverId: string): VpsOverview {
    const conn = this.connections.get(serverId)
    if (!conn?.overview) {
      return { available: false, error: null, hostname: null, os: null, kernel: null, cwd: null, metrics: unavailableMetrics() }
    }
    const sampledAt = conn.overview.metrics.sampledAt ? new Date(conn.overview.metrics.sampledAt).getTime() : 0
    const stale = conn.state !== 'connected' || Date.now() - sampledAt > METRICS_STALE_MS
    return { ...conn.overview, metrics: { ...conn.overview.metrics, stale } }
  }

  async getOverview(serverId: string): Promise<VpsOverview> {
    const server = await this.store.getServer(serverId)
    const conn = this.connections.get(serverId)
    if (!conn || conn.state !== 'connected') {
      return {
        available: false,
        error: 'Server is not connected',
        hostname: null, os: null, kernel: null, cwd: null,
        metrics: unavailableMetrics(),
      }
    }
    const outcome = await this.runRead(serverId, buildOverviewScript(), OVERVIEW_TIMEOUT_MS)
    if (!outcome.ok) return { ...this.getCachedOverview(serverId), error: outcome.error }
    const sample = parseOverview(outcome.stdout)
    const cpuPercent = cpuPercentBetween(conn.cpuTimes, sample.cpuTimes)
    conn.cpuTimes = sample.cpuTimes
    const overview: VpsOverview = {
      available: true,
      error: null,
      hostname: sample.hostname,
      os: sample.os,
      kernel: sample.kernel,
      cwd: sample.cwd || server?.defaultCwd || null,
      metrics: {
        available: true,
        stale: false,
        cpuPercent,
        memUsedMb: sample.memUsedMb,
        memTotalMb: sample.memTotalMb,
        diskUsedPercent: sample.diskUsedPercent,
        loadAvg: sample.loadAvg,
        uptimeSec: sample.uptimeSec,
        sampledAt: new Date().toISOString(),
      },
    }
    conn.overview = overview
    return overview
  }

  async listServices(serverId: string): Promise<VpsService[]> {
    const outcome = await this.runRead(serverId, buildServicesCommand(), OVERVIEW_TIMEOUT_MS)
    if (!outcome.ok) throw new Error(outcome.error)
    return parseServices(outcome.stdout).slice(0, MAX_SERVICES)
  }

  async getLogs(serverId: string, service: string, lines = 200): Promise<{ output: string; truncated: boolean }> {
    const outcome = await this.runRead(serverId, buildLogsCommand(service, lines), OVERVIEW_TIMEOUT_MS + 10000)
    if (!outcome.ok) throw new Error(outcome.error)
    return { output: outcome.stdout, truncated: outcome.truncated }
  }

  async restartService(serverId: string, service: string): Promise<{ ok: boolean; detail: string; job: VpsJob }> {
    const { job } = await this.execute(serverId, {
      command: buildRestartCommand(service),
      mutating: true,
      origin: 'user',
      waitMs: 30000,
    })
    return { ...parseRestartResult(job.output, job.exitCode), job }
  }

  private async runRead(
    serverId: string,
    command: string,
    timeoutMs: number,
  ): Promise<{ ok: true; stdout: string; truncated: boolean } | { ok: false; error: string }> {
    const conn = this.connections.get(serverId)
    if (!conn || conn.state !== 'connected') return { ok: false, error: 'Server is not connected' }
    const buffer = createBoundedBuffer(MAX_OUTPUT_BYTES)
    const handle = conn.transport.exec(command, { timeoutMs, onData: (chunk) => buffer.append(chunk) })
    try {
      const outcome = await handle.result
      if (outcome.timedOut) return { ok: false, error: 'Remote command timed out' }
      buffer.flush()
      const value = buffer.value()
      if (outcome.exitCode !== 0) {
        return { ok: false, error: `Remote command failed (exit ${outcome.exitCode})` }
      }
      return { ok: true, stdout: value.text, truncated: value.truncated }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  }

  // ── interactive terminal (PTY) ─────────────────────────────────────────

  async openTerminal(serverId: string, opts: { cols: number; rows: number }): Promise<{ id: string }> {
    const conn = this.connections.get(serverId)
    if (!conn || conn.state !== 'connected') throw new Error('Server is not connected')
    if (conn.terminalOpening) return conn.terminalOpening
    if (conn.terminalId) return { id: conn.terminalId }
    const id = randomUUID()
    conn.terminalOpening = conn.transport.openShell(id, { cols: opts.cols, rows: opts.rows })
      .then(() => {
        if (this.connections.get(serverId) !== conn || conn.state !== 'connected') throw new Error('Server disconnected while opening terminal')
        conn.terminalId = id
        return { id }
      }).finally(() => { conn.terminalOpening = null })
    return conn.terminalOpening
  }

  writeTerminal(serverId: string, data: string): boolean {
    const conn = this.connections.get(serverId)
    return conn?.terminalId ? conn.transport.writeShell(conn.terminalId, data) : false
  }

  resizeTerminal(serverId: string, cols: number, rows: number): boolean {
    const conn = this.connections.get(serverId)
    return conn?.terminalId ? conn.transport.resizeShell(conn.terminalId, cols, rows) : false
  }

  closeTerminal(serverId: string): void {
    const conn = this.connections.get(serverId)
    if (!conn?.terminalId) return
    conn.transport.closeShell(conn.terminalId)
    conn.terminalId = null
    this.emit('terminal-close', serverId)
  }

  // ── scopes ─────────────────────────────────────────────────────────────

  /** Create a per-session MCP scope bound to exactly one server (F0 §11.2). */
  createScope(serverId: string, sessionId: string): VpsScope | null {
    const conn = this.connections.get(serverId)
    if (!conn || conn.state !== 'connected') return null
    return registerScope(serverId, sessionId)
  }

  // ── lifecycle ──────────────────────────────────────────────────────────

  shutdown(): void {
    this.jobRegistry.shutdown()
    for (const serverId of [...this.connections.keys()]) {
      revokeScopesForServer(serverId)
      this.closeConnection(serverId)
    }
    this.connections.clear()
  }
}

export default VpsManager
