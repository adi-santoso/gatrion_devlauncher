/**
 * Close-confirmation latch (used by main.ts).
 *
 * When "minimize to tray" is OFF, closing the window really quits the app
 * (windows close → window-all-closed → app.quit), which stops any running
 * projects. The first close is therefore intercepted and the renderer is asked
 * to confirm via a `window-close-request` push; the user approves through a
 * `window-close-confirmed` IPC and cancels through `window-close-cancelled`.
 *
 * The latch state lives here (not in React) because Electron's `close` event
 * dispatch is synchronous — a decision must be returned before the handler
 * returns.
 */
export interface CloseConfirmRequestPayload {
  busyCount: number
}

export interface CloseConfirmDeps {
  isQuitting: () => boolean
  isMinimizeToTray: () => boolean
  getBusyCount: () => number
  sendCloseRequest: (payload: CloseConfirmRequestPayload) => void
  closeWindow: () => void
  hideWindow: () => void
}

export interface CloseConfirmLatch {
  /**
   * Decide whether a window `close` event may proceed.
   * @returns true when the caller should let the window close; false when the
   *          event was prevented (hide to tray, or pending user confirmation).
   */
  handleClose: (event: { preventDefault: () => void }) => boolean
  /** Renderer approved the quit — release the latch and re-close the window. */
  handleConfirmed: () => void
  /** Renderer cancelled the quit — reset so the next close asks again. */
  handleCancelled: () => void
}

export function createCloseConfirmLatch(deps: CloseConfirmDeps): CloseConfirmLatch {
  let pending = false
  let allowed = false

  return {
    handleClose(event) {
      // A real quit in progress (tray Quit / confirmed) must always proceed.
      if (deps.isQuitting() || allowed) return true

      if (deps.isMinimizeToTray()) {
        event.preventDefault()
        deps.hideWindow()
        return false
      }

      // Minimize-to-tray is off: closing quits the app. Ask once; while the
      // prompt is up, ignore repeated closes instead of re-sending.
      event.preventDefault()
      if (pending) return false
      pending = true
      deps.sendCloseRequest({ busyCount: deps.getBusyCount() })
      return false
    },

    handleConfirmed() {
      pending = false
      allowed = true
      deps.closeWindow()
    },

    handleCancelled() {
      pending = false
      allowed = false
    },
  }
}

export interface WindowCloseGuardOptions {
  isQuitting: () => boolean
  isMinimizeToTray: () => boolean
  getBusyCount: () => number
}

/**
 * Install the close guard on a BrowserWindow: decides in the synchronous
 * `close` event whether to hide to tray, ask the renderer to confirm, or let
 * the window close. Returns the latch used by the renderer's confirm/cancel.
 */
export function installWindowCloseGuard(
  win: Electron.BrowserWindow,
  options: WindowCloseGuardOptions
): CloseConfirmLatch {
  const latch = createCloseConfirmLatch({
    ...options,
    sendCloseRequest: (payload) => {
      if (!win.isDestroyed()) win.webContents.send('window-close-request', payload)
    },
    closeWindow: () => {
      if (!win.isDestroyed()) win.close()
    },
    hideWindow: () => {
      if (!win.isDestroyed()) win.hide()
    },
  })
  win.on('close', (event) => {
    if (!latch.handleClose(event)) event.preventDefault()
  })
  return latch
}

export default createCloseConfirmLatch