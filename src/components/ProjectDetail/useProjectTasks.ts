import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import { useDetailI18n } from './useDetailI18n';

export interface ProjectTask {
  runId: number;
  status: string;
  code?: number | null;
}
const registry = new Map<string, Record<string, ProjectTask>>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
const emptyTasks: Record<string, ProjectTask> = {};
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const notify = () => listeners.forEach(listener => listener());

/** One source of task state per project, reconciled with the process manager. */
export function useProjectTasks(projectId: string) {
  const t = useDetailI18n();
  const tasks = useSyncExternalStore(subscribe, () => registry.get(projectId) || emptyTasks);
  const busy = useSyncExternalStore(subscribe, () => [...pending].find(key => key.startsWith(`${projectId}:`))?.slice(projectId.length + 1) || null);
  const [error, setError] = useState<string | null>(null);
  const publish = useCallback((next: Record<string, ProjectTask>) => {
    registry.set(projectId, next);
    notify();
  }, [projectId]);
  useEffect(() => {
    let disposed = false;
    let checking = false;
    const refresh = async () => {
      if (checking) return;
      checking = true;
      try {
        const entries = Object.entries(registry.get(projectId) || {});
        if (!entries.some(([name, task]) => task.status === 'running' && !pending.has(`${projectId}:${name}`))) return;
        const updated = await Promise.all(entries.map(async ([name, task]) => {
          if (task.status !== 'running' || pending.has(`${projectId}:${name}`)) return [name, task] as const;
          const result = await ipc.getCustomCommandStatus(task.runId);
          if (result.success === false) throw new Error(result.error || t('Unable to read task status'));
          return [name, { ...task, status: String(result.status || 'stopped'), code: result.code as number | null | undefined }] as const;
        }));
        if (!disposed) {
          // A task started during this poll must not be overwritten by its old run.
          const next = { ...(registry.get(projectId) || {}) };
          for (const [name, task] of updated) if (next[name]?.runId === task.runId && next[name]?.status === 'running' && !pending.has(`${projectId}:${name}`)) next[name] = task;
          publish(next);
        }
      } catch (cause) {
        if (!disposed) setError(String(cause));
      } finally { checking = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => { disposed = true; clearInterval(timer); };
  }, [projectId, publish, t]);
  const run = async (name: string, action: () => Promise<{ success: boolean; error?: string; runId?: number }>) => {
    const key = `${projectId}:${name}`;
    if (pending.has(key) || registry.get(projectId)?.[name]?.status === 'running') return false;
    pending.add(key);
    notify();
    setError(null);
    try {
      const result = await action();
      if (!result.success || result.runId == null) throw new Error(result.error || t('Task did not return a run ID'));
      publish({ ...(registry.get(projectId) || {}), [name]: { runId: result.runId, status: 'running' } });
      return true;
    } catch (cause) { setError(String(cause)); return false; }
    finally { pending.delete(key); notify(); }
  };
  const stop = async (name: string) => {
    const task = registry.get(projectId)?.[name];
    const key = `${projectId}:${name}`;
    if (!task || pending.has(key)) return;
    pending.add(key);
    notify();
    setError(null);
    try {
      const result = await ipc.stopCustomCommand(task.runId);
      if (!result.success) throw new Error(result.error || t('Failed to stop task'));
      const status = await ipc.getCustomCommandStatus(task.runId);
      publish({ ...(registry.get(projectId) || {}), [name]: { ...task, status: String(status.status || 'stopped'), code: status.code as number | null | undefined } });
    } catch (cause) { setError(String(cause)); }
    finally { pending.delete(key); notify(); }
  };
  return { tasks, busy, error, run, stop };
}
