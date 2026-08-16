import { useState, useEffect, useCallback } from 'react'
import * as ipc from '../utils/ipcRenderer'
import type { AppConfig, DeepPartial } from '../types/shared'

export interface ConfigActionResult {
  success: boolean
  config?: AppConfig
  error?: string
}

const DEFAULT_CONFIG: AppConfig = {
  theme: 'dark',
  language: 'en',
  sidebarExpanded: true,
  startOnBoot: false,
  minimizeToTray: true,
  autoStartProjects: false,
  notifications: { onStart: true, onError: true, sound: false },
  terminal: { fontSize: 14, maxLines: 1000, autoScroll: true },
  autoRestart: { enabled: false, maxRetries: 3, delayMs: 2000 },
  preview: { keepAlive: true },
  prayer: {
    showIn: 'both',
    method: 'KEMENAG',
    city: 'Jakarta',
    latitude: -6.2088,
    longitude: 106.8456,
    utcOffset: 7,
    adjustments: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
    notify: true,
    sound: true,
  },
  agent: { notifyOnFinish: true, sound: false, controlEnabled: false, permissions: { read: true, write: true, destructive: true } },
  windowBounds: null,
  schemaVersion: 0,
}

/**
 * useElectronConfig Hook
 * Manages application configuration with Electron persistence
 */
export const useElectronConfig = () => {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load config from Electron
  const loadConfig = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await ipc.getConfig()

      if (response.success) {
        setConfig(response.config)
      } else {
        setError(response.error || 'Failed to load config')
      }
    } catch (err) {
      console.error('Error loading config:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // Update config in Electron
  const updateConfig = useCallback(async (updates: DeepPartial<AppConfig>): Promise<ConfigActionResult> => {
    try {
      const response = await ipc.updateConfig(updates)

      if (response.success) {
        setConfig(response.config)

        // Apply theme changes to DOM
        if (updates.theme) {
          document.documentElement.setAttribute('data-theme', updates.theme)
        }

        // Keep every useElectronConfig instance (e.g. MainLayout's own hook)
        // in sync — the IPC response only reaches the calling instance.
        window.dispatchEvent(new CustomEvent('devlauncher:config-changed', { detail: response.config }))

        return { success: true, config: response.config }
      } else {
        return { success: false, error: response.error || 'Failed to update config' }
      }
    } catch (err) {
      console.error('Error updating config:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }, [])

  // Batch update multiple config values
  const updateMultiple = useCallback(async (updates: DeepPartial<AppConfig>): Promise<ConfigActionResult> => {
    return updateConfig(updates)
  }, [updateConfig])

  // Update single config value
  const updateSingle = useCallback(<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<ConfigActionResult> => {
    return updateConfig({ [key]: value } as DeepPartial<AppConfig>)
  }, [updateConfig])

  // Load config on mount
  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Sync every instance: local CustomEvent (browser + Electron) and the
  // main-process push channel (updates originating outside this renderer).
  useEffect(() => {
    const onCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail) setConfig(detail)
    }
    window.addEventListener('devlauncher:config-changed', onCustomEvent)
    const cleanupIpc = ipc.onConfigUpdated((nextConfig) => {
      if (nextConfig) setConfig(nextConfig)
    })
    return () => {
      window.removeEventListener('devlauncher:config-changed', onCustomEvent)
      cleanupIpc?.()
    }
  }, [])

  // Apply theme on config change
  useEffect(() => {
    if (config.theme) {
      document.documentElement.setAttribute('data-theme', config.theme)
    }
  }, [config.theme])

  return {
    config,
    loading,
    error,
    updateConfig,
    updateMultiple,
    updateSingle,
    loadConfig,
  }
}
