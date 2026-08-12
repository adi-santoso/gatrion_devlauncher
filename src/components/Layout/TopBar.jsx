import React from 'react';
import { PrayerPill } from './PrayerWidget';

const TopBar = ({ title = 'Workspace', subtitle = 'Gatrion', onCommandPalette, prayer = null, prayerData = null, onPrayerExpand }) => (
  <header className="h-[50px] shrink-0 border-b border-border flex items-center gap-2.5 px-5 bg-base/80 backdrop-blur">
    <div className="text-[11px] text-ink-faint">
      <span>{subtitle}</span>
      <span className="px-2">/</span>
      <strong className="font-semibold text-ink">{title}</strong>
    </div>
    <div className="flex-1" />
    {prayer && prayerData && onPrayerExpand && (
      <PrayerPill data={prayerData} config={prayer} onExpand={onPrayerExpand} />
    )}
    <button
      type="button"
      onClick={onCommandPalette}
      className="hidden sm:flex h-7 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-[10px] text-ink-faint hover:text-ink hover:border-border-hover transition-colors"
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      Search or run command
      <kbd className="ml-3 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[8px]">Ctrl K</kbd>
    </button>
  </header>
);

export default TopBar;
