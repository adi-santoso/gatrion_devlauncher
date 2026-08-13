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

  // Export / Import
  exportProjects: () => ipcRenderer.invoke('export-projects'),
  importProjects: () => ipcRenderer.invoke('import-projects'),

  // Env Files
  listEnvFiles: (projectPath) => ipcRenderer.invoke('list-env-files', projectPath),
  readEnvFile: (projectPath, fileName) => ipcRenderer.invoke('read-env-file', projectPath, fileName),
  writeEnvFile: (projectPath, fileName, content) => ipcRenderer.invoke('write-env-file', projectPath, fileName, content),

  // Git
  gitStatus: (projectPath) => ipcRenderer.invoke('git-status', projectPath),
  gitLog: (projectPath, limit) => ipcRenderer.invoke('git-log', projectPath, limit),
  gitDiff: (projectPath, filePath, staged) => ipcRenderer.invoke('git-diff', projectPath, filePath, staged),
  gitStage: (projectPath, files) => ipcRenderer.invoke('git-stage', projectPath, files),
  gitUnstage: (projectPath, files) => ipcRenderer.invoke('git-unstage', projectPath, files),
  gitCommit: (projectPath, message) => ipcRenderer.invoke('git-commit', projectPath, message),
  gitPull: (projectPath) => ipcRenderer.invoke('git-pull', projectPath),
  gitPush: (projectPath) => ipcRenderer.invoke('git-push', projectPath),
  gitCheckout: (projectPath, branch, createNew) => ipcRenderer.invoke('git-checkout', projectPath, branch, createNew),
  gitInit: (projectPath) => ipcRenderer.invoke('git-init', projectPath),
  gitStashList: (projectPath) => ipcRenderer.invoke('git-stash-list', projectPath),
  gitStashPush: (projectPath, message) => ipcRenderer.invoke('git-stash-push', projectPath, message),
  gitStashPop: (projectPath, index) => ipcRenderer.invoke('git-stash-pop', projectPath, index),
  gitStashApply: (projectPath, index) => ipcRenderer.invoke('git-stash-apply', projectPath, index),
  gitStashDrop: (projectPath, index) => ipcRenderer.invoke('git-stash-drop', projectPath, index),
  gitDiscard: (projectPath, filePath) => ipcRenderer.invoke('git-discard', projectPath, filePath),
  gitBlame: (projectPath, filePath) => ipcRenderer.invoke('git-blame', projectPath, filePath),

  // Package tooling
  readPackageScripts: (projectPath) => ipcRenderer.invoke('read-package-scripts', projectPath),
  checkDependencies: (projectPath) => ipcRenderer.invoke('check-dependencies', projectPath),
  runProjectScript: (projectId, scriptName) => ipcRenderer.invoke('run-project-script', projectId, scriptName),
  installDependencies: (projectId) => ipcRenderer.invoke('install-dependencies', projectId),
  npmOutdated: (projectPath) => ipcRenderer.invoke('npm-outdated', projectPath),
  npmUpdate: (projectPath, packageName) => ipcRenderer.invoke('npm-update', projectPath, packageName),

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

  // Embedded preview (WebContentsView)
  previewShow: (payload) => ipcRenderer.invoke('preview-show', payload),
  previewHide: (projectId) => ipcRenderer.invoke('preview-hide', projectId),
  previewSetBounds: (projectId, bounds) => ipcRenderer.invoke('preview-set-bounds', projectId, bounds),
  previewNavigate: (projectId, url) => ipcRenderer.invoke('preview-navigate', projectId, url),
  previewReload: (projectId) => ipcRenderer.invoke('preview-reload', projectId),
  previewZoom: (projectId, zoomLevel) => ipcRenderer.invoke('preview-zoom', projectId, zoomLevel),
  previewClearData: (projectId) => ipcRenderer.invoke('preview-clear-data', projectId),
  previewToggleDevTools: (projectId) => ipcRenderer.invoke('preview-toggle-devtools', projectId),
  previewDestroy: (projectId) => ipcRenderer.invoke('preview-destroy', projectId),
  onPreviewConsole: (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on('preview-console-message', listener)
    return () => ipcRenderer.removeListener('preview-console-message', listener)
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

  // Prayer reminder: native notification + city geocoding
  showNotification: (payload) => ipcRenderer.invoke('app-notify', payload),
  geocodeCity: (query) => ipcRenderer.invoke('prayer-geocode', query),

  // System environment check
  checkSystemEnv: () => ipcRenderer.invoke('system-env-check'),

  // Health analytics
  getHealth: (projectId) => ipcRenderer.invoke('get-health', projectId),
  clearHealth: (projectId) => ipcRenderer.invoke('clear-health', projectId),

  // Update checker
  checkUpdate: () => ipcRenderer.invoke('check-update'),

  // AI Agent (oh-my-pi)
  ompStatus: () => ipcRenderer.invoke('omp-status'),
  ompListSessions: (projectId) => ipcRenderer.invoke('omp-list-sessions', projectId),
  ompCreateSession: (projectId, title) => ipcRenderer.invoke('omp-create-session', projectId, title),
  ompDeleteSession: (projectId, sessionId) => ipcRenderer.invoke('omp-delete-session', projectId, sessionId),
  ompRenameSession: (projectId, sessionId, title) => ipcRenderer.invoke('omp-rename-session', projectId, sessionId, title),
  ompChat: (projectId, cwd, message, options) => ipcRenderer.invoke('omp-chat', projectId, cwd, message, options),
  ompSteer: (projectId, cwd, message) => ipcRenderer.invoke('omp-steer', projectId, cwd, message),
  ompAbort: (projectId, cwd) => ipcRenderer.invoke('omp-abort', projectId, cwd),
  ompGetMessages: (projectId, cwd, options) => ipcRenderer.invoke('omp-get-messages', projectId, cwd, options),
  ompGetModels: (projectId, cwd) => ipcRenderer.invoke('omp-get-models', projectId, cwd),
  ompSetModel: (projectId, cwd, provider, modelId) => ipcRenderer.invoke('omp-set-model', projectId, cwd, provider, modelId),
  ompSetThinkingLevel: (projectId, cwd, level) => ipcRenderer.invoke('omp-set-thinking-level', projectId, cwd, level),
  ompGetState: (projectId, cwd) => ipcRenderer.invoke('omp-get-state', projectId, cwd),
  ompCompact: (projectId, cwd, customInstructions) => ipcRenderer.invoke('omp-compact', projectId, cwd, customInstructions),
  ompSetAutoCompaction: (projectId, cwd, enabled) => ipcRenderer.invoke('omp-set-auto-compaction', projectId, cwd, enabled),
  ompSetAutoRetry: (projectId, cwd, enabled) => ipcRenderer.invoke('omp-set-auto-retry', projectId, cwd, enabled),
  ompAbortRetry: (projectId, cwd) => ipcRenderer.invoke('omp-abort-retry', projectId, cwd),
  ompSetFastMode: (projectId, cwd, enabled) => ipcRenderer.invoke('omp-set-fast-mode', projectId, cwd, enabled),
  ompGetCommands: (projectId, cwd) => ipcRenderer.invoke('omp-get-commands', projectId, cwd),
  ompInstall: () => ipcRenderer.invoke('omp-install'),
  ompInstallState: () => ipcRenderer.invoke('omp-install-state'),
  ompCheckUpdate: () => ipcRenderer.invoke('omp-check-update'),
  ompOpenDocs: () => ipcRenderer.invoke('omp-open-docs'),
  ompConfigGet: () => ipcRenderer.invoke('omp-config-get'),
  ompConfigSaveProvider: (input) => ipcRenderer.invoke('omp-config-save-provider', input),
  ompConfigDeleteProvider: (name) => ipcRenderer.invoke('omp-config-delete-provider', name),
  ompConfigSetDefault: (modelRef) => ipcRenderer.invoke('omp-config-set-default', modelRef),
  ompRunSetup: () => ipcRenderer.invoke('omp-run-setup'),
  onOmpEvent: (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on('omp-event', listener)
    return () => ipcRenderer.removeListener('omp-event', listener)
  },
  onOmpInstallProgress: (callback) => {
    const listener = (event, state) => callback(state)
    ipcRenderer.on('omp-install-progress', listener)
    return () => ipcRenderer.removeListener('omp-install-progress', listener)
  },
})
