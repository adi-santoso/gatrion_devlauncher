import React, { useState } from 'react';
import ThemeSelector from './ThemeSelector';
import ToggleSwitch from './ToggleSwitch';
import TerminalSettings from './TerminalSettings';
import { geocodeCity } from '../../utils/ipcRenderer';

/**
 * SettingsView - Full settings view assembly
 * Lines 821-873 from template
 */
const SettingsView = ({ config, updateConfig, onExportProjects, onImportProjects }) => {

  const handleChange = async (key, value) => {
    await updateConfig({ [key]: value });
  };

  // Prayer reminder location search
  const [cityQuery, setCityQuery] = useState(config.prayer?.city || '');
  const [geoResults, setGeoResults] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState(null);

  const handleSearchCity = async () => {
    if (!cityQuery.trim()) return;
    setGeoLoading(true);
    setGeoError(null);
    setGeoResults(null);
    const res = await geocodeCity(cityQuery);
    setGeoLoading(false);
    if (res.success && res.results?.length) {
      setGeoResults(res.results);
    } else {
      setGeoError(res.error || 'Kota tidak ditemukan. Coba nama lain atau isi koordinat manual.');
    }
  };

  const handlePickCity = (result) => {
    const utcOffset = Math.max(-12, Math.min(14, Math.round(result.longitude / 15)));
    updateConfig({
      prayer: {
        city: result.name.split(',').slice(0, 2).join(','),
        latitude: result.latitude,
        longitude: result.longitude,
        utcOffset,
      },
    });
    setCityQuery(result.name.split(',').slice(0, 2).join(','));
    setGeoResults(null);
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
        <p className="font-display font-bold text-sm">App Preview</p>
        <ToggleSwitch
          enabled={config.preview?.keepAlive !== false}
          onChange={() =>
            updateConfig({ preview: { keepAlive: !(config.preview?.keepAlive !== false) } })
          }
          label="Keep preview alive when switching pages"
        />
        <p className="text-[11px] text-ink-faint">
          Keeps the embedded app preview mounted (hidden) while you browse other tabs or projects, so open modals, forms, and scroll position are preserved when you come back. Turn off to free memory — the preview will reload each time you return to it.
        </p>
      </div>

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

      <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
        <p className="font-display font-bold text-sm">Pengingat Sholat</p>
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink">Tampilkan di</p>
          <select
            value={config.prayer?.showIn ?? 'both'}
            onChange={(e) => updateConfig({ prayer: { showIn: e.target.value } })}
            aria-label="Tampilkan pengingat sholat di"
            className="bg-surface-3 border border-border rounded-md px-2 py-1 text-xs text-ink-soft focus:outline-none"
          >
            <option value="sidebar">Sidebar saja</option>
            <option value="topbar">Topbar saja</option>
            <option value="both">Sidebar & Topbar</option>
            <option value="off">Nonaktif</option>
          </select>
        </div>
        <div>
          <p className="text-xs text-ink mb-1.5">Kota & lokasi</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchCity(); }}
              placeholder="Cari kota… (contoh: Bandung)"
              aria-label="Cari kota"
              className="flex-1 bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSearchCity}
              disabled={geoLoading || !cityQuery.trim()}
              className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors disabled:opacity-40"
            >
              {geoLoading ? 'Mencari…' : 'Cari'}
            </button>
          </div>
          {geoError && <p className="mt-1.5 text-[11px] text-danger">{geoError}</p>}
          {geoResults && (
            <ul className="mt-2 rounded-lg border border-border bg-surface-2 divide-y divide-border">
              {geoResults.map((result, index) => (
                <li key={`${result.name}-${index}`}>
                  <button
                    type="button"
                    onClick={() => handlePickCity(result)}
                    className="w-full text-left px-3 py-2 text-[11px] text-ink-soft hover:text-ink hover:bg-surface-3 transition-colors cursor-pointer"
                  >
                    {result.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[10px] text-ink-faint">Latitude
              <input
                type="number"
                step="0.0001"
                value={config.prayer?.latitude ?? ''}
                onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) updateConfig({ prayer: { latitude: v } }); }}
                aria-label="Latitude"
                className="mt-0.5 w-full bg-surface-3 border border-border rounded-md px-2 py-1 text-xs font-mono text-ink focus:outline-none"
              />
            </label>
            <label className="text-[10px] text-ink-faint">Longitude
              <input
                type="number"
                step="0.0001"
                value={config.prayer?.longitude ?? ''}
                onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) updateConfig({ prayer: { longitude: v } }); }}
                aria-label="Longitude"
                className="mt-0.5 w-full bg-surface-3 border border-border rounded-md px-2 py-1 text-xs font-mono text-ink focus:outline-none"
              />
            </label>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink">Metode perhitungan</p>
          <select
            value={config.prayer?.method ?? 'KEMENAG'}
            onChange={(e) => updateConfig({ prayer: { method: e.target.value } })}
            aria-label="Metode perhitungan sholat"
            className="bg-surface-3 border border-border rounded-md px-2 py-1 text-xs text-ink-soft focus:outline-none"
          >
            <option value="KEMENAG">Kemenag RI</option>
            <option value="MWL">Muslim World League</option>
            <option value="ISNA">ISNA (Amerika Utara)</option>
            <option value="Egypt">Egyptian General Authority</option>
            <option value="Makkah">Umm Al-Qura, Makkah</option>
            <option value="Karachi">Univ. Karachi</option>
          </select>
        </div>
        <div>
          <p className="text-xs text-ink mb-1.5">Penyesuaian waktu (± menit)</p>
          <div className="grid grid-cols-5 gap-2">
            {[
              ['fajr', 'Subuh'],
              ['dhuhr', 'Dzuhur'],
              ['asr', 'Ashar'],
              ['maghrib', 'Maghrib'],
              ['isha', 'Isya'],
            ].map(([key, label]) => (
              <label key={key} className="text-[10px] text-ink-faint">{label}
                <input
                  type="number"
                  min="-60"
                  max="60"
                  value={config.prayer?.adjustments?.[key] ?? 0}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    updateConfig({ prayer: { adjustments: { [key]: Number.isNaN(v) ? 0 : v } } });
                  }}
                  aria-label={`Penyesuaian ${label}`}
                  className="mt-0.5 w-full bg-surface-3 border border-border rounded-md px-1.5 py-1 text-xs font-mono text-ink text-center focus:outline-none"
                />
              </label>
            ))}
          </div>
        </div>
        <ToggleSwitch
          enabled={config.prayer?.notify !== false}
          onChange={() => updateConfig({ prayer: { notify: !(config.prayer?.notify !== false) } })}
          label="Notifikasi sistem saat waktu sholat tiba"
        />
        <ToggleSwitch
          enabled={!!config.prayer?.sound}
          onChange={() => updateConfig({ prayer: { sound: !config.prayer?.sound } })}
          label="Bunyi suara saat waktu sholat tiba"
        />
        <p className="text-[11px] text-ink-faint">Waktu sholat dihitung lokal (offline) menggunakan algoritma PrayTimes. Klik kartu sholat di sidebar/topbar untuk jadwal lengkap.</p>
      </div>

      <p className="text-right text-[11px] text-ink-faint">Changes save automatically.</p>
    </div>
  );
};

export default SettingsView;
