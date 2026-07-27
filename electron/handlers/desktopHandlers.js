const { ipcMain, shell } = require('electron');

function setupDesktopHandlers() {
  // Open external URL in default OS browser
  ipcMain.handle('open-external-url', async (event, url) => {
    try {
      if (!url || typeof url !== 'string') {
        return { success: false, error: 'Invalid URL parameter' };
      }
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return { success: false, error: 'Only http:// and https:// URLs are allowed' };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('[DesktopHandlers] Error opening external URL:', error);
      return { success: false, error: error.message };
    }
  });

  // Reveal item/folder in Windows File Explorer
  ipcMain.handle('reveal-in-explorer', async (event, targetPath) => {
    try {
      if (!targetPath || typeof targetPath !== 'string') {
        return { success: false, error: 'Invalid path parameter' };
      }
      shell.showItemInFolder(targetPath);
      return { success: true };
    } catch (error) {
      console.error('[DesktopHandlers] Error revealing in explorer:', error);
      return { success: false, error: error.message };
    }
  });

  // Open directory path in default OS application or Code editor
  ipcMain.handle('open-in-editor', async (event, targetPath) => {
    try {
      if (!targetPath || typeof targetPath !== 'string') {
        return { success: false, error: 'Invalid path parameter' };
      }
      const errorMessage = await shell.openPath(targetPath);
      if (errorMessage) {
        return { success: false, error: errorMessage };
      }
      return { success: true };
    } catch (error) {
      console.error('[DesktopHandlers] Error opening in editor:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { setupDesktopHandlers };
