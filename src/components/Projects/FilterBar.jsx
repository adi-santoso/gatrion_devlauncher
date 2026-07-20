import React from 'react';

export default function FilterBar({
  onSearch,
  onFilterType,
  onFilterStatus,
  onSort,
  viewMode,
  onViewModeChange
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search projects…"
            onChange={(e) => onSearch?.(e.target.value)}
            className="bg-surface-3 border border-border rounded-lg pl-8 pr-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent w-56"
          />
        </div>
        <select
          onChange={(e) => onFilterType?.(e.target.value)}
          className="bg-surface-3 border border-border rounded-lg px-3 py-2 text-xs text-ink-soft focus:outline-none"
        >
          <option>All types</option>
          <option>React</option>
          <option>Next.js</option>
          <option>Vue</option>
          <option>Laravel</option>
          <option>Go</option>
          <option>Node.js</option>
        </select>
        <select
          onChange={(e) => onFilterStatus?.(e.target.value)}
          className="bg-surface-3 border border-border rounded-lg px-3 py-2 text-xs text-ink-soft focus:outline-none"
        >
          <option>All statuses</option>
          <option>Running</option>
          <option>Stopped</option>
          <option>Error</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <select
          onChange={(e) => onSort?.(e.target.value)}
          className="bg-surface-3 border border-border rounded-lg px-3 py-2 text-xs text-ink-soft focus:outline-none"
        >
          <option>Sort: Recently used</option>
          <option>Sort: Name A–Z</option>
          <option>Sort: Status</option>
        </select>
        <div className="flex bg-surface-3 rounded-lg p-0.5">
          <button
            onClick={() => onViewModeChange?.('grid')}
            className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-surface text-ink shadow-sm' : 'text-ink-faint hover:text-ink'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>
          <button
            onClick={() => onViewModeChange?.('list')}
            className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-surface text-ink shadow-sm' : 'text-ink-faint hover:text-ink'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="4" rx="1"/>
              <rect x="3" y="10" width="18" height="4" rx="1"/>
              <rect x="3" y="16" width="18" height="4" rx="1"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
