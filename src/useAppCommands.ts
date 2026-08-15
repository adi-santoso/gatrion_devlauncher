import { useCallback } from 'react'
import { exportProjects, importProjects, exportDiagnostics, openInEditor } from './utils/ipcRenderer'
import type { AppConfig, Preset } from './types/shared'
import type { ProjectRuntime } from './hooks/useProjects'
import type { PaletteCommand } from './AppTypes'

export interface AppCommandsDeps {
  projects: ProjectRuntime[]
  presets: Preset[]
  config: AppConfig
  showToast: (type: string, message: string) => void
  addActivity: (type: string, project: string, message: string, detail?: string) => void
  closeModal: () => void
  openModal: (modalName: string, data?: unknown) => void
  showView: (viewName: string, data?: unknown) => void
  setThemeHandler: (theme: string) => Promise<void>
  handleStartAll: () => unknown
  handleStopAll: () => unknown
  handleStartPreset: (preset: Preset) => unknown
}

/**
 * Command-palette actions + project-registry transfers (export / import /
 * diagnostics). Pure orchestration over the App controller's primitives.
 */
export function useAppCommands({
  projects,
  presets,
  config,
  showToast,
  addActivity,
  closeModal,
  openModal,
  showView,
  setThemeHandler,
  handleStartAll,
  handleStopAll,
  handleStartPreset,
}: AppCommandsDeps) {
  const handleCommandSelect = useCallback((command: PaletteCommand) => {
    closeModal()

    // Agent session from the workspace search palette: jump straight into it.
    if (command.type === 'session') {
      showView('agent', { projectId: command.projectId, sessionId: command.sessionId })
      return
    }
    // File hit: open it in the OS default editor.
    if (command.type === 'file') {
      void openInEditor(command.filePath || '').then((result) => {
        if (result && !result.success) {
          showToast('error', result.error || 'Failed to open file')
        }
      })
      return
    }

    switch (command.id) {
      case 'new-project':
        openModal('project')
        break
      case 'view-dashboard':
        showView('dashboard')
        break
      case 'view-projects':
        showView('projects')
        break
      case 'view-settings':
        showView('settings')
        break
      case 'toggle-theme': {
        const effective = config.theme === 'system'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : config.theme
        void setThemeHandler(effective === 'dark' ? 'light' : 'dark')
        break
      }
      case 'shortcuts':
        openModal('shortcuts')
        break
      case 'start-all':
        void handleStartAll()
        break
      case 'stop-all':
        void handleStopAll()
        break
      default: {
        const rawId = command.id || ''
        // Start a workspace preset
        if (command.presetId || rawId.startsWith('preset-')) {
          const presetId = command.presetId || rawId.replace('preset-', '')
          const preset = presets.find((item) => item.id === presetId)
          if (preset) void handleStartPreset(preset)
          break
        }
        // Handle project navigation and project-specific commands
        if (command.projectId || rawId.startsWith('project-')) {
          const targetId = command.projectId || rawId.replace('project-', '')
          const project = projects.find((item) => item.id === targetId)
          if (project) showView('project-detail', project)
        }
        break
      }
    }
  }, [closeModal, openModal, showView, setThemeHandler, handleStartAll, handleStopAll, handleStartPreset, presets, projects, config.theme, showToast])

  const handleExportProjects = useCallback(async () => {
    const result = await exportProjects()
    if (result.success) {
      const count = result.count ?? 0
      showToast('success', `Exported ${count} project(s)`)
      addActivity('accent', 'Projects', 'exported', `${count} projects`)
    } else if (!result.canceled) {
      showToast('error', result.error || 'Failed to export projects')
    }
  }, [showToast, addActivity])

  const handleImportProjects = useCallback(async () => {
    const result = await importProjects()
    if (result.success) {
      const added = result.added || []
      if (added.length > 0) {
        showToast('success', `Imported ${added.length} project(s)`)
        addActivity('accent', 'Projects', 'imported', `${added.length} projects`)
      } else {
        const reasons = [...new Set((result.skipped || []).map((item) => item.reason))]
        showToast('info', result.skipped?.length
          ? `No new projects imported — ${result.skipped.length} skipped (${reasons.join(', ')})`
          : 'No projects to import')
      }
    } else if (!result.canceled) {
      showToast('error', result.error || 'Failed to import projects')
    }
  }, [showToast, addActivity])

  const handleExportDiagnostics = useCallback(async () => {
    const result = await exportDiagnostics()
    if (result.success) {
      showToast('success', `Diagnostics exported to ${result.filePath || result.path || 'file'}`)
      addActivity('faint', 'System', 'diagnostics exported')
    } else if (!result.canceled) {
      showToast('error', result.error || 'Failed to export diagnostics')
    }
  }, [showToast, addActivity])

  return { handleCommandSelect, handleExportProjects, handleImportProjects, handleExportDiagnostics }
}
