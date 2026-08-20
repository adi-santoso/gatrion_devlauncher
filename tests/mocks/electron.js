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

// WebContentsView + session partition fakes used by PreviewManager tests.
const views = new Map() // view -> true (attached to a window)
const sessions = new Map() // partition -> fake session

class FakeWebContentsView {
  constructor(options) {
    this.options = options
    this.visible = false
    this.bounds = null
    // Every setBounds call in order — lets tests assert transient resizes
    // (e.g. PreviewManager.nudge shrinks by 1px then restores).
    this.boundsHistory = []
    this.loadedUrls = []
    this.devtoolsOpen = false
    this.consoleHandlers = {}
    this.reloadCount = 0
    this.invalidateCount = 0
    this.webContents = {
      loadURL: (url) => { this.loadedUrls.push(url); return Promise.resolve() },
      reload: () => { this.reloadCount += 1 },
      setZoomFactor: (f) => { this.zoomFactor = f },
      setWindowOpenHandler: () => {},
      on: (event, cb) => { this.consoleHandlers[event] = cb },
      isDevToolsOpened: () => this.devtoolsOpen,
      openDevTools: () => { this.devtoolsOpen = true },
      closeDevTools: () => { this.devtoolsOpen = false },
      isDestroyed: () => false,
      close: () => {},
      invalidate: () => { this.invalidateCount += 1 },
    }
  }
  setVisible(v) { this.visible = v }
  setBounds(b) { this.bounds = b; this.boundsHistory.push(b) }
  getBounds() { return this.bounds }
  emitConsole(level, message, sourceId, line) {
    this.consoleHandlers['console-message']?.({}, level, message, line, sourceId)
  }
}

const session = {
  fromPartition(partition) {
    if (!sessions.has(partition)) {
      sessions.set(partition, {
        partition,
        clearStorageData: async () => {},
        clearCache: async () => {},
        clearAuthCache: async () => {},
        cookies: { flushStore: async () => {} },
      })
    }
    return sessions.get(partition)
  },
}

const WebContentsView = FakeWebContentsView

const dialog = {
  showSaveDialog: async () => ({ canceled: true }),
  showOpenDialog: async () => ({ canceled: true }),
}

const app = {
  isPackaged: false,
  // Overridable so tests can point userData at a private temp dir instead of
  // sharing a fixed path across files (which was a source of flakes).
  _userDataPath: TEMP_USER_DATA,
  _relaunched: false,
  _quitted: false,
  getPath: (name) => (name === 'userData' ? app._userDataPath : app._userDataPath),
  getVersion: () => '0.0.0-test',
  getName: () => 'devlauncher-test',
  relaunch: () => { app._relaunched = true },
  quit: () => { app._quitted = true },
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
  views.clear()
  sessions.clear()
  app._userDataPath = TEMP_USER_DATA
  app._relaunched = false
  app._quitted = false
}

// Exposed for PreviewManager tests to inspect window attachment.
function __previewState() {
  return { views, sessions }
}

module.exports = {
  ipcMain,
  ipcRenderer,
  shell,
  dialog,
  app,
  contextBridge,
  WebContentsView,
  session,
  __reset,
  __previewState,
  TEMP_USER_DATA,
}
