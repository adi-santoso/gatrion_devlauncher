interface BulkToolbarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkStart: () => void;
  onBulkStop: () => void;
  onBulkRestart?: () => void;
  onBulkDelete: () => void;
  onBulkSavePreset?: () => void;
  onBulkTagEdit?: () => void;
}

export default function BulkToolbar({
  selectedCount,
  onClearSelection,
  onBulkStart,
  onBulkStop,
  onBulkRestart,
  onBulkDelete,
  onBulkSavePreset,
  onBulkTagEdit,
}: BulkToolbarProps) {
  if (selectedCount === 0) return null;

  const buttonClass = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors';

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between bg-accent/10 border border-accent/30 rounded-lg px-4 py-2.5" role="region" aria-label="Bulk actions">
      <span className="text-xs font-medium text-accent">
        <span>{selectedCount}</span> selected
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onBulkStart}
          aria-label="Start selected projects"
          className={`${buttonClass} bg-success/15 text-success hover:bg-success/25`}
        >
          Start
        </button>
        <button
          onClick={onBulkStop}
          aria-label="Stop selected projects"
          className={`${buttonClass} bg-surface-3 text-ink-soft hover:bg-surface-2`}
        >
          Stop
        </button>
        {onBulkRestart && (
          <button
            onClick={onBulkRestart}
            aria-label="Restart selected projects"
            className={`${buttonClass} bg-surface-3 text-ink-soft hover:bg-surface-2`}
          >
            Restart
          </button>
        )}
        {onBulkSavePreset && (
          <button
            onClick={onBulkSavePreset}
            aria-label="Save selected projects as a preset"
            className={`${buttonClass} bg-accent/15 text-accent hover:bg-accent/25`}
          >
            Save as preset
          </button>
        )}
        {onBulkTagEdit && (
          <button
            onClick={onBulkTagEdit}
            aria-label="Edit tags of selected projects"
            className={`${buttonClass} bg-accent/15 text-accent hover:bg-accent/25`}
          >
            Tags
          </button>
        )}
        <button
          onClick={onBulkDelete}
          aria-label="Delete selected projects"
          className={`${buttonClass} bg-danger/15 text-danger hover:bg-danger/25`}
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
