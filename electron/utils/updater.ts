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
import { Notification } from 'electron'
import Logger from './logger'

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
  /** Version offered by the last `update-available` event (new version). */
  version?: string | null
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
  let version: string | null = null
  const listeners = new Set<(payload: UpdatePayload) => void>()

  const emit = (nextState: string, extra: { progress?: UpdateProgress; error?: string; version?: string | null } = {}): void => {
    state = nextState
    if (extra.progress !== undefined) progress = extra.progress
    if (extra.error !== undefined) error = extra.error
    if (extra.version !== undefined) version = extra.version
    const payload: UpdatePayload = { state, progress, error, version }
    for (const listener of [...listeners]) listener(payload)
    const win = getWindow?.()
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send('update-state', payload)
    }
  }

  const wireEvents = (): void => {
    if (!autoUpdater || typeof autoUpdater.on !== 'function') return
    autoUpdater.on('checking-for-update', () => emit(STATES.CHECKING))
    autoUpdater.on('update-available', (info: { version?: string } = {}) => {
      emit(STATES.AVAILABLE, { version: info.version || null })
    })
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

interface UpdaterSetupDeps {
  autoUpdater: UpdaterDeps['autoUpdater']
  getWindow: () => BrowserWindow | null | undefined
  focusAppWindow: () => void
  isPackaged: () => boolean
}

/**
 * Wires the updater state machine into the app lifecycle: event forwarding,
 * a Windows toast with a "Restart & install" action when a download finishes,
 * and a silent check shortly after launch (packaged builds only).
 */
export function setupAutoUpdater({
  autoUpdater,
  getWindow,
  focusAppWindow,
  isPackaged,
}: UpdaterSetupDeps) {
  const updater = createUpdater({ autoUpdater, getWindow, isEnabled: isPackaged })
  updater.wireEvents()
  updater.onChange((payload: UpdatePayload) => {
    Logger.info('Updater', 'State changed', { state: payload.state, error: payload.error || undefined })
    // Update ready → Windows toast with a "Restart & install" action button.
    if (payload.state === 'downloaded' && isPackaged()) {
      const notification = new Notification({
        title: 'Gatrion - Update ready',
        body: payload.version
          ? `Version ${payload.version} is downloaded. Restart to apply it.`
          : 'Update is downloaded. Restart to apply it.',
        actions: [{ type: 'button', text: 'Restart & install' }],
        timeoutType: 'never',
      })
      notification.on('action', (event) => {
        if (event.actionIndex === 0) updater.quitAndInstall()
      })
      notification.on('click', () => focusAppWindow())
      notification.show()
    }
  })
  // Silent check shortly after launch (packaged only) so a ready update can be
  // surfaced in the Settings banner / notification without user action.
  if (isPackaged()) {
    setTimeout(() => {
      updater.check().catch(() => {})
    }, 8000)
  }
  return updater
}

export { createUpdater, STATES }

