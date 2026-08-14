// Shared in-memory mock of the Electron API for vitest.
//
// `vi.mock` cannot intercept `require('electron')` inside the CJS modules of
// this project, so the test config aliases the `electron` id to this file
// (see vitest.config.js). Main-process modules that `require('electron')`
// therefore receive this object; handler tests import the same module to
// drive the registered handlers and inspect invocations.
//
// State is reset between tests via `__reset()` (call it in beforeEach).

const os = require('os')
const path = require('path')

const TEMP_USER_DATA = path.join(os.tmpdir(), 'devlauncher-mock-electron')

function makeListeners() {
  return new Map()
}

const ipcMain = {
  _handlers: new Map(),
  _listeners: makeListeners(),
  handle(channel, fn) {
    this._handlers.set(channel, fn)
  },
  on(channel, fn) {
    if (!this._listeners.has(channel)) this._listeners.set(channel, new Set())
    this._listeners.get(channel).add(fn)
  },
  once(channel, fn) {
    this.on(channel, fn)
  },
  removeListener(channel, fn) {
    const set = this._listeners.get(channel)
    if (set) set.delete(fn)
  },
  removeAllListeners(channel) {
    if (channel) this._listeners.delete(channel)
    else this._listeners.clear()
  },
}

const ipcRenderer = {
  _handlers: new Map(),
  _listeners: makeListeners(),
  invoke: async () => ({ success: true }),
  send() {},
  on(channel, fn) {
    if (!this._listeners.has(channel)) this._listeners.set(channel, new Set())
    this._listeners.get(channel).add(fn)
  },
  removeListener(channel, fn) {
    const set = this._listeners.get(channel)
    if (set) set.delete(fn)
  },
}

const shell = {
  openExternal: async () => {},
  showItemInFolder: () => {},
  openPath: async () => '',
}

const dialog = {
  showSaveDialog: async () => ({ canceled: true }),
  showOpenDialog: async () => ({ canceled: true }),
}

const app = {
  isPackaged: false,
  getPath: (name) => (name === 'userData' ? TEMP_USER_DATA : TEMP_USER_DATA),
  getVersion: () => '0.0.0-test',
  getName: () => 'devlauncher-test',
}

const contextBridge = {
  _exposed: null,
  exposeInMainWorld(key, api) {
    this._exposed = { key, api }
  },
}

function __reset() {
  ipcMain._handlers.clear()
  ipcMain._listeners.clear()
  ipcRenderer._handlers.clear()
  ipcRenderer._listeners.clear()
  ipcRenderer.invoke = async () => ({ success: true })
  shell.openExternal = async () => {}
  shell.showItemInFolder = () => {}
  shell.openPath = async () => ''
  dialog.showSaveDialog = async () => ({ canceled: true })
  dialog.showOpenDialog = async () => ({ canceled: true })
  contextBridge._exposed = null
}

module.exports = { ipcMain, ipcRenderer, shell, dialog, app, contextBridge, __reset, TEMP_USER_DATA }
