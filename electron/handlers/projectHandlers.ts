const fs = require('fs')
const path = require('path')
const { ipcMain, dialog } = require('electron') as typeof import('electron')
const { v4: uuidv4 } = require('uuid')
import type { BrowserWindow } from 'electron'
import type { Project } from '../../src/types/shared'
import type { StorageManager } from '../managers/StorageManager'
import type { ProcessManager } from '../managers/ProcessManager'

import { normalizeProject, sanitizeProjectChanges, toRendererProject, validateProject, migrateProjects } from '../projectSchema'
import Logger from '../utils/logger'
const log = Logger || { info: () => {}, warn: () => {}, error: () => {} }
import { assertTrustedIpcEvent } from '../utils/ipcSecurity'
import { safeHandle } from '../utils/ipcValidation'
import { searchWorkspaceFiles } from '../utils/workspaceSearch'
import { normalizePathKey } from '../utils/pathKey'
const assertProjectDirectory = (projectPath: unknown) => {
  let stats
  try {
    stats = fs.statSync(projectPath as string)
  } catch {
    throw new Error(`Project directory path "${projectPath}" does not exist`)
  }
  if (!stats.isDirectory()) throw new Error(`Project path "${projectPath}" must be a directory`)
}

const ENV_FILE_PATTERN = /^\.env(\.[A-Za-z0-9_-]+)*$/

const assertEnvFilePath = (projectPath: unknown, fileName: unknown): string => {
  if (typeof projectPath !== 'string' || !projectPath.trim()) throw new Error('Project path is required')
  if (typeof fileName !== 'string' || !ENV_FILE_PATTERN.test(fileName)) {
    throw new Error('File name must be a .env file (e.g. .env, .env.local)')
  }
  const root = path.resolve(projectPath)
  const target = path.resolve(root, fileName)
  if (path.dirname(target) !== root) throw new Error('Env file must be inside the project root')
  return target
}

/**
 * Setup project-related IPC handlers
 * @param {StorageManager} storageManager - StorageManager instance
 * @param {ProcessManager} processManager - ProcessManager instance
 * @param {BrowserWindow} mainWindow - Main window instance
 */
function setupProjectHandlers(storageManager: StorageManager, processManager: ProcessManager, mainWindow: BrowserWindow | null) {
  // Helper to safely send to renderer (skip if window is destroyed or app is quitting)
  const safeSend = (channel: string, ...args: unknown[]) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(channel, ...args)
      }
    } catch (error) {
      // Silently ignore if window is destroyed during app quit
      console.log(`[projectHandlers] Skipping ${channel} - window unavailable`)
    }
  }

  const handle = (channel: string, handler: import('../utils/ipcValidation').IpcHandler) => safeHandle(ipcMain, assertTrustedIpcEvent, channel, handler)

  // Subscribe to resource updates from ProcessManager
  if (processManager && processManager.on) {
    processManager.on('resource-update', ({ projectId, stats }: { projectId: string; stats: { cpu?: number; memory?: number } }) => {
      // Send real-time CPU/memory to frontend
      safeSend('project-resource-update', {
        projectId,
        cpu: stats.cpu,
        memory: stats.memory
      })

      // Also update the project data in the manager for consistency
      const processData = processManager.processes.get(projectId)
      if (processData) {
        processData.cpu = stats.cpu
        processData.memory = stats.memory
      }
    })

    log.info('projectHandlers', 'Subscribed to resource updates from ProcessManager')
  }

  // Get all projects
  handle('get-projects', async () => {
    const projects = await storageManager.loadProjects()
    return { success: true, projects: projects.map((project) => toRendererProject(project)) }
  })

  // Add a project
  handle('add-project', async (event, projectData: Record<string, any>) => {
    const changes = sanitizeProjectChanges(projectData)
    if (changes.envVars?.some((item: { unchanged?: boolean }) => item.unchanged)) {
      throw new Error('New environment variables cannot retain a stored value')
    }
    const project = validateProject(normalizeProject({
      ...changes,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      lastRun: null,
    }))

    assertProjectDirectory(project.path)

    const { projects } = await storageManager.updateProjects((currentProjects) => {
      const duplicateName = currentProjects.find(p => p.name.toLowerCase() === project.name.toLowerCase())
      if (duplicateName) throw new Error(`Project with name "${project.name}" already exists`)

      const normPath = normalizePathKey(project.path)
      const duplicatePath = currentProjects.find(p => normalizePathKey(p.path) === normPath)
      if (duplicatePath) throw new Error(`Project at path "${project.path}" already exists`)

      return { projects: [...currentProjects, project] }
    })

    // Notify renderer of update
    safeSend('projects-updated', projects.map(toRendererProject))

    return { success: true, project: toRendererProject(project as Project) }
  })

  // Update a project
  handle('update-project', async (event, projectId: string, updates: Record<string, any>) => {
    const changes = sanitizeProjectChanges(updates)
    const { projects, value: project } = await storageManager.updateProjects((currentProjects) => {
      const index = currentProjects.findIndex((item) => item.id === projectId)
      if (index === -1) throw new Error(`Project ${projectId} not found`)

      if (changes.envVars) {
        changes.envVars = changes.envVars.map((item: { key: string; value: string; unchanged?: boolean }) => {
          if (!item.unchanged) return { key: item.key, value: item.value }
          const existing = currentProjects[index].envVars.find((env) => env.key === item.key)
          if (!existing) throw new Error(`Cannot retain missing environment variable: ${item.key}`)
          return existing
        })
      }
      const nextProject = validateProject(normalizeProject({ ...currentProjects[index], ...changes }))
      assertProjectDirectory(nextProject.path)
      const duplicateName = currentProjects.find((item, itemIndex) =>
        itemIndex !== index && item.name.toLowerCase() === nextProject.name.toLowerCase()
      )
      if (duplicateName) throw new Error(`Project with name "${nextProject.name}" already exists`)

      const normNextPath = normalizePathKey(nextProject.path)
      const duplicatePath = currentProjects.find((item, itemIndex) =>
        itemIndex !== index && normalizePathKey(item.path) === normNextPath
      )
      if (duplicatePath) throw new Error(`Project at path "${nextProject.path}" already exists`)

      const nextProjects = [...currentProjects]
      nextProjects[index] = nextProject
      return { projects: nextProjects, value: nextProject }
    })

    // Notify renderer of update
    safeSend('projects-updated', projects.map(toRendererProject))

    return { success: true, project: toRendererProject(project as Project) }
  })

  // Delete a project
  handle('delete-project', async (event, projectId: string) => {
    const processStatus = processManager.getProcessStatus(projectId)
    if (
      processStatus.status === processManager.STATUS.RUNNING ||
      processStatus.status === processManager.STATUS.STARTING
    ) {
      await processManager.stopProcess(projectId)
    } else if (processStatus.status === processManager.STATUS.STOPPING) {
      throw new Error(`Cannot delete project while process is ${processStatus.status.toLowerCase()}`)
    }

    const { projects } = await storageManager.updateProjects((currentProjects) => {
      const filtered = currentProjects.filter((project) => project.id !== projectId)
      if (filtered.length === currentProjects.length) throw new Error(`Project ${projectId} not found`)
      return { projects: filtered }
    })

    // Notify renderer of update
    safeSend('projects-updated', projects.map(toRendererProject))

    return { success: true }
  })

  // Export projects to a JSON file
  handle('export-projects', async () => {
    const projects = await storageManager.loadProjects()
    const payload = {
      app: 'devlauncher',
      type: 'devlauncher-projects',
      version: 1,
      exportedAt: new Date().toISOString(),
      projects,
    }
    const result = await dialog.showSaveDialog({
      title: 'Export Projects',
      defaultPath: `devlauncher-projects-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'DevLauncher projects', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }
    await fs.promises.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8')
    log.info('projectHandlers', 'Projects exported', { path: result.filePath, count: projects.length })
    return { success: true, path: result.filePath, count: projects.length }
  })

  // Import projects from a JSON file (validates, normalizes, and merges without overwriting existing paths)
  handle('import-projects', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Projects',
      properties: ['openFile'],
      filters: [{ name: 'DevLauncher projects', extensions: ['json'] }],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    const filePath = result.filePaths[0]
    const content = await fs.promises.readFile(filePath, 'utf8')
    const parsed = JSON.parse(content.replace(/^\uFEFF/, ''))
    const rawProjects = Array.isArray(parsed)
      ? parsed
      : parsed && Array.isArray(parsed.projects)
        ? parsed.projects
        : null
    if (!rawProjects) throw new Error('File does not contain a projects array')

    const fromVersion = parsed && Array.isArray(parsed.projects)
      ? parsed.version
      : rawProjects[0]?.schemaVersion
    const migrated = migrateProjects(rawProjects, fromVersion)
    const candidates = migrated
      .map((project: Record<string, any>) => {
        try {
          return { project: validateProject(normalizeProject(project, uuidv4)), error: null }
        } catch (error) {
          return { project: null, error: `${project?.name || '(unnamed)'}: ${(error as Error).message}` }
        }
      })

    const added: Project[] = []
    const skipped: Array<{ name: string; reason: string }> = []
    await storageManager.updateProjects((currentProjects) => {
      const existingPaths = new Set(currentProjects.map((project) => normalizePathKey(project.path)))
      const nextProjects = [...currentProjects]
      for (const { project, error } of candidates) {
        if (!project) {
          skipped.push({ name: error, reason: 'invalid' })
          continue
        }
        try {
          assertProjectDirectory(project.path)
        } catch {
          skipped.push({ name: project.name, reason: 'directory does not exist' })
          continue
        }
        const normPath = normalizePathKey(project.path)
        if (existingPaths.has(normPath)) {
          skipped.push({ name: project.name, reason: 'path already exists' })
          continue
        }
        if (currentProjects.some((item) => item.name.toLowerCase() === project.name.toLowerCase())) {
          skipped.push({ name: project.name, reason: 'name already exists' })
          continue
        }
        existingPaths.add(normPath)
        nextProjects.push(project)
        added.push(project)
      }
      return { projects: nextProjects }
    })

    if (added.length > 0) {
      const projects = await storageManager.loadProjects()
      safeSend('projects-updated', projects.map(toRendererProject))
    }
    log.info('projectHandlers', 'Projects imported', { path: filePath, added: added.length, skipped: skipped.length })
    return { success: true, added: added.map(toRendererProject), skipped }
  })

  // Workspace search: filenames across project roots (bounded depth, build
  // dirs excluded) for the command palette. The renderer passes the project
  // paths it already has; a short query returns nothing to avoid noise.
  handle('workspace-search-files', async (event, query, projectPaths) => {
    const roots = Array.isArray(projectPaths)
      ? projectPaths.filter((item) => typeof item === 'string' && item.trim())
      : []
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 100) {
      return { success: true, files: [] }
    }
    const files = await searchWorkspaceFiles(roots, query)
    return { success: true, files }
  })

  // Browse folder
  handle('browse-folder', async () => {
    // E2E test hook: bypass the native folder picker so the "add project" flow
    // can be driven deterministically (the OS dialog cannot be automated).
    if (process.env.NODE_ENV === 'test' && process.env.DEVLAUNCHER_TEST_FOLDER) {
      return { success: true, path: process.env.DEVLAUNCHER_TEST_FOLDER }
    }

    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Folder',
    })

    if (result.canceled) {
      return { success: false, canceled: true }
    }

    return { success: true, path: result.filePaths[0] }
  })

  // List .env* files in a project root
  handle('list-env-files', async (event, projectPath) => {
    assertProjectDirectory(projectPath)
    const root = path.resolve(projectPath)
    const entries = await fs.promises.readdir(root, { withFileTypes: true })
    const files = entries
      .filter((entry: { isFile(): boolean; name: string }) => entry.isFile() && ENV_FILE_PATTERN.test(entry.name))
      .map((entry: { name: string }) => entry.name)
      .sort((a: string, b: string) => (a === '.env' ? -1 : b === '.env' ? 1 : a.localeCompare(b)))
    return { success: true, files }
  })

  // Read a single env file
  handle('read-env-file', async (event, projectPath, fileName) => {
    const target = assertEnvFilePath(projectPath, fileName)
    let content
    let stats
    try {
      content = await fs.promises.readFile(target, 'utf8')
      stats = await fs.promises.stat(target)
    } catch (error) {
      if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`File ${fileName} does not exist`)
      throw error
    }
    return { success: true, fileName, content, modifiedAt: stats.mtimeMs }
  })

  // Write a single env file (creates a timestamped backup of the previous file)
  handle('write-env-file', async (event, projectPath, fileName, content) => {
    if (typeof content !== 'string') throw new Error('Env file content must be a string')
    const target = assertEnvFilePath(projectPath, fileName)
    if (fs.existsSync(target)) {
      const backupName = `${fileName}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`
      await fs.promises.copyFile(target, path.join(path.dirname(target), backupName))
    }
    await fs.promises.writeFile(target, content, 'utf8')
    return { success: true, fileName }
  })
}

export { setupProjectHandlers }

