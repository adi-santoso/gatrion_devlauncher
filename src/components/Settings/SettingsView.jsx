import React from 'react';
import ThemeSelector from './ThemeSelector';
import ToggleSwitch from './ToggleSwitch';
import TerminalSettings from './TerminalSettings';

/**
 * SettingsView - Full settings view assembly
 * Lines 821-873 from template
 */
const SettingsView = ({ config, updateConfig }) => {

  const handleChange = async (key, value) => {
    await updateConfig({ [key]: value });
  };

  return (
    <div className="view space-y-5 max-w-2xl">
      <ThemeSelector
        currentTheme={config.theme}
        onThemeChange={(theme) => handleChange('theme', theme)}
      />

      <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
        <p className="font-display font-bold text-sm">General & Desktop Integration</p>
        <ToggleSwitch
          enabled={config.sidebarExpanded}
          onChange={() => handleChange('sidebarExpanded', !config.sidebarExpanded)}
          label="Sidebar expanded by default"
        />
        <ToggleSwitch
          enabled={!!config.minimizeToTray}
          onChange={() => handleChange('minimizeToTray', !config.minimizeToTray)}
          label="Minimize to System Tray on close"
        />
        <ToggleSwitch
          enabled={!!config.startOnBoot}
          onChange={() => handleChange('startOnBoot', !config.startOnBoot)}
          label="Start Gatrion on Windows boot"
        />
        <ToggleSwitch
          enabled={!!config.autoStartProjects}
          onChange={() => handleChange('autoStartProjects', !config.autoStartProjects)}
          label="Auto-start projects marked for auto-start on launch"
        />
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
        <p className="font-display font-bold text-sm">Notifications</p>
        <ToggleSwitch
          enabled={config.notifications?.onStart !== false}
          onChange={() =>
            updateConfig({ notifications: { onStart: !(config.notifications?.onStart !== false) } })
          }
          label="Notify when a project starts"
        />
        <ToggleSwitch
          enabled={config.notifications?.onError !== false}
          onChange={() =>
            updateConfig({ notifications: { onError: !(config.notifications?.onError !== false) } })
          }
          label="Notify when a project crashes"
        />
        <ToggleSwitch
          enabled={!!config.notifications?.sound}
          onChange={() =>
            updateConfig({ notifications: { sound: !config.notifications?.sound } })
          }
          label="Play sound with notifications"
        />
      </div>

      <TerminalSettings
        fontSize={config.terminal?.fontSize}
        onFontSizeChange={(size) => updateConfig({ terminal: { fontSize: size } })}
        maxLines={config.terminal?.maxLines}
        onMaxLinesChange={(lines) => updateConfig({ terminal: { maxLines: lines } })}
        autoScroll={config.terminal?.autoScroll}
        onAutoScrollChange={() =>
          updateConfig({ terminal: { autoScroll: !config.terminal?.autoScroll } })
        }
      />

      <p className="text-right text-[11px] text-ink-faint">Changes save automatically.</p>
    </div>
  );
};

export default SettingsView;
