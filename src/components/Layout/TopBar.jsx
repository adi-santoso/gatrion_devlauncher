import React from 'react';

const TopBar = ({ title = 'Workspace', subtitle = 'DevLauncher', onCommandPalette }) => (
  <header className="h-[50px] shrink-0 border-b border-border flex items-center gap-2.5 px-5 bg-base/80 backdrop-blur">
    <div className="text-[11px] text-ink-faint">
      <span>{subtitle}</span>
      <span className="px-2">/</span>
      <strong className="font-semibold text-ink">{title}</strong>
    </div>
    <div className="flex-1" />
    <button
      type="button"
      onClick={onCommandPalette}
      className="hidden sm:flex h-7 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-[10px] text-ink-faint hover:text-ink hover:border-border-hover transition-colors"
    >
      Search or run command
      <kbd className="ml-3 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[8px]">Ctrl K</kbd>
    </button>
  </header>
);

export default TopBar;
