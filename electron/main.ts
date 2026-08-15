import type { AppConfig, WindowBounds } from '../src/types/shared'
import type { ProcessManager as ProcessManagerType } from './managers/ProcessManager'
import type { StorageManager as StorageManagerType } from './managers/StorageManager'
import type { HealthManager as HealthManagerType } from './managers/HealthManager'
import type { OmpManager as OmpManagerType } from './managers/OmpManager'
import type { OmpInstaller as OmpInstallerType } from './managers/OmpInstaller'
import type { OmpConfig as OmpConfigType } from './managers/OmpConfig'
import type { ProjectDetector as ProjectDetectorType } from './managers/ProjectDetector'
import type { TrayManager as TrayManagerType } from './managers/TrayManager'
import type { PreviewManager as PreviewManagerType } from './managers/PreviewManager'

const { app, BrowserWindow, session, globalShortcut, crashReporter } = require('electron') as typeof import('electron')
const path = require('path')
const fs = require('fs').promises
import ProcessManager from './managers/ProcessManager'
import StorageManager from './managers/StorageManager'
import HealthManager from './managers/HealthManager'
import OmpManager from './managers/OmpManager'
import OmpInstaller from './managers/OmpInstaller'
import OmpConfig from './managers/OmpConfig'
import ProjectDetector from './managers/ProjectDetector'
import TrayManager from './managers/TrayManager'
import PreviewManager from './managers/PreviewManager'
import { setupProcessHandlers } from './handlers/processHandlers'
import { setupProjectHandlers } from './handlers/projectHandlers'
import { setupDesktopHandlers } from './handlers/desktopHandlers'
import { setupTerminalHandlers, killAllTerminals } from './handlers/terminalHandlers'
import { setupPreviewHandlers } from './handlers/previewHandlers'
import { setupRepoHandlers } from './handlers/repoHandlers'
import { setupSystemHandlers } from './handlers/systemHandlers'
import { setupBackupHandlers } from './handlers/backupHandlers'
import { setupAgentHandlers } from './handlers/agentHandlers'
import { registerCoreIpcHandlers } from './ipcHandlers'
import { setupProjectNotifications } from './notifications'
import { setupAutoUpdater } from './utils/updater'
import Logger from './utils/logger'

// Global error capture — log anything that escapes normal error handling so
// crashes and silent failures are visible in main.log instead of dying
// quietly (or only showing in the terminal).
process.on('uncaughtException', (error) => {
  const stack = error instanceof Error ? error.stack : String(error)
  Logger.error('main', 'Uncaught exception', { stack })
})
process.on('unhandledRejection', (reason) => {
  const detail = reason instanceof Error ? reason.stack || reason.message : String(reason)
  Logger.error('main', 'Unhandled promise rejection', { reason: detail })
})

// E2E test hook: point the app at an isolated userData directory so tests never
// touch real workspace data (projects, config, agent sessions). Must be set
// before the single-instance lock (keyed on userData) and before any manager
// reads app paths.
if (process.env.DEVLAUNCHER_USER_DATA) {
  app.setPath('userData', process.env.DEVLAUNCHER_USER_DATA)
}

// Single-instance enforcement — launching the app again focuses the existing
// window instead of starting a second copy (duplicate tray icons, double
// process monitoring, port conflicts, etc.).
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}
app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

let mainWindow: InstanceType<typeof BrowserWindow> | null = null
let processManager!: ProcessManagerType
let storageManager!: StorageManagerType
let projectDetector!: ProjectDetectorType
let trayManager!: TrayManagerType
let previewManager!: PreviewManagerType
let healthManager!: HealthManagerType
let ompManager!: OmpManagerType
let ompInstaller!: OmpInstallerType
let ompConfig!: OmpConfigType
let isQuitting = false

// Bring the main window to the front (used by notification click handlers).
function focusAppWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

// Identity: notifications, taskbar grouping, and the default window title all
// fall back to the app name. Without this, dev runs attribute notifications to
// the electron binary ("electron") and windows can flash an untitled title.
const APP_NAME = 'DevLauncher'
const APP_ID = 'com.devlauncher.desktop'
app.setName(APP_NAME)
app.setAppUserModelId(APP_ID)

// Content Security Policy — applied to every response (dev and production).
// Must be registered after `app.whenReady()` because session.defaultSession is
// only available once the app is ready.
// Production restricts scripts to self; dev keeps 'unsafe-inline' so the Vite
// react-refresh preamble and injected styles keep working.
function applyContentSecurityPolicy() {
  const CSP = app.isPackaged
    ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*; frame-src http://localhost:* https://localhost:*; object-src 'none'; base-uri 'self'; form-action 'self'"
    : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*; frame-src http://localhost:* https://localhost:*; object-src 'none'; base-uri 'self'; form-action 'self'"

  session.defaultSession.webRequest.onHeadersReceived((details: Electron.OnHeadersReceivedListenerDetails, callback: (response: Electron.HeadersReceivedResponse) => void) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    })
  })
}

function createWindow(windowBounds?: WindowBounds | null) {
  const defaults = { width: 1280, height: 800, minWidth: 1024, minHeight: 600 }
  const bounds = windowBounds && Number.isFinite(windowBounds.width) && Number.isFinite(windowBounds.height)
    ? {
        width: Math.max(defaults.minWidth, Math.round(windowBounds.width)),
        height: Math.max(defaults.minHeight, Math.round(windowBounds.height)),
        x: Number.isFinite(windowBounds.x) ? Math.round(windowBounds.x as number) : undefined,
        y: Number.isFinite(windowBounds.y) ? Math.round(windowBounds.y as number) : undefined,
      }
    : { width: defaults.width, height: defaults.height }

  mainWindow = new BrowserWindow({
    ...bounds,
    title: APP_NAME,
    minWidth: defaults.minWidth,
    minHeight: defaults.minHeight,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../build/icon.png'),
  })

  if (windowBounds?.maximized) {
    mainWindow.maximize()
  }

  // Persist window bounds on move/resize
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const maximized = mainWindow.isMaximized()
    const normalBounds = mainWindow.getNormalBounds()
    storageManager.updateConfig({
      windowBounds: { x: normalBounds.x, y: normalBounds.y, width: normalBounds.width, height: normalBounds.height, maximized },
    }).catch(() => {})
  }
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)
  mainWindow.on('maximize', saveBounds)
  mainWindow.on('unmaximize', saveBounds)

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const trusted = app.isPackaged
      ? url === `file://${path.join(__dirname, '../dist-react/index.html').replace(/\\/g, '/')}`
      : url.startsWith('http://localhost:5173/')
    if (!trusted) event.preventDefault()
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (trayManager) trayManager.setWindow(mainWindow)

  // Load the app
  const isDev = !app.isPackaged
  if (isDev) {
    const devPort = Number(process.env.VITE_DEV_PORT) || 5173
    mainWindow.loadURL(`http://localhost:${devPort}`)
    if (process.env.GATRION_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools()
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-react/index.html'))
  }

  // Handle minimize to tray when user closes window
  mainWindow.on('close', async (event) => {
    if (!isQuitting) {
      try {
        const config = await storageManager.loadConfig()
        if (config && config.minimizeToTray) {
          event.preventDefault()
          mainWindow!.hide()
          return
        }
      } catch (err) {
        console.error('[App] Error reading config on close:', err)
      }
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function applyOSSettings(config: AppConfig) {
  if (!config) return
  if (typeof app.setLoginItemSettings === 'function') {
    try {
      app.setLoginItemSettings({
        openAtLogin: !!config.startOnBoot,
        path: app.getPath('exe')
      })
    } catch (err) {
      console.error('[App] Error setting login item settings:', err)
    }
  }
}

async function initialize() {
  applyContentSecurityPolicy()

  // Local crash dump collection: minidumps are written to
  // userData/crashDumps (never uploaded — uploadToServer: false). The
  // Settings "Crash Reports" card lists them for manual inspection.
  try {
    const crashDumpsDir = path.join(app.getPath('userData'), 'crashDumps')
    app.setPath('crashDumps', crashDumpsDir)
    crashReporter.start({
      productName: APP_NAME,
      companyName: 'DevLauncher',
      submitURL: 'https://example.invalid/crash',
      uploadToServer: false,
      compress: false,
    })
  } catch (error) {
    Logger.error('Crash', 'Failed to start crash reporter', { error: (error as Error).message })
  }

  // Create managers
  processManager = new ProcessManager()
  storageManager = new StorageManager()
  projectDetector = new ProjectDetector()
  healthManager = new HealthManager(app.getPath('userData'))
  await healthManager.init()

  // AI Agent (oh-my-pi)
  ompManager = new OmpManager(app.getPath('userData'))
  await ompManager.init()
  ompInstaller = new OmpInstaller(app.getPath('userData'))
  ompConfig = new OmpConfig()

  // Wait for storage to initialize
  await storageManager.init()

  // Start resource monitoring (every 5 seconds)
  processManager.startResourceMonitoring(5000)

  // Health analytics: crash history, run sessions, and daily resource trends
  processManager.on('status-change', (data: { projectId: string; status: string }) => {
    if (!healthManager || !data?.projectId) return
    if (data.status === 'error') {
      const info = processManager.getProcessStatus(data.projectId) || {}
      healthManager.recordCrash(data.projectId, { code: info.exitCode ?? null, message: 'Project exited unexpectedly' })
      healthManager.recordRunEnd(data.projectId, info.exitCode ?? null)
    } else if (data.status === 'running') {
      healthManager.recordRunStart(data.projectId)
    } else if (data.status === 'stopped') {
      const info = processManager.getProcessStatus(data.projectId) || {}
      healthManager.recordRunEnd(data.projectId, info.exitCode ?? null)
    }
  })
  processManager.on('resource-update', (data: { projectId: string; stats: { cpuPercent?: number; memoryMb?: number } }) => {
    if (!healthManager || !data?.projectId || !data?.stats) return
    healthManager.recordResource(data.projectId, data.stats.cpuPercent ?? 0, data.stats.memoryMb ?? 0)
  })

  // Set up log persistence directory
  const logsDir = path.join(app.getPath('userData'), 'logs')
  await fs.mkdir(logsDir, { recursive: true }).catch(() => {})
  processManager.setLogsDir(logsDir)

  // Apply auto-restart config
  const initialConfig = await storageManager.loadConfig()
  if (initialConfig?.autoRestart) {
    processManager.autoRestartConfig = initialConfig.autoRestart
  }

  // Create window
  createWindow(initialConfig?.windowBounds)

  // Auto-update (electron-updater) — packaged builds only. The state machine
  // forwards every transition to the renderer on the `update-state` channel so
  // the Settings banner can show download progress and a restart prompt.
  let autoUpdaterHandle: ReturnType<typeof setupAutoUpdater> | null = null
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdaterHandle = setupAutoUpdater({
      autoUpdater,
      getWindow: () => mainWindow,
      focusAppWindow,
      isPackaged: () => app.isPackaged,
      getVersion: () => app.getVersion(),
    })
  } catch (error) {
    console.warn('[App] Auto-update unavailable:', (error as Error).message)
  }

  // Create native tray
  trayManager = new TrayManager(mainWindow, processManager, storageManager)
  trayManager.init()

  // Global shortcut: summon/toggle the main window from anywhere (while
  // another app has focus). CommandOrControl maps to Cmd on macOS and Ctrl on
  // Windows/Linux.
  try {
    const registered = globalShortcut.register('CommandOrControl+Shift+Space', () => {
      if (!mainWindow) return
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    })
    if (!registered) {
      Logger.warn('Shortcut', 'Failed to register global shortcut CommandOrControl+Shift+Space')
    }
  } catch (error) {
    Logger.error('Shortcut', 'Failed to register global shortcut', { error: (error as Error).message })
  }

  // Embedded preview (WebContentsView) manager
  previewManager = new PreviewManager()
  previewManager.setWindow(mainWindow!)
  previewManager.setConsoleListener(({ projectId, level, message, source, line }) => {
    mainWindow?.webContents.send('preview-console-message', { projectId, level, message, source, line })
  })

  // Setup IPC handlers (process, project, desktop, terminal, preview, repo,
  // system, backup, agent) plus the core config/presets/health/update ones.
  setupProcessHandlers(processManager, storageManager, mainWindow)
  setupProjectHandlers(storageManager, processManager, mainWindow, ompManager)
  setupDesktopHandlers()
  setupTerminalHandlers(mainWindow)
  setupPreviewHandlers(previewManager)
  setupRepoHandlers(storageManager, processManager, mainWindow)
  setupSystemHandlers()
  setupBackupHandlers(storageManager, healthManager, mainWindow)
  setupAgentHandlers(ompManager, ompInstaller, ompConfig, () => mainWindow)
  registerCoreIpcHandlers({
    processManager,
    storageManager,
    healthManager,
    projectDetector,
    getWindow: () => mainWindow,
    getUpdater: () => autoUpdaterHandle,
    applyOSSettings,
  })

  // Native toasts for project lifecycle events (crash → restart action, start).
  setupProjectNotifications({
    processManager,
    storageManager,
    getWindow: () => mainWindow,
    focusAppWindow,
  }, trayManager)

  // Apply OS startup settings and auto-start projects
  await applyOSSettings(initialConfig)
  if (Number.isInteger(initialConfig?.terminal?.maxLines) && initialConfig.terminal.maxLines > 0) {
    processManager.maxLogLines = initialConfig.terminal.maxLines
  }
  if (initialConfig.autoStartProjects) {
    const projects = await storageManager.loadProjects()
    // Projects flagged for auto-start + every project belonging to an auto-start preset
    const presets = await storageManager.loadPresets().catch(() => [])
    const presetProjectIds = new Set(
      presets
        .filter((preset) => preset.autoStart)
        .flatMap((preset) => preset.projectIds || [])
    )
    const toStart = projects.filter(
      (item) => item.autoStart || presetProjectIds.has(item.id)
    )
    for (const project of toStart) {
      processManager.startProcess(
        project.id,
        project.path,
        project.commands || project.startCommand,
        Object.fromEntries(project.envVars.map((item) => [item.key, item.value])),
        project.port
      ).catch((error) => console.error(`[App] Failed to auto-start ${project.name}:`, error))
    }
  }
}

app.whenReady().then(async () => {
  // Another instance already holds the single-instance lock.
  if (!gotSingleInstanceLock) return

  try {
    await initialize()
  } catch (error) {
    console.error('[App] Initialization failed:', error)
    app.quit()
    return
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle app quit - stop all processes before exiting
app.on('before-quit', async (event) => {
  if (isQuitting) {
    return
  }

  isQuitting = true

  killAllTerminals()

  // Tear down embedded preview views
  if (previewManager) {
    previewManager.destroyAll()
  }

  // Stop resource monitoring first
  if (processManager && processManager.stopResourceMonitoring) {
    processManager.stopResourceMonitoring()
  }

  // Flush health analytics
  if (healthManager) {
    await healthManager.dispose()
  }

  // Kill any running omp RPC processes
  if (ompManager) {
    ompManager.killAll()
  }

  if (trayManager) {
    trayManager.destroy()
  }

  // Release the global shortcut so it does not linger after quit.
  try {
    globalShortcut.unregisterAll()
  } catch { /* already gone */ }

  if (processManager) {
    event.preventDefault()
    console.log('[App] Stopping all processes before quit...')

    try {
      await processManager.stopAllProcesses()
      await processManager.stopAllCustomCommands()
      console.log('[App] All processes stopped successfully')
    } catch (error) {
      console.error('[App] Error stopping processes on quit:', error)
    } finally {
      app.exit(0)
    }
  }
})
