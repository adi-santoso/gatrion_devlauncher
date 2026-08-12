import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../utils/ipcRenderer', () => ({
  startProject: vi.fn(),
  stopProject: vi.fn(),
  restartProject: vi.fn(),
  startAllProjects: vi.fn(),
  stopAllProjects: vi.fn(),
  getProcessStatus: vi.fn(),
  getLogs: vi.fn(),
  clearLogs: vi.fn(),
  getProcessMetrics: vi.fn(),
  onProcessStatus: vi.fn(() => () => {}),
  onProcessLog: vi.fn(() => () => {}),
  onProcessError: vi.fn(() => () => {}),
  onProcessExit: vi.fn(() => () => {}),
  onResourceUpdate: vi.fn(() => () => {}),
}));

import * as ipc from '../../utils/ipcRenderer';
import { useProcesses } from '../useProcesses';

const project = { id: 'p1', name: 'app', path: '/tmp/app' };

describe('useProcesses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.getProcessStatus).mockResolvedValue({ status: 'STOPPED', logs: [] });
    vi.mocked(ipc.getLogs).mockResolvedValue([]);
  });

  test('initializes with empty states', () => {
    const { result } = renderHook(() => useProcesses([], undefined, { maxLines: 1000 }));
    expect(result.current.processStatuses).toEqual({});
    expect(result.current.processLogs).toEqual({});
    expect(result.current.getMetricHistory('p1')).toEqual([]);
  });

  test('startProject sets status to starting then running', async () => {
    vi.mocked(ipc.startProject).mockResolvedValue({ success: true, pid: 1234 });
    const onProjectUpdate = vi.fn();
    const { result } = renderHook(() => useProcesses([project], onProjectUpdate, { maxLines: 1000 }));

    let response;
    await act(async () => {
      response = await result.current.startProject('p1');
    });

    expect(response.success).toBe(true);
    expect(onProjectUpdate).toHaveBeenCalledWith('p1', { status: 'starting' });
    await waitFor(() => expect(onProjectUpdate).toHaveBeenCalledWith('p1', { pid: 1234 }));
  });

  test('startProject reverts to stopped on failure', async () => {
    vi.mocked(ipc.startProject).mockResolvedValue({ success: false, error: 'boom' });
    const onProjectUpdate = vi.fn();
    const { result } = renderHook(() => useProcesses([project], onProjectUpdate, { maxLines: 1000 }));

    let response;
    await act(async () => {
      response = await result.current.startProject('p1');
    });

    expect(response.success).toBe(false);
    expect(onProjectUpdate).toHaveBeenCalledWith('p1', { status: 'stopped' });
  });

  test('stopProject sets status to stopping then stopped', async () => {
    vi.mocked(ipc.stopProject).mockResolvedValue({ success: true, forced: false });
    const onProjectUpdate = vi.fn();
    const { result } = renderHook(() => useProcesses([project], onProjectUpdate, { maxLines: 1000 }));

    await act(async () => {
      await result.current.stopProject('p1');
    });

    expect(onProjectUpdate).toHaveBeenCalledWith('p1', { status: 'stopping' });
    expect(onProjectUpdate).toHaveBeenCalledWith('p1', { status: 'stopped', pid: null, uptime: null });
  });

  test('process logs are appended and capped at maxLines', async () => {
    const { result } = renderHook(() => useProcesses([project], undefined, { maxLines: 3 }));

    const logCallback = vi.mocked(ipc.onProcessLog).mock.calls[0][0];
    await act(async () => {
      for (let i = 0; i < 5; i += 1) {
        logCallback('p1', { timestamp: `2026-01-01T00:00:0${i}Z`, type: 'stdout', message: `line ${i}` });
      }
    });

    expect(result.current.getLogs('p1')).toHaveLength(3);
    expect(result.current.getLogs('p1')[0].message).toBe('line 2');
  });

  test('clearLogs empties the frontend buffer after backend success', async () => {
    vi.mocked(ipc.clearLogs).mockResolvedValue({ success: true });
    const { result } = renderHook(() => useProcesses([project], undefined, { maxLines: 1000 }));

    const logCallback = vi.mocked(ipc.onProcessLog).mock.calls[0][0];
    await act(async () => {
      logCallback('p1', { timestamp: '2026-01-01T00:00:00Z', type: 'stdout', message: 'hello' });
      await result.current.clearLogs('p1');
    });

    expect(result.current.getLogs('p1')).toHaveLength(0);
  });

  test('hydrates backend status and logs after listeners attach', async () => {
    vi.mocked(ipc.getProcessStatus).mockResolvedValue({ status: 'RUNNING', pid: 99, startedAt: Date.now() });
    vi.mocked(ipc.getLogs).mockResolvedValue([{ id: 1, timestamp: '2026-01-01T00:00:00Z', type: 'stdout', message: 'hydrated' }]);
    const onProjectUpdate = vi.fn();
    const { result } = renderHook(() => useProcesses([project], onProjectUpdate, { maxLines: 1000 }));

    await waitFor(() => {
      expect(result.current.processStatuses.p1).toBe('running');
      expect(result.current.getLogs('p1').some((log) => log.message === 'hydrated')).toBe(true);
    });
  });
});
