import React from 'react';

export default function PortConflictModal({
  isOpen,
  onClose,
  conflictData,
  onProceed,
  onEditPort
}) {
  if (!isOpen || !conflictData) return null;

  const { port, pid, processName, isManaged, managedProjectName } = conflictData;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-warning/15 text-warning flex items-center justify-center text-xl shrink-0 border border-warning/20">
            ⚠️
          </div>
          <div>
            <h3 className="font-display font-bold text-lg text-ink">Port Conflict Detected</h3>
            <p className="text-xs text-ink-faint mt-1">
              Port <code className="text-warning font-semibold font-mono">:{port}</code> is already in use on your system.
            </p>
          </div>
        </div>

        {/* Details Box */}
        <div className="bg-surface-2 border border-border rounded-lg p-3 text-xs font-mono space-y-1.5 text-ink-soft">
          <div className="flex items-center justify-between">
            <span className="text-ink-faint">Occupying App:</span>
            <span className="font-bold text-ink">{processName || 'Unknown Application'}</span>
          </div>
          {pid && (
            <div className="flex items-center justify-between">
              <span className="text-ink-faint">Process PID:</span>
              <span className="text-ink">{pid}</span>
            </div>
          )}
          {isManaged && managedProjectName && (
            <div className="flex items-center justify-between text-accent">
              <span>Managed Project:</span>
              <span className="font-semibold">{managedProjectName}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-ink-faint leading-relaxed">
          Starting this project now may cause network binding errors or unexpected server behavior. How would you like to proceed?
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
          >
            Cancel
          </button>
          {onEditPort && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEditPort();
              }}
              className="px-4 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-semibold text-accent border border-accent/20 transition-colors"
            >
              ⚙️ Change Port
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onClose();
              onProceed?.();
            }}
            className="px-4 py-2 rounded-lg bg-warning/20 hover:bg-warning/30 text-warning border border-warning/30 text-xs font-semibold transition-colors"
          >
            Proceed Anyway
          </button>
        </div>
      </div>
    </div>
  );
}
