import React from 'react';

export default function CrashBanner({
  message,
  timestamp,
  onRestart,
  onDismiss
}) {
  return (
    <div className="flex items-start gap-3 bg-danger/10 border border-danger/25 rounded-xl px-4 py-3">
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
      <button
        onClick={onRestart}
        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-danger text-white shrink-0"
      >
        Restart
      </button>
      <button
        onClick={onDismiss}
        className="text-ink-faint hover:text-ink shrink-0"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  );
}
