import { useState, useEffect, useCallback } from 'react';
import { getPresets, savePresets } from '../utils/ipcRenderer';
import { PRESET_COLORS } from '../components/Modals/PresetModal';

/**
 * usePresets — workspace presets (named groups of projects with start delay).
 * Persisted via IPC on every mutation.
 *
 * @param {{ projects: Array, startAll: Function, stopProjectProcess: Function,
 *           showToast: Function, addActivity: Function }} deps
 */
export const usePresets = ({ projects, startAll, stopProjectProcess, showToast, addActivity }) => {
  const [presets, setPresets] = useState([]);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [presetModalInitial, setPresetModalInitial] = useState(null); // preset being edited (null = create mode)
  const [presetModalPreselect, setPresetModalPreselect] = useState(null);
  const [presetToDelete, setPresetToDelete] = useState(null);

  // Hydrate presets on mount
  useEffect(() => {
    getPresets().then((result) => {
      if (result?.success && Array.isArray(result.presets)) {
        setPresets(result.presets);
      }
    }).catch(() => {});
  }, []);

  const openPresetModal = useCallback((preset = null) => {
    setPresetModalInitial(preset);
    setPresetModalPreselect(null);
    setPresetModalOpen(true);
  }, []);

  const handleStartPreset = useCallback(async (preset) => {
    const presetProjects = (preset.projectIds || [])
      .map((id) => projects.find((p) => p.id === id))
      .filter(Boolean);
    if (presetProjects.length === 0) {
      showToast('info', `Preset "${preset.name}" has no projects`);
      return [];
    }
    const pending = presetProjects.filter((p) =>
      !['running', 'starting', 'stopping'].includes(p.status?.toLowerCase())
    );
    if (pending.length === 0) {
      showToast('info', `Preset "${preset.name}": all projects already active`);
      return [];
    }
    showToast('info', `Starting preset "${preset.name}"...`);
    const delayMs = Math.max(0, Math.min(60000, Number(preset.startDelayMs) || 0));
    const results = await startAll(pending.map((p) => p.id), delayMs);
    const summary = Array.isArray(results) ? results : [];
    const started = summary.filter((r) => r.success).length;
    const failed = summary.filter((r) => !r.success).length;
    if (failed > 0) {
      showToast('warning', `Preset "${preset.name}": ${started} starting, ${failed} failed`);
      addActivity('warning', preset.name, 'preset started with issues', `${started} started, ${failed} failed`);
    } else if (started > 0) {
      showToast('success', `Preset "${preset.name}": ${started} project(s) starting`);
      addActivity('accent', preset.name, 'preset started', `${started} projects`);
    }
    return summary;
  }, [projects, startAll, showToast, addActivity]);

  const handleStopPreset = useCallback(async (preset) => {
    const targets = (preset.projectIds || [])
      .map((id) => projects.find((p) => p.id === id))
      .filter((p) => ['running', 'starting'].includes(p.status?.toLowerCase()));
    if (targets.length === 0) {
      showToast('info', `Preset "${preset.name}": nothing to stop`);
      return [];
    }
    showToast('info', `Stopping preset "${preset.name}"...`);
    const settled = await Promise.allSettled(targets.map((p) => stopProjectProcess(p.id)));
    const stopped = settled.filter((r) => r.status === 'fulfilled' && r.value?.success).length;
    const failed = settled.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.success)).length;
    if (failed > 0) {
      showToast('warning', `Preset "${preset.name}": ${stopped} stopped, ${failed} failed`);
    } else {
      showToast('info', `Preset "${preset.name}": ${stopped} project(s) stopped`);
    }
    addActivity('faint', preset.name, 'preset stopped', `${stopped} projects`);
    return settled;
  }, [projects, stopProjectProcess, showToast, addActivity]);

  const handleRestartPreset = useCallback(async (preset) => {
    await handleStopPreset(preset);
    return handleStartPreset(preset);
  }, [handleStopPreset, handleStartPreset]);

  const handleDeletePreset = useCallback((preset) => {
    setPresetToDelete(preset);
  }, []);

  const clearPresetDelete = useCallback(() => {
    setPresetToDelete(null);
  }, []);

  const confirmDeletePreset = useCallback(async () => {
    if (!presetToDelete) return;
    const updated = presets.filter((p) => p.id !== presetToDelete.id);
    setPresets(updated);
    setPresetToDelete(null);
    const result = await savePresets(updated);
    if (result.success) {
      showToast('info', `Preset "${presetToDelete.name}" removed`);
      addActivity('faint', presetToDelete.name, 'preset removed');
    } else {
      showToast('error', result.error || 'Failed to remove preset');
    }
  }, [presetToDelete, presets, showToast, addActivity]);

  const buildPresetPayload = useCallback((data) => ({
    name: (data.name || '').trim(),
    description: (data.description || '').trim(),
    color: data.color || PRESET_COLORS[0],
    projectIds: Array.isArray(data.projectIds) ? data.projectIds : [],
    startDelayMs: Math.max(0, Math.min(60000, Number(data.startDelayMs) || 0)),
    autoStart: data.autoStart === true,
  }), []);

  const closePresetModal = useCallback(() => {
    setPresetModalOpen(false);
    setPresetModalInitial(null);
    setPresetModalPreselect(null);
  }, []);

  const handleCreatePreset = useCallback(async (data) => {
    const payload = buildPresetPayload(data);
    if (!payload.name || payload.projectIds.length === 0) return;
    const newPreset = {
      id: `preset-${Date.now()}`,
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [...presets, newPreset];
    setPresets(updated);
    const result = await savePresets(updated);
    if (result.success) {
      showToast('success', `Preset "${payload.name}" created`);
      addActivity('accent', payload.name, 'preset created', `${payload.projectIds.length} projects`);
    } else {
      showToast('error', result.error || 'Failed to save preset');
      setPresets(presets);
    }
    closePresetModal();
  }, [presets, buildPresetPayload, showToast, addActivity, closePresetModal]);

  const handleUpdatePreset = useCallback(async (presetId, data) => {
    const payload = buildPresetPayload(data);
    if (!payload.name || payload.projectIds.length === 0) return;
    const updated = presets.map((preset) => preset.id === presetId
      ? { ...preset, ...payload, updatedAt: new Date().toISOString() }
      : preset);
    setPresets(updated);
    const result = await savePresets(updated);
    if (result.success) {
      showToast('success', `Preset "${payload.name}" updated`);
      addActivity('accent', payload.name, 'preset updated');
    } else {
      showToast('error', result.error || 'Failed to update preset');
      setPresets(presets);
    }
    closePresetModal();
  }, [presets, buildPresetPayload, showToast, addActivity, closePresetModal]);

  const handleDuplicatePreset = useCallback(async (preset) => {
    const copy = {
      ...preset,
      id: `preset-${Date.now()}`,
      name: `${preset.name} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [...presets, copy];
    setPresets(updated);
    const result = await savePresets(updated);
    if (result.success) {
      showToast('success', `Preset "${copy.name}" created`);
      addActivity('accent', copy.name, 'preset duplicated');
    } else {
      showToast('error', result.error || 'Failed to duplicate preset');
    }
  }, [presets, showToast, addActivity]);

  // Open preset creation modal, optionally prefilled with a selection
  const handleSaveSelectionAsPreset = useCallback((projectIds) => {
    setPresetModalInitial(null);
    setPresetModalPreselect(Array.isArray(projectIds) ? projectIds : null);
    setPresetModalOpen(true);
  }, []);

  const handleMovePreset = useCallback(async (presetId, direction) => {
    const index = presets.findIndex((preset) => preset.id === presetId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= presets.length) return;
    const updated = [...presets];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    setPresets(updated);
    const result = await savePresets(updated);
    if (!result.success) showToast('error', result.error || 'Failed to reorder presets');
  }, [presets, showToast]);

  return {
    presets,
    presetModalOpen,
    presetModalInitial,
    presetModalPreselect,
    presetToDelete,
    openPresetModal,
    handleStartPreset,
    handleStopPreset,
    handleRestartPreset,
    handleDeletePreset,
    clearPresetDelete,
    confirmDeletePreset,
    handleCreatePreset,
    handleUpdatePreset,
    handleDuplicatePreset,
    handleSaveSelectionAsPreset,
    handleMovePreset,
    closePresetModal,
  };
};
