/**
 * Remote job registry — owns the job map, bounded/redacted output buffers, and
 * the honest state machine for remote commands.
 *
 * States (roadmap §4): queued/running/succeeded/failed/cancelled/unknown.
 * A closed channel with no exit status, a timeout, or a cancel request cannot
 * confirm the remote process ended, so those outcomes are `cancelled` (request)
 * or `unknown` — never `succeeded`. Mutating jobs are never auto-retried.
 */
import { randomUUID } from 'crypto'
import type { VpsJob, VpsJobEvent, VpsJobOrigin } from '../../../src/types/vps'
import type { VpsExecHandle, VpsTransport } from './VpsTransport'
import { createBoundedBuffer, redactOutput, redactUrlCredentials } from './vpsRedact'
import { buildExecCommand } from './remoteCommand'

export const MAX_OUTPUT_BYTES = 128 * 1024
export const MAX_JOBS_PER_SERVER = 50
export const JOB_RETENTION_MS = 60 * 60 * 1000
export const DEFAULT_EXEC_TIMEOUT_MS = 60000
export const MAX_EXEC_TIMEOUT_MS = 300000

export interface ExecuteOptions {
  command: string
  cwd: string
  timeoutMs?: number
  waitMs?: number
  mutating?: boolean
  origin: VpsJobOrigin
  sessionId?: string | null
}

export type CancelResult = { requested: boolean; confirmed: boolean; state: string }

export class VpsJobRegistry {
  private jobs = new Map<string, VpsJob>()
  private handles = new Map<string, VpsExecHandle>()

  constructor(
    private onJob: (job: VpsJob) => void,
    private onEvent: (event: VpsJobEvent) => void,
  ) {}

  private patch(id: string, patch: Partial<VpsJob>): VpsJob | null {
    const job = this.jobs.get(id)
    if (!job) return null
    Object.assign(job, patch)
    this.onJob(job)
    return job
  }

  get(id: string, serverId?: string): VpsJob | null {
    const job = this.jobs.get(id)
    if (!job) return null
    if (serverId && job.serverId !== serverId) return null
    return job
  }

  list(serverId: string, limit = 20): VpsJob[] {
    this.prune()
    return [...this.jobs.values()]
      .filter((job) => job.serverId === serverId)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .slice(0, limit)
  }

  private prune(): void {
    const cutoff = Date.now() - JOB_RETENTION_MS
    for (const [id, job] of this.jobs) {
      if (job.endedAt && new Date(job.endedAt).getTime() < cutoff) {
        this.jobs.delete(id)
        this.handles.delete(id)
      }
    }
    const perServer = new Map<string, VpsJob[]>()
    for (const job of this.jobs.values()) {
      const list = perServer.get(job.serverId) || []
      list.push(job)
      perServer.set(job.serverId, list)
    }
    for (const list of perServer.values()) {
      if (list.length <= MAX_JOBS_PER_SERVER) continue
      list.sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
      for (const job of list.filter((item) => item.endedAt !== null).slice(0, list.length - MAX_JOBS_PER_SERVER)) {
        this.jobs.delete(job.id)
        this.handles.delete(job.id)
      }
    }
  }

  async execute(transport: VpsTransport, serverId: string, opts: ExecuteOptions): Promise<{ job: VpsJob; completed: boolean }> {
    const remoteCommand = buildExecCommand(opts.command, opts.cwd)
    this.prune()
    const running = [...this.jobs.values()].filter((job) => job.serverId === serverId && job.state === 'running')
    if (running.length >= 8) throw new Error('Remote command concurrency limit reached (8 per server)')
    const timeoutMs = Math.min(Math.max(opts.timeoutMs || DEFAULT_EXEC_TIMEOUT_MS, 1000), MAX_EXEC_TIMEOUT_MS)
    const job: VpsJob = {
      id: randomUUID(),
      serverId,
      sessionId: opts.sessionId ?? null,
      command: redactUrlCredentials(redactOutput(opts.command)),
      cwd: opts.cwd,
      mutating: Boolean(opts.mutating),
      origin: opts.origin,
      state: 'running',
      exitCode: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      truncated: false,
      output: '',
    }
    this.jobs.set(job.id, job)
    this.onJob(job)
    this.onEvent({ jobId: job.id, serverId, type: 'started', job })

    const buffer = createBoundedBuffer(MAX_OUTPUT_BYTES)
    const handle = transport.exec(remoteCommand, {
      timeoutMs,
      onData: (chunk) => {
        buffer.append(chunk)
        const value = buffer.value()
        job.output = value.text
        job.truncated = value.truncated
        // Distribute only the sanitized buffer, never raw transport bytes.
        this.onEvent({ jobId: job.id, serverId, type: 'output', chunk: '', job })
      },
    })
    this.handles.set(job.id, handle)

    const finished = handle.result
      .then((outcome) => {
        if (job.state === 'unknown') return
        if (outcome.cancelled) this.patch(job.id, { state: 'unknown', exitCode: outcome.exitCode })
        else if (outcome.timedOut) this.patch(job.id, { state: 'unknown', exitCode: null })
        else if (!outcome.closed || outcome.exitCode === null) this.patch(job.id, { state: 'unknown', exitCode: null })
        else this.patch(job.id, { state: outcome.exitCode === 0 ? 'succeeded' : 'failed', exitCode: outcome.exitCode })
      })
      .catch((error: Error) => {
        buffer.append(`\n[transport error] ${error.message}`)
        this.patch(job.id, { state: 'unknown' })
      })
      .then(() => {
        const current = this.jobs.get(job.id)!
        buffer.flush()
        const value = buffer.value()
        current.endedAt = new Date().toISOString()
        current.output = value.text
        current.truncated = value.truncated
        this.handles.delete(job.id)
        this.onJob(current)
        this.onEvent({ jobId: job.id, serverId, type: 'state', job: current })
        return current
      })

    const waitMs = opts.waitMs ?? 0
    if (waitMs > 0) {
      const completed = await Promise.race([
        finished.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), waitMs)),
      ])
      return { job: this.jobs.get(job.id)!, completed }
    }
    return { job: await finished, completed: true }
  }

  cancel(id: string): CancelResult {
    const job = this.jobs.get(id)
    if (!job) return { requested: false, confirmed: false, state: 'unknown' }
    if (job.state !== 'running' && job.state !== 'queued') {
      return { requested: false, confirmed: false, state: job.state }
    }
    this.handles.get(id)?.cancel()
    return { requested: true, confirmed: false, state: 'running' }
  }

  /** Mark every running job of one server unknown (disconnect / delete). */
  markUnknownForServer(serverId: string): void {
    for (const job of this.jobs.values()) {
      if (job.serverId !== serverId) continue
      if (job.state !== 'running' && job.state !== 'queued') continue
      this.handles.get(job.id)?.cancel()
      this.patch(job.id, { state: 'unknown', endedAt: new Date().toISOString() })
    }
  }

  /** Mark every running job unknown (app quit). */
  shutdown(): void {
    for (const job of this.jobs.values()) {
      if (job.state !== 'running' && job.state !== 'queued') continue
      this.handles.get(job.id)?.cancel()
      job.state = 'unknown'
      job.endedAt = new Date().toISOString()
      this.onJob(job)
    }
    this.handles.clear()
  }
}

export default VpsJobRegistry
