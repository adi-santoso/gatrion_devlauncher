import React from 'react';
import ThemeSelector from './ThemeSelector';
import ToggleSwitch from './ToggleSwitch';
import TerminalSettings from './TerminalSettings';
import { useElectronConfig } from '../../hooks';

/**
 * SettingsView - Full settings view assembly
 * Lines 821-873 from template
 */
const SettingsView = ({ onSave }) => {
  const { config, updateConfig } = useElectronConfig();

  const handleChange = async (key, value) => {
    await updateConfig({ [key]: value });
  };

  const handleSave = async () => {
    if (onSave) {
      await onSave();
    }
  };

  return (
    <div className="view space-y-5 max-w-2xl">
      <ThemeSelector
        currentTheme={config.theme}
        onThemeChange={(theme) => handleChange('theme', theme)}
      />

      <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
        <p className="font-display font-bold text-sm">General</p>
        <ToggleSwitch
          enabled={config.sidebarExpanded}
          onChange={() => handleChange('sidebarExpanded', !config.sidebarExpanded)}
          label="Sidebar expanded by default"
        />
        <ToggleSwitch
          enabled={config.startOnBoot}
          onChange={() => handleChange('startOnBoot', !config.startOnBoot)}
          label="Start DevLauncher on system boot"
        />
        <ToggleSwitch
          enabled={config.minimizeToTray}
          onChange={() => handleChange('minimizeToTray', !config.minimizeToTray)}
          label="Minimize to tray on close"
        />
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
        <p className="font-display font-bold text-sm">Notifications</p>
        <ToggleSwitch
          enabled={config.notifyOnStart}
          onChange={() => handleChange('notifyOnStart', !config.notifyOnStart)}
          label="Notify when a project starts"
        />
        <ToggleSwitch
          enabled={config.notifyOnCrash}
          onChange={() => handleChange('notifyOnCrash', !config.notifyOnCrash)}
          label="Notify on crash / error"
        />
        <ToggleSwitch
          enabled={config.notificationSound}
          onChange={() => handleChange('notificationSound', !config.notificationSound)}
          label="Play notification sound"
        />
      </div>

      <TerminalSettings
        fontSize={config.terminalFontSize}
        onFontSizeChange={(size) => handleChange('terminalFontSize', size)}
        maxLines={config.terminalMaxLines}
        onMaxLinesChange={(lines) => handleChange('terminalMaxLines', lines)}
        autoScroll={config.terminalAutoScroll}
        onAutoScrollChange={() =>
          handleChange('terminalAutoScroll', !config.terminalAutoScroll)
        }
      />

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors"
        >
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default SettingsView;
