import type { BrowserWindow } from 'electron'
import type { Project } from '../../src/types/shared'
import type { ProcessManager } from '../managers/ProcessManager'
import type { StorageManager } from '../managers/StorageManager'

const { ipcMain } = require('electron') as typeof import('electron')
import { envVarsToObject } from '../projectSchema'
import { assertTrustedIpcEvent } from '../utils/ipcSecurity'
import { safeHandle } from '../utils/ipcValidation'
import { collectDependencies, waitForDependency } from '../utils/dependencyReadiness'
import { resolveLaunchConfig, withRequestedPort } from '../utils/launchConfig'

function topologicalSort(projects: Project[]) {
  const projectMap = new Map(projects.map((p) => [p.id, p]))
  const visited = new Set()
  const result: Project[] = []

  const visit = (project: Project | undefined, path: Set<string>) => {
    if (!project || visited.has(project.id)) return
    visited.add(project.id)
    const deps = Array.isArray(project.dependsOn) ? project.dependsOn : []
    for (const depId of deps) {
      if (path.has(depId)) continue
      const dep = projectMap.get(depId)
      if (dep) visit(dep, new Set([...path, project.id]))
    }
    result.push(project)
  }

  for (const project of projects) visit(project, new Set())
  return result
}

/**
 * Setup process-related IPC handlers
 * @param {import('../managers/ProcessManager')} processManager - ProcessManager instance
 * @param {import('../managers/StorageManager')} storageManager - StorageManager instance
 * @param {import('electron').BrowserWindow} mainWindow - Main window instance
 */
function setupProcessHandlers(processManager: ProcessManager, storageManager: StorageManager, mainWindow: BrowserWindow | null) {
  // Helper to safely send to renderer (skip if window is destroyed or app is quitting)
  const safeSend = (channel: string, ...args: unknown[]) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(channel, ...args)
      }
    } catch (error) {
      // Silently ignore if window is destroyed during app quit
      console.log(`[processHandlers] Skipping ${channel} - window unavailable`)
    }
  }

  const loadPersistedProject = async (projectId: unknown): Promise<Project> => {
    if (typeof projectId !== 'string' || !projectId.trim()) {
      throw new Error('Project ID is required')
    }

    const projects = await storageManager.loadProjects()
    const project = projects.find((item) => item.id === projectId)
    if (!project) throw new Error(`Project ${projectId} not found`)
    return project
  }

  const secureHandle = (channel: string, handler: import('../utils/ipcValidation').IpcHandler) => safeHandle(ipcMain, assertTrustedIpcEvent, channel, handler)

  // Listen for process status-change events and forward to renderer
  if (processManager && typeof processManager.on === 'function') {
    processManager.on('status-change', (data: { projectId: string }) => {
      safeSend('process-status', data.projectId, processManager.getProcessStatus(data.projectId))
    })
  }

  // Start a single project with the standard status/log callbacks wired up.
  const startOne = (project: Project) => {
    const launch = resolveLaunchConfig(project)
    return processManager.startProcess(
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
  }

  const ensureDependencies = async (project: Project, all: Project[]) => {
    const started: string[] = []
    for (const dep of collectDependencies(project, all)) {
      const status = processManager.getProcessStatus(dep.id).status.toLowerCase()
      if (status !== 'running' && status !== 'starting') { await startOne(dep); started.push(dep.id) }
      await waitForDependency(dep, id => processManager.getProcessStatus(id))
    }
    return started
  }

  // Start a project. If it depends on other projects, those are started first
  // (transitively), matching the Start-all behavior — but only when they are
  // not already running/starting.
  secureHandle('start-project', async (_event, projectId) => {
    try {
      const project = await loadPersistedProject(projectId)
      const allProjects = await storageManager.loadProjects()
      const startedDependencies = await ensureDependencies(project, allProjects)
      const result = await startOne(project)

      // Send initial status
      safeSend('process-status', project.id, processManager.getProcessStatus(project.id))

      return { ...result, success: true, startedDependencies }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Stop a project
  secureHandle('stop-project', async (_event, projectId, force = false) => {
    try {
      const stopPromise = processManager.stopProcess(projectId, force)
      safeSend('process-status', projectId, processManager.getProcessStatus(projectId))
      const result = await stopPromise
      safeSend('process-status', projectId, processManager.getProcessStatus(projectId))
      return { ...result, success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Restart a project
  secureHandle('restart-project', async (_event, projectId) => {
    try {
      const project = await loadPersistedProject(projectId)
      await ensureDependencies(project, await storageManager.loadProjects())
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

      return { ...result, success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Get process status
  secureHandle('get-process-status', async (_event, projectId) => {
    return processManager.getProcessStatus(projectId)
  })

  // Check port conflict
  secureHandle('check-port-conflict', async (_event, port) => {
    return processManager.findPortOwner(port)
  })

  // Get process metrics (uptime, memory MB)
  secureHandle('get-process-metrics', async (_event, projectId) => {
    return processManager.getProcessMetrics(projectId)
  })

  // Get logs
  secureHandle('get-logs', async (_event, projectId, limit = 1000) => {
    return processManager.getLogs(projectId, limit)
  })

  // Clear logs
  secureHandle('clear-logs', async (_event, projectId) => {
    processManager.clearLogs(projectId)
    return { success: true }
  })

  // Start all projects (topologically sorted by dependsOn).
  // options.delayMs (0-60000) staggers each start so dependencies (e.g. a DB)
  // get time to boot before the next project in the batch is launched.
  secureHandle('start-all-projects', async (_event, projectIds, options) => {
    const rawDelay = Number(options?.delayMs)
    const delayMs = Number.isFinite(rawDelay) ? Math.max(0, Math.min(60000, Math.round(rawDelay))) : 0
    const projectList = await storageManager.loadProjects()
    const requestedIds = projectIds === undefined
      ? null
      : new Set(Array.isArray(projectIds) ? projectIds.filter((id) => typeof id === 'string') : [])
    const projectsToStart = requestedIds
      ? projectList.filter((project) => requestedIds.has(project.id))
      : projectList

    const sorted = topologicalSort(projectsToStart)

    const results: Array<{ projectId: string; success: boolean; error?: string }> = []
    for (let index = 0; index < sorted.length; index++) {
      const project = sorted[index]
      try {
        const launch = resolveLaunchConfig(project)
        const cmd = launch.command
        if (!cmd || (Array.isArray(cmd) && cmd.length === 0)) {
          results.push({ projectId: project.id, success: false, error: 'Start command is missing' })
          continue
        }

        if (Array.isArray(project.dependsOn) && project.dependsOn.length > 0) {
          const failedDep = project.dependsOn.find((depId) => {
            const depResult = results.find((r) => r.projectId === depId)
            return depResult && !depResult.success
          })
          if (failedDep) {
            results.push({ projectId: project.id, success: false, error: `Dependency ${failedDep} failed to start` })
            continue
          }
          await ensureDependencies(project, projectList)
        }
        if (['starting', 'running'].includes(processManager.getProcessStatus(project.id).status.toLowerCase())) { results.push({ projectId: project.id, success: true }); continue }

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
        results.push({ ...result, projectId: project.id, success: true })
      } catch (error) {
        results.push({ projectId: project.id, success: false, error: (error as Error).message })
      }
      // Stagger: pause between launches (but not after the last one)
      if (delayMs > 0 && index < sorted.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
    return results
  })

  // Run a custom command for a project
  secureHandle('run-custom-command', async (_event, projectId, commandId) => {
    try {
      const project = await loadPersistedProject(projectId)
      const customCommand = (Array.isArray(project.customCommands) ? project.customCommands : [])
        .find((item) => item.id === commandId)
      if (!customCommand) {
        return { success: false, error: `Custom command ${commandId} not found` }
      }
      const result = await processManager.runCustomCommand(
        project.id,
        project.path,
        customCommand.id,
        customCommand.label,
        customCommand.command,
        envVarsToObject(project.envVars),
        (pid: string, log: unknown) => {
          safeSend('process-log', pid, log)
        }
      )
      safeSend('process-status', project.id, processManager.getProcessStatus(project.id))
      return { ...result, success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Stop a running custom command
  secureHandle('stop-custom-command', async (_event, runId) => {
    try {
      const result = await processManager.stopCustomCommand(runId, true)
      return { ...result, success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Get custom command run status
  secureHandle('get-custom-command-status', async (_event, runId) => {
    return processManager.getCustomRunStatus(runId)
  })

  // Stop all projects
  secureHandle('stop-all-projects', async (_event) => {
    try {
      const results = await processManager.stopAllProcesses()
      return results
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}

export { setupProcessHandlers, resolveLaunchConfig, withRequestedPort, topologicalSort }
