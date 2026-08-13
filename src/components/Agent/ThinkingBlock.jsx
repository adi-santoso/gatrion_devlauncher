import React, { useEffect, useState } from 'react';
import Icon from '../Common/Icon';

// Collapsible reasoning panel styled like kreova's chat: open by default,
// auto-opens while the model is streaming, and shows a short preview of the
// reasoning (instead of nothing) when collapsed.
export default function ThinkingBlock({ content, isStreaming = false }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (isStreaming) setOpen(true);
  }, [isStreaming]);
  const trimmed = content.trim();
  const hasContent = trimmed.length > 0;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="group flex items-center gap-1.5 text-[12px] text-ink-faint hover:text-ink-soft transition-colors cursor-pointer select-none"
        aria-expanded={open}
      >
        <span className="flex items-center justify-center w-3.5 h-3.5 rounded-[4px] bg-surface-2 border border-border text-ink-faint group-hover:text-ink-soft transition-colors">
          <Icon name="chevronRight" size={9} strokeWidth={2.5} className={`transform transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
        </span>
        <span className="font-medium">Thought process</span>
        {!open && hasContent && (
          <span className="text-[10.5px] text-ink-faint opacity-60 truncate ml-1 max-w-[300px]">
            {trimmed.slice(0, 120)}{trimmed.length > 120 ? '…' : ''}
          </span>
        )}
        {isStreaming && (
          <span className="flex items-center gap-0.5 ml-1">
            <span className="w-1 h-1 rounded-full bg-ink-faint animate-dot-pulse" />
            <span className="w-1 h-1 rounded-full bg-ink-faint animate-dot-pulse-delay-1" />
            <span className="w-1 h-1 rounded-full bg-ink-faint animate-dot-pulse-delay-2" />
          </span>
        )}
      </button>
      {open && (
        <div className="mt-1.5 pl-[22px]">
          <div className="relative">
            <div className="absolute left-0 top-1 bottom-1 w-px bg-border" />
            <div className="pl-4 text-[12.5px] leading-relaxed text-ink-soft whitespace-pre-wrap select-text">
              {hasContent ? content : 'Thinking…'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
