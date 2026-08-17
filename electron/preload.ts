import type { IpcRendererEvent } from 'electron'

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron')

// The bridge exposes thin pass-through wrappers over ipcRenderer. Inputs and
// outputs are the IPC payloads defined by the main-process handlers (see
// src/types/shared.d.ts + each handlers/*.ts file); unknown-typed here because
// every channel validates its payload at the boundary (assertPayload).

type Unsub = () => void

interface ElectronApi {
  // Project Management
  addProject: (projectData: unknown) => Promise<unknown>
  updateProject: (projectId: string, updates: unknown) => Promise<unknown>
  deleteProject: (projectId: string) => Promise<unknown>
  getProjects: () => Promise<unknown>

  // Process Management
  startProject: (projectId: string) => Promise<unknown>
  stopProject: (projectId: string, force?: boolean) => Promise<unknown>
  restartProject: (projectId: string) => Promise<unknown>
  startAllProjects: (projectIds: string[] | undefined) => Promise<unknown>
  stopAllProjects: () => Promise<unknown>
  getProcessStatus: (projectId: string) => Promise<unknown>
  checkPortConflict: (port: number) => Promise<unknown>
  getProcessMetrics: (projectId: string) => Promise<unknown>
  getLogs: (projectId: string, limit?: number) => Promise<unknown>
  clearLogs: (projectId: string) => Promise<unknown>
  runCustomCommand: (projectId: string, commandId: string) => Promise<unknown>
  stopCustomCommand: (runId: number) => Promise<unknown>
  getCustomCommandStatus: (runId: number) => Promise<unknown>

  // Project Detection
  detectProjectType: (projectPath: string) => Promise<unknown>
  browseFolder: () => Promise<unknown>

  // Export / Import
  exportProjects: () => Promise<unknown>
  importProjects: () => Promise<unknown>
  exportDiagnostics: () => Promise<unknown>

  // Workspace Backup
  backupExport: (password: string | null) => Promise<unknown>
  backupImport: (password: string | null) => Promise<unknown>

  // Env Files
  listEnvFiles: (projectPath: string) => Promise<unknown>
  readEnvFile: (projectPath: string, fileName: string) => Promise<unknown>
  writeEnvFile: (projectPath: string, fileName: string, content: string) => Promise<unknown>

  // Git
  gitStatus: (projectPath: string) => Promise<unknown>
  gitLog: (projectPath: string, limit?: number) => Promise<unknown>
  gitDiff: (projectPath: string, filePath: string, staged?: boolean) => Promise<unknown>
  gitStage: (projectPath: string, files: string[]) => Promise<unknown>
  gitUnstage: (projectPath: string, files: string[]) => Promise<unknown>
  gitCommit: (projectPath: string, message: string) => Promise<unknown>
  gitPull: (projectPath: string) => Promise<unknown>
  gitPush: (projectPath: string) => Promise<unknown>
  gitCheckout: (projectPath: string, branch: string, createNew?: boolean) => Promise<unknown>
  gitInit: (projectPath: string) => Promise<unknown>
  gitStashList: (projectPath: string) => Promise<unknown>
  gitStashPush: (projectPath: string, message?: string) => Promise<unknown>
  gitStashPop: (projectPath: string, index?: number) => Promise<unknown>
  gitStashApply: (projectPath: string, index?: number) => Promise<unknown>
  gitStashDrop: (projectPath: string, index?: number) => Promise<unknown>
  gitDiscard: (projectPath: string, filePath: string) => Promise<unknown>
  gitBlame: (projectPath: string, filePath: string) => Promise<unknown>

  // Package tooling
  readPackageScripts: (projectPath: string) => Promise<unknown>
  checkDependencies: (projectPath: string) => Promise<unknown>
  runProjectScript: (projectId: string, scriptName: string) => Promise<unknown>
  installDependencies: (projectId: string) => Promise<unknown>
  npmOutdated: (projectPath: string) => Promise<unknown>
  npmUpdate: (projectPath: string, packageName?: string) => Promise<unknown>

  // Desktop Integration
  openExternalUrl: (url: string) => Promise<unknown>
  revealInExplorer: (targetPath: string) => Promise<unknown>
  openInEditor: (targetPath: string) => Promise<unknown>

  // Config
  getConfig: () => Promise<unknown>
  updateConfig: (updates: unknown) => Promise<unknown>

  // Activity feed persistence
  getActivities: () => Promise<unknown>
  appendActivities: (entries: unknown) => Promise<unknown>

  // Workspace presets
  getPresets: () => Promise<unknown>
  savePresets: (presets: unknown) => Promise<unknown>

  // Event Listeners
  onProcessStatus: (callback: (projectId: string, status: unknown) => void) => Unsub
  onProcessLog: (callback: (projectId: string, logLine: unknown) => void) => Unsub
  onProcessError: (callback: (projectId: string, error: unknown) => void) => Unsub
  onProcessExit: (callback: (projectId: string, code: unknown, signal: unknown) => void) => Unsub
  onProjectsUpdated: (callback: (projects: unknown) => void) => Unsub
  onConfigUpdated: (callback: (config: unknown) => void) => Unsub
  onNavigateToProject: (callback: (projectId: string) => void) => Unsub

  // Frameless window controls (renderer-drawn title bar)
  getWindowState: () => Promise<unknown>
  minimizeWindow: () => Promise<unknown>
  maximizeWindow: () => Promise<unknown>
  closeWindow: () => Promise<unknown>
  onWindowMaximizedChange: (callback: (state: unknown) => void) => Unsub

  // Resource Monitoring (CPU/Memory)
  onResourceUpdate: (callback: (data: unknown) => void) => Unsub

  // Embedded preview (WebContentsView)
  previewShow: (payload: unknown) => Promise<unknown>
  previewHide: (projectId: string) => Promise<unknown>
  previewSetBounds: (projectId: string, bounds: unknown) => Promise<unknown>
  previewNavigate: (projectId: string, url: string) => Promise<unknown>
  previewReload: (projectId: string) => Promise<unknown>
  previewZoom: (projectId: string, zoomLevel: number) => Promise<unknown>
  previewClearData: (projectId: string) => Promise<unknown>
  previewToggleDevTools: (projectId: string) => Promise<unknown>
  previewDestroy: (projectId: string) => Promise<unknown>
  onPreviewConsole: (callback: (data: unknown) => void) => Unsub

  // Interactive PTY terminal
  terminalCreate: (options: unknown) => Promise<unknown>
  terminalInput: (id: string, data: string) => Promise<unknown>
  terminalResize: (id: string, cols: number, rows: number) => Promise<unknown>
  terminalKill: (id: string) => Promise<unknown>
  onTerminalData: (callback: (id: string, data: string) => void) => Unsub
  onTerminalExit: (callback: (id: string, exitCode: number) => void) => Unsub

  // Prayer reminder: native notification + city geocoding
  showNotification: (payload: unknown) => Promise<unknown>
  geocodeCity: (query: string) => Promise<unknown>

  // System environment check
  checkSystemEnv: () => Promise<unknown>

  // Main log tail for the Settings log viewer
  getMainLog: (limit?: number) => Promise<unknown>

  // Crash dumps (local minidumps, never uploaded)
  getCrashDumps: () => Promise<unknown>
  clearCrashDumps: () => Promise<unknown>
  openCrashDumpsFolder: () => Promise<unknown>

  // Reset DevLauncher to a fresh-install state (writes a marker, relaunches)
  resetAppData: () => Promise<unknown>

  // Health analytics
  getHealth: (projectId: string) => Promise<unknown>
  clearHealth: (projectId: string) => Promise<unknown>

  // Renderer error reporting (window.onerror / unhandledrejection → main.log)
  reportRendererError: (payload: unknown) => Promise<unknown>

  // Update checker + auto-update (electron-updater)
  checkUpdate: () => Promise<unknown>
  downloadUpdate: () => Promise<unknown>
  installUpdate: () => Promise<unknown>
  getUpdateState: () => Promise<unknown>
  onUpdateState: (callback: (state: unknown) => void) => Unsub

  // MCP server status (agent-control feature)
  mcpGetStatus: () => Promise<unknown>
  // MCP destructive-tool approval modal
  respondMcpApproval: (id: string, decision: string) => Promise<unknown>
  onMcpApprovalRequest: (callback: (request: unknown) => void) => Unsub

  // AI Agent (oh-my-pi)
  ompStatus: () => Promise<unknown>
  ompListSessions: (projectId: string) => Promise<unknown>
  ompListAllSessions: () => Promise<unknown>
  searchWorkspaceFiles: (query: string, projectPaths: string[]) => Promise<unknown>
  ompCreateSession: (projectId: string, title: string) => Promise<unknown>
  ompDeleteSession: (projectId: string, sessionId: string) => Promise<unknown>
  ompRenameSession: (projectId: string, sessionId: string, title: string) => Promise<unknown>
  ompUpdateSessionTokens: (projectId: string, sessionId: string, tokens: number, cost?: number) => Promise<unknown>
  ompChat: (projectId: string, cwd: string, message: string, options?: unknown) => Promise<unknown>
  ompSteer: (projectId: string, cwd: string, message: string) => Promise<unknown>
  ompAbort: (projectId: string, cwd: string) => Promise<unknown>
  ompGetMessages: (projectId: string, cwd: string, options?: unknown) => Promise<unknown>
  ompGetModels: (projectId: string, cwd: string) => Promise<unknown>
  ompSetModel: (projectId: string, cwd: string, provider: string, modelId: string) => Promise<unknown>
  ompSetThinkingLevel: (projectId: string, cwd: string, level: string) => Promise<unknown>
  ompGetState: (projectId: string, cwd: string) => Promise<unknown>
  ompCompact: (projectId: string, cwd: string, customInstructions?: string) => Promise<unknown>
  ompSetAutoCompaction: (projectId: string, cwd: string, enabled: boolean) => Promise<unknown>
  ompSetAutoRetry: (projectId: string, cwd: string, enabled: boolean) => Promise<unknown>
  ompAbortRetry: (projectId: string, cwd: string) => Promise<unknown>
  ompSetFastMode: (projectId: string, cwd: string, enabled: boolean) => Promise<unknown>
  ompGetCommands: (projectId: string, cwd: string) => Promise<unknown>
  ompExportConversation: (projectId: string, cwd: string, sessionPath: string, title: string) => Promise<unknown>
  ompTogglePin: (projectId: string, sessionId: string) => Promise<unknown>
  ompBranch: (projectId: string, cwd: string, entryId: string) => Promise<unknown>
  ompGetBranchMessages: (projectId: string, cwd: string) => Promise<unknown>
  ompSetSubagentSubscription: (projectId: string, cwd: string, level: string) => Promise<unknown>
  ompGetSubagents: (projectId: string, cwd: string) => Promise<unknown>
  ompHandoff: (projectId: string, cwd: string, customInstructions: string) => Promise<unknown>
  ompBash: (projectId: string, cwd: string, command: string) => Promise<unknown>
  ompAbortBash: (projectId: string, cwd: string) => Promise<unknown>
  ompInstall: () => Promise<unknown>
  ompInstallState: () => Promise<unknown>
  ompCheckUpdate: () => Promise<unknown>
  ompOpenDocs: () => Promise<unknown>
  ompConfigGet: () => Promise<unknown>
  ompConfigSaveProvider: (input: unknown) => Promise<unknown>
  ompConfigDeleteProvider: (name: string) => Promise<unknown>
  ompConfigSetDefault: (modelRef: string) => Promise<unknown>
  ompRunSetup: () => Promise<unknown>
  onOmpEvent: (callback: (data: unknown) => void) => Unsub
  onOmpInstallProgress: (callback: (state: unknown) => void) => Unsub
}

const api: ElectronApi = {
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
  exportDiagnostics: () => ipcRenderer.invoke('export-diagnostics'),

  // Workspace Backup
  backupExport: (password) => ipcRenderer.invoke('backup-export', password),
  backupImport: (password) => ipcRenderer.invoke('backup-import', password),

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
    const listener = (_event: IpcRendererEvent, projectId: string, status: unknown) => callback(projectId, status)
    ipcRenderer.on('process-status', listener)
    return () => ipcRenderer.removeListener('process-status', listener)
  },
  onProcessLog: (callback) => {
    const listener = (_event: IpcRendererEvent, projectId: string, logLine: unknown) => callback(projectId, logLine)
    ipcRenderer.on('process-log', listener)
    return () => ipcRenderer.removeListener('process-log', listener)
  },
  onProcessError: (callback) => {
    const listener = (_event: IpcRendererEvent, projectId: string, error: unknown) => callback(projectId, error)
    ipcRenderer.on('process-error', listener)
    return () => ipcRenderer.removeListener('process-error', listener)
  },
  onProcessExit: (callback) => {
    const listener = (_event: IpcRendererEvent, projectId: string, code: unknown, signal: unknown) => callback(projectId, code, signal)
    ipcRenderer.on('process-exit', listener)
    return () => ipcRenderer.removeListener('process-exit', listener)
  },
  onProjectsUpdated: (callback) => {
    const listener = (_event: IpcRendererEvent, projects: unknown) => callback(projects)
    ipcRenderer.on('projects-updated', listener)
    return () => ipcRenderer.removeListener('projects-updated', listener)
  },
  onConfigUpdated: (callback) => {
    const listener = (_event: IpcRendererEvent, config: unknown) => callback(config)
    ipcRenderer.on('config-updated', listener)
    return () => ipcRenderer.removeListener('config-updated', listener)
  },
  onNavigateToProject: (callback) => {
    const listener = (_event: IpcRendererEvent, projectId: string) => callback(projectId)
    ipcRenderer.on('navigate-to-project', listener)
    return () => ipcRenderer.removeListener('navigate-to-project', listener)
  },

  // Frameless window controls
  getWindowState: () => ipcRenderer.invoke('window-get-state'),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize-toggle'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  onWindowMaximizedChange: (callback) => {
    const listener = (_event: IpcRendererEvent, state: unknown) => callback(state)
    ipcRenderer.on('window-maximized-changed', listener)
    return () => ipcRenderer.removeListener('window-maximized-changed', listener)
  },

  // Resource Monitoring (CPU/Memory)
  onResourceUpdate: (callback) => {
    const listener = (_event: IpcRendererEvent, data: unknown) => callback(data)
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
    const listener = (_event: IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on('preview-console-message', listener)
    return () => ipcRenderer.removeListener('preview-console-message', listener)
  },

  // Interactive PTY terminal
  terminalCreate: (options) => ipcRenderer.invoke('terminal-create', options),
  terminalInput: (id, data) => ipcRenderer.invoke('terminal-input', id, data),
  terminalResize: (id, cols, rows) => ipcRenderer.invoke('terminal-resize', id, cols, rows),
  terminalKill: (id) => ipcRenderer.invoke('terminal-kill', id),
  onTerminalData: (callback) => {
    const listener = (_event: IpcRendererEvent, id: string, data: string) => callback(id, data)
    ipcRenderer.on('terminal-data', listener)
    return () => ipcRenderer.removeListener('terminal-data', listener)
  },
  onTerminalExit: (callback) => {
    const listener = (_event: IpcRendererEvent, id: string, exitCode: number) => callback(id, exitCode)
    ipcRenderer.on('terminal-exit', listener)
    return () => ipcRenderer.removeListener('terminal-exit', listener)
  },

  // Prayer reminder: native notification + city geocoding
  showNotification: (payload) => ipcRenderer.invoke('app-notify', payload),
  geocodeCity: (query) => ipcRenderer.invoke('prayer-geocode', query),

  // System environment check
  checkSystemEnv: () => ipcRenderer.invoke('system-env-check'),

  // Main log tail for the Settings log viewer
  getMainLog: (limit) => ipcRenderer.invoke('get-main-log', limit),

  // Crash dumps (local minidumps, never uploaded)
  getCrashDumps: () => ipcRenderer.invoke('get-crash-dumps'),
  clearCrashDumps: () => ipcRenderer.invoke('clear-crash-dumps'),
  openCrashDumpsFolder: () => ipcRenderer.invoke('open-crash-dumps-folder'),

  // Reset DevLauncher to a fresh-install state (writes a marker, relaunches)
  resetAppData: () => ipcRenderer.invoke('reset-app-data'),

  // Health analytics
  getHealth: (projectId) => ipcRenderer.invoke('get-health', projectId),
  clearHealth: (projectId) => ipcRenderer.invoke('clear-health', projectId),

  // Renderer error reporting (window.onerror / unhandledrejection → main.log)
  reportRendererError: (payload) => ipcRenderer.invoke('renderer-error', payload),

  // Update checker + auto-update (electron-updater)
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  downloadUpdate: () => ipcRenderer.invoke('update-download'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  getUpdateState: () => ipcRenderer.invoke('update-get-state'),
  mcpGetStatus: () => ipcRenderer.invoke('mcp-status'),
  respondMcpApproval: (id, decision) => ipcRenderer.invoke('mcp-approval-respond', id, decision),
  onMcpApprovalRequest: (callback) => {
    const listener = (_event: IpcRendererEvent, request: unknown) => callback(request)
    ipcRenderer.on('mcp-approval-request', listener)
    return () => ipcRenderer.removeListener('mcp-approval-request', listener)
  },
  onUpdateState: (callback) => {
    const listener = (_event: IpcRendererEvent, state: unknown) => callback(state)
    ipcRenderer.on('update-state', listener)
    return () => ipcRenderer.removeListener('update-state', listener)
  },

  // AI Agent (oh-my-pi)
  ompStatus: () => ipcRenderer.invoke('omp-status'),
  ompListSessions: (projectId) => ipcRenderer.invoke('omp-list-sessions', projectId),
  ompListAllSessions: () => ipcRenderer.invoke('omp-list-all-sessions'),
  searchWorkspaceFiles: (query, projectPaths) => ipcRenderer.invoke('workspace-search-files', query, projectPaths),
  ompCreateSession: (projectId, title) => ipcRenderer.invoke('omp-create-session', projectId, title),
  ompDeleteSession: (projectId, sessionId) => ipcRenderer.invoke('omp-delete-session', projectId, sessionId),
  ompRenameSession: (projectId, sessionId, title) => ipcRenderer.invoke('omp-rename-session', projectId, sessionId, title),
  ompUpdateSessionTokens: (projectId, sessionId, tokens, cost) => ipcRenderer.invoke('omp-update-session-tokens', projectId, sessionId, tokens, cost),
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
  ompExportConversation: (projectId, cwd, sessionPath, title) => ipcRenderer.invoke('omp-export-conversation', projectId, cwd, sessionPath, title),
  ompTogglePin: (projectId, sessionId) => ipcRenderer.invoke('omp-toggle-pin', projectId, sessionId),
  ompBranch: (projectId, cwd, entryId) => ipcRenderer.invoke('omp-branch', projectId, cwd, entryId),
  ompGetBranchMessages: (projectId, cwd) => ipcRenderer.invoke('omp-get-branch-messages', projectId, cwd),
  ompSetSubagentSubscription: (projectId, cwd, level) => ipcRenderer.invoke('omp-set-subagent-subscription', projectId, cwd, level),
  ompGetSubagents: (projectId, cwd) => ipcRenderer.invoke('omp-get-subagents', projectId, cwd),
  ompHandoff: (projectId, cwd, customInstructions) => ipcRenderer.invoke('omp-handoff', projectId, cwd, customInstructions),
  ompBash: (projectId, cwd, command) => ipcRenderer.invoke('omp-bash', projectId, cwd, command),
  ompAbortBash: (projectId, cwd) => ipcRenderer.invoke('omp-abort-bash', projectId, cwd),
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
    const listener = (_event: IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on('omp-event', listener)
    return () => ipcRenderer.removeListener('omp-event', listener)
  },
  onOmpInstallProgress: (callback) => {
    const listener = (_event: IpcRendererEvent, state: unknown) => callback(state)
    ipcRenderer.on('omp-install-progress', listener)
    return () => ipcRenderer.removeListener('omp-install-progress', listener)
  },
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', api)

