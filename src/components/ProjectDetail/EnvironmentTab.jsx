import React from 'react';

export default function EnvironmentTab({
  envVars = [],
  onAdd,
  onRemove,
  onChange
}) {
  return (
    <div className="bg-surface border border-border rounded-xl shadow-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium">Environment Variables</p>
        <button
          onClick={onAdd}
          className="text-[11px] font-medium text-accent hover:text-accent-hover flex items-center gap-1"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Add variable
        </button>
      </div>
      <div className="space-y-2">
        {envVars.map((envVar, index) => (
          <div key={index} className="flex gap-2 items-center">
            <input
              type="text"
              value={envVar.key}
              onChange={(e) => onChange?.(index, 'key', e.target.value)}
              className="w-1/3 bg-surface-3 border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <input
              type="text"
              value={envVar.value}
              onChange={(e) => onChange?.(index, 'value', e.target.value)}
              className="flex-1 bg-surface-3 border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <button
              onClick={() => onRemove?.(index)}
              className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-ink-faint hover:text-danger hover:bg-danger/10"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
