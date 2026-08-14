import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../utils/ipcRenderer', () => ({
  getActivities: vi.fn(),
  appendActivities: vi.fn(),
  getPresets: vi.fn(),
  savePresets: vi.fn(),
}));

import * as ipc from '../../utils/ipcRenderer';
import { useToasts } from '../useToasts';
import { useActivities } from '../useActivities';
import { usePresets } from '../usePresets';

const projects = [
  { id: 'p1', name: 'app', status: 'stopped' },
  { id: 'p2', name: 'api', status: 'running' },
];

function makeDeps(overrides = {}) {
  return {
    projects,
    startAll: vi.fn(async () => [{ projectId: 'p1', success: true }]),
    stopProjectProcess: vi.fn(async () => ({ success: true })),
    showToast: vi.fn(),
    addActivity: vi.fn(),
    ...overrides,
  };
}

describe('useToasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('showToast adds a toast and auto-dismisses after 5s', () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.showToast('success', 'hi'));
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(5001));
    expect(result.current.toasts).toHaveLength(0);
  });
});

describe('useActivities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.getActivities).mockResolvedValue({ success: true, activities: [] });
    vi.mocked(ipc.appendActivities).mockResolvedValue({ success: true });
  });

  test('hydrates persisted activities on mount', async () => {
    vi.mocked(ipc.getActivities).mockResolvedValue({
      success: true,
      activities: [{ type: 'success', project: 'app', message: 'started', detail: 'port 3000', timestamp: Date.now() }],
    });
    const { result } = renderHook(() => useActivities());
    await waitFor(() => expect(result.current.activities).toHaveLength(1));
    expect(result.current.activities[0].time).toContain('·');
  });

  test('addActivity prepends an entry and persists it', () => {
    const { result } = renderHook(() => useActivities());
    act(() => result.current.addActivity('accent', 'app', 'created'));
    expect(result.current.activities[0]).toMatchObject({ type: 'accent', project: 'app', message: 'created' });
    expect(ipc.appendActivities).toHaveBeenCalledWith([expect.objectContaining({ type: 'accent', project: 'app', message: 'created' })]);
  });
});

describe('usePresets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.getPresets).mockResolvedValue({ success: true, presets: [] });
    vi.mocked(ipc.savePresets).mockResolvedValue({ success: true });
  });

  test('hydrates presets on mount', async () => {
    vi.mocked(ipc.getPresets).mockResolvedValue({ success: true, presets: [{ id: 'x', name: 'X' }] });
    const { result } = renderHook(() => usePresets(makeDeps()));
    await waitFor(() => expect(result.current.presets).toHaveLength(1));
  });

  test('handleStartPreset starts only pending projects and reports activity', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => usePresets(deps));
    await act(async () => {
      await result.current.handleStartPreset({ id: 'x', name: 'Stack', projectIds: ['p1', 'p2'], startDelayMs: 0 });
    });
    expect(deps.startAll).toHaveBeenCalledWith(['p1'], 0); // p2 already running
    expect(deps.showToast).toHaveBeenCalledWith('success', expect.stringContaining('1 project(s) starting'));
    expect(deps.addActivity).toHaveBeenCalledWith('accent', 'Stack', 'preset started', '1 projects');
  });

  test('handleStopPreset stops only running projects', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => usePresets(deps));
    await act(async () => {
      await result.current.handleStopPreset({ id: 'x', name: 'Stack', projectIds: ['p1', 'p2'] });
    });
    expect(deps.stopProjectProcess).toHaveBeenCalledWith('p2');
  });

  test('handleCreatePreset persists the new preset and closes the modal', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => usePresets(deps));
    await act(async () => {
      await result.current.handleCreatePreset({ name: 'New', projectIds: ['p1'], startDelayMs: 250 });
    });
    expect(ipc.savePresets).toHaveBeenCalledWith([expect.objectContaining({ name: 'New', projectIds: ['p1'] })]);
    expect(deps.showToast).toHaveBeenCalledWith('success', expect.stringContaining('created'));
    expect(result.current.presetModalOpen).toBe(false);
  });

  test('handleMovePreset reorders and persists', async () => {
    vi.mocked(ipc.getPresets).mockResolvedValue({
      success: true,
      presets: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    });
    const deps = makeDeps();
    const { result } = renderHook(() => usePresets(deps));
    await waitFor(() => expect(result.current.presets).toHaveLength(2));
    await act(async () => {
      await result.current.handleMovePreset('b', -1);
    });
    expect(result.current.presets.map((p) => p.id)).toEqual(['b', 'a']);
    expect(ipc.savePresets).toHaveBeenCalled();
  });
});
