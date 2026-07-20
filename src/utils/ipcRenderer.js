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
    framework: 'React',
    type: 'React (Vite)',
    emoji: '⚛️',
    color: '#61DAFB'
  },
  {
    id: 2,
    name: 'payment-api',
    path: 'C:/projects/payment-api',
    status: 'stopped',
    port: 3000,
    framework: 'Express',
    type: 'Node.js',
    emoji: '🟩',
    color: '#339933'
  }
];

const MOCK_CONFIG = {
  theme: 'dark',
  sidebarExpanded: true,
  startOnBoot: false,
  minimizeToTray: true,
  notifyOnStart: false,
  notifyOnCrash: true,
  notificationSound: false,
  terminalFontSize: 14,
  terminalMaxLines: 1000,
  terminalAutoScroll: true
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
    console.warn('[IPC] Running in browser mode - browseFolder not available');
    return { success: false, error: 'File browser not available in browser mode' };
  }
  return window.electron.browseFolder();
};

export const detectProjectType = async (projectPath) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock detectProjectType called');
    return {
      success: true,
      type: 'React',
      framework: 'React (Vite)',
      emoji: '⚛️'
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

export const stopProject = async (projectId) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock stopProject called');
    return { success: true, projectId, status: 'stopped' };
  }
  return window.electron.stopProject(projectId);
};

export const restartProject = async (projectId) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock restartProject called');
    return { success: true, projectId, status: 'running' };
  }
  return window.electron.restartProject(projectId);
};

export const startAllProjects = async () => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - mock startAllProjects called');
    return { success: true };
  }
  return window.electron.startAllProjects();
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
    return { success: true, config: { ...MOCK_CONFIG, ...updates } };
  }
  return window.electron.updateConfig(updates);
};

// ==================== Event Listeners ====================

export const onProcessStatus = (callback) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onProcessStatus not available');
    return () => {}; // Return cleanup function
  }
  window.electron.onProcessStatus(callback);
  // Return cleanup function
  return () => window.electron.removeAllListeners('process-status');
};

export const onProcessLog = (callback) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onProcessLog not available');
    return () => {};
  }
  window.electron.onProcessLog(callback);
  return () => window.electron.removeAllListeners('process-log');
};

export const onProcessError = (callback) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onProcessError not available');
    return () => {};
  }
  window.electron.onProcessError(callback);
  return () => window.electron.removeAllListeners('process-error');
};

export const onProcessExit = (callback) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onProcessExit not available');
    return () => {};
  }
  window.electron.onProcessExit(callback);
  return () => window.electron.removeAllListeners('process-exit');
};

export const onProjectsUpdated = (callback) => {
  if (!isElectron()) {
    console.warn('[IPC] Running in browser mode - onProjectsUpdated not available');
    return () => {};
  }
  window.electron.onProjectsUpdated(callback);
  return () => window.electron.removeAllListeners('projects-updated');
};

// ==================== Utility ====================

export const isElectronAvailable = isElectron;
