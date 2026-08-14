import React from 'react';
import { useI18n } from '../../i18n/I18nContext';

/**
 * ThemeSelector - Grid of theme cards with preview
 * Lines 822-839 from template
 */
const ThemeSelector = ({ currentTheme = 'dark', onThemeChange }) => {
  const { t } = useI18n();
  return (
    <div className="bg-surface border border-border rounded-xl shadow-card p-5">
      <p className="font-display font-bold text-sm mb-1">{t('settings.theme.title')}</p>
      <p className="text-xs text-ink-faint mb-4">{t('settings.theme.desc')}</p>
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <button
          id="themeDarkCard"
          onClick={() => onThemeChange('dark')}
          className={`text-left border-2 ${
            currentTheme === 'dark' ? 'border-accent' : 'border-border'
          } rounded-xl p-3 transition-colors`}
        >
          <div className="h-14 rounded-lg bg-[#12151A] border border-[#232830] flex items-center gap-1.5 px-2 mb-2">
            <div className="w-3 h-8 rounded bg-[#20242C]"></div>
            <div className="flex-1 h-3 rounded bg-[#20242C]"></div>
          </div>
          <p className="text-xs font-medium flex items-center gap-1.5">
            {t('settings.theme.dark')}
            {currentTheme === 'dark' && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-accent"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </p>
        </button>
        <button
          id="themeLightCard"
          onClick={() => onThemeChange('light')}
          className={`text-left border-2 ${
            currentTheme === 'light' ? 'border-accent' : 'border-border'
          } rounded-xl p-3 transition-colors`}
        >
          <div className="h-14 rounded-lg bg-white border border-[#E3E6EB] flex items-center gap-1.5 px-2 mb-2">
            <div className="w-3 h-8 rounded bg-[#EEF0F3]"></div>
            <div className="flex-1 h-3 rounded bg-[#EEF0F3]"></div>
          </div>
          <p className="text-xs font-medium flex items-center gap-1.5">
            {t('settings.theme.light')}
            {currentTheme === 'light' && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-accent"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </p>
        </button>
        <button
          id="themeSystemCard"
          onClick={() => onThemeChange('system')}
          className={`text-left border-2 ${
            currentTheme === 'system' ? 'border-accent' : 'border-border'
          } rounded-xl p-3 transition-colors`}
        >
          <div className="h-14 rounded-lg border border-[#232830] flex items-center gap-1.5 px-2 mb-2 overflow-hidden">
            <div className="h-14 w-1/2 bg-white flex items-center justify-center">
              <div className="w-4 h-8 rounded bg-[#EEF0F3]"></div>
            </div>
            <div className="h-14 w-1/2 bg-[#12151A] flex items-center justify-center">
              <div className="w-4 h-8 rounded bg-[#20242C]"></div>
            </div>
          </div>
          <p className="text-xs font-medium flex items-center gap-1.5">
            {t('settings.theme.system')}
            {currentTheme === 'system' && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-accent"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </p>
        </button>
      </div>
    </div>
  );
};

export default ThemeSelector;
