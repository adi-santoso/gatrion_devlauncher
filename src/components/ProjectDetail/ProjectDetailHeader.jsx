import React, { useState } from 'react';

export default function ProjectDetailHeader({
  project,
  onStart,
  onStop,
  onRestart,
  onOpenBrowser,
  onOpenInEditor,
  onOpenInFinder,
  onInstallDeps
}) {
  const [showMenu, setShowMenu] = useState(false);

  const currentStatus = (project.status || 'stopped').toLowerCase();

  const getStatusBadge = () => {
    const statusConfig = {
      running: {
        className: 'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/20',
        label: 'Running',
        dotColor: '#22C55E'
      },
      starting: {
        className: 'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-warning/10 text-warning border border-warning/20',
        label: 'Starting…',
        dotColor: '#F59E0B'
      },
      stopping: {
        className: 'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-warning/10 text-warning border border-warning/20',
        label: 'Stopping…',
        dotColor: '#F59E0B'
      },
      error: {
        className: 'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-danger/10 text-danger border border-danger/20',
        label: 'Error',
        dotColor: '#EF4444'
      },
      stopped: {
        className: 'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-surface-3 text-ink-faint border border-border',
        label: 'Stopped',
        dotColor: '#5C6472'
      }
    };

    const config = statusConfig[currentStatus] || statusConfig.stopped;

    return (
      <span className={config.className}>
        {currentStatus === 'starting' || currentStatus === 'stopping' ? (
          <svg width="10" height="10" className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
        ) : (
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.dotColor }}></span>
        )}
        {config.label}
      </span>
    );
  };

  const renderActionButtons = () => {
    if (currentStatus === 'starting') {
      return (
        <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-warning/10 text-warning border border-warning/20 text-sm font-medium cursor-wait" disabled>
          <svg width="13" height="13" className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          Starting…
        </button>
      );
    }

    if (currentStatus === 'stopping') {
      return (
        <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-warning/10 text-warning border border-warning/20 text-sm font-medium cursor-wait" disabled>
          <svg width="13" height="13" className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          Stopping…
        </button>
      );
    }

    if (currentStatus === 'running') {
      return (
        <>
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger/15 text-sm font-medium transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1"/>
            </svg>
            Stop
          </button>
          <button
            onClick={onRestart}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-accent/15 hover:text-accent transition-colors"
            title="Restart"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
        </>
      );
    }

    // stopped or error
    return (
      <button
        onClick={onStart}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-success/10 text-success border border-success/20 hover:bg-success/15 text-sm font-medium transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
        Start
      </button>
    );
  };

  return (
    <div className="flex items-start justify-between flex-wrap gap-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-surface-3 flex items-center justify-center text-xl shrink-0">
          {project.emoji}
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display font-bold text-xl">{project.name}</h2>
            {getStatusBadge()}
            {project.uptime && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-3 text-ink-faint">
                ↑ uptime {project.uptime}
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-ink-faint mt-1.5">
            {project.path} · {project.type} · :{project.port}
            {project.pid && ` · pid ${project.pid}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 relative">
        {renderActionButtons()}
        <button
          onClick={onOpenBrowser}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-surface-2 text-ink-faint hover:text-ink transition-colors"
          title="Open in browser"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
            <path d="M15 3h6v6M10 14L21 3"/>
          </svg>
        </button>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-surface-2 text-ink-faint hover:text-ink transition-colors"
        >
          ⋮
        </button>
        {showMenu && (
          <div className="absolute right-0 top-full mt-1 w-44 bg-surface-2 border border-border rounded-lg shadow-card py-1 z-20">
            <button onClick={() => { setShowMenu(false); onOpenInEditor?.(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-ink-soft hover:text-ink hover:bg-surface-3 transition-colors text-left">
              Open in Editor
            </button>
            <button onClick={() => { setShowMenu(false); onOpenInFinder?.(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-ink-soft hover:text-ink hover:bg-surface-3 transition-colors text-left">
              Open in Explorer
            </button>
            <button onClick={() => { setShowMenu(false); onInstallDeps?.(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-ink-soft hover:text-ink hover:bg-surface-3 transition-colors text-left">
              Install Dependencies
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
