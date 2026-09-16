import Icon from '../Common/Icon';
import AgentSessionRow from './AgentSessionRow';
import { formatCost } from '../../utils/costEstimate';
import type { AgentSession, Project } from '../../types/shared';
import { useAgentI18n } from './useAgentI18n';

export interface RenamingTarget {
  projectId: string;
  sessionId: string;
}

export interface AgentSessionSidebarProps {
  projects: Project[];
  sessionsByProject: Record<string, AgentSession[]>;
  selectedProjectId: string | null;
  activeSession: AgentSession | null;
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
  onRetry: (projectId: string) => void;
  busy: boolean;
  pendingAction: string | null;
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
  status?: { installed: boolean; configured: boolean; version?: string | null };
  statusLoading?: boolean;
  statusError?: string | null;
  onRetryStatus: () => void;
  sessionCount?: number;
  activeContextUsage?: { tokens?: number; contextWindow?: number } | null;
  onOpenSettings?: () => void;
}

export default function AgentSessionSidebar(props: AgentSessionSidebarProps) {
  const t = useAgentI18n();
  const {
    projects, sessionsByProject, selectedProjectId, activeSession, loading, errors, onRetry,
    busy, pendingAction, sessionSearch, onSearchChange, onToggleProject, onSelectSession,
    onNewSession, onOpenProject, renaming, onStartRename, onCancelRename, onRenameSession,
    onTogglePin, onRequestDelete, status, statusLoading, statusError, onRetryStatus,
    sessionCount = 0, activeContextUsage, onOpenSettings,
  } = props;
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;
  const query = sessionSearch.trim().toLowerCase();
  const groups = projects.map((project) => ({
    project,
    sessions: (sessionsByProject[project.id] || [])
      .filter((session) => !query || project.name.toLowerCase().includes(query) || session.title.toLowerCase().includes(query))
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || Number(b.lastActive || 0) - Number(a.lastActive || 0)),
  })).filter(({ project, sessions }) => !query || sessions.length > 0 || project.name.toLowerCase().includes(query) || loading[project.id] || errors[project.id]);
  const cannotCreate = (projectId: string) => busy || Boolean(pendingAction) || Boolean(loading[projectId]) || Boolean(errors[projectId]);

  return (
    <aside aria-label={t('Agent sessions')} className="w-64 shrink-0 border-r border-border bg-surface-2 flex flex-col min-h-0">
      <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
        <span className="text-[11px] font-mono font-bold uppercase tracking-[0.12em] text-ink-faint">{t('Sessions')}</span>
        {selectedProject && (
          <button type="button" onClick={() => onNewSession(selectedProject)} disabled={cannotCreate(selectedProject.id)} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-accent hover:text-accent-hover disabled:opacity-40 disabled:cursor-not-allowed">
            <Icon name={pendingAction === `new:${selectedProject.id}` ? 'spinner' : 'plus'} size={12} /> {t('New')}
          </button>
        )}
      </div>
      <div className="px-3 pb-2 shrink-0">
        <div className="flex items-center gap-2 bg-surface-3 border border-border rounded-lg px-2.5 py-1.5 focus-within:border-accent/50">
          <Icon name="search" size={12} className="text-ink-faint shrink-0" />
          <input value={sessionSearch} onChange={(event) => onSearchChange(event.target.value)} placeholder={t('Search sessions...')} aria-label={t('Search projects and sessions')} className="flex-1 min-w-0 bg-transparent text-xs text-ink placeholder:text-ink-faint focus:outline-none" />
          {sessionSearch && <button type="button" onClick={() => onSearchChange('')} className="text-ink-faint hover:text-ink p-1" aria-label={t('Clear session search')}><Icon name="x" size={12} /></button>}
        </div>
        {busy && <p role="status" className="mt-2 text-xs text-accent leading-relaxed">{t('Agent is working. Stop the current turn before switching sessions.')}</p>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto pb-3 px-2">
        {projects.length === 0 && <p className="px-3 py-6 text-xs text-ink-faint text-center leading-relaxed">{t('No projects yet.')}<br />{t('Add one to start chatting.')}</p>}
        {query && groups.length === 0 && <p role="status" className="px-3 py-6 text-xs text-ink-faint text-center">{t('No projects or sessions match “{query}”.', { query: sessionSearch })}</p>}
        {groups.map(({ project, sessions }) => {
          const isSelected = selectedProjectId === project.id;
          const expanded = isSelected || Boolean(query);
          const allSessions = sessionsByProject[project.id] || [];
          const totalTokens = allSessions.reduce((sum, session) => sum + (session.tokens || 0), 0);
          const totalCost = allSessions.reduce((sum, session) => sum + (session.cost || 0), 0);
          return (
            <div key={project.id} className="mb-1.5">
              <div className={`flex items-center rounded-lg ${isSelected ? 'bg-surface-3/80' : 'hover:bg-surface-3/50'}`}>
                <button type="button" disabled={busy} aria-expanded={expanded} aria-controls={`agent-sessions-${project.id}`} onClick={() => onToggleProject(project)} className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-2 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed">
                  <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} className="text-ink-faint shrink-0" />
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? 'bg-accent' : 'bg-ink-faint/40'}`} />
                  <span title={project.name} className="flex-1 min-w-0 truncate text-[13px] font-semibold text-ink-soft">{project.name}</span>
                  {!loading[project.id] && !errors[project.id] && <span className="text-[11px] text-ink-faint tabular-nums">{sessions.length}</span>}
                </button>
                {onOpenProject && <button type="button" onClick={() => onOpenProject(project)} title={t('Open project detail')} aria-label={t('Open project detail: {name}', { name: project.name })} className="text-ink-faint hover:text-accent w-7 h-7 flex items-center justify-center shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-accent"><Icon name="external" size={12} /></button>}
              </div>
              {isSelected && (totalTokens > 0 || totalCost > 0) && <p className="px-3 py-1 text-[10px] text-ink-faint tabular-nums break-words" title="All sessions in this project">{(totalTokens / 1000).toFixed(1)}k tokens{totalCost > 0 ? ` · ≈${formatCost(totalCost)}` : ''} total</p>}
              {expanded && (
                <div id={`agent-sessions-${project.id}`} className="mt-1 space-y-0.5" aria-busy={loading[project.id] || false}>
                  {loading[project.id] ? <p role="status" className="px-3 py-2 text-xs text-ink-faint">{t('Loading sessions...')}</p> : errors[project.id] ? (
                    <div role="alert" className="px-3 py-2 text-xs text-danger">
                      <p className="break-words">{errors[project.id]}</p>
                      <button type="button" onClick={() => onRetry(project.id)} className="mt-2 underline">{t('Retry loading sessions')}</button>
                    </div>
                  ) : sessions.length === 0 && <p className="px-3 py-2 text-xs text-ink-faint">{t(query ? 'No sessions match your search.' : 'No sessions yet — start one below.')}</p>}
                  {sessions.map((session) => (
                    <AgentSessionRow key={session.id} project={project} session={session} active={isSelected && activeSession?.id === session.id} renaming={renaming?.projectId === project.id && renaming.sessionId === session.id} busy={busy} pending={Boolean(pendingAction)} activeContextUsage={activeContextUsage} onSelectSession={onSelectSession} onCancelRename={onCancelRename} onRenameSession={onRenameSession} onStartRename={onStartRename} onTogglePin={onTogglePin} onRequestDelete={onRequestDelete} />
                  ))}
                  {isSelected && <button type="button" onClick={() => onNewSession(project)} disabled={cannotCreate(project.id)} className="mx-1 mt-1.5 w-[calc(100%-8px)] flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs text-ink-faint hover:text-ink hover:border-border-hover py-2 disabled:opacity-40 disabled:cursor-not-allowed">
                    <Icon name={pendingAction === `new:${project.id}` ? 'spinner' : 'plus'} size={12} />
                    {t(pendingAction === `new:${project.id}` ? 'Creating session...' : 'New session')}
                  </button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="border-t border-border p-3 space-y-2 shrink-0">
        <p className="text-[11px] text-ink-faint tabular-nums">{t(sessionCount === 1 ? '{count} session' : '{count} sessions', { count: sessionCount })}{Object.values(loading).some(Boolean) ? ` · ${t('loading...')}` : Object.values(errors).some(Boolean) ? ` · ${t('some projects could not be loaded')}` : ''}</p>
        {statusLoading ? <p role="status" className="text-xs text-ink-faint">{t('Checking agent...')}</p> : statusError ? (
          <div role="alert" className="text-xs text-danger"><p className="break-words">{statusError}</p><button type="button" onClick={onRetryStatus} className="mt-1 underline">{t('Retry agent check')}</button></div>
        ) : status?.installed && status.configured ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-success bg-success/10 border border-success/20 rounded-full px-2 py-0.5"><span className="w-1.5 h-1.5 rounded-full bg-success" />{t('provider ready')}</span>
        ) : (
          <button type="button" onClick={onOpenSettings} className="text-xs font-semibold text-accent bg-accent/10 border border-accent/25 rounded-lg px-2.5 py-1.5 hover:bg-accent/20">{t(status?.installed ? 'Set up provider' : 'Install omp')}</button>
        )}
        {status?.installed && status.version && <p className="text-[10.5px] text-ink-faint font-mono break-words">oh-my-pi {status.version} · {t('local')}</p>}
        <p className="text-[10.5px] text-ink-faint leading-relaxed">{t('Sessions are stored locally by omp per project. Chat history survives app restarts.')}</p>
      </div>
    </aside>
  );
}
