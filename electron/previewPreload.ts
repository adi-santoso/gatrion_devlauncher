const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron')

/**
 * Preload script for embedded preview WebContentsViews (per-project session).
 * Runs in a sandboxed context with `contextBridge` + `ipcRenderer` available.
 * Exposes a credential autofill API to the page context.
 */
contextBridge.exposeInMainWorld('__devlauncherCredentialApi', {
  /** Get saved credentials for the current origin. */
  getCredentials: (origin: string): Promise<Array<{ username: string; password: string }>> =>
    ipcRenderer.invoke('preview-get-credentials', origin),

  /** Save a credential. */
  saveCredential: (origin: string, username: string, password: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('preview-save-credential', origin, username, password),

  /** Remove a credential. */
  removeCredential: (origin: string, username: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('preview-remove-credential', origin, username),

  /** Subscribe to fill requests from main (triggered by the content script). */
  onFillRequest: (callback: (data: { username: string; password: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { username: string; password: string }): void => callback(data)
    ipcRenderer.on('__credential-fill', handler)
    return () => ipcRenderer.removeListener('__credential-fill', handler)
  },
})