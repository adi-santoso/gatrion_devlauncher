import { useState, useEffect, useCallback } from 'react';
import * as ipc from '../utils/ipcRenderer';

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
        setProjects(response.projects || []);
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
        setProjects(prev => [...prev, response.project]);
        return { success: true, project: response.project };
      } else {
        return { success: false, error: response.error || 'Failed to add project' };
      }
    } catch (err) {
      console.error('Error adding project:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Update an existing project
  const updateProject = useCallback(async (projectId, updates) => {
    try {
      const response = await ipc.updateProject(projectId, updates);

      if (response.success) {
        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, ...updates } : p
        ));
        return { success: true, project: response.project };
      } else {
        return { success: false, error: response.error || 'Failed to update project' };
      }
    } catch (err) {
      console.error('Error updating project:', err);
      return { success: false, error: err.message };
    }
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

  // Subscribe to projects updates
  useEffect(() => {
    const cleanup = ipc.onProjectsUpdated((updatedProjects) => {
      setProjects(updatedProjects);
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
    deleteProject,
    refreshProjects,
    browseFolder,
    detectProjectType
  };
};
