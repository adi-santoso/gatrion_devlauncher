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
        <p className="font-display font-bold text-sm">General</p>
        <ToggleSwitch
          enabled={config.sidebarExpanded}
          onChange={() => handleChange('sidebarExpanded', !config.sidebarExpanded)}
          label="Sidebar expanded by default"
        />
        <p className="text-xs text-ink-faint">System startup and tray integration will appear here when native support is connected.</p>
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
