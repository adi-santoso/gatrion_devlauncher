// @ts-check
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

/**
 * @param {object} deps
 * @param {{ on: Function, checkForUpdates?: Function, downloadUpdate?: Function, quitAndInstall?: Function }} deps.autoUpdater
 * @param {() => any} [deps.getWindow]
 * @param {() => boolean} deps.isEnabled
 */
function createUpdater({ autoUpdater, getWindow, isEnabled }) {
  let state = STATES.IDLE
  let progress = null
  let error = null
  const listeners = new Set()

  const emit = (nextState, extra = {}) => {
    state = nextState
    if (extra.progress !== undefined) progress = extra.progress
    if (extra.error !== undefined) error = extra.error
    const payload = { state, progress, error }
    for (const listener of [...listeners]) listener(payload)
    const win = getWindow?.()
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send('update-state', payload)
    }
  }

  const wireEvents = () => {
    if (!autoUpdater || typeof autoUpdater.on !== 'function') return
    autoUpdater.on('checking-for-update', () => emit(STATES.CHECKING))
    autoUpdater.on('update-available', () => emit(STATES.AVAILABLE))
    autoUpdater.on('update-not-available', () => emit(STATES.IDLE))
    autoUpdater.on('download-progress', (info = {}) => {
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
    autoUpdater.on('error', (err) => emit(STATES.ERROR, { error: err?.message || String(err) }))
  }

  const unavailable = () => ({ success: false, error: 'Auto-update is unavailable in this build' })

  const check = async () => {
    if (!isEnabled() || typeof autoUpdater.checkForUpdates !== 'function') return unavailable()
    try {
      emit(STATES.CHECKING)
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch (err) {
      emit(STATES.ERROR, { error: err?.message || String(err) })
      return { success: false, error: err?.message || String(err) }
    }
  }

  const startDownload = async () => {
    if (!isEnabled() || typeof autoUpdater.downloadUpdate !== 'function') return unavailable()
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      emit(STATES.ERROR, { error: err?.message || String(err) })
      return { success: false, error: err?.message || String(err) }
    }
  }

  const quitAndInstall = () => {
    if (!isEnabled() || typeof autoUpdater.quitAndInstall !== 'function') return unavailable()
    autoUpdater.quitAndInstall(false, true)
    return { success: true }
  }

  const getState = () => ({ state, progress, error })

  const onChange = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return { states: STATES, wireEvents, check, startDownload, quitAndInstall, getState, onChange }
}

module.exports = { createUpdater, STATES }
