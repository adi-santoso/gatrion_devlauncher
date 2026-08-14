import { useState, useEffect, useCallback } from 'react';
import * as ipc from '../utils/ipcRenderer';

/**
 * useElectronConfig Hook
 * Manages application configuration with Electron persistence
 */
export const useElectronConfig = () => {
  const [config, setConfig] = useState({
    theme: 'dark',
    language: 'en',
    sidebarExpanded: true,
    startOnBoot: false,
    minimizeToTray: true,
    autoStartProjects: false,
    notifications: { onStart: true, onError: true, sound: false },
    terminal: { fontSize: 14, maxLines: 1000, autoScroll: true },
    autoRestart: { enabled: false, maxRetries: 3, delayMs: 2000 },
    preview: { keepAlive: true },
    prayer: {
      showIn: 'both',
      method: 'KEMENAG',
      city: 'Jakarta',
      latitude: -6.2088,
      longitude: 106.8456,
      utcOffset: 7,
      adjustments: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
      notify: true,
      sound: true,
    },
    windowBounds: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load config from Electron
  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ipc.getConfig();

      if (response.success) {
        setConfig(response.config);
      } else {
        setError(response.error || 'Failed to load config');
      }
    } catch (err) {
      console.error('Error loading config:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Update config in Electron
  const updateConfig = useCallback(async (updates) => {
    try {
      const response = await ipc.updateConfig(updates);

      if (response.success) {
        setConfig(response.config);

        // Apply theme changes to DOM
        if (updates.theme) {
          document.documentElement.setAttribute('data-theme', updates.theme);
        }

        return { success: true, config: response.config };
      } else {
        return { success: false, error: response.error || 'Failed to update config' };
      }
    } catch (err) {
      console.error('Error updating config:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Batch update multiple config values
  const updateMultiple = useCallback(async (updates) => {
    return updateConfig(updates);
  }, [updateConfig]);

  // Update single config value
  const updateSingle = useCallback(async (key, value) => {
    return updateConfig({ [key]: value });
  }, [updateConfig]);

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Apply theme on config change
  useEffect(() => {
    if (config.theme) {
      document.documentElement.setAttribute('data-theme', config.theme);
    }
  }, [config.theme]);

  return {
    config,
    loading,
    error,
    updateConfig,
    updateMultiple,
    updateSingle,
    loadConfig
  };
};
