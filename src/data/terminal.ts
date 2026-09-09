/**
 * Interactive terminal domain — create/input/resize/kill sessions and data
 * forwarding. Falls back to browser dev-mode mocks when the Electron bridge
 * is absent.
 */
import { invoke, isElectron, subscribe, SimpleResult } from './ipcCore'

export interface TerminalCreateOptions {
  projectId?: string
  cwd?: string
  cols?: number
  rows?: number
  [key: string]: unknown
}

export interface TerminalCreateResult extends SimpleResult {
  id?: string
  [key: string]: unknown
}

type TerminalDataListener = (id: string, data: string) => void
type TerminalExitListener = (id: string, code?: number | null) => void

// Multiplex both push channels through one preload/ipcRenderer listener. A
// Project Detail can keep many shells mounted; registering one Electron
// EventEmitter listener per shell eventually produces MaxListeners warnings.
const terminalDataListeners = new Set<TerminalDataListener>()
const terminalExitListeners = new Set<TerminalExitListener>()
let stopDataBridge: (() => void) | null = null
let stopExitBridge: (() => void) | null = null

const ensureDataBridge = (): void => {
  if (stopDataBridge || !isElectron()) return
  stopDataBridge = subscribe('onTerminalData', (id, data) => {
    for (const listener of terminalDataListeners) listener(id as string, data as string)
  })
}

const ensureExitBridge = (): void => {
  if (stopExitBridge || !isElectron()) return
  stopExitBridge = subscribe('onTerminalExit', (id, code) => {
    for (const listener of terminalExitListeners) listener(id as string, code as number | null | undefined)
  })
}

export const terminalCreate = async (options: TerminalCreateOptions): Promise<TerminalCreateResult> => {
  if (!isElectron()) return { success: false, error: 'Electron not available' }
  return invoke<TerminalCreateResult>('terminalCreate', options)
}

export const terminalInput = async (id: string, data: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false }
  return invoke<SimpleResult>('terminalInput', id, data)
}

export const terminalResize = async (id: string, cols: number, rows: number): Promise<SimpleResult> => {
  if (!isElectron()) return { success: false }
  return invoke<SimpleResult>('terminalResize', id, cols, rows)
}

export const terminalKill = async (id: string): Promise<SimpleResult> => {
  if (!isElectron()) return { success: true }
  return invoke<SimpleResult>('terminalKill', id)
}

/** Push channel — terminal output data. */
export const onTerminalData = (callback: (id: string, data: string) => void): (() => void) => {
  if (!isElectron()) return () => {}
  terminalDataListeners.add(callback)
  ensureDataBridge()
  return () => {
    terminalDataListeners.delete(callback)
    if (terminalDataListeners.size === 0 && stopDataBridge) {
      stopDataBridge()
      stopDataBridge = null
    }
  }
}

/** Push channel — terminal session exit. */
export const onTerminalExit = (callback: (id: string, code?: number | null) => void): (() => void) => {
  if (!isElectron()) return () => {}
  terminalExitListeners.add(callback)
  ensureExitBridge()
  return () => {
    terminalExitListeners.delete(callback)
    if (terminalExitListeners.size === 0 && stopExitBridge) {
      stopExitBridge()
      stopExitBridge = null
    }
  }
}
