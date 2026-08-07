import React from 'react';

/**
 * ThemeSelector - Grid of theme cards with preview
 * Lines 822-839 from template
 */
const ThemeSelector = ({ currentTheme = 'dark', onThemeChange }) => {
  return (
    <div className="bg-surface border border-border rounded-xl shadow-card p-5">
      <p className="font-display font-bold text-sm mb-1">Appearance</p>
      <p className="text-xs text-ink-faint mb-4">Choose how Gatrion looks.</p>
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
            Dark
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
            Light
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
      </div>
    </div>
  );
};

export default ThemeSelector;
