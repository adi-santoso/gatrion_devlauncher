import Icon from '../Common/Icon';
import { formatCost } from '../../utils/costEstimate';
import type { AgentSession, Project } from '../../types/shared';

function formatRelative(timestamp?: number): string {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export interface RenamingTarget {
  projectId: string;
  sessionId: string;
}

export interface AgentSessionSidebarProps {
  projects: Project[];
  sessionsByProject: Record<string, AgentSession[]>;
  selectedProjectId: string | null;
  activeSession: AgentSession | null;
  sessionSearch: string;
  onSearchChange: (value: string) => void;
  onToggleProject: (project: Project) => void;
  onSelectSession: (project: Project, session: AgentSession) => void;
  onNewSession: (project: Project) => void;
  onOpenProject?: (project: Project) => void;
  renaming: RenamingTarget | null;
  onStartRename: (projectId: string, sessionId: string) => void;
  onCancelRename: () => void;
  onRenameSession: (project: Project, session: AgentSession, title: string) => void;
  onTogglePin: (project: Project, session: AgentSession) => void;
  onRequestDelete: (project: Project, session: AgentSession) => void;
}

export default function AgentSessionSidebar({
  projects,
  sessionsByProject,
  selectedProjectId,
  activeSession,
  sessionSearch,
  onSearchChange,
  onToggleProject,
  onSelectSession,
  onNewSession,
  onOpenProject,
  renaming,
  onStartRename,
  onCancelRename,
  onRenameSession,
  onTogglePin,
  onRequestDelete,
}: AgentSessionSidebarProps) {
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;

  return (
    <div className="w-64 shrink-0 border-r border-border bg-surface-2 flex flex-col min-h-0">
      <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
        <span className="text-[11px] font-mono font-bold uppercase tracking-[0.12em] text-ink-faint">Sessions</span>
        {selectedProject && (
          <button
            type="button"
            onClick={() => onNewSession(selectedProject)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:text-accent-hover transition-colors"
          >
            <Icon name="plus" size={12} />
            New
          </button>
        )}
      </div>
      <div className="px-3 pb-2 shrink-0">
        <div className="flex items-center gap-2 bg-surface-3 border border-border rounded-lg px-2.5 py-1.5 focus-within:border-accent/50">
          <Icon name="search" size={11} className="text-ink-faint" />
          <input
            value={sessionSearch}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search sessions…"
            className="flex-1 bg-transparent text-xs text-ink placeholder:text-ink-faint focus:outline-none"
          />
          {sessionSearch && (
            <button type="button" onClick={() => onSearchChange('')} className="text-ink-faint hover:text-ink" aria-label="Clear session search">
              <Icon name="x" size={10} />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto pb-3 px-2">
        {projects.length === 0 && (
          <p className="px-3 py-6 text-xs text-ink-faint text-center leading-relaxed">No projects yet.<br />Add one to start chatting.</p>
        )}
        {projects.map((project) => {
          const query = sessionSearch.trim().toLowerCase();
          const sessions = (sessionsByProject[project.id] || [])
            .filter((session) => !query || session.title.toLowerCase().includes(query))
            .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
          const isSelected = selectedProjectId === project.id;
          return (
            <div key={project.id} className="mb-1.5">
              {/* Row is a div[role=button] (not a native button element) so
                  the inner "Open project detail" action stays valid HTML. */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onToggleProject(project)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onToggleProject(project);
                  }
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left cursor-pointer transition-colors ${
                  isSelected ? 'bg-surface-3/80' : 'hover:bg-surface-3/50'
                }`}
              >
                <Icon name={isSelected ? 'chevronDown' : 'chevronRight'} size={12} className="text-ink-faint shrink-0" />
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? 'bg-accent' : 'bg-ink-faint/40'}`} />
                <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-ink-soft">{project.name}</span>
                {isSelected && (() => {
                  const list = sessionsByProject[project.id] || [];
                  const totalTokens = list.reduce((sum, item) => sum + (item.tokens || 0), 0);
                  const totalCost = list.reduce((sum, item) => sum + (item.cost || 0), 0);
                  if (totalTokens === 0 && totalCost === 0) return null;
                  return (
                    <span className="shrink-0 text-[10px] text-ink-faint tabular-nums" title="All sessions in this project">
                      {totalTokens > 0 && `${(totalTokens / 1000).toFixed(1)}k tokens`}
                      {totalTokens > 0 && totalCost > 0 && ' · '}
                      {totalCost > 0 && `≈${formatCost(totalCost)}`}
                    </span>
                  );
                })()}
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); onOpenProject?.(project); }}
                  title="Open project detail"
                  className="text-ink-faint hover:text-accent flex items-center shrink-0"
                >
                  <Icon name="external" size={11} />
                </button>
              </div>
              {isSelected && (
                <div className="mt-1 space-y-0.5">
                  {sessions.length === 0 && (
                    <p className="px-3 py-2 text-[11px] text-ink-faint">
                      {query ? 'No sessions match your search.' : 'No sessions yet — start one below.'}
                    </p>
                  )}
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectSession(project, session)}
                      onKeyDown={(event) => event.key === 'Enter' && onSelectSession(project, session)}
                      className={`group mx-1 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${
                        activeSession?.id === session.id
                          ? 'bg-surface border-accent/30 shadow-sm'
                          : 'border-transparent hover:bg-surface-3/60'
                      }`}
                    >
                      {renaming?.sessionId === session.id ? (
                        <input
                          autoFocus
                          defaultValue={session.title}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') onRenameSession(project, session, event.currentTarget.value);
                            if (event.key === 'Escape') onCancelRename();
                          }}
                          onBlur={(event) => onRenameSession(project, session, event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          className="w-full bg-surface-3 border border-accent/40 rounded-md px-1.5 py-0.5 text-[13px] font-medium text-ink focus:outline-none"
                        />
                      ) : (
                        <p className="text-[13px] font-medium text-ink truncate leading-snug">{session.title}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-ink-faint">{formatRelative(session.lastActive as number | undefined)}</span>
                        {(session.tokens || 0) > 0 && <span className="text-[11px] text-warning tabular-nums">{((session.tokens || 0) / 1000).toFixed(1)}k tokens</span>}
                        {(session.cost || 0) > 0 && <span className="text-[11px] text-ink-soft tabular-nums" title="Estimated cost (list price of the active model)">≈{formatCost(session.cost || 0)}</span>}
                        <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); onTogglePin(project, session); }}
                            className={session.pinned ? 'text-accent' : 'text-ink-faint hover:text-accent'}
                            title={session.pinned ? 'Unpin session' : 'Pin session'}
                          >
                            <Icon name="star" size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); onStartRename(project.id, session.id); }}
                            className="text-ink-faint hover:text-accent"
                            title="Rename session"
                          >
                            <Icon name="fileText" size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); onRequestDelete(project, session); }}
                            className="text-ink-faint hover:text-danger"
                            title="Delete session"
                          >
                            <Icon name="trash" size={11} />
                          </button>
                        </span>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => onNewSession(project)}
                    className="mx-1 mt-1.5 w-[calc(100%-8px)] flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs text-ink-faint hover:text-ink hover:border-border-hover py-2 transition-colors"
                  >
                    <Icon name="plus" size={12} />
                    New session
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="border-t border-border p-3 text-[11px] text-ink-faint leading-relaxed">
        Sessions are stored locally by omp per project. Chat history survives app restarts.
      </div>
    </div>
  );
}
