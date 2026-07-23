import { useState } from 'react';

export default function ProjectCard({ project, onStop, onStart, onRestart, onNavigate, onShowToast, onDelete }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const status = (project.status || 'stopped').toLowerCase();

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

  const getStatusBadge = () => {
    switch (status) {
      case 'running':
        return (
          <span className="relative flex w-2 h-2 mt-1.5" style={{ color: project.color }}>
            <span className="pulse-dot"></span>
            <span className={`relative w-2 h-2 rounded-full`} style={{ background: project.color }}></span>
          </span>
        );
      case 'starting':
      case 'stopping':
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning/15 text-warning uppercase tracking-wide">
            {status === 'starting' ? 'Starting' : 'Stopping'}
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-danger/15 text-danger uppercase tracking-wide">
            Error
          </span>
        );
      default:
        return <span className="w-2 h-2 rounded-full bg-ink-faint mt-1.5"></span>;
    }
  };

  const getActionButton = () => {
    if (status === 'running') {
      return (
        <button
          onClick={(e) => handleAction(() => onStop(project), e)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-surface-3 hover:bg-danger/15 hover:text-danger text-xs font-medium transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
          Stop
        </button>
      );
    } else if (status === 'starting' || status === 'stopping') {
      return (
        <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-surface-3 text-warning text-xs font-medium cursor-wait" disabled>
          <svg width="12" height="12" className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          {status === 'starting' ? 'Booting' : 'Stopping'}
        </button>
      );
    } else {
      return (
        <button
          onClick={(e) => handleAction(() => onStart(project), e)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-success/10 hover:bg-success/20 text-success text-xs font-medium transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          Start
        </button>
      );
    }
  };

  return (
    <div className="relative bg-surface border border-border rounded-xl pl-4 pr-4 py-4 shadow-card overflow-hidden hover:border-border-hover transition-colors">
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: project.color }}></span>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => onNavigate && onNavigate(project)}>
          <div className="w-9 h-9 rounded-lg bg-surface-3 flex items-center justify-center text-base">
            {project.emoji}
          </div>
          <div>
            <p className="font-medium text-sm hover:text-accent transition-colors">{project.name}</p>
            <p className="text-xs text-ink-faint font-mono">{project.stack}</p>
          </div>
        </div>
        {getStatusBadge()}
      </div>
      <p className="text-xs font-mono text-ink-faint mt-3 truncate">{project.path}</p>
      <div className="flex items-center gap-3 mt-3">
        {project.port && <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-3 text-ink-soft">:{project.port}</span>}
        {status === 'running' ? (
          <>
            <span className="text-[11px] font-mono text-ink-faint">CPU {project.cpu || '—'}</span>
            <span className="text-[11px] font-mono text-ink-faint">{project.memory || '—'}</span>
          </>
        ) : status === 'starting' || status === 'stopping' ? (
          <>
            <span className="text-[11px] font-mono text-ink-faint">CPU —</span>
            <span className="text-[11px] font-mono text-ink-faint">—</span>
          </>
        ) : (
          <span className="text-[11px] font-mono text-ink-faint">idle {project.uptime || '—'}</span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
        {getActionButton()}
        {status === 'running' && (
          <button
            onClick={(e) => handleAction(() => onRestart(project), e)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-accent/15 hover:text-accent transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          </button>
        )}
        {(status === 'starting' || status === 'stopping') && (
          <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-3 text-ink-faint" disabled>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
            </svg>
          </button>
        )}
        {(status === 'stopped' || status === 'error') && (
          <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-3 text-ink-faint" disabled>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
            </svg>
          </button>
        )}
        <button
          onClick={toggleDropdown}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-surface-2 text-ink-faint hover:text-ink transition-colors relative"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>
        {dropdownOpen && (
          <div className="absolute right-4 bottom-14 w-44 bg-surface-2 border border-border rounded-lg shadow-card py-1 z-20">
            <a href="#" onClick={(e) => { e.preventDefault(); closeDropdown(); }} className="flex items-center gap-2.5 px-3 py-2 text-xs text-ink-soft hover:text-ink hover:bg-surface-3 transition-colors">
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
              onClick={(e) => handleAction(() => onDelete?.(project), e)}
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
