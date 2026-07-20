import React from 'react';
import ThemeSelector from './ThemeSelector';
import ToggleSwitch from './ToggleSwitch';
import TerminalSettings from './TerminalSettings';

/**
 * SettingsView - Full settings view assembly
 * Lines 821-873 from template
 */
const SettingsView = ({ settings, onSave, onSettingsChange }) => {
  const handleChange = (key, value) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="view space-y-5 max-w-2xl">
      <ThemeSelector
        currentTheme={settings.theme}
        onThemeChange={(theme) => handleChange('theme', theme)}
      />

      <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
        <p className="font-display font-bold text-sm">General</p>
        <ToggleSwitch
          enabled={settings.sidebarExpanded}
          onChange={() => handleChange('sidebarExpanded', !settings.sidebarExpanded)}
          label="Sidebar expanded by default"
        />
        <ToggleSwitch
          enabled={settings.startOnBoot}
          onChange={() => handleChange('startOnBoot', !settings.startOnBoot)}
          label="Start DevLauncher on system boot"
        />
        <ToggleSwitch
          enabled={settings.minimizeToTray}
          onChange={() => handleChange('minimizeToTray', !settings.minimizeToTray)}
          label="Minimize to tray on close"
        />
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
        <p className="font-display font-bold text-sm">Notifications</p>
        <ToggleSwitch
          enabled={settings.notifyOnStart}
          onChange={() => handleChange('notifyOnStart', !settings.notifyOnStart)}
          label="Notify when a project starts"
        />
        <ToggleSwitch
          enabled={settings.notifyOnCrash}
          onChange={() => handleChange('notifyOnCrash', !settings.notifyOnCrash)}
          label="Notify on crash / error"
        />
        <ToggleSwitch
          enabled={settings.notificationSound}
          onChange={() => handleChange('notificationSound', !settings.notificationSound)}
          label="Play notification sound"
        />
      </div>

      <TerminalSettings
        fontSize={settings.terminalFontSize}
        onFontSizeChange={(size) => handleChange('terminalFontSize', size)}
        maxLines={settings.terminalMaxLines}
        onMaxLinesChange={(lines) => handleChange('terminalMaxLines', lines)}
        autoScroll={settings.terminalAutoScroll}
        onAutoScrollChange={() =>
          handleChange('terminalAutoScroll', !settings.terminalAutoScroll)
        }
      />

      <div className="flex justify-end">
        <button
          onClick={onSave}
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors"
        >
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default SettingsView;
