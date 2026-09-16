import { useId, useState } from 'react';
import Icon from '../Common/Icon';
import { TOOL_ICONS } from './agentChatUtils';
import Markdown from './Markdown';
import { useAgentI18n } from './useAgentI18n';

export interface ToolCallInfo {
  name: string;
  arg?: string;
  state?: string;
  body?: string;
  [key: string]: unknown;
}

// Tool bodies are often raw terminal/JSON output — plain <pre> is fine for
// those. But when a tool returns code (a fenced markdown block), render it
// through Markdown so it gets the same code block with a copy button as the
// rest of the chat.
const containsFencedCode = (body: string): boolean => /```[\s\S]*```/.test(body);

export default function ToolCard({ tool }: { tool: ToolCallInfo }) {
  const t = useAgentI18n();
  const bodyId = useId();
  const [expanded, setExpanded] = useState(false);
  const running = tool.state === 'running';
  const done = tool.state === 'done';
  const failed = tool.state === 'error';
  const bodyCode = Boolean(tool.body && containsFencedCode(tool.body));
  return (
    <div className={`agent-tool-card my-3 rounded-xl border overflow-hidden transition-colors duration-200 ${running ? 'border-accent/25 bg-accent/[0.03]' : failed ? 'border-danger/30 bg-surface' : 'border-border bg-surface'}`}>
      <button
        type="button"
        onClick={() => tool.body && setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-disabled={!tool.body}
        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left ${tool.body ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${running ? 'bg-accent/15 text-accent-hover' : done ? 'bg-success/10 text-success' : 'bg-surface-3 text-ink-faint'}`}>
          <Icon name={TOOL_ICONS[tool.name] || 'bolt'} size={12} />
        </span>
        <span className="text-[13px] font-semibold text-ink font-mono">{tool.name}</span>
        {tool.arg && <span className="min-w-0 flex-1 truncate text-xs text-ink-faint font-mono">{tool.arg}</span>}
        <span className={`ml-auto flex items-center justify-end gap-1.5 min-w-20 text-[11px] font-medium shrink-0 ${running ? 'text-warning' : failed ? 'text-danger' : done ? 'text-success' : 'text-ink-faint'}`}>
          <span key={tool.state} className="agent-status-in inline-flex w-3 justify-center">
            <Icon name={running ? 'spinner' : failed ? 'warn' : done ? 'check' : 'clock'} size={12} className={running ? 'animate-spin' : ''} />
          </span>
          {t(running ? 'working...' : failed ? 'failed' : done ? 'done' : 'idle')}
        </span>
        {tool.body && (
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} className="text-ink-faint shrink-0" />
        )}
      </button>
        <div id={bodyId} hidden={!expanded || !tool.body} aria-label={t('Tool output')} className="border-t border-border px-3 py-3">
          {bodyCode ? (
            <Markdown content={tool.body || ''} />
          ) : (
            <pre className="text-xs font-mono text-ink-soft whitespace-pre-wrap break-all max-h-72 overflow-auto">{tool.body}</pre>
          )}
        </div>
    </div>
  );
}
