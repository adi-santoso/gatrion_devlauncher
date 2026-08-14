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

export const previewDestroy = async (projectId: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('previewDestroy', projectId)
}

export const previewToggleDevTools = async (projectId: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false, error: 'Preview requires desktop app' }
  return invoke<SimpleResult>('previewToggleDevTools', projectId)
}

/** Push channel — console output forwarded from the preview webview. */
export const onPreviewConsole = (callback: (entry: PreviewConsoleEntry) => void): (() => void) => {
  if (!isElectron()) return () => {}
  return subscribe('onPreviewConsole', (entry) => callback(entry as PreviewConsoleEntry))
}
