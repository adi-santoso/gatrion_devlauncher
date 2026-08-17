import { useState } from 'react';
import ToggleSwitch from './ToggleSwitch';
import SystemEnvCard from './SystemEnvCard';
import AnimatedModal from '../Common/AnimatedModal';
import { openCrashDumpsFolder, resetAppData } from '../../utils/ipcRenderer';
import type { AppConfig, PrayerMethod, PrayerShowIn } from '../../types/shared';
import { useI18n } from '../../i18n/I18nContext';
import type {
  DataPanelProps,
  DiagnosticsPanelProps,
  PrayerPanelProps,
} from './settingsTypes';

/**
 * DataPanel - project export/import, diagnostics export, and workspace backup.
 */
export function DataPanel({
  onExportProjects,
  onImportProjects,
  onExportDiagnostics,
  backupPassword,
  onBackupPasswordChange,
  backupBusy,
  backupResult,
  onBackupExport,
  onBackupImport,
}: DataPanelProps) {
  const { t } = useI18n();
  // Reset DevLauncher — two-step confirmation: the confirm button only
  // enables after the user types the exact word RESET.
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleReset = async () => {
    setResetBusy(true);
    setResetError(null);
    const result = await resetAppData();
    setResetBusy(false);
    if (!result?.success) {
      setResetError(result?.error || 'Reset failed');
    }
    // On success the app relaunches — nothing else to do here.
  };

  return (
    <>
      <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4 lg:col-span-2">
        <p className="font-display font-bold text-sm">{t('settings.data.title')}</p>
        <p className="text-[11px] text-ink-faint">
          {t('settings.data.desc')}
        </p>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onExportProjects}
            className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors"
          >
            ⬇ {t('settings.data.exportProjects')}
          </button>
          <button
            type="button"
            onClick={onImportProjects}
            className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors"
          >
            ⬆ {t('settings.data.importProjects')}
          </button>
        </div>
        <div className="border-t border-border pt-3">
          <p className="text-[11px] text-ink-faint mb-2">
            {t('settings.data.diagnostics.desc')}
          </p>
          <button
            type="button"
            onClick={onExportDiagnostics}
            className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors"
          >
            🩺 {t('settings.data.exportDiagnostics')}
          </button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4 lg:col-span-2">
        <p className="font-display font-bold text-sm">{t('settings.backup.title')}</p>
        <p className="text-[11px] text-ink-faint">
          {t('settings.backup.desc')}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="password"
            value={backupPassword}
            onChange={(e) => onBackupPasswordChange(e.target.value)}
            placeholder={t('settings.backup.passwordPlaceholder')}
            className="flex-1 min-w-0 bg-surface-3 border border-border rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBackupExport}
              disabled={backupBusy}
              className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors disabled:opacity-40"
            >
              {backupBusy ? t('settings.backup.working') : `⬇ ${t('settings.backup.export')}`}
            </button>
            <button
              type="button"
              onClick={onBackupImport}
              disabled={backupBusy}
              className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors disabled:opacity-40"
            >
              {backupBusy ? t('settings.backup.working') : `⬆ ${t('settings.backup.import')}`}
            </button>
          </div>
        </div>
        {backupResult && (
          <p className={`text-[11px] ${backupResult.type === 'ok' ? 'text-accent' : 'text-danger'}`}>
            {backupResult.text}
          </p>
        )}
      </div>

      <div className="bg-surface border border-danger/25 rounded-xl shadow-card p-5 space-y-3 lg:col-span-2">
        <p className="font-display font-bold text-sm text-danger">{t('settings.reset.title')}</p>
        <p className="text-[11px] text-ink-faint">
          {t('settings.reset.desc')}
        </p>
        <button
          type="button"
          onClick={() => { setResetConfirm(''); setResetError(null); setResetOpen(true); }}
          className="px-3.5 py-2 rounded-lg bg-danger/10 hover:bg-danger/20 text-xs font-semibold text-danger border border-danger/25 transition-colors"
        >
          {t('settings.reset.button')}
        </button>

        <AnimatedModal id="resetAppModal" isOpen={resetOpen} onClose={() => setResetOpen(false)}>
          <div className="w-full max-w-md bg-surface border border-border rounded-xl shadow-card p-5">
            <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="font-display font-bold text-sm">{t('settings.reset.confirmTitle')}</h3>
            <p className="text-xs text-ink-faint mt-1.5 leading-relaxed">
              {t('settings.reset.confirmDesc')}
            </p>
            <p className="text-[11px] text-warning mt-2 leading-relaxed">
              {t('settings.reset.suggestion')}
            </p>
            {resetError && <p className="text-[11px] text-danger mt-2">{resetError}</p>}
            <input
              type="text"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              placeholder={t('settings.reset.typeToConfirm')}
              aria-label={t('settings.reset.typeToConfirm')}
              autoFocus
              className="mt-3 w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-xs font-mono text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-danger/40"
            />
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setResetOpen(false)}
                disabled={resetBusy}
                className="px-3.5 py-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-3 text-sm font-medium transition-colors disabled:opacity-40"
              >
                {t('settings.reset.cancel')}
              </button>
              <button
                onClick={handleReset}
                disabled={resetConfirm.trim().toUpperCase() !== 'RESET' || resetBusy}
                className="px-3.5 py-2 rounded-lg bg-danger hover:bg-danger/90 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resetBusy ? t('settings.reset.working') : t('settings.reset.confirm')}
              </button>
            </div>
          </div>
        </AnimatedModal>
      </div>
    </>
  );
}

/**
 * DiagnosticsPanel - main log viewer, crash reports, and system environment.
 */
export function DiagnosticsPanel({
  logLines,
  logLoading,
  logError,
  onRefreshLog,
  crashDumps,
  crashLoading,
  onRefreshCrash,
  onClearCrash,
}: DiagnosticsPanelProps) {
  const { t } = useI18n();
  return (
    <>
      <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4 lg:col-span-2">
        <div className="flex items-center justify-between">
          <p className="font-display font-bold text-sm">{t('settings.log.title')}</p>
          <button
            type="button"
            onClick={onRefreshLog}
            disabled={logLoading}
            className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors disabled:opacity-40"
          >
            {logLoading ? t('settings.log.loading') : `↻ ${t('settings.log.refresh')}`}
          </button>
        </div>
        <p className="text-[11px] text-ink-faint">
          {t('settings.log.desc')}
        </p>
        {logError && <p className="text-[11px] text-danger">{logError}</p>}
        <pre className="max-h-56 overflow-auto rounded-lg bg-[#0d0f13] border border-border p-3 text-[10px] leading-relaxed font-mono text-[#aab2c0] whitespace-pre-wrap break-words">
          {logLines.length > 0 ? logLines.join('\n') : (logLoading ? t('settings.log.loading') : t('settings.log.empty'))}
        </pre>
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4 lg:col-span-2">
        <div className="flex items-center justify-between">
          <p className="font-display font-bold text-sm">{t('settings.crash.title')}</p>
          <button
            type="button"
            onClick={onRefreshCrash}
            disabled={crashLoading}
            className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors disabled:opacity-40"
          >
            {crashLoading ? t('settings.crash.loading') : `↻ ${t('settings.crash.refresh')}`}
          </button>
        </div>
        <p className="text-[11px] text-ink-faint">
          {crashDumps.length > 0
            ? t('settings.crash.hasDumps', { count: crashDumps.length })
            : t('settings.crash.noDumps')}
        </p>
        {crashDumps.length > 0 && (
          <ul className="max-h-32 overflow-auto rounded-lg border border-border bg-surface-2 divide-y divide-border text-[11px] font-mono text-ink-soft">
            {crashDumps.map((dump) => (
              <li key={dump.name} className="px-3 py-1.5 truncate">{dump.name}</li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openCrashDumpsFolder()}
            className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors"
          >
            {t('settings.crash.openFolder')}
          </button>
          {crashDumps.length > 0 && (
            <button
              type="button"
              onClick={onClearCrash}
              className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-danger border border-border transition-colors"
            >
              {t('settings.crash.clearAll')}
            </button>
          )}
        </div>
      </div>

      <div className="lg:col-span-2"><SystemEnvCard /></div>
    </>
  );
}

/**
 * PrayerPanel - prayer reminder location, method, and notification settings.
 */
export function PrayerPanel({
  config,
  updateConfig,
  cityQuery,
  onCityQueryChange,
  geoResults,
  geoLoading,
  geoError,
  onSearchCity,
  onPickCity,
}: PrayerPanelProps) {
  const { t } = useI18n();
  return (
    <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4 lg:col-span-2">
      <p className="font-display font-bold text-sm">{t('settings.prayer.title')}</p>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink">{t('settings.prayer.showIn')}</p>
        <select
          value={config.prayer?.showIn ?? 'both'}
          onChange={(e) => updateConfig({ prayer: { showIn: e.target.value as PrayerShowIn } })}
          aria-label={t('settings.prayer.showIn')}
          className="bg-surface-3 border border-border rounded-md px-2 py-1 text-xs text-ink-soft focus:outline-none"
        >
          <option value="sidebar">{t('settings.prayer.showIn.sidebar')}</option>
          <option value="topbar">{t('settings.prayer.showIn.topbar')}</option>
          <option value="both">{t('settings.prayer.showIn.both')}</option>
          <option value="off">{t('settings.prayer.showIn.off')}</option>
        </select>
      </div>
      <div>
        <p className="text-xs text-ink mb-1.5">{t('settings.prayer.location')}</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={cityQuery}
            onChange={(e) => onCityQueryChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSearchCity(); }}
            placeholder={t('settings.prayer.searchCity')}
            aria-label={t('settings.prayer.searchCity')}
            className="flex-1 bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <button
            type="button"
            onClick={onSearchCity}
            disabled={geoLoading || !cityQuery.trim()}
            className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors disabled:opacity-40"
          >
            {geoLoading ? t('settings.prayer.searching') : t('settings.prayer.search')}
          </button>
        </div>
        {geoError && <p className="mt-1.5 text-[11px] text-danger">{geoError}</p>}
        {geoResults && (
          <ul className="mt-2 rounded-lg border border-border bg-surface-2 divide-y divide-border">
            {geoResults.map((result, index) => (
              <li key={`${result.name}-${index}`}>
                <button
                  type="button"
                  onClick={() => onPickCity(result)}
                  className="w-full text-left px-3 py-2 text-[11px] text-ink-soft hover:text-ink hover:bg-surface-3 transition-colors cursor-pointer"
                >
                  {result.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[10px] text-ink-faint">{t('settings.prayer.latitude')}
            <input
              type="number"
              step="0.0001"
              value={config.prayer?.latitude ?? ''}
              onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) updateConfig({ prayer: { latitude: v } }); }}
              aria-label={t('settings.prayer.latitude')}
              className="mt-0.5 w-full bg-surface-3 border border-border rounded-md px-2 py-1 text-xs font-mono text-ink focus:outline-none"
            />
          </label>
          <label className="text-[10px] text-ink-faint">{t('settings.prayer.longitude')}
            <input
              type="number"
              step="0.0001"
              value={config.prayer?.longitude ?? ''}
              onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) updateConfig({ prayer: { longitude: v } }); }}
              aria-label={t('settings.prayer.longitude')}
              className="mt-0.5 w-full bg-surface-3 border border-border rounded-md px-2 py-1 text-xs font-mono text-ink focus:outline-none"
            />
          </label>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink">{t('settings.prayer.method')}</p>
        <select
          value={config.prayer?.method ?? 'KEMENAG'}
          onChange={(e) => updateConfig({ prayer: { method: e.target.value as PrayerMethod } })}
          aria-label={t('settings.prayer.method')}
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
        <p className="text-xs text-ink mb-1.5">{t('settings.prayer.adjustments')}</p>
        <div className="grid grid-cols-5 gap-2">
          {([
            ['fajr', 'Subuh'],
            ['dhuhr', 'Dzuhur'],
            ['asr', 'Ashar'],
            ['maghrib', 'Maghrib'],
            ['isha', 'Isya'],
          ] as Array<[keyof AppConfig['prayer']['adjustments'], string]>).map(([key, label]) => (
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
        label={t('settings.prayer.notify')}
      />
      <ToggleSwitch
        enabled={!!config.prayer?.sound}
        onChange={() => updateConfig({ prayer: { sound: !config.prayer?.sound } })}
        label={t('settings.prayer.sound')}
      />
      <p className="text-[11px] text-ink-faint">{t('settings.prayer.calculationNote')}</p>
    </div>
  );
}
