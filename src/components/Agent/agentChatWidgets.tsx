import Icon from '../Common/Icon';
import type { Project } from '../../types/shared';
import { SUGGESTIONS } from './agentChatUtils';
import type { BashRun, SubagentInfo, TodoPhase } from './agentChatTypes';

// ---------------------------------------------------------------------------
// Handoff (custom instructions) popover
// ---------------------------------------------------------------------------

export interface HandoffPopoverProps {
  open: boolean;
  text: string;
  setText: (value: string) => void;
  onApply: () => void;
  onClose: () => void;
}

export function HandoffPopover({ open, text, setText, onApply, onClose }: HandoffPopoverProps) {
  if (!open) return null;
  return (
    <div className="relative shrink-0 bg-base px-5 pt-3">
      <div className="max-w-[760px] mx-auto rounded-xl border border-border bg-surface-2 shadow-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="fileText" size={13} className="text-accent" />
          <p className="text-xs font-semibold text-ink">Custom instructions</p>
          <span className="text-[10px] text-ink-faint">applied to the next agent response</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-ink-faint hover:text-ink flex items-center"
            aria-label="Close instructions"
          >
            <Icon name="x" size={12} />
          </button>
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); onApply(); }
          }}
          rows={2}
          placeholder="e.g. Always explain changes before editing files…"
          className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50 resize-none"
        />
        <div className="flex items-center gap-2 mt-2.5">
          <button
            type="button"
            onClick={onApply}
            disabled={!text.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply
          </button>
          <span className="text-[10px] text-ink-faint">Ctrl/⌘+Enter to apply</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subagent activity chips
// ---------------------------------------------------------------------------

export function SubagentChips({ subagents }: { subagents: SubagentInfo[] }) {
  if (subagents.length === 0) return null;
  return (
    <div className="shrink-0 bg-base px-5 pt-2.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Subagents</span>
      {subagents.map((agent, index) => {
        const agentStatus = agent.status || (typeof agent.progress === 'number' ? (agent.progress < 1 ? 'running' : 'done') : 'idle');
        const running = agentStatus === 'running' || agentStatus === 'in_progress' || agentStatus === 'working';
        const done = agentStatus === 'done' || agentStatus === 'completed';
        return (
          <span
            key={agent.id || agent.name || `sub-${index}`}
            title={agent.task || agent.name || 'subagent'}
            className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft bg-surface-2 border border-border rounded-full px-2.5 py-1"
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${running ? 'bg-warning animate-pulse' : done ? 'bg-success' : 'bg-ink-faint/50'}`} />
            <Icon name="bot" size={11} className="text-accent shrink-0" />
            <span className="max-w-[200px] truncate">{agent.task || agent.name || 'subagent'}</span>
            {typeof agent.progress === 'number' && agent.progress < 1 && (
              <span className="text-ink-faint tabular-nums">{Math.round(agent.progress * 100)}%</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Todos panel (floating card over the messages area)
// ---------------------------------------------------------------------------

export interface TodosPanelProps {
  todos: TodoPhase[];
  open: boolean;
  setOpen: (updater: (value: boolean) => boolean) => void;
}

export function TodosPanel({ todos, open, setOpen }: TodosPanelProps) {
  if (todos.length === 0) return null;
  return (
    <div className="absolute right-4 top-4 z-20 w-64 max-h-[60%] flex flex-col rounded-xl border border-border bg-surface shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 px-3 py-2 text-left border-b border-border bg-surface-2"
      >
        <Icon name="check" size={12} className="text-accent" />
        <span className="text-xs font-semibold text-ink flex-1">Todos</span>
        <span className="text-[10px] text-ink-faint tabular-nums">{todos.reduce((sum, phase) => sum + (phase.tasks?.length || 0), 0)}</span>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={11} className="text-ink-faint" />
      </button>
      {open && (
        <div className="overflow-auto p-2 space-y-2">
          {todos.map((phase) => (
            <div key={phase.id}>
              {phase.name && phase.name !== 'Todos' && (
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint px-1 mb-1">{phase.name}</p>
              )}
              {(phase.tasks || []).map((task) => (
                <div key={task.id} className="flex items-start gap-2 px-1 py-0.5">
                  <span className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${task.status === 'done' ? 'bg-success border-success text-white' : task.status === 'in_progress' ? 'border-accent' : 'border-border'}`}>
                    {task.status === 'done' && <Icon name="check" size={8} />}
                  </span>
                  <span className={`text-xs leading-snug ${task.status === 'done' ? 'text-ink-faint line-through' : task.status === 'in_progress' ? 'text-ink' : 'text-ink-soft'}`}>{task.content}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty / loading / error states for the messages area
// ---------------------------------------------------------------------------

export interface HistoryStateProps {
  historyError: string | null;
  historyLoading: boolean;
  isFresh: boolean;
  notConfigured: boolean;
  project: Project;
  busy: boolean;
  onRetry: () => void;
  onOpenSettings?: () => void;
  onSend: (preset?: string) => void;
}

export function HistoryStates({ historyError, historyLoading, isFresh, notConfigured, project, busy, onRetry, onOpenSettings, onSend }: HistoryStateProps) {
  if (historyError) {
    return (
      <div className="max-w-[560px] mx-auto pt-2 px-4">
        <div className="rounded-xl border border-danger/30 bg-danger-soft/40 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 w-6 h-6 rounded-md bg-danger/15 flex items-center justify-center shrink-0">
              <Icon name="warn" size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Couldn&apos;t load this conversation</p>
              <p className="text-xs text-ink-soft mt-0.5 break-words">{historyError}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
              >
                <Icon name="refreshCw" size={12} />
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (historyLoading) {
    return (
      <div className="max-w-[760px] mx-auto space-y-5 pt-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-5 h-5 rounded-md bg-accent/15 flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-accent/40 border-t-transparent animate-spin" />
          </span>
          <span className="text-xs font-semibold text-ink-soft">Loading conversation…</span>
        </div>
        <div className="space-y-1.5">
          <div className="skeleton h-3.5 w-3/4 rounded" />
          <div className="skeleton h-3.5 w-1/2 rounded" />
          <div className="skeleton h-3.5 w-2/3 rounded" />
        </div>
        <div className="flex justify-end">
          <div className="skeleton h-9 w-40 rounded-2xl" />
        </div>
        <div className="space-y-1.5">
          <div className="skeleton h-3.5 w-full rounded" />
          <div className="skeleton h-3.5 w-4/5 rounded" />
        </div>
        <div className="flex justify-end">
          <div className="skeleton h-9 w-56 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (isFresh) {
    return (
      <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center">
        <div className="relative w-16 h-16 mx-auto mb-5">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent/15 to-accent/5" />
          <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 flex items-center justify-center text-accent-hover">
            <Icon name="messageSquare" size={24} />
          </div>
        </div>
        {notConfigured ? (
          <>
            <p className="text-base font-semibold text-ink">Agent is not configured yet</p>
            <p className="text-sm text-ink-faint mt-1.5 max-w-md leading-relaxed">
              omp is installed but no AI provider is set up. Configure one to start chatting with the coding agent.
            </p>
            <button
              onClick={() => onOpenSettings?.()}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors"
            >
              <Icon name="gear" size={14} />
              Open Agent settings
            </button>
          </>
        ) : (
          <>
            <p className="text-[22px] font-bold tracking-[-0.02em] mb-2 text-ink">What can I help you build?</p>
            <p className="text-[13.5px] text-ink-faint leading-relaxed mb-7">
              Ask it to fix a bug, refactor code, or explore <span className="text-ink-soft font-medium">{project?.name}</span>.
            </p>
            <div className="grid grid-cols-2 gap-2.5 w-full max-w-md">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onSend(suggestion)}
                  disabled={busy}
                  className="text-left text-[12.5px] px-3.5 py-3 rounded-lg border border-border bg-surface-2 text-ink-soft hover:border-accent/50 hover:text-ink leading-snug transition-colors disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bash command runner — collapsible terminal blocks per command
// ---------------------------------------------------------------------------

export interface BashRunnerProps {
  runs: BashRun[];
  projectName?: string;
  onUpdateRun: (runId: string, patch: Partial<BashRun>) => void;
  onAbortRun: (runId: string) => void;
  onClear: () => void;
}

export function BashRunnerList({ runs, projectName, onUpdateRun, onAbortRun, onClear }: BashRunnerProps) {
  if (runs.length === 0) return null;
  return (
    <div className="shrink-0 bg-base px-5 pt-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon name="terminal" size={12} className="text-accent" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Terminal</span>
        <span className="text-[10px] text-ink-faint">runs in {projectName}</span>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto text-[10px] text-ink-faint hover:text-ink transition-colors"
        >
          Clear
        </button>
      </div>
      {runs.map((run) => (
        <div key={run.id} className="rounded-xl border border-border bg-surface overflow-hidden">
          <button
            type="button"
            onClick={() => onUpdateRun(run.id, { expanded: !run.expanded })}
            className="w-full flex items-center gap-2 px-3 py-2 text-left"
          >
            <span className="text-[11px] font-mono text-ink-soft truncate flex-1">$ {run.command}</span>
            {run.status === 'running' && (
              <span className="flex items-center gap-1.5 text-[10px] text-warning shrink-0">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-warning border-t-transparent animate-spin" />
                running…
              </span>
            )}
            {run.status === 'cancelling' && <span className="text-[10px] text-ink-faint shrink-0">cancelling…</span>}
            {run.status === 'done' && (
              <span className={`text-[10px] font-mono shrink-0 ${run.exitCode === 0 ? 'text-success' : 'text-warning'}`}>
                {run.cancelled ? 'cancelled' : run.timedOut ? 'timed out' : `exit ${run.exitCode ?? '?'}`}
              </span>
            )}
            {run.status === 'error' && <span className="text-[10px] text-danger shrink-0">failed</span>}
            <Icon name={run.expanded ? 'chevronDown' : 'chevronRight'} size={11} className="text-ink-faint shrink-0" />
          </button>
          {run.status === 'running' && (
            <div className="px-3 pb-2">
              <button
                type="button"
                onClick={() => onAbortRun(run.id)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger bg-danger/10 border border-danger/25 rounded-lg px-2.5 py-1 hover:bg-danger/20 transition-colors"
              >
                <Icon name="stop" size={10} />
                Stop
              </button>
            </div>
          )}
          {run.expanded && (run.output || run.error) && (
            <pre className="border-t border-border px-3 py-2 text-xs font-mono text-ink-soft whitespace-pre-wrap break-all max-h-64 overflow-auto">
              {run.error || run.output}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
