import { useState, useEffect, useCallback, useRef } from 'react';
import * as ipc from '../utils/ipcRenderer';

const formatUptime = (startedAt) => {
  if (!startedAt) return null;
  const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${totalSeconds}s`;
};

const runtimeUpdate = (status) => {
  const details = typeof status === 'string' ? { status } : status || {};
  const normalizedStatus = (details.status || 'stopped').toLowerCase();
  const active = normalizedStatus === 'running' || normalizedStatus === 'starting';
  return {
    status: normalizedStatus,
    pid: details.pid ?? null,
    startedAt: details.startedAt ?? null,
    uptime: active ? formatUptime(details.startedAt) : null,
    errorMessage: details.error || null,
    processCommands: details.commands || []
  };
};

/**
 * useProcesses Hook
 * Manages process lifecycle and subscribes to process events
 */
export const useProcesses = (projects = [], onProjectUpdate, options = {}) => {
  const [processStatuses, setProcessStatuses] = useState({});
  const [processLogs, setProcessLogs] = useState({});
  const statusRevisions = useRef({});
  const maxLines = Number.isInteger(options.maxLines) && options.maxLines > 0 ? options.maxLines : 1000;
  const maxLinesRef = useRef(maxLines);
  maxLinesRef.current = maxLines;

  // Start a project
  const startProject = useCallback(async (projectId) => {
    try {
      const project = projects.find(p => p.id === projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      // Update local status immediately BEFORE IPC call for responsive UI
      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: 'starting'
      }));

      // Notify parent component to update project status
      if (onProjectUpdate) {
        onProjectUpdate(projectId, { status: 'starting' });
      }

      const response = await ipc.startProject(projectId);

      if (response.success) {
        setProcessStatuses(prev => {
          const current = prev[projectId];
          if (current === 'running' || current === 'error') {
            return prev;
          }
          const normalizedStatus = (response.status || 'running').toLowerCase();
          return {
            ...prev,
            [projectId]: normalizedStatus
          };
        });

        if (onProjectUpdate) {
          onProjectUpdate(projectId, {
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
  const stopProject = useCallback(async (projectId, force = false) => {
    setProcessStatuses(prev => ({
      ...prev,
      [projectId]: 'stopping'
    }));
    if (onProjectUpdate) {
      onProjectUpdate(projectId, { status: 'stopping' });
    }

    try {
      const response = await ipc.stopProject(projectId, force);

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
      const project = projects.find(p => p.id === projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      // Update local status immediately BEFORE IPC call for responsive UI
      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: 'starting'
      }));

      if (onProjectUpdate) {
        onProjectUpdate(projectId, { status: 'starting' });
      }

      const response = await ipc.restartProject(projectId);

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
  const startAll = useCallback(async (projectIds) => {
    try {
      const response = await ipc.startAllProjects(projectIds);
      if (Array.isArray(response)) {
        for (const result of response) {
          if (!result.projectId) continue;
          const status = result.success ? (result.status || 'starting').toLowerCase() : 'error';
          setProcessStatuses(prev => ({ ...prev, [result.projectId]: status }));
          onProjectUpdate?.(result.projectId, {
            status,
            ...(result.pid != null && { pid: result.pid }),
            ...(!result.success && { errorMessage: result.error || 'Failed to start project' })
          });
        }
      }
      return response;
    } catch (err) {
      console.error('Error starting all projects:', err);
      return { success: false, error: err.message };
    }
  }, [onProjectUpdate]);

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

  // Get logs for a specific project
  const getLogs = useCallback((projectId) => {
    return processLogs[projectId] || [];
  }, [processLogs]);

  // Clear logs for a specific project
  const clearLogs = useCallback(async (projectId) => {
    try {
      const response = await ipc.clearLogs(projectId);
      if (!response.success) return response;
      setProcessLogs(prev => ({ ...prev, [projectId]: [] }));
      return { success: true };
    } catch (err) {
      console.error('Error clearing process logs:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Subscribe to process status updates
  useEffect(() => {
    const cleanup = ipc.onProcessStatus((projectId, status) => {
      statusRevisions.current[projectId] = (statusRevisions.current[projectId] || 0) + 1;

      const update = runtimeUpdate(status);

      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: update.status
      }));

      if (onProjectUpdate) {
        onProjectUpdate(projectId, update);
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
          [projectId]: [...logs, logLine].slice(-maxLinesRef.current)
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

  // Subscribe to CPU/Memory resource updates
  useEffect(() => {
    const cleanup = ipc.onResourceUpdate(({ projectId, cpu, memory }) => {
      // Update the project's CPU and memory in parent component via callback
      if (onProjectUpdate) {
        onProjectUpdate(projectId, {
          cpu: cpu ?? null,
          memory: memory ?? null
        });
      }
    });

    return cleanup;
  }, [onProjectUpdate]);

  const projectIds = JSON.stringify(projects.map(project => project.id));

  // Hydrate after listeners are attached so reloads keep backend runtime state and output.
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const snapshots = await Promise.all(projects.map(async (project) => {
        const statusRevision = statusRevisions.current[project.id] || 0;
        const [statusResult, logsResult] = await Promise.allSettled([
          ipc.getProcessStatus(project.id),
          ipc.getLogs(project.id)
        ]);
        return { project, statusRevision, statusResult, logsResult };
      }));

      if (cancelled) return;

      for (const { project, statusRevision, statusResult, logsResult } of snapshots) {
        if (statusResult.status === 'fulfilled' && statusRevision === (statusRevisions.current[project.id] || 0)) {
          const update = runtimeUpdate(statusResult.value);
          setProcessStatuses(prev => ({ ...prev, [project.id]: update.status }));
          onProjectUpdate?.(project.id, update);
        } else {
          console.error(`Error hydrating status for project ${project.id}:`, statusResult.reason);
        }

        if (logsResult.status === 'fulfilled') {
          setProcessLogs(prev => {
            const logs = [...logsResult.value, ...(prev[project.id] || [])];
            const seen = new Set();
            const merged = logs.filter(log => {
              const key = log.id ?? JSON.stringify([log.timestamp, log.type, log.message]);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            }).sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-maxLinesRef.current);
            return { ...prev, [project.id]: merged };
          });
        } else {
          console.error(`Error hydrating logs for project ${project.id}:`, logsResult.reason);
        }
      }
    };

    hydrate();
    return () => { cancelled = true; };
  }, [projectIds, onProjectUpdate]);

  // Subscribe to process exits
  useEffect(() => {
    const cleanup = ipc.onProcessExit(async (projectId) => {
      const snapshot = await ipc.getProcessStatus(projectId);
      const update = runtimeUpdate(snapshot);
      setProcessStatuses(prev => ({ ...prev, [projectId]: update.status }));
      onProjectUpdate?.(projectId, update);
    });

    return cleanup;
  }, [onProjectUpdate]);

  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const processStatusesRef = useRef(processStatuses);
  processStatusesRef.current = processStatuses;

  const onProjectUpdateRef = useRef(onProjectUpdate);
  onProjectUpdateRef.current = onProjectUpdate;

  // Smart polling for resource metrics (runs once on mount, 4s interval, throttled backend)
  useEffect(() => {
    const pollMetrics = async () => {
      if (document.hidden) return;
      const currentProjects = projectsRef.current || [];
      const currentStatuses = processStatusesRef.current || {};
      const runningProjects = currentProjects.filter(
        p => (currentStatuses[p.id] || p.status || '').toLowerCase() === 'running'
      );

      for (const p of runningProjects) {
        try {
          const metrics = await ipc.getProcessMetrics(p.id);
          if (metrics && metrics.pid) {
            // Only notify if metrics or uptime actually changed
            if (
              p.uptime !== metrics.uptime ||
              p.metrics?.memoryMb !== metrics.memoryMb ||
              p.metrics?.cpuPercent !== metrics.cpuPercent
            ) {
              onProjectUpdateRef.current?.(p.id, {
                uptime: metrics.uptime,
                metrics,
                cpu: metrics.cpuPercent ?? p.cpu ?? null,
                memory: metrics.memoryMb ?? p.memory ?? null
              });
            }
          }
        } catch {
          // Ignore
        }
      }
    };

    const intervalId = setInterval(pollMetrics, 4000);
    return () => clearInterval(intervalId);
  }, []);

  return {
    processStatuses,
    processLogs,
    startProject,
    stopProject,
    restartProject,
    startAll,
    stopAll,
    getLogs,
    clearLogs
  };
};
