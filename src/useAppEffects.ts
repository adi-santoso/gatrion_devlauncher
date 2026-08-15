import { useEffect } from 'react'
import { isElectronAvailable, onNavigateToProject, onPreviewConsole } from './utils/ipcRenderer'
import type { AppConfig } from './types/shared'
import type { ProjectRuntime } from './hooks/useProjects'

export interface AppEffectsDeps {
  projects: ProjectRuntime[]
  config: AppConfig
  showToast: (type: string, message: string) => void
  addActivity: (type: string, project: string, message: string, detail?: string) => void
  showView: (viewName: string, data?: unknown) => void
}

/** App-level environment effects: availability check, theme sync, tray + preview subscriptions. */
export function useAppEffects({ projects, config, showToast, addActivity, showView }: AppEffectsDeps) {
  // Check Electron availability on mount
  useEffect(() => {
    if (!isElectronAvailable()) {
      console.warn('⚠️ Running in browser mode - Electron APIs not available')
      showToast('warning', 'Running in browser mode with mock data')
    }
  }, [showToast])

  // Initialize theme from config. 'system' follows the OS preference live via
  // the prefers-color-scheme media query (same source as nativeTheme), so a
  // user switching their OS theme is reflected without touching the app.
  useEffect(() => {
    const applyTheme = () => {
      const theme = config.theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : config.theme
      document.documentElement.setAttribute('data-theme', theme)
    }
    applyTheme()
    if (config.theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      media.addEventListener('change', applyTheme)
      return () => media.removeEventListener('change', applyTheme)
    }
    return undefined
  }, [config.theme])

  // Subscribe to tray menu navigation events
  useEffect(() => {
    return onNavigateToProject((projectId) => {
      const target = projects.find((p) => p.id === projectId)
      if (target) {
        showView('project-detail', target)
      }
    })
  }, [projects, showView])

  // Surface console output from embedded project apps (native preview) in the
  // activity feed so renderer-only errors are not silently lost.
  useEffect(() => {
    return onPreviewConsole(({ projectId, level, message }) => {
      if (!message) return
      const pid = projectId as string | undefined
      const project = projects.find((p) => p.id === pid)
      if (level === 'error' || level === 'warning') {
        addActivity('faint', project?.name || String(pid || ''), `[preview:${level}] ${message}`, '')
      }
    })
  }, [projects, addActivity])
}
