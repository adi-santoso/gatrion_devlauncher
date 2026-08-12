import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../utils/ipcRenderer', () => ({
  getProjects: vi.fn(),
  addProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  browseFolder: vi.fn(),
  detectProjectType: vi.fn(),
  onProjectsUpdated: vi.fn(() => () => {}),
}));

import * as ipc from '../../utils/ipcRenderer';
import { useProjects } from '../useProjects';

const persisted = { id: 'p1', name: 'app', path: '/tmp/app', type: 'NODEJS', status: 'stopped' };

describe('useProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.getProjects).mockResolvedValue({ success: true, projects: [persisted] });
  });

  test('loads projects on mount and resets persisted status to stopped', async () => {
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects[0].id).toBe('p1');
    expect(result.current.projects[0].status).toBe('stopped');
  });

  test('addProject appends the new project', async () => {
    vi.mocked(ipc.addProject).mockResolvedValue({ success: true, project: { ...persisted, id: 'p2', name: 'second' } });
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addProject({ name: 'second', path: '/tmp/second' });
    });

    expect(result.current.projects).toHaveLength(2);
    expect(result.current.projects[1].status).toBe('stopped');
  });

  test('updateProject persists persistable fields via IPC', async () => {
    vi.mocked(ipc.updateProject).mockResolvedValue({ success: true, project: { ...persisted, name: 'renamed' } });
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateProject('p1', { name: 'renamed', status: 'running', pid: 5 });
    });

    expect(ipc.updateProject).toHaveBeenCalledWith('p1', { name: 'renamed' });
    expect(result.current.projects[0].name).toBe('renamed');
  });

  test('updateProjectLocal only mutates local state without IPC', async () => {
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.updateProjectLocal('p1', { status: 'running', pid: 42 });
    });

    expect(ipc.updateProject).not.toHaveBeenCalled();
    expect(result.current.projects[0].status).toBe('running');
    expect(result.current.projects[0].pid).toBe(42);
  });

  test('deleteProject removes the project', async () => {
    vi.mocked(ipc.deleteProject).mockResolvedValue({ success: true });
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteProject('p1');
    });

    expect(result.current.projects).toHaveLength(0);
  });

  test('projects-updated event merges backend data while preserving runtime state', async () => {
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.updateProjectLocal('p1', { status: 'running', pid: 7 });
    });
    expect(result.current.projects[0].status).toBe('running');

    const eventCallback = vi.mocked(ipc.onProjectsUpdated).mock.calls[0][0];
    await act(async () => {
      eventCallback([{ ...persisted, name: 'updated-by-backend' }]);
    });

    expect(result.current.projects[0].name).toBe('updated-by-backend');
    expect(result.current.projects[0].status).toBe('running');
    expect(result.current.projects[0].pid).toBe(7);
  });
});
