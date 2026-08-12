const { app, BrowserWindow, ipcMain, Notification, session } = require('electron')
const path = require('path')
const fs = require('fs').promises
const ProcessManager = require('./managers/ProcessManager')
const StorageManager = require('./managers/StorageManager')
const ProjectDetector = require('./managers/ProjectDetector')
const TrayManager = require('./managers/TrayManager')
const PreviewManager = require('./managers/PreviewManager')
const { setupProcessHandlers } = require('./handlers/processHandlers')
const { setupProjectHandlers } = require('./handlers/projectHandlers')
const { setupDesktopHandlers } = require('./handlers/desktopHandlers')
const { setupTerminalHandlers, killAllTerminals } = require('./handlers/terminalHandlers')
const { setupPreviewHandlers } = require('./handlers/previewHandlers')
const { assertTrustedIpcEvent } = require('./utils/ipcSecurity')

let mainWindow
let processManager
let storageManager
let projectDetector
let trayManager
let previewManager
let isQuitting = false

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

  // Wait for storage to initialize
  await storageManager.init()

  // Start resource monitoring (every 5 seconds)
  processManager.startResourceMonitoring(5000)

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

  // Create native tray
  trayManager = new TrayManager(mainWindow, processManager, storageManager)
  trayManager.init()

  // Embedded preview (WebContentsView) manager
  previewManager = new PreviewManager()
  previewManager.setWindow(mainWindow)
  previewManager.setConsoleListener(({ projectId, level, message, source, line }) => {
    mainWindow?.webContents.send('preview-console-message', { projectId, level, message, source, line })
  })

  // Setup IPC handlers
  setupProcessHandlers(processManager, storageManager, mainWindow)
  setupProjectHandlers(storageManager, processManager, mainWindow)
  setupDesktopHandlers()
  setupTerminalHandlers(mainWindow)
  setupPreviewHandlers(previewManager)

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

  if (trayManager) {
    trayManager.destroy()
  }

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
