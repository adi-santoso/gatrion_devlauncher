import { useEffect, useState } from 'react';
import ThemeSelector from './ThemeSelector';
import ToggleSwitch from './ToggleSwitch';
import TerminalSettings from './TerminalSettings';
import SystemEnvCard from './SystemEnvCard';
import OmpSettingsCard from './OmpSettingsCard';
import Icon, { type IconName } from '../Common/Icon';
import { useI18n } from '../../i18n/I18nContext';
import {
  geocodeCity,
  checkUpdate,
  openExternalUrl,
  downloadUpdate,
  installUpdate,
  onUpdateState,
  getMainLog,
  getCrashDumps,
  clearCrashDumps,
  openCrashDumpsFolder,
  backupExport,
  backupImport,
} from '../../utils/ipcRenderer';
import type { AppConfig, DeepPartial, PrayerMethod, PrayerShowIn } from '../../types/shared';
import type { SimpleResult } from '../../data';

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
}

interface GeocodeCityResult extends SimpleResult {
  results?: GeoResult[];
}

interface UpdateInfoResult extends SimpleResult {
  updateAvailable: boolean;
  latest?: string;
  current?: string;
  url?: string;
}

interface UpdateStatePayload {
  state?: string;
  progress?: { percent?: number };
  error?: string;
  [key: string]: unknown;
}

interface CrashDumpInfo {
  name: string;
}

/** Fields the backup handlers return on top of the minimal envelope. */
interface BackupResult extends SimpleResult {
  canceled?: boolean;
  projectCount?: number;
  encrypted?: boolean;
  skipped?: string[];
  added?: string[];
  configUpdated?: boolean;
  presetsAdded?: number;
}

interface BackupResultMessage {
  type: 'ok' | 'err';
  text: string;
}

interface SettingsViewProps {
  config: AppConfig;
  updateConfig: (updates: DeepPartial<AppConfig>) => void | Promise<void>;
  onExportProjects: () => void;
  onImportProjects: () => void;
  onExportDiagnostics: () => void;
}

type AppConfigUpdateValue = DeepPartial<AppConfig>[keyof AppConfig];

/**
 * SettingsView - Full settings view assembly
 */
const SettingsView = ({ config, updateConfig, onExportProjects, onImportProjects, onExportDiagnostics }: SettingsViewProps) => {
  const { t } = useI18n();

  const handleChange = async (key: keyof AppConfig, value: AppConfigUpdateValue) => {
    await updateConfig({ [key]: value } as DeepPartial<AppConfig>);
  };

  // Tabbed layout — every panel stays mounted (hidden, not unmounted) so
  // in-flight state (log tail, crash list, backup result) survives tab switches.
  const [activeTab, setActiveTab] = useState('general');
  const TABS: Array<{ id: string; icon: IconName; label: string }> = [
    { id: 'general', icon: 'gear', label: t('settings.tabs.general') },
    { id: 'terminal', icon: 'terminal', label: t('settings.tabs.terminal') },
    { id: 'data', icon: 'fileText', label: t('settings.tabs.data') },
    { id: 'diagnostics', icon: 'chart', label: t('settings.tabs.diagnostics') },
    { id: 'agent', icon: 'bot', label: t('settings.tabs.agent') },
    { id: 'prayer', icon: 'clock', label: t('settings.tabs.prayer') },
  ];

  // Prayer reminder location search
  const [cityQuery, setCityQuery] = useState(config.prayer?.city || '');
  const [geoResults, setGeoResults] = useState<GeoResult[] | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const handleSearchCity = async () => {
    if (!cityQuery.trim()) return;
    setGeoLoading(true);
    setGeoError(null);
    setGeoResults(null);
    const res = (await geocodeCity(cityQuery)) as GeocodeCityResult;
    setGeoLoading(false);
    if (res.success && res.results?.length) {
      setGeoResults(res.results);
    } else {
      setGeoError(res.error || t('settings.prayer.notFound'));
    }
  };

  const handlePickCity = (result: GeoResult) => {
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

  // Update checker — fetch once when the view mounts
  const [updateInfo, setUpdateInfo] = useState<UpdateInfoResult | null>(null);
  useEffect(() => {
    let cancelled = false;
    checkUpdate().then((result) => {
      if (!cancelled && result?.success) setUpdateInfo(result as UpdateInfoResult);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Auto-update state streamed from the main process (downloading % → downloaded).
  const [updateState, setUpdateState] = useState<UpdateStatePayload | null>(null);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    return onUpdateState((payload) => {
      const state = payload as UpdateStatePayload | null;
      setUpdateState(state);
      if (state?.state === 'downloading') setDownloading(true);
      if (state?.state && state.state !== 'downloading') setDownloading(false);
    });
  }, []);

  const handleDownloadUpdate = async () => {
    setDownloading(true);
    const result = await downloadUpdate();
    if (!result?.success && result?.error) setDownloading(false);
  };

  const handleInstallUpdate = async () => {
    await installUpdate();
  };

  // Main log viewer — tail of main.log from the main process
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const loadMainLog = async () => {
    setLogLoading(true);
    setLogError(null);
    const result = await getMainLog(500);
    setLogLoading(false);
    if (result.success) {
      setLogLines(result.lines || []);
    } else {
      setLogError(result.error || 'Failed to read the main log');
    }
  };
  useEffect(() => {
    loadMainLog();
    // Intentional: load once on mount; refresh is manual via the button.
  }, []);

  // Crash reports — local minidumps collected by the main process
  const [crashDumps, setCrashDumps] = useState<CrashDumpInfo[]>([]);
  const [crashLoading, setCrashLoading] = useState(false);
  const loadCrashDumps = async () => {
    setCrashLoading(true);
    const result = await getCrashDumps();
    setCrashLoading(false);
    if (result.success) setCrashDumps((result.dumps as CrashDumpInfo[]) || []);
  };
  useEffect(() => {
    loadCrashDumps();
  }, []);
  const handleClearCrashDumps = async () => {
    const result = await clearCrashDumps();
    if (result.success) setCrashDumps([]);
  };

  // Workspace backup — one portable file (optionally encrypted) with projects,
  // config, presets and health analytics. Import merges without overwriting.
  const [backupPassword, setBackupPassword] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupResult, setBackupResult] = useState<BackupResultMessage | null>(null);

  const handleBackupExport = async () => {
    setBackupBusy(true);
    setBackupResult(null);
    const result = (await backupExport(backupPassword.trim() || undefined)) as BackupResult;
    setBackupBusy(false);
    if (result.success) {
      setBackupResult({
        type: 'ok',
        text: t('settings.backup.exported', {
          count: result.projectCount || 0,
          encrypted: result.encrypted ? t('settings.backup.encrypted') : '',
        }),
      });
    } else if (!result.canceled) {
      setBackupResult({ type: 'err', text: result.error || 'Export failed' });
    }
  };

  const handleBackupImport = async () => {
    setBackupBusy(true);
    setBackupResult(null);
    const result = (await backupImport(backupPassword.trim() || undefined)) as BackupResult;
    setBackupBusy(false);
    if (result.success) {
      const skipped = result.skipped?.length || 0;
      setBackupResult({
        type: 'ok',
        text: t('settings.backup.imported', {
          added: result.added?.length || 0,
          skipped: skipped ? t('settings.backup.skipped', { count: skipped }) : '',
          config: result.configUpdated ? t('settings.backup.configUpdated') : '',
          presets: result.presetsAdded ? t('settings.backup.presetsAdded', { count: result.presetsAdded }) : '',
        }),
      });
    } else if (!result.canceled) {
      setBackupResult({ type: 'err', text: result.error || 'Import failed' });
    }
  };

  return (
    <div className="view mx-auto max-w-5xl">
      {updateInfo?.updateAvailable && updateInfo.latest && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-accent/25 bg-accent/10 mb-5">
          <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center shrink-0">
            <Icon name={updateState?.state === 'downloaded' ? 'check' : 'download'} size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-ink">
              {updateState?.state === 'downloaded'
                ? t('settings.update.ready', { version: updateInfo.latest })
                : t('settings.update.availableLine', { version: updateInfo.latest })}
            </p>
            <p className="text-[11px] text-ink-faint mt-0.5">
              {updateState?.state === 'error'
                ? t('settings.update.failed', { error: updateState.error || 'unknown error' })
                : downloading
                  ? t('settings.update.downloadingProgress', { percent: updateState?.progress?.percent ?? 0 })
                  : updateState?.state === 'downloaded'
                    ? t('settings.update.restartToApply')
                    : t('settings.update.runningOld', { current: updateInfo.current })}
            </p>
          </div>
          {updateState?.state === 'downloaded' ? (
            <button
              onClick={handleInstallUpdate}
              className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors"
            >
              {t('settings.update.install')}
            </button>
          ) : (
            <>
              <button
                onClick={handleDownloadUpdate}
                disabled={downloading}
                className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? t('settings.update.downloading') : t('settings.update.downloadInstall')}
              </button>
              <button
                onClick={() => openExternalUrl(updateInfo.url || '')}
                className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors"
              >
                {t('settings.update.viewRelease')}
              </button>
            </>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-5 border-b border-border" role="tablist" aria-label={t('settings.tabs.general')}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-accent/15 text-ink border border-accent/30'
                : 'bg-surface-3 hover:bg-surface-2 text-ink-soft hover:text-ink border border-transparent'
            }`}
          >
            <Icon name={tab.icon} size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── General: language, theme, general, notifications, auto-restart ── */}
      <div role="tabpanel" className={activeTab === 'general' ? 'grid gap-5 lg:grid-cols-2' : 'hidden'}>
        {/* Language + App Preview — paired with the theme card so both have the same height */}
        <div className="bg-surface border border-border rounded-xl shadow-card p-5 flex flex-col gap-4">
          <div className="space-y-4">
            <p className="font-display font-bold text-sm">{t('settings.language.title')}</p>
            <p className="text-[11px] text-ink-faint">{t('settings.language.desc')}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleChange('language', 'en')}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors ${config.language === 'en' ? 'bg-accent/15 text-ink border-accent/30' : 'bg-surface-3 hover:bg-surface-2 text-ink-soft hover:text-ink border-border'}`}
              >
                {t('settings.language.en')}
              </button>
              <button
                type="button"
                onClick={() => handleChange('language', 'id')}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors ${config.language === 'id' ? 'bg-accent/15 text-ink border-accent/30' : 'bg-surface-3 hover:bg-surface-2 text-ink-soft hover:text-ink border-border'}`}
              >
                {t('settings.language.id')}
              </button>
            </div>
          </div>
          <div className="border-t border-border pt-4 mt-auto space-y-4">
            <p className="font-display font-bold text-sm">{t('settings.preview.title')}</p>
            <ToggleSwitch
              enabled={config.preview?.keepAlive !== false}
              onChange={() =>
                updateConfig({ preview: { keepAlive: !(config.preview?.keepAlive !== false) } })
              }
              label={t('settings.preview.keepAlive')}
            />
            <p className="text-[11px] text-ink-faint">
              {t('settings.preview.desc')}
            </p>
          </div>
        </div>

        <ThemeSelector
          currentTheme={config.theme}
          onThemeChange={(theme) => handleChange('theme', theme)}
        />

        {/* General + Notifications + Auto-restart — one card */}
        <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-5 lg:col-span-2">
          <section className="space-y-4">
            <p className="font-display font-bold text-sm">{t('settings.general.title')}</p>
            <ToggleSwitch
              enabled={config.sidebarExpanded}
              onChange={() => handleChange('sidebarExpanded', !config.sidebarExpanded)}
              label={t('settings.general.sidebarExpanded')}
            />
            <ToggleSwitch
              enabled={!!config.minimizeToTray}
              onChange={() => handleChange('minimizeToTray', !config.minimizeToTray)}
              label={t('settings.minimizeToTray')}
            />
            <ToggleSwitch
              enabled={!!config.startOnBoot}
              onChange={() => handleChange('startOnBoot', !config.startOnBoot)}
              label={t('settings.startOnBoot')}
            />
            <ToggleSwitch
              enabled={!!config.autoStartProjects}
              onChange={() => handleChange('autoStartProjects', !config.autoStartProjects)}
              label={t('settings.autoStartProjects')}
            />
          </section>

          <section className="space-y-4 border-t border-border pt-5">
            <p className="font-display font-bold text-sm">{t('settings.notifications.title')}</p>
            <ToggleSwitch
              enabled={config.notifications?.onStart !== false}
              onChange={() =>
                updateConfig({ notifications: { onStart: !(config.notifications?.onStart !== false) } })
              }
              label={t('settings.notifications.onStart')}
            />
            <ToggleSwitch
              enabled={config.notifications?.onError !== false}
              onChange={() =>
                updateConfig({ notifications: { onError: !(config.notifications?.onError !== false) } })
              }
              label={t('settings.notifications.onError')}
            />
            <ToggleSwitch
              enabled={!!config.notifications?.sound}
              onChange={() =>
                updateConfig({ notifications: { sound: !config.notifications?.sound } })
              }
              label={t('settings.notifications.sound')}
            />
          </section>

          <section className="space-y-4 border-t border-border pt-5">
            <p className="font-display font-bold text-sm">{t('settings.autoRestart.title')}</p>
            <ToggleSwitch
              enabled={!!config.autoRestart?.enabled}
              onChange={() =>
                updateConfig({ autoRestart: { enabled: !config.autoRestart?.enabled } })
              }
              label={t('settings.autoRestart.enabled')}
            />
            <div className="flex items-center gap-3 text-xs text-ink-soft">
              <label htmlFor="maxRetries" className="whitespace-nowrap">{t('settings.autoRestart.maxRetries')}</label>
              <input
                id="maxRetries"
                type="number"
                min="0"
                max="10"
                value={config.autoRestart?.maxRetries ?? 3}
                onChange={(e) => updateConfig({ autoRestart: { maxRetries: Math.max(0, Math.min(10, Number(e.target.value) || 0)) } })}
                className="w-16 bg-surface-3 border border-border rounded-md px-2 py-1 text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              <label htmlFor="delayMs" className="whitespace-nowrap ml-4">{t('settings.autoRestart.delay')}</label>
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
            <p className="text-[11px] text-ink-faint">{t('settings.autoRestart.desc')}</p>
          </section>
        </div>
      </div>

      {/* ── Terminal ── */}
      <div role="tabpanel" className={activeTab === 'terminal' ? 'grid gap-5 lg:grid-cols-2' : 'hidden'}>
        <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4 lg:col-span-2">
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
        </div>
      </div>

      {/* ── Data & Backup ── */}
      <div role="tabpanel" className={activeTab === 'data' ? 'grid gap-5 lg:grid-cols-2' : 'hidden'}>
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
              onChange={(e) => setBackupPassword(e.target.value)}
              placeholder={t('settings.backup.passwordPlaceholder')}
              className="flex-1 min-w-0 bg-surface-3 border border-border rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBackupExport}
                disabled={backupBusy}
                className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors disabled:opacity-40"
              >
                {backupBusy ? t('settings.backup.working') : `⬇ ${t('settings.backup.export')}`}
              </button>
              <button
                type="button"
                onClick={handleBackupImport}
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
      </div>

      {/* ── Diagnostics: log, crash reports, environment ── */}
      <div role="tabpanel" className={activeTab === 'diagnostics' ? 'grid gap-5 lg:grid-cols-2' : 'hidden'}>
        <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="font-display font-bold text-sm">{t('settings.log.title')}</p>
            <button
              type="button"
              onClick={loadMainLog}
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
              onClick={loadCrashDumps}
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
                onClick={handleClearCrashDumps}
                className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-danger border border-border transition-colors"
              >
                {t('settings.crash.clearAll')}
              </button>
            )}
          </div>
        </div>

        <div className="lg:col-span-2"><SystemEnvCard /></div>
      </div>

      {/* ── AI Agent ── */}
      <div role="tabpanel" className={activeTab === 'agent' ? 'grid gap-5 lg:grid-cols-2' : 'hidden'}>
        <div className="lg:col-span-2"><OmpSettingsCard /></div>
      </div>

      {/* ── Prayer ── */}
      <div role="tabpanel" className={activeTab === 'prayer' ? 'grid gap-5 lg:grid-cols-2' : 'hidden'}>
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
                onChange={(e) => setCityQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearchCity(); }}
                placeholder={t('settings.prayer.searchCity')}
                aria-label={t('settings.prayer.searchCity')}
                className="flex-1 bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSearchCity}
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
      </div>

      <p className="mt-5 text-right text-[11px] text-ink-faint">{t('settings.saveAuto')}</p>
    </div>
  );
};

export default SettingsView;
