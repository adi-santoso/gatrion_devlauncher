/**
 * Auto-update orchestration. `autoUpdater` (from electron-updater) is injected
 * so the state machine is unit-testable without an Electron runtime.
 *
 * Flow: check() → checking → available / idle; startDownload() → downloading
 * (with percent) → downloaded; quitAndInstall() applies the downloaded update.
 * Every transition is forwarded to the renderer on the `update-state` channel.
 */

const STATES = {
  IDLE: 'idle',
  CHECKING: 'checking',
  AVAILABLE: 'available',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  ERROR: 'error',
}

import type { BrowserWindow } from 'electron'

interface UpdateProgress {
  percent: number
  transferred: number | null
  total: number | null
  bytesPerSecond: number | null
}

interface UpdatePayload {
  state: string
  progress: UpdateProgress | null
  error: string | null
}

interface UpdaterDeps {
  autoUpdater: {
    on: Function
    checkForUpdates?: Function
    downloadUpdate?: Function
    quitAndInstall?: Function
  }
  getWindow?: () => BrowserWindow | null | undefined
  isEnabled: () => boolean
}

function createUpdater({ autoUpdater, getWindow, isEnabled }: UpdaterDeps) {
  let state: string = STATES.IDLE
  let progress: UpdateProgress | null = null
  let error: string | null = null
  const listeners = new Set<(payload: UpdatePayload) => void>()

  const emit = (nextState: string, extra: { progress?: UpdateProgress; error?: string } = {}): void => {
    state = nextState
    if (extra.progress !== undefined) progress = extra.progress
    if (extra.error !== undefined) error = extra.error
    const payload: UpdatePayload = { state, progress, error }
    for (const listener of [...listeners]) listener(payload)
    const win = getWindow?.()
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send('update-state', payload)
    }
  }

  const wireEvents = (): void => {
    if (!autoUpdater || typeof autoUpdater.on !== 'function') return
    autoUpdater.on('checking-for-update', () => emit(STATES.CHECKING))
    autoUpdater.on('update-available', () => emit(STATES.AVAILABLE))
    autoUpdater.on('update-not-available', () => emit(STATES.IDLE))
    autoUpdater.on('download-progress', (info: { percent?: number; transferred?: number | null; total?: number | null; bytesPerSecond?: number | null } = {}) => {
      emit(STATES.DOWNLOADING, {
        progress: {
          percent: Math.round((Number(info.percent) || 0) * 10) / 10,
          transferred: info.transferred ?? null,
          total: info.total ?? null,
          bytesPerSecond: info.bytesPerSecond ?? null,
        },
      })
    })
    autoUpdater.on('update-downloaded', () => emit(STATES.DOWNLOADED))
    autoUpdater.on('error', (err: Error) => emit(STATES.ERROR, { error: err.message || String(err) }))
  }

  const unavailable = () => ({ success: false, error: 'Auto-update is unavailable in this build' })

  const check = async (): Promise<{ success: boolean; error?: string }> => {
    if (!isEnabled() || typeof autoUpdater.checkForUpdates !== 'function') return unavailable()
    try {
      emit(STATES.CHECKING)
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      emit(STATES.ERROR, { error: message })
      return { success: false, error: message }
    }
  }

  const startDownload = async (): Promise<{ success: boolean; error?: string }> => {
    if (!isEnabled() || typeof autoUpdater.downloadUpdate !== 'function') return unavailable()
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      emit(STATES.ERROR, { error: message })
      return { success: false, error: message }
    }
  }

  const quitAndInstall = (): { success: boolean; error?: string } => {
    if (!isEnabled() || typeof autoUpdater.quitAndInstall !== 'function') return unavailable()
    autoUpdater.quitAndInstall(false, true)
    return { success: true }
  }

  const getState = (): UpdatePayload => ({ state, progress, error })

  const onChange = (listener: (payload: UpdatePayload) => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return { states: STATES, wireEvents, check, startDownload, quitAndInstall, getState, onChange }
}

export { createUpdater, STATES }

