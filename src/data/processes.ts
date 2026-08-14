/**
 * Process domain — lifecycle control, logs, metrics, port conflict checks and
 * custom commands. Falls back to browser dev-mode mocks when the Electron
 * bridge is absent.
 */
import { invoke, isElectron, subscribe, SimpleResult } from './ipcCore'
import type { ProcessStatus } from '../types/shared'

/** Push payload for `process-resource` — real-time CPU/memory snapshot. */
export interface ResourceUpdatePayload {
  projectId: string
  cpu?: number | null
  memory?: number | null
}

export interface ProcessStartResult {
  projectId: string
  success: boolean
  status?: string
  pid?: number | null
  error?: string
}

export type StartAllResult = ProcessStartResult[] | SimpleStartError

export interface SimpleStartError {
  success: false
  error: string
}

export interface ProcessStatusResult {
  status?: ProcessStatus | string
  pid?: number | null
  startedAt?: number | null
  error?: string
  commands?: unknown[]
  logs?: unknown[]
  [key: string]: unknown
}

export interface MetricsResult {
  pid?: number | null
  cpuPercent?: number | null
  memoryMb?: number | null
  uptime?: string | null
  [key: string]: unknown
}

export interface PortConflictResult {
  inUse: boolean
  isManaged?: boolean
  pid?: number | null
  name?: string
  [key: string]: unknown
}

export interface ProcessLogLine {
  id?: string
  timestamp: string | number
  type?: string
  level?: string
  message: string
  [key: string]: unknown
}

export interface CustomCommandResult {
  success: boolean
  runId?: string
  error?: string
  [key: string]: unknown
}

export const startProject = async (projectId: string): Promise<ProcessStartResult & { success: boolean }> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock startProject called')
    return { projectId, success: true, status: 'running' }
  }
  return invoke<ProcessStartResult>('startProject', projectId)
}

export const stopProject = async (projectId: string, force = false): Promise<SimpleResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock stopProject called')
    return { success: true }
  }
  return invoke<SimpleResult>('stopProject', projectId, force)
}

export const restartProject = async (projectId: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock restartProject called')
    return { success: true }
  }
  return invoke<SimpleResult>('restartProject', projectId)
}

export const startAllProjects = async (projectIds: string[] | undefined, delayMs?: number): Promise<StartAllResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock startAllProjects called')
    return []
  }
  return invoke<StartAllResult>('startAllProjects', projectIds, delayMs)
}

export const stopAllProjects = async (): Promise<SimpleResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock stopAllProjects called')
    return { success: true }
  }
  return invoke<SimpleResult>('stopAllProjects')
}

export const getProcessStatus = async (projectId: string): Promise<ProcessStatusResult> => {
  if (!isElectron()) {
    return { status: 'stopped', logs: [] }
  }
  return invoke<ProcessStatusResult>('getProcessStatus', projectId)
}

export const getLogs = async (projectId: string, limit = 1000): Promise<ProcessLogLine[]> => {
  if (!isElectron()) {
    return []
  }
  return invoke<ProcessLogLine[]>('getLogs', projectId, limit)
}

export const checkPortConflict = async (port: number): Promise<PortConflictResult> => {
  if (!isElectron()) {
    return { inUse: false }
  }
  return invoke<PortConflictResult>('checkPortConflict', port)
}

export const getProcessMetrics = async (projectId: string): Promise<MetricsResult> => {
  if (!isElectron()) {
    return {}
  }
  return invoke<MetricsResult>('getProcessMetrics', projectId)
}

export const clearLogs = async (projectId: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('clearLogs', projectId)
}

export const runCustomCommand = async (projectId: string, commandId: string): Promise<CustomCommandResult> => {
  if (!isElectron()) {
    return { success: false, error: 'Electron not available' }
  }
  return invoke<CustomCommandResult>('runCustomCommand', projectId, commandId)
}

export const stopCustomCommand = async (runId: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('stopCustomCommand', runId)
}

export const getCustomCommandStatus = async (runId: string): Promise<CustomCommandResult> => {
  if (!isElectron()) {
    return { success: false, error: 'Electron not available' }
  }
  return invoke<CustomCommandResult>('getCustomCommandStatus', runId)
}

/** Push channel — process status transitions. */
export const onProcessStatus = (callback: (projectId: string, status: ProcessStatusResult | string) => void): (() => void) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onProcessStatus not available')
    return () => {}
  }
  return subscribe('onProcessStatus', (projectId, status) =>
    callback(projectId as string, status as ProcessStatusResult | string)
  )
}

/** Push channel — process log lines. */
export const onProcessLog = (callback: (projectId: string, logLine: unknown) => void): (() => void) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onProcessLog not available')
    return () => {}
  }
  return subscribe('onProcessLog', (projectId, logLine) => callback(projectId as string, logLine))
}

/** Push channel — process errors. */
export const onProcessError = (callback: (projectId: string, error: string) => void): (() => void) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onProcessError not available')
    return () => {}
  }
  return subscribe('onProcessError', (projectId, error) => callback(projectId as string, error as string))
}

/** Push channel — process exits. */
export const onProcessExit = (callback: (projectId: string) => void): (() => void) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onProcessExit not available')
    return () => {}
  }
  return subscribe('onProcessExit', (projectId) => callback(projectId as string))
}

/** Push channel — real-time CPU/memory updates. */
export const onResourceUpdate = (callback: (data: ResourceUpdatePayload) => void): (() => void) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onResourceUpdate not available')
    return () => {}
  }
  return subscribe('onResourceUpdate', (data) => callback(data as ResourceUpdatePayload))
}
