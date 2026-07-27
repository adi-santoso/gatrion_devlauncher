const { ipcMain, dialog } = require('electron')
const { v4: uuidv4 } = require('uuid')
const { normalizeProject, sanitizeProjectChanges, validateProject } = require('../projectSchema')

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
      const changes = sanitizeProjectChanges(projectData)
      const project = validateProject(normalizeProject({
        ...changes,
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        lastRun: null,
      }))

      const { projects } = await storageManager.updateProjects((currentProjects) => {
        const duplicateName = currentProjects.find(p => p.name.toLowerCase() === project.name.toLowerCase())
        if (duplicateName) throw new Error(`Project with name "${project.name}" already exists`)

        const duplicatePath = currentProjects.find(p => p.path.toLowerCase() === project.path.toLowerCase())
        if (duplicatePath) throw new Error(`Project at path "${project.path}" already exists`)

        return { projects: [...currentProjects, project] }
      })

      // Notify renderer of update
      safeSend('projects-updated', projects)

      return { success: true, project }
    } catch (error) {
      console.error('[projectHandlers] Error adding project:', error)
      return { success: false, error: error.message }
    }
  })

  // Update a project
  ipcMain.handle('update-project', async (event, projectId, updates) => {
    try {
      const changes = sanitizeProjectChanges(updates)
      const { projects, value: project } = await storageManager.updateProjects((currentProjects) => {
        const index = currentProjects.findIndex((item) => item.id === projectId)
        if (index === -1) throw new Error(`Project ${projectId} not found`)

        const nextProject = validateProject(normalizeProject({ ...currentProjects[index], ...changes }))
        const duplicateName = currentProjects.find((item, itemIndex) =>
          itemIndex !== index && item.name.toLowerCase() === nextProject.name.toLowerCase()
        )
        if (duplicateName) throw new Error(`Project with name "${nextProject.name}" already exists`)

        const duplicatePath = currentProjects.find((item, itemIndex) =>
          itemIndex !== index && item.path.toLowerCase() === nextProject.path.toLowerCase()
        )
        if (duplicatePath) throw new Error(`Project at path "${nextProject.path}" already exists`)

        const nextProjects = [...currentProjects]
        nextProjects[index] = nextProject
        return { projects: nextProjects, value: nextProject }
      })

      // Notify renderer of update
      safeSend('projects-updated', projects)

      return { success: true, project }
    } catch (error) {
      console.error('[projectHandlers] Error updating project:', error)
      return { success: false, error: error.message }
    }
  })

  // Delete a project
  ipcMain.handle('delete-project', async (event, projectId) => {
    try {
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
      safeSend('projects-updated', projects)

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
