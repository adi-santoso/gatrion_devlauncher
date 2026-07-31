const { app, BrowserWindow, ipcMain, Notification } = require('electron')
const path = require('path')
const ProcessManager = require('./managers/ProcessManager')
const StorageManager = require('./managers/StorageManager')
const ProjectDetector = require('./managers/ProjectDetector')
const TrayManager = require('./managers/TrayManager')
const { setupProcessHandlers } = require('./handlers/processHandlers')
const { setupProjectHandlers } = require('./handlers/projectHandlers')
const { setupDesktopHandlers } = require('./handlers/desktopHandlers')

let mainWindow
let processManager
let storageManager
let projectDetector
let trayManager
let isQuitting = false

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../build/icon.png'),
  })

  // Load the app
  const isDev = !app.isPackaged
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
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
  // Create managers
  processManager = new ProcessManager()
  storageManager = new StorageManager()
  projectDetector = new ProjectDetector()

  // Wait for storage to initialize
  await storageManager.init()

  // Start resource monitoring (every 5 seconds)
  processManager.startResourceMonitoring(5000)

  // Create window
  createWindow()

  // Create native tray
  trayManager = new TrayManager(mainWindow, processManager, storageManager)
  trayManager.init()

  // Setup IPC handlers
  setupProcessHandlers(processManager, storageManager, mainWindow)
  setupProjectHandlers(storageManager, processManager, mainWindow)
  setupDesktopHandlers()

  // Listen to process events for native notifications & tray updates
  processManager.on('status-change', (data) => {
    trayManager.updateContextMenu()
    if (data.status === 'error' && Notification.isSupported()) {
      new Notification({
        title: 'DevLauncher - Project Crash',
        body: `Project "${data.projectId}" encountered an error.`
      }).show()
    }
  })

  // Apply OS startup settings
  const config = await storageManager.loadConfig()
  await applyOSSettings(config)

  // Setup config handler
  ipcMain.handle('get-config', async () => {
    const currentConfig = await storageManager.loadConfig()
    return { success: true, config: currentConfig }
  })

  ipcMain.handle('update-config', async (event, updates) => {
    try {
      const updatedConfig = await storageManager.updateConfig(updates)
      await applyOSSettings(updatedConfig)
      return { success: true, config: updatedConfig }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Setup project detection handler
  ipcMain.handle('detect-project-type', async (event, projectPath) => {
    try {
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
      console.log('[App] All processes stopped successfully')
    } catch (error) {
      console.error('[App] Error stopping processes on quit:', error)
    } finally {
      app.exit(0)
    }
  }
})
