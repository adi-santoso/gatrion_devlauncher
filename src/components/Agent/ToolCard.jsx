import React, { useState } from 'react';
import Icon from '../Common/Icon';
import { TOOL_ICONS } from './agentChatUtils';

export default function ToolCard({ tool }) {
  const [expanded, setExpanded] = useState(false);
  const running = tool.state === 'running';
  const done = tool.state === 'done';
  return (
    <div className={`my-1.5 rounded-xl border overflow-hidden transition-colors ${running ? 'border-accent/25 bg-accent/[0.03]' : 'border-border bg-surface'}`}>
      <button
        type="button"
        onClick={() => tool.body && setExpanded((value) => !value)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left ${tool.body ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${running ? 'bg-accent/15 text-accent-hover' : done ? 'bg-success/10 text-success' : 'bg-surface-3 text-ink-faint'}`}>
          <Icon name={TOOL_ICONS[tool.name] || 'bolt'} size={12} />
        </span>
        <span className="text-[13px] font-semibold text-ink font-mono">{tool.name}</span>
        {tool.arg && <span className="min-w-0 flex-1 truncate text-xs text-ink-faint font-mono">{tool.arg}</span>}
        <span className={`ml-auto flex items-center gap-1.5 text-[11px] font-medium shrink-0 ${running ? 'text-warning' : done ? 'text-success' : 'text-ink-faint'}`}>
          {running && <span className="w-3 h-3 rounded-full border-2 border-warning border-t-transparent animate-spin" />}
          {done && <Icon name="check" size={11} />}
          {running ? 'working…' : done ? 'done' : 'idle'}
        </span>
        {tool.body && (
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} className="text-ink-faint shrink-0" />
        )}
      </button>
      {expanded && tool.body && (
        <div className="border-t border-border px-3 py-2">
          <pre className="text-xs font-mono text-ink-soft whitespace-pre-wrap break-all max-h-52 overflow-auto">{tool.body}</pre>
        </div>
      )}
    </div>
  );
}
