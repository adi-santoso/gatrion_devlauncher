import type { ChildProcess } from 'child_process'

export interface LaunchCommand {
  id: string
  name: string
  command: string
  port: number | null
  primary?: boolean
}

export interface LogObject {
  id: number
  timestamp: string
  type: string
  message: string
  commandId: string | null
  commandName: string | null
}

export interface ChildProcessData extends LaunchCommand {
  status: string
  process: ChildProcess
  pid: number | null
  ready: boolean
  exitCode?: number | null
  exitSignal?: string | null
}

export interface CommandSnapshot {
  id: string
  name: string
  command: string
  port: number | null
  primary: boolean | undefined
  status: string
  pid: number | null
  ready: boolean
}

export interface ProcessData {
  pid: number | null
  status: string
  startedAt: number
  logs: LogObject[]
  command: string
  projectPath: string
  port: number | null
  launchCommands: LaunchCommand[]
  runId: symbol
  commands: Map<string, ChildProcessData>
  onExit?: ExitCallback
  onError?: ErrorCallback
  onReady?: ReadyCallback
  onLog?: LogCallback
  env: Record<string, string>
  restartCount: number
  error?: string
  exitCode?: number | null
  exitSignal?: string | null
  process?: ChildProcess
  uptime?: string
  memory?: number
  cpu?: number
  cachedMemoryMb?: number
  lastMetricsTime?: number
  isFetchingMetrics?: boolean
}

export interface CustomRun {
  projectId: string
  commandId: string
  label: string
  process: ChildProcess
  pid: number | null
}

export type LogCallback = (projectId: string, entry: LogObject) => void
export type ExitCallback = (projectId: string, code: number | null, signal: NodeJS.Signals | null) => void
export type ErrorCallback = (projectId: string, error: Error) => void
export type ReadyCallback = (projectId: string) => void

export const STATUS = {
  STOPPED: 'STOPPED',
  STARTING: 'STARTING',
  RUNNING: 'RUNNING',
  STOPPING: 'STOPPING',
  ERROR: 'ERROR',
} as const

export function stubProcessData(projectPath: string, status: string, error?: string): ProcessData {
  return {
    pid: null,
    status,
    startedAt: Date.now(),
    logs: [],
    command: '',
    projectPath,
    port: null,
    launchCommands: [],
    runId: Symbol('stub'),
    commands: new Map(),
    env: {},
    restartCount: 0,
    error,
  }
}

export function isActiveStatus(status: string, STATUS_SET: readonly string[]): boolean {
  return STATUS_SET.includes(status)
}
