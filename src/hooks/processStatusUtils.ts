import type { Project } from '../types/shared'
import type { MetricsResult, ProcessStatusResult } from '../data/processes'

/** Runtime-only fields merged onto a persisted project by useProcesses. */
export interface ProjectRuntimeUpdate {
  status?: string
  pid?: number | null
  startedAt?: number | null
  uptime?: string | null
  errorMessage?: string | null
  cpu?: number | null
  memory?: number | null
  metrics?: MetricsResult
  processCommands?: unknown[]
}

/** Project list as consumed by useProcesses — persisted fields plus runtime status/metrics. */
export interface ProcessProject extends Project {
  status?: string
  uptime?: string | null
  cpu?: number | null
  memory?: number | null
  metrics?: MetricsResult
}

export const formatUptime = (startedAt: number | string | null | undefined): string | null => {
  if (!startedAt) return null
  const totalSeconds = Math.max(0, Math.floor((Date.now() - Number(startedAt)) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m`
  return `${totalSeconds}s`
}

export const runtimeUpdate = (status: ProcessStatusResult | string): ProjectRuntimeUpdate & { status: string } => {
  const details: ProcessStatusResult = typeof status === 'string' ? { status } : status || {}
  const normalizedStatus = (details.status || 'stopped').toLowerCase()
  const active = normalizedStatus === 'running' || normalizedStatus === 'starting'
  return {
    status: normalizedStatus,
    pid: details.pid ?? null,
    startedAt: details.startedAt ?? null,
    uptime: active ? formatUptime(details.startedAt) : null,
    errorMessage: details.error || null,
    processCommands: details.commands || [],
  }
}
