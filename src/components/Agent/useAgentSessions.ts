import { useCallback, useEffect, useRef, useState } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import { cleanIpcError } from './agentChatUtils';
import type { AgentSession, Project } from '../../types/shared';

/** Load the local registry for every project so search and counts are complete. */
export default function useAgentSessions(projects: Project[]) {
  const [sessionsByProject, setSessionsByProject] = useState<Record<string, AgentSession[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const requested = useRef(new Set<string>());
  const inFlight = useRef(new Set<string>());

  const loadSessions = useCallback(async (projectId: string) => {
    if (inFlight.current.has(projectId)) return;
    requested.current.add(projectId);
    inFlight.current.add(projectId);
    setLoading((prev) => ({ ...prev, [projectId]: true }));
    setErrors((prev) => ({ ...prev, [projectId]: null }));
    try {
      const result = await ipc.ompListSessions(projectId);
      if (!result?.success) throw new Error(result?.error || 'Could not load sessions.');
      setSessionsByProject((prev) => ({ ...prev, [projectId]: result.sessions }));
    } catch (error) {
      setErrors((prev) => ({ ...prev, [projectId]: cleanIpcError(error, 'Could not load sessions.') }));
    } finally {
      inFlight.current.delete(projectId);
      setLoading((prev) => ({ ...prev, [projectId]: false }));
    }
  }, []);

  useEffect(() => {
    for (const project of projects) {
      if (!requested.current.has(project.id)) void loadSessions(project.id);
    }
  }, [projects, loadSessions]);

  return { sessionsByProject, setSessionsByProject, loading, errors, loadSessions };
}
