import React, { useEffect, useState } from 'react';
import Icon from '../Common/Icon';

// Collapsible reasoning panel for assistant messages. Auto-opens while the
// model is streaming so the user can watch it think, and shows a short preview
// of the reasoning (instead of nothing) when collapsed.
export default function ThinkingBlock({ content, isStreaming = false }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (isStreaming) setExpanded(true);
  }, [isStreaming]);
  const trimmed = content.trim();
  const preview = trimmed.slice(0, 120);

  return (
    <div className="my-1.5 rounded-xl border border-border/70 bg-surface-2/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
      >
        <Icon name="spinner" size={12} className="text-ink-faint shrink-0" />
        <span className="text-xs font-medium text-ink-soft">Thinking</span>
        {!expanded && preview && (
          <span className="text-[11px] text-ink-faint truncate min-w-0 flex-1">{preview}{trimmed.length > 120 ? '…' : ''}</span>
        )}
        {isStreaming && (
          <span className="flex items-center gap-0.5 shrink-0">
            <span className="w-1 h-1 rounded-full bg-ink-faint animate-pulse" />
            <span className="w-1 h-1 rounded-full bg-ink-faint animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 rounded-full bg-ink-faint animate-pulse" style={{ animationDelay: '300ms' }} />
          </span>
        )}
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} className="text-ink-faint shrink-0 ml-auto" />
      </button>
      {expanded && (
        <div className="border-t border-border/60 px-3 py-2 text-xs text-ink-faint italic whitespace-pre-wrap break-words max-h-56 overflow-auto">
          {preview ? content : 'Thinking…'}
        </div>
      )}
    </div>
  );
}
