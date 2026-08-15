import type { AppConfig, DeepPartial } from '../../types/shared';
import type { SimpleResult } from '../../data';

export interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
}

export interface GeocodeCityResult extends SimpleResult {
  results?: GeoResult[];
}

export interface UpdateInfoResult extends SimpleResult {
  updateAvailable: boolean;
  latest?: string;
  current?: string;
  url?: string;
}

export interface UpdateStatePayload {
  state?: string;
  progress?: { percent?: number };
  error?: string;
  [key: string]: unknown;
}

export interface CrashDumpInfo {
  name: string;
}

/** Fields the backup handlers return on top of the minimal envelope. */
export interface BackupResult extends SimpleResult {
  canceled?: boolean;
  projectCount?: number;
  encrypted?: boolean;
  skipped?: string[];
  added?: string[];
  configUpdated?: boolean;
  presetsAdded?: number;
}

export interface BackupResultMessage {
  type: 'ok' | 'err';
  text: string;
}

export type AppConfigUpdateValue = DeepPartial<AppConfig>[keyof AppConfig];

export interface SettingsViewProps {
  config: AppConfig;
  updateConfig: (updates: DeepPartial<AppConfig>) => void | Promise<void>;
  onExportProjects: () => void;
  onImportProjects: () => void;
  onExportDiagnostics: () => void;
}

export interface UpdateBannerProps {
  updateInfo: UpdateInfoResult | null;
  updateState: UpdateStatePayload | null;
  downloading: boolean;
  onDownload: () => void;
  onInstall: () => void;
}

export interface GeneralPanelProps {
  config: AppConfig;
  onConfigChange: (key: keyof AppConfig, value: AppConfigUpdateValue) => void;
  updateConfig: (updates: DeepPartial<AppConfig>) => void | Promise<void>;
}

export interface TerminalPanelProps {
  config: AppConfig;
  updateConfig: (updates: DeepPartial<AppConfig>) => void | Promise<void>;
}

export interface DataPanelProps {
  onExportProjects: () => void;
  onImportProjects: () => void;
  onExportDiagnostics: () => void;
  backupPassword: string;
  onBackupPasswordChange: (value: string) => void;
  backupBusy: boolean;
  backupResult: BackupResultMessage | null;
  onBackupExport: () => void;
  onBackupImport: () => void;
}

export interface DiagnosticsPanelProps {
  logLines: string[];
  logLoading: boolean;
  logError: string | null;
  onRefreshLog: () => void;
  crashDumps: CrashDumpInfo[];
  crashLoading: boolean;
  onRefreshCrash: () => void;
  onClearCrash: () => void;
}

export interface PrayerPanelProps {
  config: AppConfig;
  updateConfig: (updates: DeepPartial<AppConfig>) => void | Promise<void>;
  cityQuery: string;
  onCityQueryChange: (value: string) => void;
  geoResults: GeoResult[] | null;
  geoLoading: boolean;
  geoError: string | null;
  onSearchCity: () => void;
  onPickCity: (result: GeoResult) => void;
}
