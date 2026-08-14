/**
 * IPC Renderer Utilities
 * Wrapper functions for Electron IPC calls with fallback for browser dev mode
 */

const isElectron = () => {
  return typeof window !== 'undefined' && window.electron !== undefined;
};

// Mock data for browser development mode
const MOCK_PROJECTS = [
  {
    id: 1,
    name: 'storefront-web',
    path: 'C:/projects/storefront-web',
    status: 'stopped',
    port: 5173,
    type: 'REACT_VITE',
    startCommand: 'npm run dev',
    envVars: [],
    emoji: '⚛️',
    color: '#61DAFB'
  },
  {
    id: 2,
    name: 'payment-api',
    path: 'C:/projects/payment-api',
    status: 'stopped',
    port: 3000,
    type: 'NODEJS',
    startCommand: 'npm start',
    envVars: [],
    emoji: '🟩',
    color: '#339933'
  }
];

const MOCK_CONFIG = {
  theme: 'dark',
  sidebarExpanded: true,
  startOnBoot: false,
  minimizeToTray: true,
  autoStartProjects: false,
  notifications: { onStart: true, onError: true, sound: false },
  terminal: { fontSize: 14, maxLines: 1000, autoScroll: true },
  autoRestart: { enabled: false, maxRetries: 3, delayMs: 2000 },
  preview: { keepAlive: true },
  prayer: {
    showIn: 'both',
    method: 'KEMENAG',
    city: 'Jakarta',
    latitude: -6.2088,
    longitude: 106.8456,
    utcOffset: 7,
    adjustments: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
    notify: true,
    sound: true,
  },
  windowBounds: null,
};

// ==================== Project APIs ====================

export const getProjects = async () => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - using mock data');
    return { success: true, projects: MOCK_PROJECTS };
  }
  return window.electron.getProjects();
};

export const addProject = async (projectData) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock addProject called');
    return { success: true, project: { ...projectData, id: Date.now() } };
  }
  return window.electron.addProject(projectData);
};

export const updateProject = async (projectId, updates) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock updateProject called');
    return { success: true, project: { id: projectId, ...updates } };
  }
  return window.electron.updateProject(projectId, updates);
};

export const deleteProject = async (projectId) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock deleteProject called');
    return { success: true, projectId };
  }
  return window.electron.deleteProject(projectId);
};

export const browseFolder = async () => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock browseFolder called');
    return { success: false, canceled: true };
  }
  return window.electron.browseFolder();
};

export const exportProjects = async () => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - exportProjects not available');
    return { success: false, canceled: true };
  }
  return window.electron.exportProjects();
};

export const importProjects = async () => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - importProjects not available');
    return { success: false, canceled: true };
  }
  return window.electron.importProjects();
};

export const exportDiagnostics = async () => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - exportDiagnostics not available');
    return { success: false, canceled: true };
  }
  return window.electron.exportDiagnostics();
};

export const listEnvFiles = async (projectPath) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock listEnvFiles called');
    return { success: true, files: [] };
  }
  return window.electron.listEnvFiles(projectPath);
};

export const readEnvFile = async (projectPath, fileName) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock readEnvFile called');
    return { success: false, error: 'Electron not available' };
  }
  return window.electron.readEnvFile(projectPath, fileName);
};

export const writeEnvFile = async (projectPath, fileName, content) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock writeEnvFile called');
    return { success: false, error: 'Electron not available' };
  }
  return window.electron.writeEnvFile(projectPath, fileName, content);
};

export const detectProjectType = async (projectPath) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock detectProjectType called');
    return {
      success: true,
      type: 'REACT_VITE',
      name: 'React (Vite)',
      defaultCommand: 'npm run dev',
      defaultPort: 5173,
      icon: '⚛️',
      color: '#61DAFB'
    };
  }
  return window.electron.detectProjectType(projectPath);
};

// ==================== Process APIs ====================

export const startProject = async (projectId) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock startProject called');
    return { success: true, projectId, status: 'running' };
  }
  return window.electron.startProject(projectId);
};

export const stopProject = async (projectId, force = false) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock stopProject called');
    return { success: true, projectId, status: 'stopped' };
  }
  return window.electron.stopProject(projectId, force);
};

export const restartProject = async (projectId) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock restartProject called');
    return { success: true, projectId, status: 'running' };
  }
  return window.electron.restartProject(projectId);
};

export const startAllProjects = async (projectIds, delayMs) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock startAllProjects called');
    return { success: true };
  }
  return window.electron.startAllProjects(projectIds, delayMs);
};

export const stopAllProjects = async () => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock stopAllProjects called');
    return { success: true };
  }
  return window.electron.stopAllProjects();
};

export const getProcessStatus = async (projectId) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock getProcessStatus called');
    return { success: true, status: 'stopped' };
  }
  return window.electron.getProcessStatus(projectId);
};

export const getLogs = async (projectId, limit = 1000) => {
  if (!isElectron()) return [];
  return window.electron.getLogs(projectId, limit);
};

export const checkPortConflict = async (port) => {
  if (!isElectron()) {
    return { inUse: false };
  }
  return window.electron.checkPortConflict(port);
};

export const getProcessMetrics = async (projectId) => {
  if (!isElectron()) {
    return { status: 'stopped', pid: null, uptime: null, memoryMb: null, cpuPercent: null };
  }
  return window.electron.getProcessMetrics(projectId);
};

export const clearLogs = async (projectId) => {
  if (!isElectron()) return { success: true };
  return window.electron.clearLogs(projectId);
};

export const runCustomCommand = async (projectId, commandId) => {
  if (!isElectron()) return { success: false, error: 'Electron not available' };
  return window.electron.runCustomCommand(projectId, commandId);
};

export const stopCustomCommand = async (runId) => {
  if (!isElectron()) return { success: true };
  return window.electron.stopCustomCommand(runId);
};

export const getCustomCommandStatus = async (runId) => {
  if (!isElectron()) return { runId, pid: null, status: 'stopped' };
  return window.electron.getCustomCommandStatus(runId);
};

// ==================== Git APIs ====================

export const gitStatus = async (projectPath) => {
  if (!isElectron()) return { success: true, isRepo: false, branch: null, upstream: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] };
  return window.electron.gitStatus(projectPath);
};

export const gitLog = async (projectPath, limit = 15) => {
  if (!isElectron()) return { success: true, commits: [] };
  return window.electron.gitLog(projectPath, limit);
};

export const gitDiff = async (projectPath, filePath, staged = false) => {
  if (!isElectron()) return { success: true, diff: '' };
  return window.electron.gitDiff(projectPath, filePath, staged);
};

export const gitStage = async (projectPath, files) => {
  if (!isElectron()) return { success: true };
  return window.electron.gitStage(projectPath, files);
};

export const gitUnstage = async (projectPath, files) => {
  if (!isElectron()) return { success: true };
  return window.electron.gitUnstage(projectPath, files);
};

export const gitCommit = async (projectPath, message) => {
  if (!isElectron()) return { success: true };
  return window.electron.gitCommit(projectPath, message);
};

export const gitPull = async (projectPath) => {
  if (!isElectron()) return { success: true };
  return window.electron.gitPull(projectPath);
};

export const gitPush = async (projectPath) => {
  if (!isElectron()) return { success: true };
  return window.electron.gitPush(projectPath);
};

export const gitCheckout = async (projectPath, branch, createNew = false) => {
  if (!isElectron()) return { success: true };
  return window.electron.gitCheckout(projectPath, branch, createNew);
};

export const gitInit = async (projectPath) => {
  if (!isElectron()) return { success: true };
  return window.electron.gitInit(projectPath);
};

export const gitStashList = async (projectPath) => {
  if (!isElectron()) return { success: true, stashes: [] };
  return window.electron.gitStashList(projectPath);
};

export const gitStashPush = async (projectPath, message) => {
  if (!isElectron()) return { success: true };
  return window.electron.gitStashPush(projectPath, message);
};

export const gitStashPop = async (projectPath, index = 0) => {
  if (!isElectron()) return { success: true };
  return window.electron.gitStashPop(projectPath, index);
};

export const gitStashApply = async (projectPath, index = 0) => {
  if (!isElectron()) return { success: true };
  return window.electron.gitStashApply(projectPath, index);
};

export const gitStashDrop = async (projectPath, index = 0) => {
  if (!isElectron()) return { success: true };
  return window.electron.gitStashDrop(projectPath, index);
};

export const gitDiscard = async (projectPath, filePath) => {
  if (!isElectron()) return { success: true };
  return window.electron.gitDiscard(projectPath, filePath);
};

export const gitBlame = async (projectPath, filePath) => {
  if (!isElectron()) return { success: true, lines: [] };
  return window.electron.gitBlame(projectPath, filePath);
};

// ==================== Package Tooling APIs ====================

export const readPackageScripts = async (projectPath) => {
  if (!isElectron()) return { success: true, hasPackageJson: false, scripts: [] };
  return window.electron.readPackageScripts(projectPath);
};

export const checkDependencies = async (projectPath) => {
  if (!isElectron()) return { success: true, hasPackageJson: false, hasNodeModules: false, lockfile: null, packageManager: 'npm', scriptCount: 0, depCount: 0 };
  return window.electron.checkDependencies(projectPath);
};

export const runProjectScript = async (projectId, scriptName) => {
  if (!isElectron()) return { success: false, error: 'Electron not available' };
  return window.electron.runProjectScript(projectId, scriptName);
};

export const installDependencies = async (projectId) => {
  if (!isElectron()) return { success: false, error: 'Electron not available' };
  return window.electron.installDependencies(projectId);
};

export const npmOutdated = async (projectPath) => {
  if (!isElectron()) return { success: true, hasPackageJson: false, outdated: [] };
  return window.electron.npmOutdated(projectPath);
};

export const npmUpdate = async (projectPath, packageName = null) => {
  if (!isElectron()) return { success: false, error: 'Electron not available' };
  return window.electron.npmUpdate(projectPath, packageName);
};

// ==================== Config APIs ====================

export const getConfig = async () => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - using mock config');
    return { success: true, config: MOCK_CONFIG };
  }
  return window.electron.getConfig();
};

export const updateConfig = async (updates) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock updateConfig called');
    return {
      success: true,
      config: {
        ...MOCK_CONFIG,
        ...updates,
        notifications: { ...MOCK_CONFIG.notifications, ...(updates.notifications || {}) },
        terminal: { ...MOCK_CONFIG.terminal, ...(updates.terminal || {}) },
        autoRestart: { ...MOCK_CONFIG.autoRestart, ...(updates.autoRestart || {}) },
        preview: { ...MOCK_CONFIG.preview, ...(updates.preview || {}) },
      },
    };
  }
  return window.electron.updateConfig(updates);
};

// ==================== Activity Feed APIs ====================

export const getActivities = async () => {
  if (!isElectron()) return { success: true, activities: [] };
  return window.electron.getActivities();
};

export const appendActivities = async (entries) => {
  if (!isElectron()) return { success: true };
  return window.electron.appendActivities(entries);
};

// ==================== Workspace Preset APIs ====================

export const getPresets = async () => {
  if (!isElectron()) return { success: true, presets: [] };
  return window.electron.getPresets();
};

export const savePresets = async (presets) => {
  if (!isElectron()) return { success: true, presets };
  return window.electron.savePresets(presets);
};

// ==================== Desktop Integration APIs ====================

export const openExternalUrl = async (url) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - opening URL in window:', url);
    window.open(url, '_blank');
    return { success: true };
  }
  return window.electron.openExternalUrl(url);
};

export const revealInExplorer = async (targetPath) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - revealInExplorer called for path:', targetPath);
    return { success: false, error: 'File Explorer integration requires desktop app' };
  }
  return window.electron.revealInExplorer(targetPath);
};

export const openInEditor = async (targetPath) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - openInEditor called for path:', targetPath);
    return { success: false, error: 'Editor integration requires desktop app' };
  }
  return window.electron.openInEditor(targetPath);
};

// ==================== Event Listeners ====================

export const onProcessStatus = (callback) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onProcessStatus not available');
    return () => {}; // Return cleanup function
  }
  return window.electron.onProcessStatus(callback);
};

export const onProcessLog = (callback) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onProcessLog not available');
    return () => {};
  }
  return window.electron.onProcessLog(callback);
};

export const onProcessError = (callback) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onProcessError not available');
    return () => {};
  }
  return window.electron.onProcessError(callback);
};

export const onProcessExit = (callback) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onProcessExit not available');
    return () => {};
  }
  return window.electron.onProcessExit(callback);
};

export const onProjectsUpdated = (callback) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onProjectsUpdated not available');
    return () => {};
  }
  return window.electron.onProjectsUpdated(callback);
};

export const onNavigateToProject = (callback) => {
  if (!isElectron()) {
    return () => {};
  }
  return window.electron.onNavigateToProject(callback);
};

// ==================== Resource Monitoring ====================

/**
 * Subscribe to real-time CPU/memory updates for projects
 * @param {(data: {projectId: string, cpu: number, memory: number}) => void} callback
 */
export const onResourceUpdate = (callback) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onResourceUpdate not available');
    return () => {};
  }
  return window.electron.onResourceUpdate(callback);
};

// ==================== Embedded Preview APIs ====================

export const previewShow = async (payload) => {
  if (!isElectron()) return { success: false, error: 'Preview requires desktop app' };
  return window.electron.previewShow(payload);
};

export const previewHide = async (projectId) => {
  if (!isElectron()) return { success: true };
  return window.electron.previewHide(projectId);
};

export const previewSetBounds = async (projectId, bounds) => {
  if (!isElectron()) return { success: true };
  return window.electron.previewSetBounds(projectId, bounds);
};

export const previewNavigate = async (projectId, url) => {
  if (!isElectron()) return { success: false, error: 'Preview requires desktop app' };
  return window.electron.previewNavigate(projectId, url);
};

export const previewReload = async (projectId) => {
  if (!isElectron()) return { success: false, error: 'Preview requires desktop app' };
  return window.electron.previewReload(projectId);
};

export const previewZoom = async (projectId, zoomLevel) => {
  if (!isElectron()) return { success: true };
  return window.electron.previewZoom(projectId, zoomLevel);
};

export const previewClearData = async (projectId) => {
  if (!isElectron()) return { success: false, error: 'Preview requires desktop app' };
  return window.electron.previewClearData(projectId);
};

export const previewDestroy = async (projectId) => {
  if (!isElectron()) return { success: true };
  return window.electron.previewDestroy(projectId);
};

export const previewToggleDevTools = async (projectId) => {
  if (!isElectron()) return { success: false, error: 'Preview requires desktop app' };
  return window.electron.previewToggleDevTools(projectId);
};

export const onPreviewConsole = (callback) => {
  if (!isElectron()) return () => {};
  return window.electron.onPreviewConsole(callback);
};

// ==================== Interactive Terminal APIs ====================

export const terminalCreate = async (options) => {
  if (!isElectron()) return { success: false, error: 'Electron not available' };
  return window.electron.terminalCreate(options);
};

export const terminalInput = async (id, data) => {
  if (!isElectron()) return { success: false };
  return window.electron.terminalInput(id, data);
};

export const terminalResize = async (id, cols, rows) => {
  if (!isElectron()) return { success: false };
  return window.electron.terminalResize(id, cols, rows);
};

export const terminalKill = async (id) => {
  if (!isElectron()) return { success: true };
  return window.electron.terminalKill(id);
};

export const onTerminalData = (callback) => {
  if (!isElectron()) return () => {};
  return window.electron.onTerminalData(callback);
};

export const onTerminalExit = (callback) => {
  if (!isElectron()) return () => {};
  return window.electron.onTerminalExit(callback);
};

export const isElectronAvailable = isElectron;

export const showNotification = async (payload) => {
  if (!isElectron()) return { success: true };
  return window.electron.showNotification(payload);
};

export const geocodeCity = async (query) => {
  if (!isElectron()) return { success: false, error: 'Geocoding is only available in the desktop app' };
  return window.electron.geocodeCity(query);
};

// ==================== Health Analytics ====================

export const getHealth = async (projectId) => {
  if (!isElectron()) {
    return { success: true, stats: { crashes: [], runs: [], totalRuns: 0, totalUptimeMs: 0, avgUptimeMs: 0, lastRun: null, daily: [] } };
  }
  return window.electron.getHealth(projectId);
};

export const clearHealth = async (projectId) => {
  if (!isElectron()) return { success: true };
  return window.electron.clearHealth(projectId);
};

export const checkUpdate = async () => {
  if (!isElectron()) return { success: true, updateAvailable: false };
  return window.electron.checkUpdate();
};

export const downloadUpdate = async () => {
  if (!isElectron()) return { success: false, error: 'Electron not available' };
  return window.electron.downloadUpdate();
};

export const installUpdate = async () => {
  if (!isElectron()) return { success: false, error: 'Electron not available' };
  return window.electron.installUpdate();
};

export const onUpdateState = (callback) => {
  if (!isElectron()) return () => {};
  return window.electron.onUpdateState(callback);
};

// ==================== AI Agent (oh-my-pi) ====================

export const ompStatus = async () => {
  if (!isElectron()) return { success: true, installed: false, version: null, binaryPath: null, configured: false };
  return window.electron.ompStatus();
};

export const ompListSessions = async (projectId) => {
  if (!isElectron()) return { success: true, sessions: [] };
  return window.electron.ompListSessions(projectId);
};

export const ompListAllSessions = async () => {
  if (!isElectron()) return { success: true, sessions: [] };
  return window.electron.ompListAllSessions();
};

export const searchWorkspaceFiles = async (query, projectPaths) => {
  if (!isElectron()) return { success: true, files: [] };
  return window.electron.searchWorkspaceFiles(query, projectPaths);
};

export const ompCreateSession = async (projectId, title = '') => {
  if (!isElectron()) return { success: true, session: { id: 'mock', title: title || 'Session' } };
  return window.electron.ompCreateSession(projectId, title);
};

export const ompDeleteSession = async (projectId, sessionId) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompDeleteSession(projectId, sessionId);
};

export const ompRenameSession = async (projectId, sessionId, title) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompRenameSession(projectId, sessionId, title);
};

export const ompUpdateSessionTokens = async (projectId, sessionId, tokens, cost) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompUpdateSessionTokens(projectId, sessionId, tokens, cost);
};

export const ompChat = async (projectId, cwd, message, options = {}) => {
  if (!isElectron()) return { success: false, error: 'Electron not available' };
  return window.electron.ompChat(projectId, cwd, message, options);
};

export const ompSteer = async (projectId, cwd, message) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompSteer(projectId, cwd, message);
};

export const ompAbort = async (projectId, cwd) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompAbort(projectId, cwd);
};

export const ompGetMessages = async (projectId, cwd, options = {}) => {
  if (!isElectron()) return { success: true, messages: [] };
  return window.electron.ompGetMessages(projectId, cwd, options);
};

export const ompGetModels = async (projectId, cwd) => {
  if (!isElectron()) return { success: true, models: [] };
  return window.electron.ompGetModels(projectId, cwd);
};

export const ompSetModel = async (projectId, cwd, provider, modelId) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompSetModel(projectId, cwd, provider, modelId);
};

export const ompSetThinkingLevel = async (projectId, cwd, level) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompSetThinkingLevel(projectId, cwd, level);
};

export const ompGetState = async (projectId, cwd) => {
  if (!isElectron()) return { success: true, state: { thinkingLevel: null } };
  return window.electron.ompGetState(projectId, cwd);
};

export const ompCompact = async (projectId, cwd, customInstructions) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompCompact(projectId, cwd, customInstructions);
};

export const ompSetAutoCompaction = async (projectId, cwd, enabled) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompSetAutoCompaction(projectId, cwd, enabled);
};

export const ompSetAutoRetry = async (projectId, cwd, enabled) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompSetAutoRetry(projectId, cwd, enabled);
};

export const ompAbortRetry = async (projectId, cwd) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompAbortRetry(projectId, cwd);
};

export const ompSetFastMode = async (projectId, cwd, enabled) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompSetFastMode(projectId, cwd, enabled);
};

export const ompGetCommands = async (projectId, cwd) => {
  if (!isElectron()) return { success: true, commands: [] };
  return window.electron.ompGetCommands(projectId, cwd);
};

export const ompExportConversation = async (projectId, cwd, sessionPath, title) => {
  if (!isElectron()) return { success: false, error: 'Electron not available' };
  return window.electron.ompExportConversation(projectId, cwd, sessionPath, title);
};

export const ompTogglePin = async (projectId, sessionId) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompTogglePin(projectId, sessionId);
};

export const ompBranch = async (projectId, cwd, entryId) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompBranch(projectId, cwd, entryId);
};

export const ompGetBranchMessages = async (projectId, cwd) => {
  if (!isElectron()) return { success: true, messages: [] };
  return window.electron.ompGetBranchMessages(projectId, cwd);
};

export const ompSetSubagentSubscription = async (projectId, cwd, level) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompSetSubagentSubscription(projectId, cwd, level);
};

export const ompGetSubagents = async (projectId, cwd) => {
  if (!isElectron()) return { success: true, subagents: [] };
  return window.electron.ompGetSubagents(projectId, cwd);
};

export const ompHandoff = async (projectId, cwd, customInstructions) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompHandoff(projectId, cwd, customInstructions);
};

export const ompBash = async (projectId, cwd, command) => {
  if (!isElectron()) return { success: false, error: 'Electron not available' };
  return window.electron.ompBash(projectId, cwd, command);
};

export const ompAbortBash = async (projectId, cwd) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompAbortBash(projectId, cwd);
};

export const ompInstall = async () => {
  if (!isElectron()) return { success: false, error: 'Electron not available' };
  return window.electron.ompInstall();
};

export const ompInstallState = async () => {
  if (!isElectron()) return { success: true, status: 'idle' };
  return window.electron.ompInstallState();
};

export const ompCheckUpdate = async () => {
  if (!isElectron()) return { success: true, latest: null };
  return window.electron.ompCheckUpdate();
};

export const ompOpenDocs = async () => {
  if (!isElectron()) return { success: true };
  return window.electron.ompOpenDocs();
};

export const ompConfigGet = async () => {
  if (!isElectron()) return { success: true, providers: [], defaultModel: null, configPath: null };
  return window.electron.ompConfigGet();
};

export const ompConfigSaveProvider = async (input) => {
  if (!isElectron()) return { success: false, error: 'Electron not available' };
  return window.electron.ompConfigSaveProvider(input);
};

export const ompConfigDeleteProvider = async (name) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompConfigDeleteProvider(name);
};

export const ompConfigSetDefault = async (modelRef) => {
  if (!isElectron()) return { success: true };
  return window.electron.ompConfigSetDefault(modelRef);
};

export const ompRunSetup = async () => {
  if (!isElectron()) return { success: false, error: 'Electron not available' };
  return window.electron.ompRunSetup();
};

export const onOmpEvent = (callback) => {
  if (!isElectron()) return () => {};
  return window.electron.onOmpEvent(callback);
};

export const onOmpInstallProgress = (callback) => {
  if (!isElectron()) return () => {};
  return window.electron.onOmpInstallProgress(callback);
};

// ==================== System Environment ====================

export const checkSystemEnv = async () => {
  if (!isElectron()) {
    // Browser dev-mode mock: report a few common tools
    return {
      success: true,
      tools: [
        { name: 'node', label: 'Node.js', found: true, version: 'v23.9.0 (mock)' },
        { name: 'npm', label: 'npm', found: true, version: '10.9.2 (mock)' },
        { name: 'git', label: 'Git', found: true, version: 'git version 2.47.0 (mock)' },
        { name: 'php', label: 'PHP', found: false },
        { name: 'omp', label: 'oh-my-pi (AI agent)', found: false },
      ],
      checkedAt: new Date().toISOString(),
    };
  }
  return window.electron.checkSystemEnv();
};

export const getMainLog = async (limit = 500) => {
  if (!isElectron()) return { success: true, lines: [] };
  return window.electron.getMainLog(limit);
};

export const getCrashDumps = async () => {
  if (!isElectron()) return { success: true, dir: '', dumps: [] };
  return window.electron.getCrashDumps();
};

export const clearCrashDumps = async () => {
  if (!isElectron()) return { success: true };
  return window.electron.clearCrashDumps();
};

export const openCrashDumpsFolder = async () => {
  if (!isElectron()) return { success: false, error: 'Electron not available' };
  return window.electron.openCrashDumpsFolder();
};
