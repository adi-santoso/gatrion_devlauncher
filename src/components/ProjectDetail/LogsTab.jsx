import React from 'react';

export default function LogsTab({
  logs = [],
  onFilterChange,
  autoScroll,
  onAutoScrollChange
}) {
  const getLogColor = (level) => {
    const colors = {
      info: 'text-ink-soft',
      ready: 'text-success',
      warn: 'text-warning',
      error: 'text-danger'
    };
    return colors[level] || 'text-ink-soft';
  };

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-2">
        <div className="relative">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Filter logs…"
            onChange={(e) => onFilterChange?.(e.target.value)}
            className="bg-surface-3 border border-border rounded-md pl-7 pr-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:outline-none w-48"
          />
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => onAutoScrollChange?.(e.target.checked)}
            className="w-3 h-3 accent-accent"
          />
          Auto-scroll
        </label>
      </div>
      <div className="scan-line bg-[#08090C] px-5 py-4 font-mono text-[12.5px] leading-relaxed h-72 overflow-y-auto">
        {logs.map((log, index) => (
          <p key={index}>
            <span className="text-ink-faint">{log.timestamp}</span>{' '}
            <span className={getLogColor(log.level)}>[{log.level}]</span>{' '}
            {log.message}
          </p>
        ))}
        <p className="text-accent">▍</p>
      </div>
    </div>
  );
}
