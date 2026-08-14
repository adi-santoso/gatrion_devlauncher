import type { IpcHandler } from '../utils/ipcValidation'

const { ipcMain, shell } = require('electron') as typeof import('electron');
const fs = require('fs');
import { assertTrustedIpcEvent } from '../utils/ipcSecurity'
import { safeHandle } from '../utils/ipcValidation'

function setupDesktopHandlers() {
  const handle = (channel: string, handler: IpcHandler): void => safeHandle(ipcMain, assertTrustedIpcEvent, channel, handler)

  // Open external URL in default OS browser
  handle('open-external-url', async (event, url) => {
    if (!url || typeof url !== 'string') {
      return { success: false, error: 'Invalid URL parameter' };
    }
    const trimmed = url.trim();
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      return { success: false, error: 'Invalid URL format' };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { success: false, error: 'Only http:// and https:// URLs are allowed' };
    }

    await shell.openExternal(parsed.toString());
    return { success: true };
  });

  // Reveal item/folder in Windows File Explorer
  handle('reveal-in-explorer', async (event, targetPath) => {
    if (!targetPath || typeof targetPath !== 'string') {
      return { success: false, error: 'Invalid path parameter' };
    }
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: 'Path does not exist' };
    }
    shell.showItemInFolder(targetPath);
    return { success: true };
  });

  // Open directory path in default OS application or Code editor
  handle('open-in-editor', async (event, targetPath) => {
    if (!targetPath || typeof targetPath !== 'string') {
      return { success: false, error: 'Invalid path parameter' };
    }
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: 'Path does not exist' };
    }
    const errorMessage = await shell.openPath(targetPath);
    if (errorMessage) {
      return { success: false, error: errorMessage };
    }
    return { success: true };
  });
}

export { setupDesktopHandlers }

