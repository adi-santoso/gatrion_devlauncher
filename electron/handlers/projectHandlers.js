const { ipcMain, dialog } = require('electron')
const { v4: uuidv4 } = require('uuid')

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
  // Get all projects
  ipcMain.handle('get-projects', async (event) => {
    try {
      const projects = await storageManager.loadProjects()
      return { success: true, projects }
    } catch (error) {
      return { success: false, error: error.message, projects: [] }
    }
  })

  // Add a project
  ipcMain.handle('add-project', async (event, projectData) => {
    try {
      // Validate required fields
      if (!projectData.name || !projectData.name.trim()) {
        throw new Error('Project name is required')
      }
      if (!projectData.path || !projectData.path.trim()) {
        throw new Error('Project path is required')
      }
      if (!projectData.port) {
        throw new Error('Port is required')
      }
      if (!projectData.startCommand || !projectData.startCommand.trim()) {
        throw new Error('Start command is required')
      }

      // Load existing projects
      const projects = await storageManager.loadProjects()

      // Check for duplicate name
      const duplicateName = projects.find(p => p.name.toLowerCase() === projectData.name.toLowerCase())
      if (duplicateName) {
        throw new Error(`Project with name "${projectData.name}" already exists`)
      }

      // Check for duplicate path
      const duplicatePath = projects.find(p => p.path === projectData.path)
      if (duplicatePath) {
        throw new Error(`Project at path "${projectData.path}" already exists`)
      }

      // Generate ID if not provided
      if (!projectData.id) {
        projectData.id = uuidv4()
      }

      // Add timestamps
      projectData.createdAt = new Date().toISOString()
      projectData.lastRun = null

      // Save to storage
      projects.push(projectData)
      await storageManager.saveProjects(projects)

      // Notify renderer of update
      safeSend('projects-updated', projects)

      return { success: true, project: projectData }
    } catch (error) {
      console.error('[projectHandlers] Error adding project:', error)
      return { success: false, error: error.message }
    }
  })

  // Update a project
  ipcMain.handle('update-project', async (event, projectId, updates) => {
    try {
      const projects = await storageManager.loadProjects()
      const index = projects.findIndex((p) => p.id === projectId)

      if (index === -1) {
        throw new Error(`Project ${projectId} not found`)
      }

      // Update project
      projects[index] = { ...projects[index], ...updates }
      await storageManager.saveProjects(projects)

      // Notify renderer of update
      safeSend('projects-updated', projects)

      return { success: true, project: projects[index] }
    } catch (error) {
      console.error('[projectHandlers] Error updating project:', error)
      return { success: false, error: error.message }
    }
  })

  // Delete a project
  ipcMain.handle('delete-project', async (event, projectId) => {
    try {
      const processStatus = processManager.getProcessStatus(projectId)
      if (processStatus.status === processManager.STATUS.RUNNING) {
        await processManager.stopProcess(projectId)
      } else if (
        processStatus.status === processManager.STATUS.STARTING ||
        processStatus.status === processManager.STATUS.STOPPING
      ) {
        throw new Error(`Cannot delete project while process is ${processStatus.status.toLowerCase()}`)
      }

      const projects = await storageManager.loadProjects()
      const filtered = projects.filter((p) => p.id !== projectId)

      if (filtered.length === projects.length) {
        throw new Error(`Project ${projectId} not found`)
      }

      await storageManager.saveProjects(filtered)

      // Notify renderer of update
      safeSend('projects-updated', filtered)

      return { success: true }
    } catch (error) {
      console.error('[projectHandlers] Error deleting project:', error)
      return { success: false, error: error.message }
    }
  })

  // Browse folder
  ipcMain.handle('browse-folder', async (event) => {
    try {
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
}

module.exports = { setupProjectHandlers }
