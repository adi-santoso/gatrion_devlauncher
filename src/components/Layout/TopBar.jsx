import React from 'react';

const TopBar = ({
  title = 'Dashboard',
  subtitle = 'DevLauncher',
  onCommandPalette,
  onAddProject,
  onSettings,
  onStartAll,
  onStopAll
}) => {
  return (
    <header className="h-16 shrink-0 border-b border-border flex items-center justify-between px-6 bg-base/80 backdrop-blur">
      <div>
        <p className="text-[11px] text-ink-faint font-medium">{subtitle}</p>
        <h1 className="font-display font-bold text-lg leading-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onCommandPalette}
          className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 border border-border text-ink-faint text-xs transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          Search or run command
          <kbd className="ml-2 text-[10px] border border-border rounded px-1.5 py-0.5">Ctrl K</kbd>
        </button>
        <button
          onClick={onStartAll}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-success/10 text-success border border-success/20 hover:bg-success/15 text-sm font-medium transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          Start All
        </button>
        <button
          onClick={onStopAll}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger/15 text-sm font-medium transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
          Stop All
        </button>
        <div className="w-px h-6 bg-border mx-1"></div>
        <button
          onClick={onAddProject}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Project
        </button>
        <button
          onClick={onSettings}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-ink-faint hover:text-ink hover:bg-surface-3 transition-colors"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.32.4.6.73.79.24.14.5.21.78.21H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
};

export default TopBar;
