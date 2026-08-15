import ThemeSelector from './ThemeSelector';
import ToggleSwitch from './ToggleSwitch';
import TerminalSettings from './TerminalSettings';
import Icon from '../Common/Icon';
import { openExternalUrl } from '../../utils/ipcRenderer';
import { useI18n } from '../../i18n/I18nContext';
import type {
  UpdateBannerProps,
  GeneralPanelProps,
  TerminalPanelProps,
} from './settingsTypes';

/**
 * UpdateBanner - update-available banner shown above the tab bar.
 */
export function UpdateBanner({ updateInfo, updateState, downloading, onDownload, onInstall }: UpdateBannerProps) {
  const { t } = useI18n();
  if (!updateInfo?.updateAvailable || !updateInfo.latest) return null;
  return (
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
          onClick={onInstall}
          className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors"
        >
          {t('settings.update.install')}
        </button>
      ) : (
        <>
          <button
            onClick={onDownload}
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

