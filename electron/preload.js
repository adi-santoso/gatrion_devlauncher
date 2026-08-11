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
  stopProject: (projectId, force) => ipcRenderer.invoke('stop-project', projectId, force),
  restartProject: (projectId) => ipcRenderer.invoke('restart-project', projectId),
  startAllProjects: (projectIds) => ipcRenderer.invoke('start-all-projects', projectIds),
  stopAllProjects: () => ipcRenderer.invoke('stop-all-projects'),
  getProcessStatus: (projectId) => ipcRenderer.invoke('get-process-status', projectId),
  checkPortConflict: (port) => ipcRenderer.invoke('check-port-conflict', port),
  getProcessMetrics: (projectId) => ipcRenderer.invoke('get-process-metrics', projectId),
  getLogs: (projectId, limit) => ipcRenderer.invoke('get-logs', projectId, limit),
  clearLogs: (projectId) => ipcRenderer.invoke('clear-logs', projectId),
  runCustomCommand: (projectId, commandId) => ipcRenderer.invoke('run-custom-command', projectId, commandId),
  stopCustomCommand: (runId) => ipcRenderer.invoke('stop-custom-command', runId),
  getCustomCommandStatus: (runId) => ipcRenderer.invoke('get-custom-command-status', runId),

  // Project Detection
  detectProjectType: (projectPath) => ipcRenderer.invoke('detect-project-type', projectPath),
  browseFolder: () => ipcRenderer.invoke('browse-folder'),

  // Env Files
  listEnvFiles: (projectPath) => ipcRenderer.invoke('list-env-files', projectPath),
  readEnvFile: (projectPath, fileName) => ipcRenderer.invoke('read-env-file', projectPath, fileName),
  writeEnvFile: (projectPath, fileName, content) => ipcRenderer.invoke('write-env-file', projectPath, fileName, content),

  // Desktop Integration
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  revealInExplorer: (targetPath) => ipcRenderer.invoke('reveal-in-explorer', targetPath),
  openInEditor: (targetPath) => ipcRenderer.invoke('open-in-editor', targetPath),

  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (updates) => ipcRenderer.invoke('update-config', updates),

  // Activity feed persistence
  getActivities: () => ipcRenderer.invoke('get-activities'),
  appendActivities: (entries) => ipcRenderer.invoke('append-activities', entries),

  // Workspace presets
  getPresets: () => ipcRenderer.invoke('get-presets'),
  savePresets: (presets) => ipcRenderer.invoke('save-presets', presets),

  // Event Listeners
  onProcessStatus: (callback) => {
    const listener = (event, projectId, status) => callback(projectId, status)
    ipcRenderer.on('process-status', listener)
    return () => ipcRenderer.removeListener('process-status', listener)
  },
  onProcessLog: (callback) => {
    const listener = (event, projectId, logLine) => callback(projectId, logLine)
    ipcRenderer.on('process-log', listener)
    return () => ipcRenderer.removeListener('process-log', listener)
  },
  onProcessError: (callback) => {
    const listener = (event, projectId, error) => callback(projectId, error)
    ipcRenderer.on('process-error', listener)
    return () => ipcRenderer.removeListener('process-error', listener)
  },
  onProcessExit: (callback) => {
    const listener = (event, projectId, code, signal) => callback(projectId, code, signal)
    ipcRenderer.on('process-exit', listener)
    return () => ipcRenderer.removeListener('process-exit', listener)
  },
  onProjectsUpdated: (callback) => {
    const listener = (event, projects) => callback(projects)
    ipcRenderer.on('projects-updated', listener)
    return () => ipcRenderer.removeListener('projects-updated', listener)
  },
  onNavigateToProject: (callback) => {
    const listener = (event, projectId) => callback(projectId)
    ipcRenderer.on('navigate-to-project', listener)
    return () => ipcRenderer.removeListener('navigate-to-project', listener)
  },

  // Resource Monitoring (CPU/Memory)
  onResourceUpdate: (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on('project-resource-update', listener)
    return () => ipcRenderer.removeListener('project-resource-update', listener)
  },

  // Interactive PTY terminal
  terminalCreate: (options) => ipcRenderer.invoke('terminal-create', options),
  terminalInput: (id, data) => ipcRenderer.invoke('terminal-input', id, data),
  terminalResize: (id, cols, rows) => ipcRenderer.invoke('terminal-resize', id, cols, rows),
  terminalKill: (id) => ipcRenderer.invoke('terminal-kill', id),
  onTerminalData: (callback) => {
    const listener = (event, id, data) => callback(id, data)
    ipcRenderer.on('terminal-data', listener)
    return () => ipcRenderer.removeListener('terminal-data', listener)
  },
  onTerminalExit: (callback) => {
    const listener = (event, id, exitCode) => callback(id, exitCode)
    ipcRenderer.on('terminal-exit', listener)
    return () => ipcRenderer.removeListener('terminal-exit', listener)
  },
})
