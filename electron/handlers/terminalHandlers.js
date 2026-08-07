const { ipcMain } = require('electron');
const os = require('os');
const { assertTrustedIpcEvent } = require('../utils/ipcSecurity');

let pty;
try {
  pty = require('node-pty');
} catch (error) {
  pty = null;
}

const terminals = new Map();

function getDefaultShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

function setupTerminalHandlers(mainWindow) {
  ipcMain.handle('terminal-create', async (event, options = {}) => {
    try {
      assertTrustedIpcEvent(event);
      if (!pty) {
        return { success: false, error: 'node-pty is not available' };
      }
      const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const shell = options.shell || getDefaultShell();
      const cwd = options.cwd || os.homedir();
      const cols = Number.isInteger(options.cols) && options.cols > 0 ? options.cols : 80;
      const rows = Number.isInteger(options.rows) && options.rows > 0 ? options.rows : 24;

      const term = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: process.env,
      });

      term.onData((data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal-data', id, data);
        }
      });

      term.onExit(({ exitCode }) => {
        terminals.delete(id);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal-exit', id, exitCode);
        }
      });

      terminals.set(id, term);
      return { success: true, id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('terminal-input', async (event, id, data) => {
    try {
      assertTrustedIpcEvent(event);
      const term = terminals.get(id);
      if (!term) return { success: false, error: 'Terminal not found' };
      term.write(String(data ?? ''));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('terminal-resize', async (event, id, cols, rows) => {
    try {
      assertTrustedIpcEvent(event);
      const term = terminals.get(id);
      if (!term) return { success: false, error: 'Terminal not found' };
      if (Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0) {
        term.resize(cols, rows);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('terminal-kill', async (event, id) => {
    try {
      assertTrustedIpcEvent(event);
      const term = terminals.get(id);
      if (term) {
        term.kill();
        terminals.delete(id);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

function killAllTerminals() {
  for (const term of terminals.values()) {
    try { term.kill(); } catch {}
  }
  terminals.clear();
}

module.exports = { setupTerminalHandlers, killAllTerminals };
