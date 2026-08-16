import type { BrowserWindow } from 'electron';

const { ipcMain } = require('electron') as typeof import('electron');
const os = require('os');
import { assertTrustedIpcEvent } from '../utils/ipcSecurity'
import { safeHandle } from '../utils/ipcValidation'

// node-pty is an optional native module with no bundled types — its API
// surface is pinned by the usage below.
interface PtyProcess {
  onData(callback: (data: string) => void): void
  onExit(callback: (event: { exitCode: number }) => void): void
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
}

interface PtyApi {
  spawn(shell: string, args: string[], options: Record<string, unknown>): PtyProcess
}

let pty: PtyApi | null = null;
try {
  pty = require('node-pty') as PtyApi;
} catch (error) {
  pty = null;
}

const terminals = new Map<string, PtyProcess>();

function getDefaultShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

export interface TerminalActionResult {
  success: boolean
  id?: string
  error?: string
}

/**
 * Shared terminal backend used by both the IPC handlers (renderer terminal) and
 * the MCP `devlauncher_terminal_*` tools — one PTY pool, one lifecycle.
 */
export const terminalApi = {
  create(options: Record<string, unknown> = {}, onData?: (id: string, data: string) => void, onExit?: (id: string, code: number) => void): TerminalActionResult {
    if (!pty) return { success: false, error: 'node-pty is not available' }
    const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const shell = typeof options.shell === 'string' && options.shell ? options.shell : getDefaultShell()
    const cwd = typeof options.cwd === 'string' && options.cwd ? options.cwd : os.homedir()
    const cols = Number.isInteger(options.cols) && (options.cols as number) > 0 ? (options.cols as number) : 80
    const rows = Number.isInteger(options.rows) && (options.rows as number) > 0 ? (options.rows as number) : 24

    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: process.env,
    })

    term.onData((data: string) => {
      onData?.(id, data)
    })

    term.onExit(({ exitCode }: { exitCode: number }) => {
      terminals.delete(id)
      onExit?.(id, exitCode)
    })

    terminals.set(id, term)
    return { success: true, id }
  },

  input(id: string, data: string): TerminalActionResult {
    const term = terminals.get(id)
    if (!term) return { success: false, error: 'Terminal not found' }
    term.write(String(data ?? ''))
    return { success: true }
  },

  resize(id: string, cols: number, rows: number): TerminalActionResult {
    const term = terminals.get(id)
    if (!term) return { success: false, error: 'Terminal not found' }
    if (Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0) {
      term.resize(cols, rows)
    }
    return { success: true }
  },

  kill(id: string): TerminalActionResult {
    const term = terminals.get(id)
    if (term) {
      term.kill()
      terminals.delete(id)
    }
    return { success: true }
  },

  count(): number {
    return terminals.size
  },
}

function setupTerminalHandlers(mainWindow: BrowserWindow | null) {
  const handle = (channel: string, handler: import('../utils/ipcValidation').IpcHandler) => safeHandle(ipcMain, assertTrustedIpcEvent, channel, handler)

  handle('terminal-create', async (_event, options: Record<string, unknown> = {}) => {
    const result = terminalApi.create(options, (id, data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal-data', id, data)
      }
    }, (id, exitCode) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal-exit', id, exitCode)
      }
    })
    return result
  })

  handle('terminal-input', async (_event, id: string, data: string) => terminalApi.input(id, data))
  handle('terminal-resize', async (_event, id: string, cols: number, rows: number) => terminalApi.resize(id, cols, rows))
  handle('terminal-kill', async (_event, id: string) => terminalApi.kill(id))
}

function killAllTerminals() {
  for (const id of [...terminals.keys()]) terminalApi.kill(id)
}

export { setupTerminalHandlers, killAllTerminals }
