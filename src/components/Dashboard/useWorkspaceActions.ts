import { useEffect, useState } from 'react';
import type { ProcessStartResult } from '../../data/processes';
import type { ViewProject } from './ProjectCard';
import type { WorkspaceActionComplete } from './DashboardView';

export interface UseWorkspaceActionsOptions {
  projects: ViewProject[];
  onStart?: (project: ViewProject) => unknown;
  onStartAll?: (projects: ViewProject[]) => Promise<ProcessStartResult[] | { success: boolean; error?: string }>;
  onStop?: (project: ViewProject) => void;
  onStopAll?: (projects: ViewProject[]) => Promise<unknown>;
  onWorkspaceActionComplete?: (result: WorkspaceActionComplete) => void;
}

export interface UseWorkspaceActionsResult {
  workspaceAction: string;
  workspaceTargets: string[];
  workspaceInitialFailures: number;
  startWorkspace: () => Promise<void>;
  stopWorkspace: () => Promise<void>;
}

const isProcessStartResult = (item: unknown): item is ProcessStartResult =>
  Boolean(item) && typeof item === 'object' && item != null && 'success' in item;

/** Orchestrates "Start/Stop workspace" bulk actions and reports completion. */
export function useWorkspaceActions({
  projects,
  onStart,
  onStartAll,
  onStop,
  onStopAll,
  onWorkspaceActionComplete,
}: UseWorkspaceActionsOptions): UseWorkspaceActionsResult {
  const [workspaceAction, setWorkspaceAction] = useState('idle'); // 'idle', 'starting', 'stopping'
  const [workspaceTargets, setWorkspaceTargets] = useState<string[]>([]);
  const [workspaceInitialFailures, setWorkspaceInitialFailures] = useState(0);

  const resetWorkspace = () => {
    setWorkspaceAction('idle');
    setWorkspaceTargets([]);
    setWorkspaceInitialFailures(0);
  };

  const startWorkspace = async (): Promise<void> => {
    const projectsToStart = projects.filter(p => !['running', 'starting', 'stopping'].includes((p.status || '').toLowerCase()));
    if (projectsToStart.length === 0) return;

    setWorkspaceAction('starting');
    try {
      const result = onStartAll
        ? await onStartAll(projectsToStart)
        : await Promise.all(projectsToStart.map(project => onStart?.(project)));
      const items: ProcessStartResult[] = (Array.isArray(result) ? result : []).filter(isProcessStartResult);
      const acceptedIds = Array.isArray(result)
        ? items.filter((item) => item.success).map((item) => item.projectId)
        : projectsToStart.map((project) => project.id);
      setWorkspaceInitialFailures(Array.isArray(result) ? items.filter((item) => !item.success).length : 0);
      if (acceptedIds.length > 0) setWorkspaceTargets(acceptedIds);
      else resetWorkspace();
    } catch {
      resetWorkspace();
    }
  };

  const stopWorkspace = async (): Promise<void> => {
    const projectsToStop = projects.filter((project) => ['running', 'starting'].includes((project.status || '').toLowerCase()));
    if (projectsToStop.length === 0) return;

    setWorkspaceAction('stopping');
    setWorkspaceTargets(projectsToStop.map((project) => project.id));
    try {
      if (onStopAll) await onStopAll(projectsToStop);
      else await Promise.all(projectsToStop.map(project => onStop?.(project)));
    } catch {
      resetWorkspace();
    }
  };

  useEffect(() => {
    if (workspaceAction === 'idle' || workspaceTargets.length === 0) return;
    const targetProjects = workspaceTargets
      .map((id) => projects.find((project) => project.id === id))
      .filter((project): project is ViewProject => Boolean(project));
    if (targetProjects.length !== workspaceTargets.length) {
      resetWorkspace();
      return;
    }

    const terminalStatuses = workspaceAction === 'starting'
      ? ['running', 'error', 'stopped']
      : ['stopped', 'error'];
    if (targetProjects.every((project) => terminalStatuses.includes((project.status || '').toLowerCase()))) {
      const failedTargets = workspaceAction === 'starting'
        ? targetProjects.filter((project) => ['error', 'stopped'].includes((project.status || '').toLowerCase())).length
        : targetProjects.filter((project) => (project.status || '').toLowerCase() === 'error').length;
      const failed = failedTargets + workspaceInitialFailures;
      onWorkspaceActionComplete?.({
        action: workspaceAction,
        completed: targetProjects.length - failedTargets,
        failed,
      });
      resetWorkspace();
    }
  }, [projects, workspaceAction, workspaceTargets, workspaceInitialFailures, onWorkspaceActionComplete]);

  return { workspaceAction, workspaceTargets, workspaceInitialFailures, startWorkspace, stopWorkspace };
}
