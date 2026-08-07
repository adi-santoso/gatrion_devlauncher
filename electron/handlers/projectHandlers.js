const fs = require('fs')
const path = require('path')
const { ipcMain, dialog } = require('electron')
const { v4: uuidv4 } = require('uuid')
const { normalizeProject, sanitizeProjectChanges, toRendererProject, validateProject } = require('../projectSchema')
const Logger = require('../utils/logger')
const log = Logger || { info: () => {}, warn: () => {}, error: () => {} }
const { assertTrustedIpcEvent } = require('../utils/ipcSecurity')
const normalizePathKey = (projectPath) => projectPath
  ? path.normalize(projectPath).toLowerCase().replace(/[/\\]+$/, '')
  : ''
const assertProjectDirectory = (projectPath) => {
  let stats
  try {
    stats = fs.statSync(projectPath)
  } catch {
    throw new Error(`Project directory path "${projectPath}" does not exist`)
  }
  if (!stats.isDirectory()) throw new Error(`Project path "${projectPath}" must be a directory`)
}

const ENV_FILE_PATTERN = /^\.env(\.[A-Za-z0-9_-]+)*$/

const assertEnvFilePath = (projectPath, fileName) => {
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
function setupProjectHandlers(storageManager, processManager, mainWindow) {
  // Helper to safely send to renderer (skip if window is destroyed or app is quitting)
  const safeSend = (channel, ...args) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(channel, ...args)
      }
    } catch (error) {
      // Silently ignore if window is destroyed during app quit
      console.log(`[projectHandlers] Skipping ${channel} - window unavailable`)
    }
  }

  // Subscribe to resource updates from ProcessManager
  if (processManager && processManager.on) {
    processManager.on('resource-update', ({ projectId, stats }) => {
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
  ipcMain.handle('get-projects', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      const projects = await storageManager.loadProjects()
      return { success: true, projects: projects.map(toRendererProject) }
    } catch (error) {
      return { success: false, error: error.message, projects: [] }
    }
  })

  // Add a project
  ipcMain.handle('add-project', async (event, projectData) => {
    try {
      assertTrustedIpcEvent(event)
      const changes = sanitizeProjectChanges(projectData)
      if (changes.envVars?.some((item) => item.unchanged)) {
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

      return { success: true, project: toRendererProject(project) }
    } catch (error) {
      console.error('[projectHandlers] Error adding project:', error)
      return { success: false, error: error.message }
    }
  })

  // Update a project
  ipcMain.handle('update-project', async (event, projectId, updates) => {
    try {
      assertTrustedIpcEvent(event)
      const changes = sanitizeProjectChanges(updates)
      const { projects, value: project } = await storageManager.updateProjects((currentProjects) => {
        const index = currentProjects.findIndex((item) => item.id === projectId)
        if (index === -1) throw new Error(`Project ${projectId} not found`)

        if (changes.envVars) {
          changes.envVars = changes.envVars.map((item) => {
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

      return { success: true, project: toRendererProject(project) }
    } catch (error) {
      console.error('[projectHandlers] Error updating project:', error)
      return { success: false, error: error.message }
    }
  })

  // Delete a project
  ipcMain.handle('delete-project', async (event, projectId) => {
    try {
      assertTrustedIpcEvent(event)
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
    } catch (error) {
      console.error('[projectHandlers] Error deleting project:', error)
      return { success: false, error: error.message }
    }
  })

  // Browse folder
  ipcMain.handle('browse-folder', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Project Folder',
      })

      if (result.canceled) {
        return { success: false, canceled: true }
      }

      return { success: true, path: result.filePaths[0] }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // List .env* files in a project root
  ipcMain.handle('list-env-files', async (event, projectPath) => {
    try {
      assertTrustedIpcEvent(event)
      assertProjectDirectory(projectPath)
      const root = path.resolve(projectPath)
      const entries = await fs.promises.readdir(root, { withFileTypes: true })
      const files = entries
        .filter((entry) => entry.isFile() && ENV_FILE_PATTERN.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => (a === '.env' ? -1 : b === '.env' ? 1 : a.localeCompare(b)))
      return { success: true, files }
    } catch (error) {
      return { success: false, error: error.message, files: [] }
    }
  })

  // Read a single env file
  ipcMain.handle('read-env-file', async (event, projectPath, fileName) => {
    try {
      assertTrustedIpcEvent(event)
      const target = assertEnvFilePath(projectPath, fileName)
      const content = await fs.promises.readFile(target, 'utf8')
      const stats = await fs.promises.stat(target)
      return { success: true, fileName, content, modifiedAt: stats.mtimeMs }
    } catch (error) {
      const missing = error && error.code === 'ENOENT'
      return { success: false, error: missing ? `File ${fileName} does not exist` : error.message }
    }
  })

  // Write a single env file (creates a timestamped backup of the previous file)
  ipcMain.handle('write-env-file', async (event, projectPath, fileName, content) => {
    try {
      assertTrustedIpcEvent(event)
      if (typeof content !== 'string') throw new Error('Env file content must be a string')
      const target = assertEnvFilePath(projectPath, fileName)
      if (fs.existsSync(target)) {
        const backupName = `${fileName}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`
        await fs.promises.copyFile(target, path.join(path.dirname(target), backupName))
      }
      await fs.promises.writeFile(target, content, 'utf8')
      return { success: true, fileName }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

module.exports = { setupProjectHandlers }
