const { ipcMain } = require('electron')
const { envVarsToObject } = require('../projectSchema')
const { assertTrustedIpcEvent } = require('../utils/ipcSecurity')

const portArguments = /(?:^|\s)(?:--port(?:=|\s+)|-p\s+)\d+\b/i
const artisanServe = /(?:^|[\\/])artisan\s+serve\b/i
const phpArtisanServe = /\bphp(?:\.exe)?\s+(?:-[a-zA-Z]\S*\s+)*artisan\s+serve\b/i
const npmRunScript = /^npm\s+run\s+([A-Za-z0-9:_-]+)\s*$/i
const packageManagerScript = /^(pnpm|yarn|bun)\s+([A-Za-z0-9:_-]+)\s*$/i

function withRequestedPort(command, port) {
  if (typeof command !== 'string' || !Number.isInteger(port) || portArguments.test(command)) return command
  const trimmed = command.trim()
  if (phpArtisanServe.test(trimmed) || artisanServe.test(trimmed)) return `${trimmed} --port=${port}`

  const npmScript = trimmed.match(npmRunScript)
  if (npmScript) return `npm run ${npmScript[1]} -- --port=${port}`

  const managedScript = trimmed.match(packageManagerScript)
  if (managedScript) return `${managedScript[1]} ${managedScript[2]} --port=${port}`

  return command
}

function resolveLaunchConfig(project) {
  const requestedPort = Number.isInteger(project?.port) ? project.port : null
  const source = project?.commands || project?.startCommand
  if (!Array.isArray(source)) {
    return {
      command: typeof source === 'string' ? withRequestedPort(source, requestedPort) : source,
      port: requestedPort,
    }
  }

  const commands = source.map((item) => {
    const port = Number.isInteger(item?.port) ? item.port : null
    return { ...item, command: withRequestedPort(item?.command, port), port }
  })
  const primary = commands.find((item) => item.primary) || commands[0]
  if (primary) {
    const primaryPort = requestedPort ?? primary.port ?? null
    primary.command = withRequestedPort(primary.command, primaryPort)
    primary.port = primaryPort
  }

  return { command: commands, port: primary?.port ?? requestedPort }
}

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
      const launch = resolveLaunchConfig(project)
      const result = await processManager.startProcess(
        project.id,
        project.path,
        launch.command,
        envVarsToObject(project.envVars),
        launch.port,
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
      const launch = resolveLaunchConfig(project)
      const result = await processManager.restartProcess(
        project.id,
        project.path,
        launch.command,
        envVarsToObject(project.envVars),
        launch.port,
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
  secureHandle('start-all-projects', async (event, projectIds) => {
    const projectList = await storageManager.loadProjects()
    const requestedIds = projectIds === undefined
      ? null
      : new Set(Array.isArray(projectIds) ? projectIds.filter((id) => typeof id === 'string') : [])
    const projectsToStart = requestedIds
      ? projectList.filter((project) => requestedIds.has(project.id))
      : projectList

    const results = []
    for (const project of projectsToStart) {
      try {
        const launch = resolveLaunchConfig(project)
        const cmd = launch.command
        if (!cmd || (Array.isArray(cmd) && cmd.length === 0)) {
          results.push({ projectId: project.id, success: false, error: 'Start command is missing' })
          continue
        }
        const result = await processManager.startProcess(
          project.id,
          project.path,
          cmd,
          envVarsToObject(project.envVars),
          launch.port,
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
      const results = await processManager.stopAllProcesses()
      return results
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

module.exports = { setupProcessHandlers, resolveLaunchConfig, withRequestedPort }
