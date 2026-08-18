import ThemeSelector from './ThemeSelector';
import ToggleSwitch from './ToggleSwitch';
import TerminalSettings from './TerminalSettings';
import { useEffect, useState } from 'react';
import Icon from '../Common/Icon';
import { openExternalUrl, mcpGetStatus } from '../../utils/ipcRenderer';
import { useI18n } from '../../i18n/I18nContext';
import type {
  UpdateBannerProps,
  GeneralPanelProps,
  TerminalPanelProps,
} from './settingsTypes';

/**
 * UpdateBanner - update-available banner shown above the tab bar.
 *
 * The "available" message comes from the manual GitHub API check, while the
 * Download/Install buttons follow the real electron-updater state machine
 * (`updateState`). A check must succeed first (state → available) before the
 * download button is offered; this guarantees electron-updater's internal
 * state is populated so downloadUpdate() never fails with "Please check
 * update first". Download progress is rendered as a bar, not text.
 */
export function UpdateBanner({ updateInfo, updateState, downloading, onCheck, onDownload, onInstall }: UpdateBannerProps) {
  const { t } = useI18n();
  if (!updateInfo?.updateAvailable || !updateInfo.latest) return null;
  const state = updateState?.state;
  const isDownloading = downloading || state === 'downloading';
  const percent = Math.min(100, Math.max(0, updateState?.progress?.percent ?? 0));
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-accent/25 bg-accent/10 mb-5">
      <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center shrink-0">
        <Icon name={state === 'downloaded' ? 'check' : 'download'} size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-ink">
          {state === 'downloaded'
            ? t('settings.update.ready', { version: updateInfo.latest })
            : t('settings.update.availableLine', { version: updateInfo.latest })}
        </p>
        <p className="text-[11px] text-ink-faint mt-0.5">
          {state === 'error'
            ? t('settings.update.failed', { error: updateState?.error || 'unknown error' })
            : isDownloading
              ? t('settings.update.downloading')
              : state === 'downloaded'
                ? t('settings.update.restartToApply')
                : state === 'checking'
                  ? t('settings.update.checking')
                  : t('settings.update.runningOld', { current: updateInfo.current })}
        </p>
        {isDownloading && (
          <div
            className="mt-2 h-1.5 w-full max-w-[240px] rounded-full bg-surface-3 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {state === 'downloaded' ? (
          <button
            onClick={onInstall}
            className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors"
          >
            {t('settings.update.install')}
          </button>
        ) : (
          <>
            {state === 'available' ? (
              <button
                onClick={onDownload}
                disabled={isDownloading}
                className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDownloading ? t('settings.update.downloading') : t('settings.update.downloadInstall')}
              </button>
            ) : (
              <button
                onClick={onCheck}
                disabled={state === 'checking'}
                className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {state === 'checking' ? t('settings.update.checking') : t('settings.update.check')}
              </button>
            )}
            <button
              onClick={() => openExternalUrl(updateInfo.url || '')}
              className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors"
            >
              {t('settings.update.viewRelease')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * McpStatusLine - small status readout under the agent-control toggle.
 */
function McpStatusLine({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const [running, setRunning] = useState<boolean | null>(null);
  const [port, setPort] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const poll = () => mcpGetStatus().then((result) => {
      if (cancelled || !result?.success) return;
      setRunning(!!result.running);
      setPort(result.port ?? null);
    }).catch(() => {});
    poll();
    const timer = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [enabled]);
  if (!enabled) {
    return <p className="text-[11px] text-ink-faint">{t('settings.agentControl.desc')}</p>;
  }
  const text = running && port
    ? t('settings.agentControl.active', { port: String(port) })
    : t('settings.agentControl.inactive');
  return (
    <p className="text-[11px] text-ink-faint">
      <span className={`inline-block w-2 h-2 rounded-full mr-1.5 align-middle ${running ? 'bg-success' : 'bg-ink-faint'}`} />
      {text}
    </p>
  );
}

/**
 * GeneralPanel - language, app preview, theme, general, notifications, auto-restart.
 */
export function GeneralPanel({ config, onConfigChange, updateConfig }: GeneralPanelProps) {
  const { t } = useI18n();
  return (
    <>
      {/* Language + App Preview — paired with the theme card so both have the same height */}
      <div className="bg-surface border border-border rounded-xl shadow-card p-5 flex flex-col gap-4">
        <div className="space-y-4">
          <p className="font-display font-bold text-sm">{t('settings.language.title')}</p>
          <p className="text-[11px] text-ink-faint">{t('settings.language.desc')}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onConfigChange('language', 'en')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors ${config.language === 'en' ? 'bg-accent/15 text-ink border-accent/30' : 'bg-surface-3 hover:bg-surface-2 text-ink-soft hover:text-ink border-border'}`}
            >
              {t('settings.language.en')}
            </button>
            <button
              type="button"
              onClick={() => onConfigChange('language', 'id')}
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
        onThemeChange={(theme) => onConfigChange('theme', theme)}
      />

      {/* General + Notifications + Auto-restart — one card */}
      <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-5 lg:col-span-2">
        <section className="space-y-4">
          <p className="font-display font-bold text-sm">{t('settings.general.title')}</p>
          <ToggleSwitch
            enabled={config.sidebarExpanded}
            onChange={() => onConfigChange('sidebarExpanded', !config.sidebarExpanded)}
            label={t('settings.general.sidebarExpanded')}
          />
          <ToggleSwitch
            enabled={!!config.minimizeToTray}
            onChange={() => onConfigChange('minimizeToTray', !config.minimizeToTray)}
            label={t('settings.minimizeToTray')}
          />
          <ToggleSwitch
            enabled={!!config.startOnBoot}
            onChange={() => onConfigChange('startOnBoot', !config.startOnBoot)}
            label={t('settings.startOnBoot')}
          />
          <ToggleSwitch
            enabled={!!config.autoStartProjects}
            onChange={() => onConfigChange('autoStartProjects', !config.autoStartProjects)}
            label={t('settings.autoStartProjects')}
          />
          <ToggleSwitch
            enabled={!!config.agent?.controlEnabled}
            onChange={() => updateConfig({ agent: { controlEnabled: !config.agent?.controlEnabled } })}
            label={t('settings.agentControl.title')}
          />
          <McpStatusLine enabled={!!config.agent?.controlEnabled} />
          {config.agent?.controlEnabled && (
            <div className="rounded-lg bg-surface-3 border border-border p-3 space-y-2.5">
              <p className="text-[11px] font-semibold text-ink-soft">{t('settings.agentControl.permissionsTitle')}</p>
              <ToggleSwitch
                enabled={config.agent?.permissions?.read !== false}
                onChange={() => updateConfig({
                  agent: { permissions: { ...config.agent?.permissions, read: config.agent?.permissions?.read === false } },
                })}
                label={t('settings.agentControl.perm.read')}
                description={t('settings.agentControl.perm.readHint')}
              />
              <ToggleSwitch
                enabled={config.agent?.permissions?.write !== false}
                onChange={() => updateConfig({
                  agent: { permissions: { ...config.agent?.permissions, write: config.agent?.permissions?.write === false } },
                })}
                label={t('settings.agentControl.perm.write')}
                description={t('settings.agentControl.perm.writeHint')}
              />
              <ToggleSwitch
                enabled={config.agent?.permissions?.destructive !== false}
                onChange={() => updateConfig({
                  agent: { permissions: { ...config.agent?.permissions, destructive: config.agent?.permissions?.destructive === false } },
                })}
                label={t('settings.agentControl.perm.destructive')}
                description={t('settings.agentControl.perm.destructiveHint')}
              />
            </div>
          )}
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
    </>
  );
}

/**
 * TerminalPanel - terminal behavior settings.
 */
export function TerminalPanel({ config, updateConfig }: TerminalPanelProps) {
  return (
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
  );
}

