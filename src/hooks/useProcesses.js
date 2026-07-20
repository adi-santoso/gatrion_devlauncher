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
      const response = await ipc.startProject(projectId);

      if (response.success) {
        // Update local status immediately for responsive UI
        setProcessStatuses(prev => ({
          ...prev,
          [projectId]: 'starting'
        }));

        // Notify parent component to update project status
        if (onProjectUpdate) {
          onProjectUpdate(projectId, { status: 'starting' });
        }

        return { success: true };
      } else {
        return { success: false, error: response.error || 'Failed to start project' };
      }
    } catch (err) {
      console.error('Error starting project:', err);
      return { success: false, error: err.message };
    }
  }, [onProjectUpdate]);

  // Stop a project
  const stopProject = useCallback(async (projectId) => {
    try {
      const response = await ipc.stopProject(projectId);

      if (response.success) {
        setProcessStatuses(prev => ({
          ...prev,
          [projectId]: 'stopped'
        }));

        if (onProjectUpdate) {
          onProjectUpdate(projectId, { status: 'stopped' });
        }

        return { success: true };
      } else {
        return { success: false, error: response.error || 'Failed to stop project' };
      }
    } catch (err) {
      console.error('Error stopping project:', err);
      return { success: false, error: err.message };
    }
  }, [onProjectUpdate]);

  // Restart a project
  const restartProject = useCallback(async (projectId) => {
    try {
      const response = await ipc.restartProject(projectId);

      if (response.success) {
        setProcessStatuses(prev => ({
          ...prev,
          [projectId]: 'starting'
        }));

        if (onProjectUpdate) {
          onProjectUpdate(projectId, { status: 'starting' });
        }

        return { success: true };
      } else {
        return { success: false, error: response.error || 'Failed to restart project' };
      }
    } catch (err) {
      console.error('Error restarting project:', err);
      return { success: false, error: err.message };
    }
  }, [onProjectUpdate]);

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

      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: status.status
      }));

      if (onProjectUpdate) {
        onProjectUpdate(projectId, {
          status: status.status,
          pid: status.pid,
          port: status.port,
          uptime: status.uptime
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
          [projectId]: [...logs, logLine]
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
          ...(code !== 0 && { errorMessage: `exit code ${code}` })
        });
      }
    });

    return cleanup;
  }, [onProjectUpdate]);

  return {
    processStatuses,
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
