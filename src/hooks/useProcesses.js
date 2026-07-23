import { useState, useEffect, useCallback } from 'react';
import * as ipc from '../utils/ipcRenderer';

/**
 * useProcesses Hook
 * Manages process lifecycle and subscribes to process events
 */
export const useProcesses = (projects = [], onProjectUpdate) => {
  const [processStatuses, setProcessStatuses] = useState({});
  const [processLogs, setProcessLogs] = useState({});

  // Start a project
  const startProject = useCallback(async (projectId) => {
    try {
      // Find project data to get path, command, and env
      const project = projects.find(p => p.id === projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      // Validate required fields
      if (!project.path) {
        return { success: false, error: 'Project path is missing' };
      }
      if (!project.startCommand) {
        return { success: false, error: 'Start command is missing' };
      }

      // Convert envVars array to object format
      // From: [{key: 'NODE_ENV', value: 'development'}]
      // To: {NODE_ENV: 'development'}
      const envObject = {};
      if (Array.isArray(project.envVars)) {
        project.envVars.forEach(env => {
          if (env.key && env.key.trim()) {
            envObject[env.key] = env.value || '';
          }
        });
      }

      console.log('[useProcesses] Starting project:', {
        projectId,
        path: project.path,
        command: project.startCommand,
        env: envObject
      });

      // Update local status immediately BEFORE IPC call for responsive UI
      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: 'starting'
      }));

      // Notify parent component to update project status
      if (onProjectUpdate) {
        onProjectUpdate(projectId, { status: 'starting' });
      }

      const response = await ipc.startProject(
        projectId,
        project.path,
        project.startCommand,
        envObject
      );

      if (response.success) {
        const normalizedStatus = (response.status || 'running').toLowerCase();
        setProcessStatuses(prev => ({
          ...prev,
          [projectId]: normalizedStatus
        }));

        if (onProjectUpdate) {
          onProjectUpdate(projectId, {
            status: normalizedStatus,
            pid: response.pid
          });
        }

        return { success: true };
      } else {
        // Revert status on failure
        setProcessStatuses(prev => ({
          ...prev,
          [projectId]: 'stopped'
        }));

        if (onProjectUpdate) {
          onProjectUpdate(projectId, { status: 'stopped' });
        }

        return { success: false, error: response.error || 'Failed to start project' };
      }
    } catch (err) {
      console.error('Error starting project:', err);
      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: 'stopped'
      }));
      if (onProjectUpdate) {
        onProjectUpdate(projectId, { status: 'stopped' });
      }
      return { success: false, error: err.message };
    }
  }, [projects, onProjectUpdate]);

  // Stop a project
  const stopProject = useCallback(async (projectId) => {
    setProcessStatuses(prev => ({
      ...prev,
      [projectId]: 'stopping'
    }));
    if (onProjectUpdate) {
      onProjectUpdate(projectId, { status: 'stopping' });
    }

    try {
      const response = await ipc.stopProject(projectId);

      if (response.success) {
        setProcessStatuses(prev => ({
          ...prev,
          [projectId]: 'stopped'
        }));

        if (onProjectUpdate) {
          onProjectUpdate(projectId, { status: 'stopped', pid: null, uptime: null });
        }

        return { success: true };
      } else {
        setProcessStatuses(prev => ({
          ...prev,
          [projectId]: 'running'
        }));
        if (onProjectUpdate) {
          onProjectUpdate(projectId, { status: 'running' });
        }
        return { success: false, error: response.error || 'Failed to stop project' };
      }
    } catch (err) {
      console.error('Error stopping project:', err);
      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: 'running'
      }));
      if (onProjectUpdate) {
        onProjectUpdate(projectId, { status: 'running' });
      }
      return { success: false, error: err.message };
    }
  }, [onProjectUpdate]);

  // Restart a project
  const restartProject = useCallback(async (projectId) => {
    try {
      // Find project data to get path, command, and env
      const project = projects.find(p => p.id === projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      // Validate required fields
      if (!project.path) {
        return { success: false, error: 'Project path is missing' };
      }
      if (!project.startCommand) {
        return { success: false, error: 'Start command is missing' };
      }

      // Convert envVars array to object format
      const envObject = {};
      if (Array.isArray(project.envVars)) {
        project.envVars.forEach(env => {
          if (env.key && env.key.trim()) {
            envObject[env.key] = env.value || '';
          }
        });
      }

      console.log('[useProcesses] Restarting project:', {
        projectId,
        path: project.path,
        command: project.startCommand,
        env: envObject
      });

      // Update local status immediately BEFORE IPC call for responsive UI
      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: 'starting'
      }));

      if (onProjectUpdate) {
        onProjectUpdate(projectId, { status: 'starting' });
      }

      const response = await ipc.restartProject(
        projectId,
        project.path,
        project.startCommand,
        envObject
      );

      if (response.success) {
        return { success: true };
      } else {
        // Revert status on failure
        setProcessStatuses(prev => ({
          ...prev,
          [projectId]: 'stopped'
        }));

        if (onProjectUpdate) {
          onProjectUpdate(projectId, { status: 'stopped' });
        }

        return { success: false, error: response.error || 'Failed to restart project' };
      }
    } catch (err) {
      console.error('Error restarting project:', err);
      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: 'stopped'
      }));
      if (onProjectUpdate) {
        onProjectUpdate(projectId, { status: 'stopped' });
      }
      return { success: false, error: err.message };
    }
  }, [projects, onProjectUpdate]);

  // Start all projects
  const startAll = useCallback(async () => {
    try {
      const response = await ipc.startAllProjects();
      return response;
    } catch (err) {
      console.error('Error starting all projects:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Stop all projects
  const stopAll = useCallback(async () => {
    try {
      const response = await ipc.stopAllProjects();
      return response;
    } catch (err) {
      console.error('Error stopping all projects:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Get process status
  const getStatus = useCallback(async (projectId) => {
    try {
      const response = await ipc.getProcessStatus(projectId);
      return response;
    } catch (err) {
      console.error('Error getting process status:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Get logs for a specific project
  const getLogs = useCallback((projectId) => {
    return processLogs[projectId] || [];
  }, [processLogs]);

  // Clear logs for a specific project
  const clearLogs = useCallback((projectId) => {
    setProcessLogs(prev => ({
      ...prev,
      [projectId]: []
    }));
  }, []);

  // Subscribe to process status updates
  useEffect(() => {
    const cleanup = ipc.onProcessStatus((projectId, status) => {
      console.log(`[Process Status] Project ${projectId}:`, status);

      const rawStatus = typeof status === 'string' ? status : status?.status;
      const normalizedStatus = (rawStatus || 'stopped').toLowerCase();

      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: normalizedStatus
      }));

      if (onProjectUpdate) {
        onProjectUpdate(projectId, {
          status: normalizedStatus,
          pid: status?.pid,
          port: status?.port,
          uptime: status?.uptime
        });
      }
    });

    return cleanup;
  }, [onProjectUpdate]);

  // Subscribe to process logs
  useEffect(() => {
    const cleanup = ipc.onProcessLog((projectId, logLine) => {
      setProcessLogs(prev => {
        const logs = prev[projectId] || [];
        return {
          ...prev,
          [projectId]: [...logs, logLine].slice(-1000)
        };
      });
    });

    return cleanup;
  }, []);

  // Subscribe to process errors
  useEffect(() => {
    const cleanup = ipc.onProcessError((projectId, error) => {
      console.error(`[Process Error] Project ${projectId}:`, error);

      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: 'error'
      }));

      if (onProjectUpdate) {
        onProjectUpdate(projectId, {
          status: 'error',
          errorMessage: error
        });
      }
    });

    return cleanup;
  }, [onProjectUpdate]);

  // Subscribe to process exits
  useEffect(() => {
    const cleanup = ipc.onProcessExit((projectId, code) => {
      console.log(`[Process Exit] Project ${projectId} exited with code:`, code);

      const status = code === 0 ? 'stopped' : 'error';

      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: status
      }));

      if (onProjectUpdate) {
        onProjectUpdate(projectId, {
          status,
          pid: null,
          uptime: null,
          ...(code !== 0 && { errorMessage: `exit code ${code}` })
        });
      }
    });

    return cleanup;
  }, [onProjectUpdate]);

  return {
    processStatuses,
    processLogs,
    startProject,
    stopProject,
    restartProject,
    startAll,
    stopAll,
    getStatus,
    getLogs,
    clearLogs
  };
};
