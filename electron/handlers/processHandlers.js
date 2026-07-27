const { ipcMain } = require('electron')
const { envVarsToObject } = require('../projectSchema')

/**
 * Setup process-related IPC handlers
 * @param {ProcessManager} processManager - ProcessManager instance
 * @param {StorageManager} storageManager - StorageManager instance
 * @param {BrowserWindow} mainWindow - Main window instance
 */
function setupProcessHandlers(processManager, storageManager, mainWindow) {
  // Helper to safely send to renderer (skip if window is destroyed or app is quitting)
  const safeSend = (channel, ...args) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(channel, ...args)
      }
    } catch (error) {
      // Silently ignore if window is destroyed during app quit
      console.log(`[processHandlers] Skipping ${channel} - window unavailable`)
    }
  }

  // Listen for process status-change events and forward to renderer
  if (processManager && typeof processManager.on === 'function') {
    processManager.on('status-change', (data) => {
      safeSend('process-status', data.projectId, processManager.getProcessStatus(data.projectId))
    })
  }

  // Start a project
  ipcMain.handle('start-project', async (event, projectId, projectPath, command, env = {}, port = null) => {
    try {
      const result = await processManager.startProcess(
        projectId,
        projectPath,
        command,
        env,
        port,
        // onLog callback
        (projectId, log) => {
          safeSend('process-log', projectId, log)
        },
        // onExit callback
        (projectId, code, signal) => {
          safeSend('process-exit', projectId, code, signal)
          safeSend('process-status', projectId, processManager.getProcessStatus(projectId))
        },
        // onError callback
        (projectId, error) => {
          safeSend('process-error', projectId, error.message)
          safeSend('process-status', projectId, processManager.getProcessStatus(projectId))
        },
        (projectId) => {
          safeSend('process-status', projectId, processManager.getProcessStatus(projectId))
        }
      )

      // Send initial status
      safeSend('process-status', projectId, processManager.getProcessStatus(projectId))

      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Stop a project
  ipcMain.handle('stop-project', async (event, projectId, force = false) => {
    try {
      const stopPromise = processManager.stopProcess(projectId, force)
      safeSend('process-status', projectId, processManager.getProcessStatus(projectId))
      const result = await stopPromise
      safeSend('process-status', projectId, processManager.getProcessStatus(projectId))
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Restart a project
  ipcMain.handle('restart-project', async (event, projectId, projectPath, command, env = {}, port = null) => {
    try {
      const result = await processManager.restartProcess(
        projectId,
        projectPath,
        command,
        env,
        port,
        (projectId, log) => {
          safeSend('process-log', projectId, log)
        },
        (projectId, code, signal) => {
          safeSend('process-exit', projectId, code, signal)
          safeSend('process-status', projectId, processManager.getProcessStatus(projectId))
        },
        (projectId, error) => {
          safeSend('process-error', projectId, error.message)
          safeSend('process-status', projectId, processManager.getProcessStatus(projectId))
        },
        (projectId) => {
          safeSend('process-status', projectId, processManager.getProcessStatus(projectId))
        }
      )

      safeSend('process-status', projectId, processManager.getProcessStatus(projectId))

      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get process status
  ipcMain.handle('get-process-status', async (event, projectId) => {
    return processManager.getProcessStatus(projectId)
  })

  // Check port conflict
  ipcMain.handle('check-port-conflict', async (event, port) => {
    return processManager.findPortOwner(port)
  })

  // Get process metrics (uptime, memory MB)
  ipcMain.handle('get-process-metrics', async (event, projectId) => {
    return processManager.getProcessMetrics(projectId)
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

  // Start all projects
  ipcMain.handle('start-all-projects', async (event, projects) => {
    let projectList = projects
    if ((!projectList || !Array.isArray(projectList)) && storageManager) {
      projectList = await storageManager.loadProjects()
    }
    projectList = projectList || []

    const results = []
    for (const project of projectList) {
      try {
        const cmd = project.startCommand
        if (!cmd) {
          results.push({ projectId: project.id, success: false, error: 'Start command is missing' })
          continue
        }
        const result = await processManager.startProcess(
          project.id,
          project.path,
          cmd,
          envVarsToObject(project.envVars),
          project.port,
          (projectId, log) => {
            safeSend('process-log', projectId, log)
          },
          (projectId, code, signal) => {
            safeSend('process-exit', projectId, code, signal)
            safeSend('process-status', projectId, processManager.getProcessStatus(projectId))
          },
          (projectId, error) => {
            safeSend('process-error', projectId, error.message)
            safeSend('process-status', projectId, processManager.getProcessStatus(projectId))
          },
          (projectId) => {
            safeSend('process-status', projectId, processManager.getProcessStatus(projectId))
          }
        )
        safeSend('process-status', project.id, processManager.getProcessStatus(project.id))
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
