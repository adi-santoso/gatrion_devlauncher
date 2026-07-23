const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const ProcessManager = require('./managers/ProcessManager')
const StorageManager = require('./managers/StorageManager')
const ProjectDetector = require('./managers/ProjectDetector')
const { setupProcessHandlers } = require('./handlers/processHandlers')
const { setupProjectHandlers } = require('./handlers/projectHandlers')

let mainWindow
let processManager
let storageManager
let projectDetector
let isQuitting = false // Track if app is in quitting process

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

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function initialize() {
  // Create managers
  processManager = new ProcessManager()
  storageManager = new StorageManager()
  projectDetector = new ProjectDetector()

  // Wait for storage to initialize
  await storageManager.init()

  // Create window
  createWindow()

  // Setup IPC handlers
  setupProcessHandlers(processManager, storageManager, mainWindow)
  setupProjectHandlers(storageManager, processManager, mainWindow)

  // Setup config handler
  ipcMain.handle('get-config', async () => {
    const config = await storageManager.loadConfig()
    return { success: true, config }
  })

  ipcMain.handle('update-config', async (event, updates) => {
    try {
      const config = await storageManager.updateConfig(updates)
      return { success: true, config }
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
  // On macOS, keep app running until user explicitly quits
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle app quit - stop all processes before exiting
app.on('before-quit', async (event) => {
  if (isQuitting) {
    return // Already in quitting process, don't prevent
  }

  if (processManager) {
    event.preventDefault() // Prevent quit until processes are stopped
    isQuitting = true

    console.log('[App] Stopping all processes before quit...')

    try {
      await processManager.stopAllProcesses()
      console.log('[App] All processes stopped successfully')
    } catch (error) {
      console.error('[App] Error stopping processes on quit:', error)
    } finally {
      // Force quit after cleanup
      app.exit(0)
    }
  } else {
    isQuitting = true
  }
})
