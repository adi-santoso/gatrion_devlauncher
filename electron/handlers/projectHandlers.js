const { ipcMain, dialog } = require('electron')
const { v4: uuidv4 } = require('uuid')

/**
 * Setup project-related IPC handlers
 * @param {StorageManager} storageManager - StorageManager instance
 * @param {BrowserWindow} mainWindow - Main window instance
 */
function setupProjectHandlers(storageManager, mainWindow) {
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
      // Generate ID if not provided
      if (!projectData.id) {
        projectData.id = uuidv4()
      }

      // Add timestamps
      projectData.createdAt = new Date().toISOString()
      projectData.lastRun = null

      // Save to storage
      const projects = await storageManager.loadProjects()
      projects.push(projectData)
      await storageManager.saveProjects(projects)

      // Notify renderer of update
      mainWindow.webContents.send('projects-updated', projects)

      return { success: true, project: projectData }
    } catch (error) {
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
      mainWindow.webContents.send('projects-updated', projects)

      return { success: true, project: projects[index] }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Delete a project
  ipcMain.handle('delete-project', async (event, projectId) => {
    try {
      const projects = await storageManager.loadProjects()
      const filtered = projects.filter((p) => p.id !== projectId)

      if (filtered.length === projects.length) {
        throw new Error(`Project ${projectId} not found`)
      }

      await storageManager.saveProjects(filtered)

      // Notify renderer of update
      mainWindow.webContents.send('projects-updated', filtered)

      return { success: true }
    } catch (error) {
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
