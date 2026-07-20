const { ipcMain } = require('electron')

/**
 * Setup process-related IPC handlers
 * @param {ProcessManager} processManager - ProcessManager instance
 * @param {BrowserWindow} mainWindow - Main window instance
 */
function setupProcessHandlers(processManager, mainWindow) {
  // Start a project
  ipcMain.handle('start-project', async (event, projectId, projectPath, command, env = {}) => {
    try {
      const result = processManager.startProcess(
        projectId,
        projectPath,
        command,
        env,
        // onLog callback
        (projectId, logLine, type) => {
          mainWindow.webContents.send('process-log', projectId, {
            timestamp: new Date().toISOString(),
            type,
            message: logLine,
          })
        },
        // onExit callback
        (projectId, code, signal) => {
          mainWindow.webContents.send('process-exit', projectId, code, signal)
          mainWindow.webContents.send('process-status', projectId, processManager.getProcessStatus(projectId))
        },
        // onError callback
        (projectId, error) => {
          mainWindow.webContents.send('process-error', projectId, error.message)
          mainWindow.webContents.send('process-status', projectId, processManager.getProcessStatus(projectId))
        }
      )

      // Send initial status
      mainWindow.webContents.send('process-status', projectId, processManager.getProcessStatus(projectId))

      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Stop a project
  ipcMain.handle('stop-project', async (event, projectId, force = false) => {
    try {
      const result = await processManager.stopProcess(projectId, force)
      mainWindow.webContents.send('process-status', projectId, processManager.getProcessStatus(projectId))
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Restart a project
  ipcMain.handle('restart-project', async (event, projectId, projectPath, command, env = {}) => {
    try {
      const result = await processManager.restartProcess(
        projectId,
        projectPath,
        command,
        env,
        (projectId, logLine, type) => {
          mainWindow.webContents.send('process-log', projectId, {
            timestamp: new Date().toISOString(),
            type,
            message: logLine,
          })
        },
        (projectId, code, signal) => {
          mainWindow.webContents.send('process-exit', projectId, code, signal)
          mainWindow.webContents.send('process-status', projectId, processManager.getProcessStatus(projectId))
        },
        (projectId, error) => {
          mainWindow.webContents.send('process-error', projectId, error.message)
          mainWindow.webContents.send('process-status', projectId, processManager.getProcessStatus(projectId))
        }
      )

      mainWindow.webContents.send('process-status', projectId, processManager.getProcessStatus(projectId))

      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get process status
  ipcMain.handle('get-process-status', async (event, projectId) => {
    return processManager.getProcessStatus(projectId)
  })

  // Get logs
  ipcMain.handle('get-logs', async (event, projectId, limit = 1000) => {
    return processManager.getLogs(projectId, limit)
  })

  // Clear logs
  ipcMain.handle('clear-logs', async (event, projectId) => {
    processManager.clearLogs(projectId)
    return { success: true }
  })

  // Start all projects (will be called from project handlers)
  ipcMain.handle('start-all-projects', async (event, projects) => {
    const results = []
    for (const project of projects) {
      try {
        const result = processManager.startProcess(
          project.id,
          project.path,
          project.command,
          project.env || {},
          (projectId, logLine, type) => {
            mainWindow.webContents.send('process-log', projectId, {
              timestamp: new Date().toISOString(),
              type,
              message: logLine,
            })
          },
          (projectId, code, signal) => {
            mainWindow.webContents.send('process-exit', projectId, code, signal)
            mainWindow.webContents.send('process-status', projectId, processManager.getProcessStatus(projectId))
          },
          (projectId, error) => {
            mainWindow.webContents.send('process-error', projectId, error.message)
            mainWindow.webContents.send('process-status', projectId, processManager.getProcessStatus(projectId))
          }
        )
        mainWindow.webContents.send('process-status', project.id, processManager.getProcessStatus(project.id))
        results.push({ projectId: project.id, success: true, ...result })
      } catch (error) {
        results.push({ projectId: project.id, success: false, error: error.message })
      }
    }
    return results
  })

  // Stop all projects
  ipcMain.handle('stop-all-projects', async (event) => {
    try {
      await processManager.stopAllProcesses()
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

module.exports = { setupProcessHandlers }
