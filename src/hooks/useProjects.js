import { useState, useEffect, useCallback } from 'react';
import * as ipc from '../utils/ipcRenderer';
import { upsertProject } from '../utils/projectState';

/**
 * useProjects Hook
 * Manages project state and provides CRUD operations
 */
export const useProjects = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load projects from Electron storage
  const refreshProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ipc.getProjects();

      if (response.success) {
        // Reset all project statuses to 'stopped' on initial load
        // Status is runtime state, not persisted data
        const projectsWithResetStatus = (response.projects || []).map(project => ({
          ...project,
          status: 'stopped'
        }));
        setProjects(projectsWithResetStatus);
      } else {
        setError(response.error || 'Failed to load projects');
      }
    } catch (err) {
      console.error('Error loading projects:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Add a new project
  const addProject = useCallback(async (projectData) => {
    try {
      const response = await ipc.addProject(projectData);

      if (response.success) {
        setProjects(prev => upsertProject(prev, { ...response.project, status: 'stopped' }));
        return { success: true, project: response.project };
      } else {
        return { success: false, error: response.error || 'Failed to add project' };
      }
    } catch (err) {
      console.error('Error adding project:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Update an existing project (persists to backend)
  const updateProject = useCallback(async (projectId, updates) => {
    try {
      // Don't persist runtime-only fields to backend
      const { status: _status, pid: _pid, uptime: _uptime, errorMessage: _errorMessage, ...persistableUpdates } = updates;

      // Only call IPC if there are persistable fields to save
      if (Object.keys(persistableUpdates).length > 0) {
        const response = await ipc.updateProject(projectId, persistableUpdates);
        if (!response.success) {
          return { success: false, error: response.error || 'Failed to update project' };
        }
        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, ...response.project } : p
        ));
      } else {
        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, ...updates } : p
        ));
      }

      return { success: true };
    } catch (err) {
      console.error('Error updating project:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Update project locally only (for runtime state like status, pid, etc.)
  // This does NOT persist to Electron storage — avoids IPC round-trip race conditions
  const updateProjectLocal = useCallback((projectId, updates) => {
    setProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, ...updates } : p
    ));
  }, []);

  // Delete a project
  const deleteProject = useCallback(async (projectId) => {
    try {
      const response = await ipc.deleteProject(projectId);

      if (response.success) {
        setProjects(prev => prev.filter(p => p.id !== projectId));
        return { success: true };
      } else {
        return { success: false, error: response.error || 'Failed to delete project' };
      }
    } catch (err) {
      console.error('Error deleting project:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Browse for folder
  const browseFolder = useCallback(async () => {
    try {
      const response = await ipc.browseFolder();
      return response;
    } catch (err) {
      console.error('Error browsing folder:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Detect project type
  const detectProjectType = useCallback(async (projectPath) => {
    try {
      const response = await ipc.detectProjectType(projectPath);
      return response;
    } catch (err) {
      console.error('Error detecting project type:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Subscribe to projects updates from backend (CRUD changes only)
  // Preserve runtime status when merging backend updates
  useEffect(() => {
    const cleanup = ipc.onProjectsUpdated((updatedProjects) => {
      setProjects(prev => {
        // Build a map of current runtime statuses
        const statusMap = {};
        prev.forEach(p => {
          statusMap[p.id] = {
            status: p.status,
            pid: p.pid,
            uptime: p.uptime,
            errorMessage: p.errorMessage,
            processCommands: p.processCommands
          };
        });

        // Merge backend data with preserved runtime state
        return updatedProjects.map(p => ({
          ...p,
          status: statusMap[p.id]?.status || 'stopped',
          pid: statusMap[p.id]?.pid,
          uptime: statusMap[p.id]?.uptime,
          errorMessage: statusMap[p.id]?.errorMessage,
          processCommands: statusMap[p.id]?.processCommands || []
        }));
      });
    });

    return cleanup;
  }, []);

  // Load projects on mount
  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  return {
    projects,
    loading,
    error,
    addProject,
    updateProject,
    updateProjectLocal,
    deleteProject,
    refreshProjects,
    browseFolder,
    detectProjectType
  };
};
