/**
 * Shared domain types — single source of truth for the IPC boundary.
 * Used by the renderer (`.tsx` via `import type`) and the main process
 * (`.ts` via `import type`). Source of truth: `electron/configSchema.ts`,
 * `electron/projectSchema.ts`, `electron/handlers/agentHandlers.ts`,
 * `electron/handlers/processHandlers.ts`, `electron/managers/StorageManager.ts`.
 */

// ---------- App config ----------

export type Theme = 'dark' | 'light' | 'system'
export type Language = 'en' | 'id'
export type PrayerShowIn = 'sidebar' | 'topbar' | 'both' | 'off'
export type PrayerMethod = 'KEMENAG' | 'MWL' | 'ISNA' | 'Egypt' | 'Makkah' | 'Karachi'

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  maximized?: boolean
}

export interface AppConfig {
  theme: Theme
  language: Language
  sidebarExpanded: boolean
  startOnBoot: boolean
  minimizeToTray: boolean
  autoStartProjects: boolean
  notifications: {
    onStart: boolean
    onError: boolean
    sound: boolean
  }
  terminal: {
    fontSize: number
    maxLines: number
    autoScroll: boolean
  }
  autoRestart: {
    enabled: boolean
    maxRetries: number
    delayMs: number
  }
  preview: {
    keepAlive: boolean
  }
  prayer: {
    showIn: PrayerShowIn
    method: PrayerMethod
    city: string
    latitude: number
    longitude: number
    utcOffset: number
    adjustments: {
      fajr: number
      dhuhr: number
      asr: number
      maghrib: number
      isha: number
    }
    notify: boolean
    sound: boolean
  }
  agent: {
    notifyOnFinish: boolean
    sound: boolean
  }
  windowBounds: WindowBounds | null
  schemaVersion: number
}

/** Recursive partial — used for `update-config` payloads (validated at runtime). */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

// ---------- Project ----------

export type ProjectType = 'LARAVEL' | 'NEXTJS' | 'REACT_VITE' | 'REACT' | 'VUE' | 'GOLANG' | 'NODEJS' | 'CUSTOM'

export interface ProjectCommand {
  id: string
  name: string
  command: string
  port: number | null
  primary?: boolean
}

export interface EnvVar {
  key: string
  value: string
  secret?: boolean
  unchanged?: boolean
}

export interface CustomCommand {
  id: string
  label: string
  command: string
}

export interface Project {
  id: string
  name: string
  path: string
  type: ProjectType
  port: number | null
  startCommand: string
  commands: ProjectCommand[]
  envVars: EnvVar[]
  emoji: string
  color: string
  autoStart: boolean
  createdAt: string
  lastRun: string | null
  tags: string[]
  customCommands: CustomCommand[]
  dependsOn: string[]
  schemaVersion: number
}

/** Fields a renderer may change via `update-project` (validated at runtime). */
export type ProjectChanges = Partial<Omit<Project, 'id' | 'createdAt' | 'lastRun' | 'schemaVersion'>>

// ---------- Process ----------

export type ProcessStatus = 'running' | 'starting' | 'stopping' | 'stopped' | 'error'

export interface ProcessStatusInfo {
  status: ProcessStatus
  exitCode?: number | null
  startTime?: number | null
  restartCount?: number
  message?: string
  [key: string]: unknown
}

export interface ResourceStats {
  cpuPercent?: number
  memoryMb?: number
  [key: string]: unknown
}

export interface LogEntry {
  id?: string
  timestamp: number
  level: string
  message: string
  meta?: Record<string, unknown>
}

// ---------- Agent session ----------

export interface AgentSession {
  id: string
  title: string
  projectId: string
  sessionPath?: string
  tokens?: number
  cost?: number
  pinned?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ---------- Presets ----------

export interface Preset {
  id: string
  name: string
  projectIds: string[]
  autoStart?: boolean
  [key: string]: unknown
}

// ---------- IPC result envelope ----------

export interface IpcResult<T = unknown> {
  success: boolean
  error?: string
  [key: string]: unknown
  data?: T
}
