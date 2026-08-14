/**
 * System domain — geocoding, health analytics, auto-update, environment
 * inspection, main-process logs and crash dumps. Falls back to browser
 * dev-mode mocks when the Electron bridge is absent.
 */
import { invoke, isElectron, subscribe, SimpleResult } from './ipcCore'

export interface HealthStats {
  crashes: unknown[]
  runs: unknown[]
  totalRuns: number
  totalUptimeMs: number
  avgUptimeMs: number
  lastRun: string | null
  daily: unknown[]
}

export interface HealthResult {
  success: boolean
  stats: HealthStats
  error?: string
}

export interface UpdateCheckResult {
  success: boolean
  updateAvailable: boolean
  version?: string
  error?: string
  [key: string]: unknown
}

export interface SystemEnvTool {
  name: string
  label: string
  found: boolean
  version?: string
}

export interface SystemEnvResult {
  success: boolean
  tools: SystemEnvTool[]
  checkedAt?: string
  error?: string
}

export interface MainLogResult {
  success: boolean
  lines: string[]
  error?: string
}

export interface CrashDumpResult {
  success: boolean
  dir: string
  dumps: unknown[]
  error?: string
}

export const geocodeCity = async (query: string): Promise<SimpleResult & { location?: unknown }> => {
  if (!isElectron()) return { success: false, error: 'Geocoding is only available in the desktop app' }
  return invoke<SimpleResult & { location?: unknown }>('geocodeCity', query)
}

export const getHealth = async (projectId: string): Promise<HealthResult> => {
  if (!isElectron()) {
    return { success: true, stats: { crashes: [], runs: [], totalRuns: 0, totalUptimeMs: 0, avgUptimeMs: 0, lastRun: null, daily: [] } }
  }
  return invoke<HealthResult>('getHealth', projectId)
}

export const clearHealth = async (projectId: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('clearHealth', projectId)
}

export const checkUpdate = async (): Promise<UpdateCheckResult> => {
  if (!isElectron()) return { success: true, updateAvailable: false }
  return invoke<UpdateCheckResult>('checkUpdate')
}

export const downloadUpdate = async (): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Electron not available' }
  return invoke<SimpleResult>('downloadUpdate')
}

export const installUpdate = async (): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Electron not available' }
  return invoke<SimpleResult>('installUpdate')
}

export const onUpdateState = (callback: (state: unknown) => void): (() => void) => {
  if (!isElectron()) return () => {}
  return subscribe('onUpdateState', (state) => callback(state))
}

export const checkSystemEnv = async (): Promise<SystemEnvResult> => {
  if (!isElectron()) {
    // Browser dev-mode mock: report a few common tools
    return {
      success: true,
      tools: [
        { name: 'node', label: 'Node.js', found: true, version: 'v23.9.0 (mock)' },
        { name: 'npm', label: 'npm', found: true, version: '10.9.2 (mock)' },
        { name: 'git', label: 'Git', found: true, version: 'git version 2.47.0 (mock)' },
        { name: 'php', label: 'PHP', found: false },
        { name: 'omp', label: 'oh-my-pi (AI agent)', found: false },
      ],
      checkedAt: new Date().toISOString(),
    }
  }
  return invoke<SystemEnvResult>('checkSystemEnv')
}

export const getMainLog = async (limit = 500): Promise<MainLogResult> => {
  if (!isElectron()) return { success: true, lines: [] }
  return invoke<MainLogResult>('getMainLog', limit)
}

export const getCrashDumps = async (): Promise<CrashDumpResult> => {
  if (!isElectron()) return { success: true, dir: '', dumps: [] }
  return invoke<CrashDumpResult>('getCrashDumps')
}

export const clearCrashDumps = async (): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('clearCrashDumps')
}

export const openCrashDumpsFolder = async (): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Electron not available' }
  return invoke<SimpleResult>('openCrashDumpsFolder')
}
