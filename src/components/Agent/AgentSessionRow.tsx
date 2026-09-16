import { useRef } from 'react';
import Icon from '../Common/Icon';
import { formatCost } from '../../utils/costEstimate';
import type { AgentSession, Project } from '../../types/shared';
import type { AgentSessionSidebarProps } from './AgentSessionSidebar';

interface Props extends Pick<AgentSessionSidebarProps, 'onSelectSession' | 'onCancelRename' | 'onRenameSession' | 'onStartRename' | 'onTogglePin' | 'onRequestDelete' | 'activeContextUsage'> {
  project: Project;
  session: AgentSession;
  active: boolean;
  renaming: boolean;
  busy: boolean;
  pending: boolean;
}

function formatRelative(timestamp?: number): string {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function AgentSessionRow({ project, session, active, renaming, busy, pending, activeContextUsage, onSelectSession, onCancelRename, onRenameSession, onStartRename, onTogglePin, onRequestDelete }: Props) {
  const renameCommitted = useRef(false);
  const commitRename = (title: string) => {
    if (renameCommitted.current) return;
    renameCommitted.current = true;
    onRenameSession(project, session, title);
  };
  const actionClass = 'w-7 h-7 inline-flex items-center justify-center rounded-md text-ink-faint hover:bg-surface-3 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40';

  return (
    <div className={`group mx-1 rounded-lg border transition-colors ${active ? 'bg-surface border-accent/30 shadow-sm' : 'border-transparent hover:bg-surface-3/60'}`}>
      {renaming ? (
        <div className="px-3 pt-2">
          <input
            autoFocus
            aria-label="Session title"
            maxLength={80}
            defaultValue={session.title}
            disabled={pending}
            onFocus={(event) => { renameCommitted.current = false; event.target.select(); }}
            onChange={() => { renameCommitted.current = false; }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter') { event.preventDefault(); commitRename(event.currentTarget.value); }
              if (event.key === 'Escape') { event.preventDefault(); renameCommitted.current = true; onCancelRename(); }
            }}
            onBlur={(event) => commitRename(event.target.value)}
            className="w-full bg-surface-3 border border-accent/40 rounded-md px-1.5 py-1 text-[13px] font-medium text-ink focus:outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onSelectSession(project, session)}
          disabled={busy}
          aria-current={active ? 'true' : undefined}
          title={session.title}
          className="w-full flex items-center gap-1.5 text-left px-3 pt-2 pb-1 rounded-lg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed"
        >
          {session.pinned && <Icon name="star" size={11} className="text-accent shrink-0" />}
          <span className="text-[13px] font-medium text-ink truncate leading-snug">{session.title}</span>
        </button>
      )}
      <div className="px-3 pb-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-faint tabular-nums">
          <span>{formatRelative(session.lastActive as number | undefined)}</span>
          {(session.tokens || 0) > 0 && <span className="text-warning">{((session.tokens || 0) / 1000).toFixed(1)}k tokens</span>}
          {(session.cost || 0) > 0 && <span title="Estimated cost (list price of the active model)">≈{formatCost(session.cost || 0)}</span>}
          {active && activeContextUsage && (activeContextUsage.tokens ?? 0) > 0 && (
            <span className="text-accent" title="Context used right now (tokens / context window)">
              {(activeContextUsage.tokens || 0).toLocaleString()}/{activeContextUsage.contextWindow ? (activeContextUsage.contextWindow / 1000).toFixed(0) : '?'}k ctx
            </span>
          )}
        </div>
        <div className={`flex justify-end gap-0.5 transition-opacity ${active || renaming ? '' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
          <button type="button" disabled={pending} onClick={() => onTogglePin(project, session)} className={actionClass} title={session.pinned ? 'Unpin session' : 'Pin session'} aria-label={session.pinned ? 'Unpin session' : 'Pin session'}><Icon name="star" size={12} /></button>
          <button type="button" disabled={pending || busy} onClick={() => { renameCommitted.current = false; onStartRename(project.id, session.id); }} className={actionClass} title="Rename session" aria-label="Rename session"><Icon name="fileText" size={12} /></button>
          <button type="button" disabled={pending || busy} onClick={() => onRequestDelete(project, session)} className={`${actionClass} hover:text-danger`} title="Delete session" aria-label="Delete session"><Icon name="trash" size={12} /></button>
        </div>
      </div>
    </div>
  );
}
