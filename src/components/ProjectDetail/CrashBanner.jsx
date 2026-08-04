import React from 'react';

export default function CrashBanner({
  message,
  timestamp,
  onRestart,
  onDismiss
}) {
  return (
    <div role="alert" className="relative flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 pr-10 shadow-sm">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger shrink-0 mt-0.5">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4M12 16h.01"/>
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-danger">{message}</p>
        {timestamp && (
          <p className="text-xs text-ink-faint mt-0.5">{timestamp}</p>
        )}
      </div>
      {onRestart && (
        <button
          type="button"
          onClick={onRestart}
          className="shrink-0 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white hover:brightness-110"
        >
          Restart
        </button>
      )}
      {onDismiss && <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="absolute right-3 top-3 rounded p-1 text-ink-faint hover:bg-danger/10 hover:text-ink"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>}
    </div>
  );
}
