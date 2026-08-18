import { useEffect, useState } from 'react';
import OmpSettingsCard from './OmpSettingsCard';
import Icon, { type IconName } from '../Common/Icon';
import { useI18n } from '../../i18n/I18nContext';
import { UpdateBanner, GeneralPanel, TerminalPanel } from './settingsPanels';
import { DataPanel, DiagnosticsPanel, PrayerPanel } from './settingsDataPanels';
import {
  geocodeCity,
  checkUpdate,
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  getUpdateState,
  onUpdateState,
  getMainLog,
  getCrashDumps,
  clearCrashDumps,
  backupExport,
  backupImport,
} from '../../utils/ipcRenderer';
import type { AppConfig, DeepPartial } from '../../types/shared';
import type {
  GeoResult,
  GeocodeCityResult,
  UpdateInfoResult,
  UpdateStatePayload,
  CrashDumpInfo,
  BackupResult,
  BackupResultMessage,
  AppConfigUpdateValue,
  SettingsViewProps,
} from './settingsTypes';

/**
 * SettingsView - full settings view assembly.
 *
 * Controller: owns the shared state/handlers (tabs, update checker, log tail,
 * crash dumps, backup) and composes the presentational panels from
 * `settingsPanels.tsx`. Panels stay mounted (hidden, not unmounted) so in-flight
 * state survives tab switches.
 */
const SettingsView = ({ config, updateConfig, onExportProjects, onImportProjects, onExportDiagnostics }: SettingsViewProps) => {
  const { t } = useI18n();

  const handleChange = async (key: keyof AppConfig, value: AppConfigUpdateValue) => {
    await updateConfig({ [key]: value } as DeepPartial<AppConfig>);
  };

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
    let cancelled = false;
    // Pull the main-process updater state so the banner reflects reality even
    // when push events fired before this view mounted (e.g. an update that was
    // already downloaded by the silent launch check). Without this, the banner
    // keeps offering "Download & install" for an update that is already ready.
    getUpdateState().then((result) => {
      if (cancelled || !result?.success || !result.state?.state) return;
      setUpdateState(result.state as unknown as UpdateStatePayload);
      setDownloading(result.state.state === 'downloading');
    }).catch(() => {});
    const unsubscribe = onUpdateState((payload) => {
      const state = payload as UpdateStatePayload | null;
      setUpdateState(state);
      if (state?.state === 'downloading') setDownloading(true);
      if (state?.state && state.state !== 'downloading') setDownloading(false);
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  // Explicit check drives the real electron-updater state machine; only after
  // it reaches `available` does the banner offer "Download & install".
  const handleCheckUpdate = async () => {
    await checkForUpdate();
  };

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
      <UpdateBanner
        updateInfo={updateInfo}
        updateState={updateState}
        downloading={downloading}
        onCheck={handleCheckUpdate}
        onDownload={handleDownloadUpdate}
        onInstall={handleInstallUpdate}
      />

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
        <GeneralPanel config={config} onConfigChange={handleChange} updateConfig={updateConfig} />
      </div>

      {/* ── Terminal ── */}
      <div role="tabpanel" className={activeTab === 'terminal' ? 'grid gap-5 lg:grid-cols-2' : 'hidden'}>
        <TerminalPanel config={config} updateConfig={updateConfig} />
      </div>

      {/* ── Data & Backup ── */}
      <div role="tabpanel" className={activeTab === 'data' ? 'grid gap-5 lg:grid-cols-2' : 'hidden'}>
        <DataPanel
          onExportProjects={onExportProjects}
          onImportProjects={onImportProjects}
          onExportDiagnostics={onExportDiagnostics}
          backupPassword={backupPassword}
          onBackupPasswordChange={setBackupPassword}
          backupBusy={backupBusy}
          backupResult={backupResult}
          onBackupExport={handleBackupExport}
          onBackupImport={handleBackupImport}
        />
      </div>

      {/* ── Diagnostics: log, crash reports, environment ── */}
      <div role="tabpanel" className={activeTab === 'diagnostics' ? 'grid gap-5 lg:grid-cols-2' : 'hidden'}>
        <DiagnosticsPanel
          logLines={logLines}
          logLoading={logLoading}
          logError={logError}
          onRefreshLog={loadMainLog}
          crashDumps={crashDumps}
          crashLoading={crashLoading}
          onRefreshCrash={loadCrashDumps}
          onClearCrash={handleClearCrashDumps}
        />
      </div>

      {/* ── AI Agent ── */}
      <div role="tabpanel" className={activeTab === 'agent' ? 'grid gap-5 lg:grid-cols-2' : 'hidden'}>
        <div className="lg:col-span-2"><OmpSettingsCard /></div>
      </div>

      {/* ── Prayer ── */}
      <div role="tabpanel" className={activeTab === 'prayer' ? 'grid gap-5 lg:grid-cols-2' : 'hidden'}>
        <PrayerPanel
          config={config}
          updateConfig={updateConfig}
          cityQuery={cityQuery}
          onCityQueryChange={setCityQuery}
          geoResults={geoResults}
          geoLoading={geoLoading}
          geoError={geoError}
          onSearchCity={handleSearchCity}
          onPickCity={handlePickCity}
        />
      </div>

      <p className="mt-5 text-right text-[11px] text-ink-faint">{t('settings.saveAuto')}</p>
    </div>
  );
};

export default SettingsView;
