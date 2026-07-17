const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Project Management
  addProject: (projectData) => ipcRenderer.invoke('add-project', projectData),
  updateProject: (projectId, updates) => ipcRenderer.invoke('update-project', projectId, updates),
  deleteProject: (projectId) => ipcRenderer.invoke('delete-project', projectId),
  getProjects: () => ipcRenderer.invoke('get-projects'),

  // Process Management
  startProject: (projectId) => ipcRenderer.invoke('start-project', projectId),
  stopProject: (projectId) => ipcRenderer.invoke('stop-project', projectId),
  restartProject: (projectId) => ipcRenderer.invoke('restart-project', projectId),
  startAllProjects: () => ipcRenderer.invoke('start-all-projects'),
  stopAllProjects: () => ipcRenderer.invoke('stop-all-projects'),
  getProcessStatus: (projectId) => ipcRenderer.invoke('get-process-status', projectId),

  // Project Detection
  detectProjectType: (projectPath) => ipcRenderer.invoke('detect-project-type', projectPath),
  browseFolder: () => ipcRenderer.invoke('browse-folder'),

  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (updates) => ipcRenderer.invoke('update-config', updates),

  // Event Listeners
  onProcessStatus: (callback) => {
    ipcRenderer.on('process-status', (event, projectId, status) => callback(projectId, status))
  },
  onProcessLog: (callback) => {
    ipcRenderer.on('process-log', (event, projectId, logLine) => callback(projectId, logLine))
  },
  onProcessError: (callback) => {
    ipcRenderer.on('process-error', (event, projectId, error) => callback(projectId, error))
  },
  onProcessExit: (callback) => {
    ipcRenderer.on('process-exit', (event, projectId, code) => callback(projectId, code))
  },
  onProjectsUpdated: (callback) => {
    ipcRenderer.on('projects-updated', (event, projects) => callback(projects))
  },

  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  },
})
