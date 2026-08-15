import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../Common/Icon';
import { ConfirmDialog } from '../Modals';
import * as ipc from '../../utils/ipcRenderer';
import { formatCost } from '../../utils/costEstimate';
import AgentChat from './AgentChat';
import type { AgentSession, Project } from '../../types/shared';
import type { OmpStatusResult } from '../../data/agent';

function formatRelative(timestamp?: number): string {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

interface AgentViewProps {
  projects: Project[];
  initialProjectId?: string | null;
  initialSessionId?: string | null;
  onOpenProject?: (project: Project) => void;
  onOpenSettings?: () => void;
  visible?: boolean;
}

interface SessionStatus {
  installed: boolean;
  configured: boolean;
  version?: string | null;
}

export default function AgentView({ projects, initialProjectId = null, initialSessionId = null, onOpenProject, onOpenSettings, visible = true }: AgentViewProps) {
  const [status, setStatus] = useState<SessionStatus>({ installed: false, configured: false });
  const [statusLoading, setStatusLoading] = useState(true);
  const [sessionsByProject, setSessionsByProject] = useState<Record<string, AgentSession[]>>({});
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<AgentSession | null>(null);
  const [, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ projectId: string; sessionId: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ project: Project; session: AgentSession } | null>(null);
  const [sessionSearch, setSessionSearch] = useState('');
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const loadedRef = useRef<Record<string, boolean>>({});

  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;

  // Detect omp + auto-select project passed from navigation
  useEffect(() => {
    ipc.ompStatus().then((result) => {
      setStatusLoading(false);
      if (result?.success) setStatus(result);
    }).catch(() => setStatusLoading(false));
  }, []);

  useEffect(() => {
    if (initialProjectId && projects.some((project) => project.id === initialProjectId)) {
      setSelectedProjectId(initialProjectId);
    }
  }, [initialProjectId, projects]);

  // Navigation from the workspace search palette can target a specific session
  // across ANY project. Hold it as pending until its project's session list has
  // loaded, then select it. Re-running on initialSessionId lets the user jump
  // between sessions of the same project without leaving the view.
  useEffect(() => {
    if (initialSessionId) setPendingSessionId(initialSessionId);
  }, [initialSessionId]);

  useEffect(() => {
    if (!pendingSessionId) return;
    const list = selectedProjectId ? (sessionsByProject[selectedProjectId] || []) : [];
    const session = list.find((item) => item.id === pendingSessionId);
    if (session) {
      setPendingSessionId(null);
      setActiveSession(session);
    }
  }, [pendingSessionId, selectedProjectId, sessionsByProject]);

  const loadSessions = useCallback(async (projectId: string) => {
    if (loadedRef.current[projectId]) return;
    loadedRef.current[projectId] = true;
    const result = await ipc.ompListSessions(projectId);
    if (result?.success) {
      setSessionsByProject((prev) => ({ ...prev, [projectId]: result.sessions }));
    }
  }, []);

  // When a project becomes selected, load its sessions
  useEffect(() => {
    if (selectedProjectId) loadSessions(selectedProjectId);
  }, [selectedProjectId, loadSessions]);

  // Clicking a project name only expands/collapses its session list — it does
  // NOT open the chat. The chat opens when a session (or New session) is picked,
  // so a stray click can never start an invisible, un-resumable conversation.
  const toggleProject = (project: Project) => {
    if (selectedProjectId === project.id) {
      setSelectedProjectId(null);
      setActiveSession(null);
      return;
    }
    setSelectedProjectId(project.id);
    setActiveSession(null); // the chat is per-project; switching resets it
    loadSessions(project.id);
  };

  const selectSession = (_project: Project, session: AgentSession) => {
    setActiveSession(session);
  };

  const handleNewSession = async (project: Project) => {
    const result = await ipc.ompCreateSession(project.id, '');
    if (!result?.success) return;
    setSessionsByProject((prev) => ({ ...prev, [project.id]: [...(prev[project.id] || []), result.session as AgentSession] }));
    setActiveSession(result.session as AgentSession);
  };

  const handleDeleteSession = async (project: Project, session: AgentSession) => {
    setConfirmDelete(null);
    await ipc.ompDeleteSession(project.id, session.id);
    setSessionsByProject((prev) => ({ ...prev, [project.id]: (prev[project.id] || []).filter((item) => item.id !== session.id) }));
    if (activeSession?.id === session.id) setActiveSession(null);
  };

  const handleTogglePin = async (project: Project, session: AgentSession) => {
    const result = await ipc.ompTogglePin(project.id, session.id);
    const updated = (result as { success: boolean; session?: AgentSession }).session;
    if (result?.success && updated) {
      setSessionsByProject((prev) => ({
        ...prev,
        [project.id]: (prev[project.id] || []).map((item) => (item.id === session.id ? updated : item)),
      }));
    }
  };

  const handleRenameSession = async (project: Project, session: AgentSession, title: string) => {
    const clean = title.trim();
    if (!clean || clean === session.title) {
      setRenaming(null);
      return;
    }
    const result = await ipc.ompRenameSession(project.id, session.id, clean);
    if (result?.success) {
      setSessionsByProject((prev) => ({
        ...prev,
        [project.id]: (prev[project.id] || []).map((item) => (item.id === session.id ? { ...item, title: clean } : item)),
      }));
    }
    setRenaming(null);
  };

  const handleSessionCreated = (sessionId: string, session?: AgentSession) => {
    const created: AgentSession = session || { id: sessionId, title: sessionId, projectId: '' };
    setActiveSession(created);
    // Surface implicitly-created sessions (first message sent in a fresh chat)
    // in the sidebar immediately, so the conversation can be resumed after
    // navigating away instead of silently living only in omp's registry. If
    // the entry already exists (e.g. created via "New session"), MERGE the
    // enriched data back — critically sessionPath, which is only known after
    // the first prompt and lets the transcript reload when re-selected.
    if (created.id && selectedProjectId) {
      setSessionsByProject((prev) => {
        const list = prev[selectedProjectId] || [];
        const index = list.findIndex((item) => item.id === created.id);
        if (index === -1) return { ...prev, [selectedProjectId]: [...list, created] };
        const merged = { ...list[index], ...created };
        const next = [...list];
        next[index] = merged;
        return { ...prev, [selectedProjectId]: next };
      });
    }
  };

  const sessionCount = Object.values(sessionsByProject).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="view flex flex-col" style={{ height: 'calc(100vh - 140px)', minHeight: 480 }}>
      {/* Status bar */}
      <div className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 border border-border rounded-xl bg-surface shadow-card mb-3 flex-wrap">
        {statusLoading ? (
          <span className="text-xs text-ink-faint">Checking agent…</span>
        ) : status.installed ? (
          <>
            <span className="flex items-center gap-2 text-xs text-ink-soft">
              <span className="relative flex w-2 h-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              <b className="text-ink">oh-my-pi</b>
              {status.version && <span className="font-mono text-[11px] text-ink-faint">{status.version}</span>}
            </span>
            {status.configured ? (
              <span className="text-[11px] text-success bg-success/10 border border-success/20 rounded-full px-2.5 py-0.5">provider ready</span>
            ) : (
              <button
                onClick={() => onOpenSettings?.()}
                className="text-[11px] text-warning bg-warning/10 border border-warning/25 rounded-full px-2.5 py-0.5 hover:bg-warning/20 transition-colors"
              >
                provider not configured — set up
              </button>
            )}
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-ink-faint" />
            <span className="text-xs text-ink-soft">AI Agent requires <b className="text-ink">oh-my-pi (omp)</b></span>
            <button
              onClick={onOpenSettings}
              className="text-[11px] font-semibold text-accent bg-accent/10 border border-accent/25 rounded-full px-2.5 py-0.5 hover:bg-accent/20 transition-colors"
            >
              Install in Settings
            </button>
          </>
        )}
        <span className="ml-auto text-[11px] text-ink-faint tabular-nums">{sessionCount} session{sessionCount === 1 ? '' : 's'}</span>
      </div>

      <div className="flex-1 min-h-0 flex border border-border rounded-xl bg-surface shadow-card overflow-hidden">
        {/* Sessions grouped per project */}
        <div className="w-64 shrink-0 border-r border-border bg-surface-2 flex flex-col min-h-0">
          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold uppercase tracking-[0.12em] text-ink-faint">Sessions</span>
            {selectedProject && (
              <button
                type="button"
                onClick={() => handleNewSession(selectedProject)}
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
                onChange={(event) => setSessionSearch(event.target.value)}
                placeholder="Search sessions…"
                className="flex-1 bg-transparent text-xs text-ink placeholder:text-ink-faint focus:outline-none"
              />
              {sessionSearch && (
                <button type="button" onClick={() => setSessionSearch('')} className="text-ink-faint hover:text-ink" aria-label="Clear session search">
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
                    onClick={() => toggleProject(project)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleProject(project);
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
                          onClick={() => selectSession(project, session)}
                          onKeyDown={(event) => event.key === 'Enter' && selectSession(project, session)}
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
                                if (event.key === 'Enter') handleRenameSession(project, session, event.currentTarget.value);
                                if (event.key === 'Escape') setRenaming(null);
                              }}
                              onBlur={(event) => handleRenameSession(project, session, event.target.value)}
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
                                onClick={(event) => { event.stopPropagation(); handleTogglePin(project, session); }}
                                className={session.pinned ? 'text-accent' : 'text-ink-faint hover:text-accent'}
                                title={session.pinned ? 'Unpin session' : 'Pin session'}
                              >
                                <Icon name="star" size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); setRenaming({ projectId: project.id, sessionId: session.id }); }}
                                className="text-ink-faint hover:text-accent"
                                title="Rename session"
                              >
                                <Icon name="fileText" size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); setConfirmDelete({ project, session }); }}
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
                        onClick={() => handleNewSession(project)}
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

        <ConfirmDialog
          isOpen={Boolean(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => confirmDelete && handleDeleteSession(confirmDelete.project, confirmDelete.session)}
          title="Delete session?"
          message={`“${confirmDelete?.session?.title || 'This session'}” and its local chat history will be deleted. This cannot be undone.`}
          confirmLabel="Delete"
        />

        {/* Chat */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 relative">
          {!selectedProject || !activeSession ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-base gap-3">
              <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-ink-faint">
                <Icon name="messageSquare" size={26} />
              </div>
              <p className="text-base font-semibold text-ink-soft">
                {!selectedProject ? 'Select a project to start chatting' : 'Select a session to continue'}
              </p>
              <p className="text-sm text-ink-faint max-w-sm text-center leading-relaxed">
                {!selectedProject
                  ? 'Sessions are grouped per project — pick one from the list to begin a conversation with the coding agent.'
                  : 'Pick an existing session from the list, or start a new one — a conversation always belongs to a session.'}
              </p>
            </div>
          ) : (
            <AgentChat
              visible={visible}
              status={status as OmpStatusResult}
              project={selectedProject}
              session={activeSession}
              onSessionCreated={handleSessionCreated}
              onBusyChange={setBusy}
              onOpenSettings={onOpenSettings}
              onTokensUsed={(tokens, cost) => {
                if (!activeSession || !selectedProjectId) return;
                const projectId = selectedProjectId;
                setSessionsByProject((prev) => ({
                  ...prev,
                  [projectId]: (prev[projectId] || []).map((item) =>
                    item.id === activeSession.id ? { ...item, tokens, ...(Number.isFinite(cost) ? { cost } : {}) } : item
                  ),
                }));
                // Persist the usage so the badge survives restarts and shows on
                // every session, not just the one active during the turn. Only
                // persist positive, changed counts: an agent_end without a
                // usage payload reports 0, which must not clobber a count that
                // is already on disk.
                if (activeSession.id && Number.isFinite(tokens) && tokens > 0) {
                  const previous = (sessionsByProject[projectId] || []).find((item) => item.id === activeSession.id)?.tokens;
                  if (previous !== tokens) {
                    ipc.ompUpdateSessionTokens(projectId, activeSession.id, tokens, Number.isFinite(cost) ? cost : undefined).catch(() => {});
                  }
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
