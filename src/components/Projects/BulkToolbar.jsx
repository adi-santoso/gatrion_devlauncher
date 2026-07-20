import React from 'react';

export default function BulkToolbar({
  selectedCount,
  onClearSelection,
  onBulkStart,
  onBulkStop,
  onBulkDelete
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between bg-accent/10 border border-accent/30 rounded-lg px-4 py-2.5">
      <span className="text-xs font-medium text-accent">
        <span>{selectedCount}</span> selected
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onBulkStart}
          className="px-3 py-1.5 rounded-lg bg-success/15 text-success text-xs font-medium hover:bg-success/25 transition-colors"
        >
          Start
        </button>
        <button
          onClick={onBulkStop}
          className="px-3 py-1.5 rounded-lg bg-surface-3 text-ink-soft text-xs font-medium hover:bg-surface-2 transition-colors"
        >
          Stop
        </button>
        <button
          onClick={onBulkDelete}
          className="px-3 py-1.5 rounded-lg bg-danger/15 text-danger text-xs font-medium hover:bg-danger/25 transition-colors"
        >
          Delete
        </button>
        <button
          onClick={onClearSelection}
          className="text-xs text-ink-faint hover:text-ink"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
