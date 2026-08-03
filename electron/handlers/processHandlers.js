const { ipcMain } = require('electron')
const { envVarsToObject } = require('../projectSchema')
const { assertTrustedIpcEvent } = require('../utils/ipcSecurity')

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

  const loadPersistedProject = async (projectId) => {
    if (typeof projectId !== 'string' || !projectId.trim()) {
      throw new Error('Project ID is required')
    }

    const projects = await storageManager.loadProjects()
    const project = projects.find((item) => item.id === projectId)
    if (!project) throw new Error(`Project ${projectId} not found`)
    return project
  }

  const secureHandle = (channel, handler) => ipcMain.handle(channel, async (event, ...args) => {
    try {
      assertTrustedIpcEvent(event)
      return await handler(event, ...args)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Listen for process status-change events and forward to renderer
  if (processManager && typeof processManager.on === 'function') {
    processManager.on('status-change', (data) => {
      safeSend('process-status', data.projectId, processManager.getProcessStatus(data.projectId))
    })
  }

  // Start a project
  secureHandle('start-project', async (event, projectId) => {
    try {
      const project = await loadPersistedProject(projectId)
      const result = await processManager.startProcess(
        project.id,
        project.path,
        project.commands || project.startCommand,
        envVarsToObject(project.envVars),
        project.port,
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
      safeSend('process-status', project.id, processManager.getProcessStatus(project.id))

      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Stop a project
  secureHandle('stop-project', async (event, projectId, force = false) => {
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
  secureHandle('restart-project', async (event, projectId) => {
    try {
      const project = await loadPersistedProject(projectId)
      const result = await processManager.restartProcess(
        project.id,
        project.path,
        project.commands || project.startCommand,
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

      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get process status
  secureHandle('get-process-status', async (event, projectId) => {
    return processManager.getProcessStatus(projectId)
  })

  // Check port conflict
  secureHandle('check-port-conflict', async (event, port) => {
    return processManager.findPortOwner(port)
  })

  // Get process metrics (uptime, memory MB)
  secureHandle('get-process-metrics', async (event, projectId) => {
    return processManager.getProcessMetrics(projectId)
  })

  // Get logs
  secureHandle('get-logs', async (event, projectId, limit = 1000) => {
    return processManager.getLogs(projectId, limit)
  })

  // Clear logs
  secureHandle('clear-logs', async (event, projectId) => {
    processManager.clearLogs(projectId)
    return { success: true }
  })

  // Start all projects
  secureHandle('start-all-projects', async () => {
    const projectList = await storageManager.loadProjects()

    const results = []
    for (const project of projectList) {
      try {
        const cmd = project.commands || project.startCommand
        if (!cmd || (Array.isArray(cmd) && cmd.length === 0)) {
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
  secureHandle('stop-all-projects', async (event) => {
    try {
      await processManager.stopAllProcesses()
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

module.exports = { setupProcessHandlers }
