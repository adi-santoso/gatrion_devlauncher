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
  return subscribe('onTerminalData', (id, data) => callback(id as string, data as string))
}

/** Push channel — terminal session exit. */
export const onTerminalExit = (callback: (id: string, code?: number | null) => void): (() => void) => {
  if (!isElectron()) return () => {}
  return subscribe('onTerminalExit', (id, code) => callback(id as string, code as number | null | undefined))
}
