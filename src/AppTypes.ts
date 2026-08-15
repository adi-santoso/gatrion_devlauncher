import type { Preset, Project } from './types/shared'
import type { ProjectRuntime } from './hooks/useProjects'

/** Top-level navigation views rendered by MainLayout. */
export type ViewName = 'dashboard' | 'projects' | 'project-detail' | 'settings' | 'terminals' | 'agent'

/** Modal dialogs opened via openModalHandler. */
export type ModalName = 'project' | 'command' | 'shortcuts' | 'confirm'

/** Port-conflict modal payload (project + conflict info + bulk-skip metadata). */
export interface PortConflictTarget {
  project: ProjectRuntime
  conflictData: Record<string, unknown>
  skippedCount?: number
  skippedNames?: string[]
}

/** Result contract for start/stop/restart process calls. */
export interface ProcessActionResult {
  success: boolean
  error?: string
  conflict?: boolean
}

/** Command-palette command union consumed by handleCommandSelect. */
export interface PaletteCommand {
  id?: string
  type?: string
  projectId?: string
  sessionId?: string
  filePath?: string
  presetId?: string
  label?: string
  [key: string]: unknown
}

/** Bundle passed from App to the presentational view/modals layers. */
export interface AppRenderBundle {
  projectsLoading: boolean
  currentView: string
  projects: ProjectRuntime[]
  activities: Array<{ type: string; project?: string; message: string; time: string }>
  presets: Preset[]
  config: import('./types/shared').AppConfig
  isFullscreen: boolean
  lastFullscreenProjectId: string | null
  agentProjectId: string | null
  agentSessionId: string | null
  selectedProject: ProjectRuntime | null
  fullscreenProjectRef: React.RefObject<ProjectRuntime | null>
  getLogs: (projectId: string) => import('./data/processes').ProcessLogLine[]
  clearLogs: (projectId: string) => Promise<{ success: boolean; error?: string }>
  getMetricHistory: (projectId: string) => Array<{ t: number; cpu: number | null; memory: number | null }>
  showView: (viewName: string, data?: unknown, fullscreen?: boolean) => void
  openModal: (modalName: ModalName, data?: unknown) => void
  closeModal: () => void
  setLastFullscreenProjectId: React.Dispatch<React.SetStateAction<string | null>>
  handleProjectUpdate: (projectId: string, updates: Record<string, unknown>) => void
  handleStartProject: (project: ProjectRuntime, opts?: { skipPortCheck?: boolean }) => Promise<ProcessActionResult>
  handleStopProject: (project: ProjectRuntime, opts?: { force?: boolean }) => Promise<ProcessActionResult>
  handleRestartProject: (project: ProjectRuntime) => Promise<ProcessActionResult>
  handleStartAll: (requestedProjects?: ProjectRuntime[]) => Promise<unknown>
  handleStopAll: () => Promise<void>
  handleBulkStartProjects: (projects: ProjectRuntime[]) => Promise<void>
  handleBulkStopProjects: (projects: ProjectRuntime[]) => Promise<void>
  handleBulkRestartProjects: (projects: ProjectRuntime[]) => Promise<void>
  handleBulkTagEdit: (projects: ProjectRuntime[], tagsToAdd?: string[], tagsToRemove?: string[]) => Promise<void>
  handleBulkDeleteProjects: (projects: ProjectRuntime[]) => void
  handleDeleteProject: (project: ProjectRuntime) => void
  handleDuplicateProject: (project: ProjectRuntime) => void
  handleWorkspaceActionComplete: (info: { action: string; completed: number; failed: number }) => void
  handleCommandSelect: (command: PaletteCommand) => void
  handleDetailFullscreenChange: (isFull: boolean) => void
  navigateRelativeProject: (direction: number) => void
  handleCreateProject: (data: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
  confirmDelete: () => Promise<void>
  setThemeHandler: (theme: string) => Promise<void>
  handleDropFolder: (folderPath: string) => Promise<void>
  handleExportProjects: () => Promise<void>
  handleImportProjects: () => Promise<void>
  handleExportDiagnostics: () => Promise<void>
  updateElectronConfig: (updates: import('./types/shared').DeepPartial<import('./types/shared').AppConfig>) => Promise<{ success: boolean; error?: string }>
}

export type { Project }
