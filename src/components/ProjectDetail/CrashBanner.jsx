import React from 'react';
import Icon from '../Common/Icon';

export default function CrashBanner({
  message,
  timestamp,
  onRestart,
  onDismiss
}) {
  return (
    <div role="alert" className="relative flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 pr-10 shadow-sm">
      <Icon name="warn" size={16} className="text-danger shrink-0 mt-0.5" />
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
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white hover:brightness-110"
      >
        <Icon name="restart" size={12} />
        Restart
      </button>
      )}
      {onDismiss && <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="absolute right-3 top-3 rounded p-1 text-ink-faint hover:bg-danger/10 hover:text-ink"
      >
        <Icon name="x" size={13} />
      </button>}
    </div>
  );
}
