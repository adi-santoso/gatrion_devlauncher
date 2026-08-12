const { ipcMain } = require('electron')
const { assertTrustedIpcEvent } = require('../utils/ipcSecurity')

/**
 * IPC handlers for the embedded WebContentsView preview.
 * The renderer owns the layout: it sends bounds (DIPs relative to window
 * content) and lifecycle commands; this side manages the native view.
 */
function setupPreviewHandlers(previewManager) {
  ipcMain.handle('preview-show', (event, payload) => {
    try {
      assertTrustedIpcEvent(event)
      return previewManager.show(payload || {})
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('preview-hide', (event, projectId) => {
    try {
      assertTrustedIpcEvent(event)
      return previewManager.hide(projectId)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('preview-set-bounds', (event, projectId, bounds) => {
    try {
      assertTrustedIpcEvent(event)
      previewManager.setBounds(projectId, bounds)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('preview-navigate', (event, projectId, url) => {
    try {
      assertTrustedIpcEvent(event)
      return previewManager.navigate(projectId, url)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('preview-reload', (event, projectId) => {
    try {
      assertTrustedIpcEvent(event)
      return previewManager.reload(projectId)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('preview-zoom', (event, projectId, zoomLevel) => {
    try {
      assertTrustedIpcEvent(event)
      return previewManager.setZoom(projectId, zoomLevel)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('preview-toggle-devtools', (event, projectId) => {
    try {
      assertTrustedIpcEvent(event)
      return previewManager.toggleDevTools(projectId)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('preview-clear-data', (event, projectId) => {
    try {
      assertTrustedIpcEvent(event)
      return previewManager.clearSiteData(projectId)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('preview-destroy', (event, projectId) => {
    try {
      assertTrustedIpcEvent(event)
      return previewManager.destroy(projectId)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

module.exports = { setupPreviewHandlers }
