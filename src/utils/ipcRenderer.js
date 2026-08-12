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
