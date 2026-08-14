import type { PreviewManager } from '../managers/PreviewManager'

const { ipcMain } = require('electron') as typeof import('electron')
import { assertTrustedIpcEvent } from '../utils/ipcSecurity'
import { safeHandle } from '../utils/ipcValidation'

/**
 * IPC handlers for the embedded WebContentsView preview.
 * The renderer owns the layout: it sends bounds (DIPs relative to window
 * content) and lifecycle commands; this side manages the native view.
 */
function setupPreviewHandlers(previewManager: PreviewManager) {
  const handle = (channel: string, handler: import('../utils/ipcValidation').IpcHandler) => safeHandle(ipcMain, assertTrustedIpcEvent, channel, handler)

  handle('preview-show', (event, payload: Record<string, unknown>) => previewManager.show((payload || {}) as Parameters<PreviewManager['show']>[0]))
  handle('preview-hide', (event, projectId: string) => previewManager.hide(projectId))

  handle('preview-set-bounds', (event, projectId: string, bounds: { x: number; y: number; width: number; height: number }) => {
    previewManager.setBounds(projectId, bounds)
    return { success: true }
  })

  handle('preview-navigate', (event, projectId: string, url: string) => previewManager.navigate(projectId, url))
  handle('preview-reload', (event, projectId: string) => previewManager.reload(projectId))
  handle('preview-zoom', (event, projectId: string, zoomLevel: number) => previewManager.setZoom(projectId, zoomLevel))
  handle('preview-toggle-devtools', (event, projectId: string) => previewManager.toggleDevTools(projectId))
  handle('preview-clear-data', (event, projectId: string) => previewManager.clearSiteData(projectId))
  handle('preview-destroy', (event, projectId: string) => previewManager.destroy(projectId))
}

export { setupPreviewHandlers }

