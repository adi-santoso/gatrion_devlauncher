import React from 'react';
import ThemeSelector from './ThemeSelector';
import ToggleSwitch from './ToggleSwitch';
import TerminalSettings from './TerminalSettings';

/**
 * SettingsView - Full settings view assembly
 * Lines 821-873 from template
 */
const SettingsView = ({ config, updateConfig, onExportProjects, onImportProjects }) => {

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

      <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
        <p className="font-display font-bold text-sm">Auto-Restart</p>
        <ToggleSwitch
          enabled={!!config.autoRestart?.enabled}
          onChange={() =>
            updateConfig({ autoRestart: { enabled: !config.autoRestart?.enabled } })
          }
          label="Automatically restart projects on crash"
        />
        <div className="flex items-center gap-3 text-xs text-ink-soft">
          <label htmlFor="maxRetries" className="whitespace-nowrap">Max retries</label>
          <input
            id="maxRetries"
            type="number"
            min="0"
            max="10"
            value={config.autoRestart?.maxRetries ?? 3}
            onChange={(e) => updateConfig({ autoRestart: { maxRetries: Math.max(0, Math.min(10, Number(e.target.value) || 0)) } })}
            className="w-16 bg-surface-3 border border-border rounded-md px-2 py-1 text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <label htmlFor="delayMs" className="whitespace-nowrap ml-4">Initial delay (ms)</label>
          <input
            id="delayMs"
            type="number"
            min="500"
            max="60000"
            step="500"
            value={config.autoRestart?.delayMs ?? 2000}
            onChange={(e) => updateConfig({ autoRestart: { delayMs: Math.max(500, Math.min(60000, Number(e.target.value) || 2000)) } })}
            className="w-20 bg-surface-3 border border-border rounded-md px-2 py-1 text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <p className="text-[11px] text-ink-faint">Exponential backoff is applied between retries. Counter resets when the project becomes running.</p>
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

      <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
        <p className="font-display font-bold text-sm">Data</p>
        <p className="text-[11px] text-ink-faint">
          Projects are stored locally in your app data folder. Export a portable JSON backup, or import one on another machine.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onExportProjects}
            className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors"
          >
            ⬇ Export projects…
          </button>
          <button
            type="button"
            onClick={onImportProjects}
            className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors"
          >
            ⬆ Import projects…
          </button>
        </div>
      </div>

      <p className="text-right text-[11px] text-ink-faint">Changes save automatically.</p>
    </div>
  );
};

export default SettingsView;
