// @ts-check
const { ipcMain } = require('electron')
const { assertTrustedIpcEvent } = require('../utils/ipcSecurity')
const { safeHandle } = require('../utils/ipcValidation')

/**
 * IPC handlers for the embedded WebContentsView preview.
 * The renderer owns the layout: it sends bounds (DIPs relative to window
 * content) and lifecycle commands; this side manages the native view.
 */
function setupPreviewHandlers(previewManager) {
  const handle = (channel, handler) => safeHandle(ipcMain, assertTrustedIpcEvent, channel, handler)

  handle('preview-show', (event, payload) => previewManager.show(payload || {}))
  handle('preview-hide', (event, projectId) => previewManager.hide(projectId))

  handle('preview-set-bounds', (event, projectId, bounds) => {
    previewManager.setBounds(projectId, bounds)
    return { success: true }
  })

  handle('preview-navigate', (event, projectId, url) => previewManager.navigate(projectId, url))
  handle('preview-reload', (event, projectId) => previewManager.reload(projectId))
  handle('preview-zoom', (event, projectId, zoomLevel) => previewManager.setZoom(projectId, zoomLevel))
  handle('preview-toggle-devtools', (event, projectId) => previewManager.toggleDevTools(projectId))
  handle('preview-clear-data', (event, projectId) => previewManager.clearSiteData(projectId))
  handle('preview-destroy', (event, projectId) => previewManager.destroy(projectId))
}

module.exports = { setupPreviewHandlers }
