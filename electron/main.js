// @ts-check
const { app, BrowserWindow, ipcMain, Notification, session, globalShortcut } = require('electron')
const path = require('path')
const fs = require('fs').promises
const https = require('https')
const ProcessManager = require('./managers/ProcessManager')
const StorageManager = require('./managers/StorageManager')
const HealthManager = require('./managers/HealthManager')
const OmpManager = require('./managers/OmpManager')
const OmpInstaller = require('./managers/OmpInstaller')
const OmpConfig = require('./managers/OmpConfig')
const ProjectDetector = require('./managers/ProjectDetector')
const TrayManager = require('./managers/TrayManager')
const PreviewManager = require('./managers/PreviewManager')
const { setupProcessHandlers } = require('./handlers/processHandlers')
const { setupProjectHandlers } = require('./handlers/projectHandlers')
const { setupDesktopHandlers } = require('./handlers/desktopHandlers')
const { setupTerminalHandlers, killAllTerminals } = require('./handlers/terminalHandlers')
const { setupPreviewHandlers } = require('./handlers/previewHandlers')
const { setupRepoHandlers } = require('./handlers/repoHandlers')
const { setupSystemHandlers } = require('./handlers/systemHandlers')
const { setupAgentHandlers } = require('./handlers/agentHandlers')
const { assertTrustedIpcEvent } = require('./utils/ipcSecurity')
const { isVersionNewer } = require('./utils/versionCompare')
const { createUpdater } = require('./utils/updater')
const Logger = require('./utils/logger')

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

let mainWindow
let processManager
let storageManager
let projectDetector
let trayManager
let previewManager
let healthManager
let ompManager
let ompInstaller
let ompConfig
let isQuitting = false

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

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    })
  })
}

function createWindow(windowBounds) {
  const defaults = { width: 1280, height: 800, minWidth: 1024, minHeight: 600 }
  const bounds = windowBounds && Number.isFinite(windowBounds.width) && Number.isFinite(windowBounds.height)
    ? {
        width: Math.max(defaults.minWidth, Math.round(windowBounds.width)),
        height: Math.max(defaults.minHeight, Math.round(windowBounds.height)),
        x: Number.isFinite(windowBounds.x) ? Math.round(windowBounds.x) : undefined,
        y: Number.isFinite(windowBounds.y) ? Math.round(windowBounds.y) : undefined,
      }
    : { width: defaults.width, height: defaults.height }

  mainWindow = new BrowserWindow({
    ...bounds,
    title: APP_NAME,
    minWidth: defaults.minWidth,
    minHeight: defaults.minHeight,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
          mainWindow.hide()
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

async function applyOSSettings(config) {
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
  processManager.on('status-change', (data) => {
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
  processManager.on('resource-update', (data) => {
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
  let autoUpdaterHandle = null
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdaterHandle = createUpdater({
      autoUpdater,
      getWindow: () => mainWindow,
      isEnabled: () => app.isPackaged,
    })
    autoUpdaterHandle.wireEvents()
    autoUpdaterHandle.onChange((payload) => {
      Logger.info('Updater', 'State changed', { state: payload.state, error: payload.error || undefined })
    })
  } catch (error) {
    console.warn('[App] Auto-update unavailable:', error.message)
  }

  ipcMain.handle('update-download', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      if (!autoUpdaterHandle) return { success: false, error: 'Auto-update is unavailable' }
      return await autoUpdaterHandle.startDownload()
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('update-install', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      if (!autoUpdaterHandle) return { success: false, error: 'Auto-update is unavailable' }
      return autoUpdaterHandle.quitAndInstall()
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Silent check shortly after launch (packaged only) so a ready update can be
  // surfaced in the Settings banner / notification without user action.
  if (app.isPackaged && autoUpdaterHandle) {
    setTimeout(() => {
      autoUpdaterHandle.check().catch(() => {})
    }, 8000)
  }

    // Prayer reminder: native notifications + city geocoding (renderer CSP blocks external fetch)
  function setupPrayerHandlers() {
    ipcMain.handle('app-notify', (event, payload = {}) => {
      try {
        assertTrustedIpcEvent(event)
        if (!Notification.isSupported()) return { success: false, error: 'Notifications are not supported on this system' }
        new Notification({
          title: String(payload.title || 'Gatrion'),
          body: String(payload.body || ''),
          silent: !!payload.silent,
        }).show()
        return { success: true }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })

    ipcMain.handle('prayer-geocode', async (event, query) => {
      try {
        assertTrustedIpcEvent(event)
        const q = String(query || '').trim()
        if (!q) return { success: false, error: 'Query is empty' }
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`
        const body = await new Promise((resolve, reject) => {
          const req = https.get(url, {
            headers: { 'User-Agent': 'Gatrion/1.0 (desktop project manager)', 'Accept': 'application/json' },
          }, (res) => {
            let data = ''
            res.on('data', (chunk) => { data += chunk })
            res.on('end', () => resolve(data))
          })
          req.setTimeout(10000, () => req.destroy(new Error('Geocoding request timed out')))
          req.on('error', reject)
        })
        const parsed = JSON.parse(body)
        if (!Array.isArray(parsed)) return { success: false, error: 'Unexpected geocoding response' }
        const results = parsed
          .map((item) => ({
            name: item.display_name || item.name || 'Unknown',
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon),
          }))
          .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
        return { success: true, results }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })
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
    Logger.error('Shortcut', 'Failed to register global shortcut', { error: error.message })
  }

  // Embedded preview (WebContentsView) manager
  previewManager = new PreviewManager()
  previewManager.setWindow(mainWindow)
  previewManager.setConsoleListener(({ projectId, level, message, source, line }) => {
    mainWindow?.webContents.send('preview-console-message', { projectId, level, message, source, line })
  })

  // Renderer errors (window.onerror / unhandledrejection) land in main.log
  ipcMain.handle('renderer-error', async (event, payload = {}) => {
    try {
      assertTrustedIpcEvent(event)
      const meta = typeof payload === 'object' && payload !== null ? payload : {}
      Logger.error('renderer', String(meta.message || 'Unknown renderer error'), {
        type: String(meta.type || ''),
        source: String(meta.source || ''),
        line: Number.isFinite(meta.line) ? meta.line : undefined,
        column: Number.isFinite(meta.column) ? meta.column : undefined,
        stack: String(meta.stack || '').slice(0, 2000),
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Setup IPC handlers
  setupProcessHandlers(processManager, storageManager, mainWindow)
  setupProjectHandlers(storageManager, processManager, mainWindow)
  setupDesktopHandlers()
  setupTerminalHandlers(mainWindow)
  setupPreviewHandlers(previewManager)
  setupRepoHandlers(storageManager, processManager, mainWindow)
  setupSystemHandlers()
  setupAgentHandlers(ompManager, ompInstaller, ompConfig, () => mainWindow)
  setupPrayerHandlers()

  // Health analytics IPC
  ipcMain.handle('get-health', async (event, projectId) => {
    try {
      assertTrustedIpcEvent(event)
      if (typeof projectId !== 'string' || !projectId.trim()) throw new Error('Project ID is required')
      return { success: true, stats: healthManager.getStats(projectId) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('clear-health', async (event, projectId) => {
    try {
      assertTrustedIpcEvent(event)
      if (typeof projectId !== 'string' || !projectId.trim()) throw new Error('Project ID is required')
      healthManager.clear(projectId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Listen to process events for native notifications & tray updates
  processManager.on('status-change', async (data) => {
    trayManager.updateContextMenu()
    const currentConfig = await storageManager.loadConfig().catch(() => null)
    const notifications = currentConfig?.notifications || {}
    if (!Notification.isSupported()) return

    const projects = await storageManager.loadProjects().catch(() => [])
    const projectName = projects.find((p) => p.id === data.projectId)?.name || data.projectId

    if (data.status === 'error' && notifications.onError) {
      new Notification({
        title: 'Gatrion - Project Crash',
        body: `Project "${projectName}" encountered an error.`,
        silent: !notifications.sound
      }).show()
    } else if (data.status === 'running' && notifications.onStart) {
      new Notification({
        title: 'Gatrion - Project Started',
        body: `Project "${projectName}" is now running.`,
        silent: !notifications.sound
      }).show()
    }
  })

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

  // Workspace presets
  ipcMain.handle('get-presets', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      return { success: true, presets: await storageManager.loadPresets() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('save-presets', async (event, presets) => {
    try {
      assertTrustedIpcEvent(event)
      const saved = await storageManager.savePresets(presets)
      return { success: true, presets: saved }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Setup config handler
  ipcMain.handle('get-config', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      const currentConfig = await storageManager.loadConfig()
      return { success: true, config: currentConfig }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('update-config', async (event, updates) => {
    try {
      assertTrustedIpcEvent(event)
      const updatedConfig = await storageManager.updateConfig(updates)
      await applyOSSettings(updatedConfig)
      if (Number.isInteger(updatedConfig?.terminal?.maxLines) && updatedConfig.terminal.maxLines > 0) {
        processManager.maxLogLines = updatedConfig.terminal.maxLines
      }
      if (updatedConfig?.autoRestart) {
        processManager.autoRestartConfig = updatedConfig.autoRestart
      }
      return { success: true, config: updatedConfig }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Activity feed persistence
  ipcMain.handle('get-activities', async (event) => {    try {
      assertTrustedIpcEvent(event)
      const activities = await storageManager.loadActivities()
      return { success: true, activities }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('append-activities', async (event, entries) => {
    try {
      assertTrustedIpcEvent(event)
      const activities = await storageManager.appendActivities(entries)
      return { success: true, activities }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Update checker — compare the running version against the latest GitHub release
  ipcMain.handle('check-update', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      const url = 'https://api.github.com/repos/adi-santoso/gatrion_devlauncher/releases/latest'
      const body = await new Promise((resolve, reject) => {
        const req = https.get(url, {
          headers: { 'User-Agent': 'Gatrion/1.0 (desktop project manager)', 'Accept': 'application/vnd.github+json' },
          timeout: 10000,
        }, (res) => {
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => resolve(data))
        })
        req.on('error', reject)
        req.on('timeout', () => req.destroy(new Error('Update check timed out')))
      })
      const parsed = JSON.parse(body)
      const latest = String(parsed.tag_name || '').replace(/^v/, '')
      const current = app.getVersion()
      // Numeric compare (not string !==) so 1.0.10 > 1.0.9 and an older
      // release is never advertised as an available update.
      const updateAvailable = Boolean(latest) && isVersionNewer(latest, current)
      return {
        success: true,
        current,
        latest: latest || null,
        updateAvailable,
        url: String(parsed.html_url || 'https://github.com/adi-santoso/gatrion_devlauncher/releases'),
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Setup project detection handler
  ipcMain.handle('detect-project-type', async (event, projectPath) => {
    try {
      assertTrustedIpcEvent(event)
      const result = await projectDetector.detectProjectType(projectPath)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
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
