/**
 * App-config & desktop-integration domain — persisted config, activity feed,
 * workspace presets, external links and OS-level actions. Falls back to
 * browser dev-mode mocks when the Electron bridge is absent.
 */
import { invoke, isElectron, subscribe, SimpleResult } from './ipcCore'
import type { AppConfig, DeepPartial, Preset } from '../types/shared'

export interface ConfigResult {
  success: boolean
  config: AppConfig
  error?: string
}

export interface ActivityEntry {
  type: string
  project?: string
  message: string
  detail?: string
  timestamp: string
}

export interface ActivitiesResult {
  success: boolean
  activities?: ActivityEntry[]
  error?: string
}

export interface PresetsResult {
  success: boolean
  presets: Preset[]
  error?: string
}

const MOCK_CONFIG: AppConfig = {
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

export const getConfig = async (): Promise<ConfigResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - using mock config')
    return { success: true, config: MOCK_CONFIG }
  }
  return invoke<ConfigResult>('getConfig')
}

export const updateConfig = async (updates: DeepPartial<AppConfig>): Promise<ConfigResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock updateConfig called')
    return {
      success: true,
      config: {
        ...MOCK_CONFIG,
        ...updates,
        notifications: { ...MOCK_CONFIG.notifications, ...(updates.notifications || {}) },
        terminal: { ...MOCK_CONFIG.terminal, ...(updates.terminal || {}) },
        autoRestart: { ...MOCK_CONFIG.autoRestart, ...(updates.autoRestart || {}) },
        preview: { ...MOCK_CONFIG.preview, ...(updates.preview || {}) },
      } as AppConfig,
    }
  }
  return invoke<ConfigResult>('updateConfig', updates)
}

export const getActivities = async (): Promise<ActivitiesResult> => {
  if (!isElectron()) return { success: true, activities: [] }
  return invoke<ActivitiesResult>('getActivities')
}

export const appendActivities = async (entries: ActivityEntry[]): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('appendActivities', entries)
}

export const getPresets = async (): Promise<PresetsResult> => {
  if (!isElectron()) return { success: true, presets: [] }
  return invoke<PresetsResult>('getPresets')
}

export const savePresets = async (presets: Preset[]): Promise<PresetsResult> => {
  if (!isElectron()) return { success: true, presets }
  return invoke<PresetsResult>('savePresets', presets)
}

export const openExternalUrl = async (url: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - opening URL in window:', url)
    window.open(url, '_blank')
    return { success: true }
  }
  return invoke<SimpleResult>('openExternalUrl', url)
}

export const revealInExplorer = async (targetPath: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - revealInExplorer called for path:', targetPath)
    return { success: false, error: 'File Explorer integration requires desktop app' }
  }
  return invoke<SimpleResult>('revealInExplorer', targetPath)
}

export const openInEditor = async (targetPath: string): Promise<SimpleResult> => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - openInEditor called for path:', targetPath)
    return { success: false, error: 'Editor integration requires desktop app' }
  }
  return invoke<SimpleResult>('openInEditor', targetPath)
}

export const showNotification = async (payload: { title: string; body?: string; [key: string]: unknown }): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('showNotification', payload)
}

/** Push channel — config changes originating outside this renderer. */
export const onConfigUpdated = (callback: (config: AppConfig) => void): (() => void) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onConfigUpdated not available')
    return () => {}
  }
  return subscribe('onConfigUpdated', (config) => callback(config as AppConfig))
}
