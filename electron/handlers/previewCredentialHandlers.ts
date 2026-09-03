import type { CredentialManager } from '../managers/CredentialManager'

const { ipcMain } = require('electron') as typeof import('electron')
import { assertTrustedIpcEvent } from '../utils/ipcSecurity'
import { safeHandle } from '../utils/ipcValidation'

/**
 * IPC handlers for the preview password manager (save/get/remove credentials
 * for the embedded preview). Backed by CredentialManager (safeStorage).
 */
function setupPreviewCredentialHandlers(credentialManager: CredentialManager) {
  const handle = (channel: string, handler: import('../utils/ipcValidation').IpcHandler) =>
    safeHandle(ipcMain, assertTrustedIpcEvent, channel, handler)

  handle('preview-get-credentials', (_event, origin: string) =>
    credentialManager.getCredentials(origin))

  handle('preview-save-credential', async (_event, origin: string, username: string, password: string) => {
    await credentialManager.saveCredential(origin, username, password)
    return { success: true }
  })

  handle('preview-remove-credential', async (_event, origin: string, username: string) => {
    await credentialManager.removeCredential(origin, username)
    return { success: true }
  })
}

export { setupPreviewCredentialHandlers }