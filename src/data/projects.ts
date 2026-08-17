/**
 * Project domain — CRUD, folder browsing, env files, project-type detection,
 * import/export and encrypted backup. All functions fall back to browser
 * dev-mode mocks when the Electron bridge is absent.
 */
import { invoke, isElectron, subscribe, SimpleResult } from './ipcCore'
import type { EnvVar, Project, ProjectChanges } from '../types/shared'

export interface ProjectsResult {
  success: boolean
  projects: Project[]
  error?: string
}

export interface ProjectResult {
  success: boolean
  project: Project
  error?: string
}


export interface BrowseResult {
  success: boolean
  canceled?: boolean
  path?: string
  error?: string
}

/** Result of `exportProjects` — the native save dialog plus the exported count. */
export interface ExportProjectsResult extends BrowseResult {
  count?: number
}

/** Result of `exportDiagnostics` — the native save dialog plus the file path. */
export interface DiagnosticsExportResult extends BrowseResult {
  filePath?: string
}

export interface DetectTypeResult {
  success: boolean
  type?: string
  name?: string
  projectName?: string
  packageManager?: string | null
  defaultCommand?: string
  defaultPort?: number | null
  commands?: Array<{ id: string; name: string; command: string; port: number | null; primary?: boolean }>
  icon?: string
  color?: string
  warnings?: string[]
  error?: string
}

export interface ImportProjectsResult {
  success: boolean
  canceled?: boolean
  projects?: Project[]
  error?: string
  /** Newly imported projects, as returned by the backend import handler. */
  added?: Project[]
  /** Projects skipped during import, with the reason for each. */
  skipped?: Array<{ name: string; reason: string }>
}

export interface EnvFilesResult {
  success: boolean
  files?: string[]
  error?: string
}

export interface EnvFileResult {
  success: boolean
  content?: string
  error?: string
}

// Mock data for browser development mode
const buildMockProject = (overrides: Partial<Project> & Pick<Project, 'id' | 'name' | 'path'>): Project => ({
  type: 'CUSTOM',
  port: null,
  startCommand: 'npm run dev',
  commands: [],
  envVars: [],
  emoji: '📦',
  color: '#6b7280',
  autoStart: false,
  createdAt: new Date().toISOString(),
  lastRun: null,
  tags: [],
  customCommands: [],
  dependsOn: [],
  schemaVersion: 0,
  ...overrides,
})

const MOCK_PROJECTS: Project[] = [
  buildMockProject({
    id: 'mock-1',
    name: 'storefront-web',
    path: 'C:/projects/storefront-web',
    port: 5173,
    type: 'REACT_VITE',
    startCommand: 'npm run dev',
    emoji: '⚛️',
    color: '#61DAFB',
  }),
  buildMockProject({
    id: 'mock-2',
    name: 'payment-api',
    path: 'C:/projects/payment-api',
    port: 3000,
    type: 'NODEJS',
    startCommand: 'npm start',
    emoji: '🟩',
    color: '#339933',
  }),
]

export const getProjects = async (): Promise<ProjectsResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - using mock data')
    return { success: true, projects: MOCK_PROJECTS }
  }
  return invoke<ProjectsResult>('getProjects')
}

export const addProject = async (projectData: ProjectChanges): Promise<ProjectResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock addProject called')
    return { success: true, project: { ...buildMockProject({ id: `mock-${Date.now()}`, name: projectData.name || 'untitled', path: projectData.path || '' }), ...projectData } }
  }
  return invoke<ProjectResult>('addProject', projectData)
}

export const updateProject = async (projectId: string, updates: ProjectChanges): Promise<ProjectResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock updateProject called')
    return { success: true, project: { ...buildMockProject({ id: projectId, name: 'untitled', path: '' }), ...updates } }
  }
  return invoke<ProjectResult>('updateProject', projectId, updates)
}

export const deleteProject = async (projectId: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock deleteProject called')
    return { success: true }
  }
  return invoke<SimpleResult>('deleteProject', projectId)
}

export const browseFolder = async (): Promise<BrowseResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock browseFolder called')
    return { success: false, canceled: true }
  }
  return invoke<BrowseResult>('browseFolder')
}

export const exportProjects = async (): Promise<ExportProjectsResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - exportProjects not available')
    return { success: false, canceled: true }
  }
  return invoke<BrowseResult>('exportProjects')
}

export const importProjects = async (): Promise<ImportProjectsResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - importProjects not available')
    return { success: false, canceled: true }
  }
  return invoke<ImportProjectsResult>('importProjects')
}

export const exportDiagnostics = async (): Promise<DiagnosticsExportResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - exportDiagnostics not available')
    return { success: false, canceled: true }
  }
  return invoke<BrowseResult>('exportDiagnostics')
}

export const backupExport = async (password?: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - backupExport not available')
    return { success: false, error: 'Backup requires desktop app' }
  }
  return invoke<SimpleResult>('backupExport', password)
}

export const backupImport = async (password?: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - backupImport not available')
    return { success: false, error: 'Backup requires desktop app' }
  }
  return invoke<SimpleResult>('backupImport', password)
}

export const listEnvFiles = async (projectPath: string): Promise<EnvFilesResult> => {
  if (!isElectron()) {
    return { success: true, files: [] }
  }
  // Method name = preload bridge method (camelCase), not the IPC channel
  // name (kebab-case). Passing the channel name here makes window.electron
  // undefined -> 'fn is not a function' and the env tab stays empty.
  return invoke<EnvFilesResult>('listEnvFiles', projectPath)
}

export const readEnvFile = async (projectPath: string, fileName: string): Promise<EnvFileResult> => {
  if (!isElectron()) {
    return { success: true, content: '' }
  }
  return invoke<EnvFileResult>('readEnvFile', projectPath, fileName)
}

export const writeEnvFile = async (projectPath: string, fileName: string, content: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    return { success: true }
  }
  return invoke<SimpleResult>('writeEnvFile', projectPath, fileName, content)
}

export const detectProjectType = async (projectPath: string): Promise<DetectTypeResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - detectProjectType not available')
    return { success: false, error: 'Detection requires desktop app' }
  }
  return invoke<DetectTypeResult>('detectProjectType', projectPath)
}

/** Push channel — backend CRUD changes to the project list. */
export const onProjectsUpdated = (callback: (projects: Project[]) => void): (() => void) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onProjectsUpdated not available')
    return () => {}
  }
  return subscribe('onProjectsUpdated', (data) => callback(data as Project[]))
}

/** Push channel — navigation requests targeting a specific project. */
export const onNavigateToProject = (callback: (projectId: string) => void): (() => void) => {
  if (!isElectron()) {
    return () => {}
  }
  return subscribe('onNavigateToProject', (projectId) => callback(projectId as string))
}

// Re-exported for typing convenience at the boundary.
export type { EnvVar }
