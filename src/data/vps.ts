/**
 * VPS Command Center data layer — the renderer's typed view of the VPS IPC
 * channels. SSH secrets are never part of this surface: callers pass a secret
 * in, the main process stores it, and it is never returned.
 */
import { invoke, isElectron, subscribe, type SimpleResult } from './ipcCore'
import type {
  VpsConnectionEvent,
  VpsHostKeyInfo,
  VpsJob,
  VpsJobEvent,
  VpsOverview,
  VpsServer,
  VpsServerInput,
  VpsServerStatus,
  VpsService,
  VpsTestResult,
} from '../types/vps'

export type VpsSecretInput =
  | { kind: 'key'; privateKey: string; passphrase?: string }
  | { kind: 'password'; password: string }
  | { kind: 'agent' }

export interface VpsServersResult extends SimpleResult {
  servers: VpsServer[]
}

export interface VpsServerResult extends SimpleResult {
  server: VpsServer
}

export interface VpsStatusResult extends SimpleResult {
  status: VpsServerStatus
}

export interface VpsConnectResponse extends SimpleResult {
  status: VpsServerStatus
}

export interface VpsTestResponse extends SimpleResult {
  result: VpsTestResult
}

export interface VpsOverviewResult extends SimpleResult {
  overview: VpsOverview
}

export interface VpsServicesResult extends SimpleResult {
  services: VpsService[]
}

export interface VpsLogsResult extends SimpleResult {
  output: string
  truncated: boolean
}

export interface VpsRestartResult extends SimpleResult {
  ok: boolean
  detail: string
  job: VpsJob
}

export interface VpsJobResult extends SimpleResult {
  job: VpsJob
}

export interface VpsJobsResult extends SimpleResult {
  jobs: VpsJob[]
}

export interface VpsCancelResult extends SimpleResult {
  requested: boolean
  confirmed: boolean
  state: string
}

export interface VpsHostKeyResult extends SimpleResult {
  has: boolean
}

export interface VpsScopeResult extends SimpleResult {
  scopeId: string
  contextDir: string
  scoped: boolean
}

export interface VpsTerminalOpenResult extends SimpleResult {
  id: string
}

const offline = { success: false, error: 'VPS is unavailable in browser mode' }

export const listVpsServers = (): Promise<VpsServersResult> =>
  isElectron() ? invoke<VpsServersResult>('vpsListServers') : Promise.resolve({ success: true, servers: [] })

export const addVpsServer = (input: Partial<VpsServerInput>, secret?: VpsSecretInput): Promise<VpsServerResult> =>
  isElectron() ? invoke<VpsServerResult>('vpsAddServer', input, secret) : Promise.resolve({ ...offline, server: undefined as unknown as VpsServer })

export const updateVpsServer = (serverId: string, patch: Partial<VpsServerInput>): Promise<VpsServerResult> =>
  isElectron() ? invoke<VpsServerResult>('vpsUpdateServer', serverId, patch) : Promise.resolve({ ...offline, server: undefined as unknown as VpsServer })

export const deleteVpsServer = (serverId: string): Promise<SimpleResult> =>
  isElectron() ? invoke<SimpleResult>('vpsDeleteServer', serverId) : Promise.resolve(offline)

export const setVpsCredential = (serverId: string, secret: VpsSecretInput): Promise<SimpleResult> =>
  isElectron() ? invoke<SimpleResult>('vpsSetCredential', serverId, secret) : Promise.resolve(offline)

export const hasVpsCredential = (serverId: string): Promise<VpsHostKeyResult> =>
  isElectron() ? invoke<VpsHostKeyResult>('vpsHasCredential', serverId) : Promise.resolve({ success: false, has: false })

export const testVpsConnection = (input: Partial<VpsServerInput>, secret?: VpsSecretInput): Promise<VpsTestResponse> =>
  isElectron() ? invoke<VpsTestResponse>('vpsTestConnection', input, secret) : Promise.resolve({ success: false, error: 'browser mode', result: { success: false } })

export const connectVps = (serverId: string, trustedFingerprint?: string): Promise<VpsConnectResponse> =>
  isElectron() ? invoke<VpsConnectResponse>('vpsConnect', serverId, trustedFingerprint) : Promise.resolve({ ...offline, status: null as unknown as VpsServerStatus })

export const disconnectVps = (serverId: string): Promise<SimpleResult> =>
  isElectron() ? invoke<SimpleResult>('vpsDisconnect', serverId) : Promise.resolve({ success: true })

export const trustVpsHostKey = (serverId: string, fingerprint: string): Promise<VpsConnectResponse> =>
  isElectron() ? invoke<VpsConnectResponse>('vpsTrustHostKey', serverId, fingerprint) : Promise.resolve({ ...offline, status: null as unknown as VpsServerStatus })

export const forgetVpsHostKey = (serverId: string): Promise<SimpleResult> =>
  isElectron() ? invoke<SimpleResult>('vpsForgetHostKey', serverId) : Promise.resolve({ success: true })

export const getVpsStatus = (serverId: string): Promise<VpsStatusResult> =>
  isElectron() ? invoke<VpsStatusResult>('vpsGetStatus', serverId) : Promise.resolve({ success: false, status: null as unknown as VpsServerStatus })

export const getVpsOverview = (serverId: string): Promise<VpsOverviewResult> =>
  isElectron() ? invoke<VpsOverviewResult>('vpsOverview', serverId) : Promise.resolve({ ...offline, overview: null as unknown as VpsOverview })

export const listVpsServices = (serverId: string): Promise<VpsServicesResult> =>
  isElectron() ? invoke<VpsServicesResult>('vpsListServices', serverId) : Promise.resolve({ ...offline, services: [] })

export const getVpsLogs = (serverId: string, service: string, lines = 200): Promise<VpsLogsResult> =>
  isElectron() ? invoke<VpsLogsResult>('vpsGetLogs', serverId, service, lines) : Promise.resolve({ ...offline, output: '', truncated: false })

export const restartVpsService = (serverId: string, service: string): Promise<VpsRestartResult> =>
  isElectron() ? invoke<VpsRestartResult>('vpsRestartService', serverId, service) : Promise.resolve({ ...offline, ok: false, detail: '', job: null as unknown as VpsJob })

export const execVps = (
  serverId: string,
  options: { command: string; cwd?: string; timeoutMs?: number; mutating?: boolean; sessionId?: string },
): Promise<VpsJobResult> =>
  isElectron() ? invoke<VpsJobResult>('vpsExec', serverId, options) : Promise.resolve({ ...offline, job: null as unknown as VpsJob })

export const listVpsJobs = (serverId: string, limit = 20): Promise<VpsJobsResult> =>
  isElectron() ? invoke<VpsJobsResult>('vpsListJobs', serverId, limit) : Promise.resolve({ success: true, jobs: [] })

export const getVpsJob = (jobId: string, serverId?: string): Promise<VpsJobResult> =>
  isElectron() ? invoke<VpsJobResult>('vpsGetJob', jobId, serverId) : Promise.resolve({ ...offline, job: null as unknown as VpsJob })

export const cancelVpsJob = (jobId: string): Promise<VpsCancelResult> =>
  isElectron() ? invoke<VpsCancelResult>('vpsCancelJob', jobId) : Promise.resolve({ success: false, requested: false, confirmed: false, state: 'unknown' })

export const openVpsTerminal = (serverId: string, cols: number, rows: number): Promise<VpsTerminalOpenResult> =>
  isElectron() ? invoke<VpsTerminalOpenResult>('vpsTerminalOpen', serverId, cols, rows) : Promise.resolve({ ...offline, id: '' })

export const sendVpsTerminalInput = (serverId: string, data: string): Promise<SimpleResult> =>
  isElectron() ? invoke<SimpleResult>('vpsTerminalInput', serverId, data) : Promise.resolve({ success: false })

export const resizeVpsTerminal = (serverId: string, cols: number, rows: number): Promise<SimpleResult> =>
  isElectron() ? invoke<SimpleResult>('vpsTerminalResize', serverId, cols, rows) : Promise.resolve({ success: false })

export const closeVpsTerminal = (serverId: string): Promise<SimpleResult> =>
  isElectron() ? invoke<SimpleResult>('vpsTerminalClose', serverId) : Promise.resolve({ success: true })

export const prepareVpsScope = (serverId: string, sessionId: string): Promise<VpsScopeResult> =>
  isElectron() ? invoke<VpsScopeResult>('vpsPrepareScope', serverId, sessionId) : Promise.resolve({ success: false, scopeId: '', contextDir: '', scoped: false })

export const onVpsStatus = (callback: (status: VpsServerStatus) => void): (() => void) =>
  subscribe('onVpsStatus', (status) => callback(status as VpsServerStatus))

export const onVpsJobEvent = (callback: (event: VpsJobEvent) => void): (() => void) =>
  subscribe('onVpsJobEvent', (event) => callback(event as VpsJobEvent))

export const onVpsTerminalData = (callback: (serverId: string, data: string) => void): (() => void) =>
  subscribe('onVpsTerminalData', (serverId, data) => callback(serverId as string, data as string))

export const onVpsTerminalClose = (callback: (serverId: string) => void): (() => void) =>
  subscribe('onVpsTerminalClose', (serverId) => callback(serverId as string))

export type { VpsConnectionEvent, VpsHostKeyInfo }
