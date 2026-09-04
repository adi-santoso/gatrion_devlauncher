/**
 * Embedded preview domain — show/hide, bounds, navigation, zoom, devtools and
 * console forwarding for the in-app browser. Falls back to browser dev-mode
 * mocks when the Electron bridge is absent.
 */
import { invoke, isElectron, subscribe, SimpleResult } from './ipcCore'

export interface PreviewBounds {
  x?: number
  y?: number
  width?: number
  height?: number
}

export interface PreviewConsoleEntry {
  level?: string
  message?: string
  [key: string]: unknown
}

export interface PreviewNavState {
  projectId: string
  url: string
  canGoBack: boolean
  canGoForward: boolean
  title?: string
}

/**
 * Device-emulation override applied to the native preview view via CDP
 * (`Emulation.setDeviceMetricsOverride` + touch + user agent). `mobile`
 * switches the viewport semantics to a touch device; `deviceScaleFactor`
 * emulates the device pixel ratio (e.g. 3 for modern phones).
 */
export interface DeviceEmulationConfig {
  width: number
  height: number
  deviceScaleFactor: number
  mobile: boolean
  userAgent?: string
}

export const previewShow = async (payload: { projectId: string; url?: string; [key: string]: unknown }): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Preview requires desktop app' }
  return invoke<SimpleResult>('previewShow', payload)
}

export const previewHide = async (projectId: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('previewHide', projectId)
}

export const previewSetBounds = async (projectId: string, bounds: PreviewBounds): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('previewSetBounds', projectId, bounds)
}

export const previewNavigate = async (projectId: string, url: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Preview requires desktop app' }
  return invoke<SimpleResult>('previewNavigate', projectId, url)
}

export const previewGetState = async (projectId: string): Promise<{ success: boolean; data?: PreviewNavState; error?: string }> => {
  if (!isElectron()) return { success: false, error: 'Preview requires desktop app' }
  return invoke<{ success: boolean; data?: PreviewNavState; error?: string }>('previewGetState', projectId)
}

export const previewBack = async (projectId: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Preview requires desktop app' }
  return invoke<SimpleResult>('previewBack', projectId)
}

export const previewForward = async (projectId: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Preview requires desktop app' }
  return invoke<SimpleResult>('previewForward', projectId)
}

/** Push channel — live URL/navigation state pushed from the embedded preview. */
export const onPreviewUrlUpdated = (callback: (state: PreviewNavState) => void): (() => void) => {
  if (!isElectron()) return () => {}
  return subscribe('onPreviewUrlUpdated', (state) => callback(state as PreviewNavState))
}

export const previewReload = async (projectId: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Preview requires desktop app' }
  return invoke<SimpleResult>('previewReload', projectId)
}

export const previewZoom = async (projectId: string, zoomLevel: number): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('previewZoom', projectId, zoomLevel)
}

export const previewClearData = async (projectId: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Preview requires desktop app' }
  return invoke<SimpleResult>('previewClearData', projectId)
}

export const previewNudge = async (projectId: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('previewNudge', projectId)
}

export const previewDestroy = async (projectId: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('previewDestroy', projectId)
}

export const previewToggleDevTools = async (projectId: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Preview requires desktop app' }
  return invoke<SimpleResult>('previewToggleDevTools', projectId)
}

/**
 * Apply (or clear, when `null`) CDP device emulation on the native preview
 * view: viewport metrics, touch support and user agent.
 */
export const previewSetDevice = async (projectId: string, config: DeviceEmulationConfig | null): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('previewSetDevice', projectId, config)
}

/** Push channel — console output forwarded from the preview webview. */
export const onPreviewConsole = (callback: (entry: PreviewConsoleEntry) => void): (() => void) => {
  if (!isElectron()) return () => {}
  return subscribe('onPreviewConsole', (entry) => callback(entry as PreviewConsoleEntry))
}
