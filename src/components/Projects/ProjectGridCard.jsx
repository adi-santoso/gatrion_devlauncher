import React from 'react';

export default function ProjectGridCard({
  project,
  isSelected,
  onToggleSelect,
  onShowDetail
}) {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  const toggleDropdown = (e) => {
    e.stopPropagation();
    setDropdownOpen(!dropdownOpen);
  };

  const closeDropdown = () => setDropdownOpen(false);

  const handleAction = (action, e) => {
    e?.stopPropagation();
    closeDropdown();
    action();
  };
  const status = (project.status || 'stopped').toLowerCase();

  const renderStatus = () => {
    if (status === 'running') {
      return (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-success/10 text-success">
          ↑ {project.uptime || 'running'}
        </span>
      );
    } else if (status === 'starting' || status === 'stopping') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning/15 text-warning uppercase tracking-wide">
          <svg width="10" height="10" className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          {status === 'starting' ? 'Starting' : 'Stopping'}
        </span>
      );
    } else if (status === 'error') {
      return (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-danger/15 text-danger uppercase">
          Error
        </span>
      );
    } else {
      return (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-3 text-ink-faint">
          idle {project.idleTime || ''}
        </span>
      );
    }
  };

  const renderSparkline = () => {
    if (status === 'running' && project.sparklinePoints) {
      return (
        <svg viewBox="0 0 100 24" className="w-full h-6 mt-2">
          <polyline
            points={project.sparklinePoints}
            fill="none"
            stroke={project.color}
            strokeWidth="1.5"
          />
        </svg>
      );
    } else if (status === 'starting' || status === 'stopping') {
      return (
        <p className="text-[11px] text-warning mt-2.5 font-mono animate-pulse">
          {status === 'starting' ? 'Booting up…' : 'Stopping…'}
        </p>
      );
    } else if (status === 'error') {
      return (
        <p className="text-[11px] text-danger mt-2.5 font-mono">
          {project.errorMessage || 'Process crashed'}
        </p>
      );
    } else {
      return (
        <svg viewBox="0 0 100 24" className="w-full h-6 mt-2 opacity-30">
          <polyline
            points="0,12 100,12"
            fill="none"
            stroke="#5C6472"
            strokeWidth="1.5"
          />
        </svg>
      );
    }
  };

  const renderActionButton = () => {
    if (status === 'running') {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            project.onStop?.();
          }}
          className="flex-1 py-1.5 rounded-lg bg-surface-3 hover:bg-danger/15 hover:text-danger text-xs font-medium transition-colors"
        >
          Stop
        </button>
      );
    } else if (status === 'starting' || status === 'stopping') {
      return (
        <button
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-surface-3 text-warning text-xs font-medium cursor-wait"
          disabled
        >
          <svg width="12" height="12" className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          {status === 'starting' ? 'Booting' : 'Stopping'}
        </button>
      );
    } else if (status === 'error') {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            project.onRestart?.();
          }}
          className="flex-1 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-xs font-medium transition-colors"
        >
          Restart
        </button>
      );
    } else {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            project.onStart?.();
          }}
          className="flex-1 py-1.5 rounded-lg bg-success/10 hover:bg-success/20 text-success text-xs font-medium transition-colors"
        >
          Start
        </button>
      );
    }
  };

  return (
    <div className="relative bg-surface border border-border rounded-xl p-4 shadow-card hover:border-border-hover transition-colors">
      <span
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ backgroundColor: project.color }}
      />
      <div className="flex items-start justify-between pl-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelect?.();
          }}
          className="project-select mt-1 w-3.5 h-3.5 rounded border-border bg-surface-3 accent-accent"
        />
        {renderStatus()}
      </div>
      <div className="pl-2 mt-1 cursor-pointer" onClick={onShowDetail}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center text-sm">
            {project.emoji}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate hover:text-accent">
              {project.name}
            </p>
            <p className="text-xs text-ink-faint font-mono">
              {project.type} · :{project.port}
            </p>
          </div>
        </div>
        {renderSparkline()}
      </div>
      <div className="flex items-center gap-2 mt-2 pt-3 border-t border-border pl-2">
        {renderActionButton()}
        <button
          onClick={toggleDropdown}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-3 text-ink-faint hover:text-ink relative transition-colors"
        >
          ⋮
        </button>
        {dropdownOpen && (
          <div className="absolute right-4 bottom-14 w-44 bg-surface-2 border border-border rounded-lg shadow-card py-1 z-20">
            <a href="#" onClick={(e) => { e.preventDefault(); handleAction(() => project.onEdit?.(), e); }} className="flex items-center gap-2.5 px-3 py-2 text-xs text-ink-soft hover:text-ink hover:bg-surface-3 transition-colors">
              Edit Project
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); closeDropdown(); }} className="flex items-center gap-2.5 px-3 py-2 text-xs text-ink-soft hover:text-ink hover:bg-surface-3 transition-colors">
              Duplicate
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); closeDropdown(); }} className="flex items-center gap-2.5 px-3 py-2 text-xs text-ink-soft hover:text-ink hover:bg-surface-3 transition-colors">
              Open in Explorer
            </a>
            <div className="h-px bg-border my-1"></div>
            <button
              onClick={(e) => handleAction(() => project.onDelete?.(), e)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-danger hover:bg-danger/10 transition-colors text-left"
            >
              Remove Project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
