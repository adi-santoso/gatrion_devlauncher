import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../Common/Icon';
import { ConfirmDialog } from '../Modals';
import * as ipc from '../../utils/ipcRenderer';
import AgentChat from './AgentChat';

function formatRelative(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function AgentView({ projects, initialProjectId = null, onOpenProject, onOpenSettings }) {
  const [status, setStatus] = useState({ installed: false, configured: false });
  const [statusLoading, setStatusLoading] = useState(true);
  const [sessionsByProject, setSessionsByProject] = useState({});
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(null); // { projectId, sessionId }
  const [confirmDelete, setConfirmDelete] = useState(null); // { project, session }
  const [sessionSearch, setSessionSearch] = useState('');
  const loadedRef = useRef({});

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

  const loadSessions = useCallback(async (projectId) => {
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

  const selectProject = (project) => {
    setSelectedProjectId(project.id);
    setActiveSession(null);
    loadSessions(project.id);
  };

  const selectSession = (project, session) => {
    setActiveSession(session);
  };

  const handleNewSession = async (project) => {
    const result = await ipc.ompCreateSession(project.id, '');
    if (!result?.success) return;
    setSessionsByProject((prev) => ({ ...prev, [project.id]: [...(prev[project.id] || []), result.session] }));
    setActiveSession(result.session);
  };

  const handleDeleteSession = async (project, session) => {
    setConfirmDelete(null);
    await ipc.ompDeleteSession(project.id, session.id);
    setSessionsByProject((prev) => ({ ...prev, [project.id]: (prev[project.id] || []).filter((item) => item.id !== session.id) }));
    if (activeSession?.id === session.id) setActiveSession(null);
  };

  const handleTogglePin = async (project, session) => {
    const result = await ipc.ompTogglePin(project.id, session.id);
    if (result?.success && result.session) {
      setSessionsByProject((prev) => ({
        ...prev,
        [project.id]: (prev[project.id] || []).map((item) => (item.id === session.id ? result.session : item)),
      }));
    }
  };

  const handleRenameSession = async (project, session, title) => {
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

  const handleSessionCreated = (sessionId, session) => {
    setActiveSession(session || { id: sessionId });
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
                  <button
                    type="button"
                    onClick={() => selectProject(project)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                      isSelected ? 'bg-surface-3/80' : 'hover:bg-surface-3/50'
                    }`}
                  >
                    <Icon name={isSelected ? 'chevronDown' : 'chevronRight'} size={12} className="text-ink-faint shrink-0" />
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? 'bg-accent' : 'bg-ink-faint/40'}`} />
                    <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-ink-soft">{project.name}</span>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); onOpenProject?.(project); }}
                      title="Open project detail"
                      className="text-ink-faint hover:text-accent flex items-center shrink-0"
                    >
                      <Icon name="external" size={11} />
                    </button>
                  </button>
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
                                if (event.key === 'Enter') handleRenameSession(project, session, event.target.value);
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
                            <span className="text-[11px] text-ink-faint">{formatRelative(session.lastActive)}</span>
                            {session.tokens > 0 && <span className="text-[11px] text-warning tabular-nums">{(session.tokens / 1000).toFixed(1)}k tokens</span>}
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
          {!selectedProject ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-base gap-3">
              <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-ink-faint">
                <Icon name="messageSquare" size={26} />
              </div>
              <p className="text-base font-semibold text-ink-soft">Select a project to start chatting</p>
              <p className="text-sm text-ink-faint max-w-sm text-center leading-relaxed">
                Sessions are grouped per project — pick one from the list to begin a conversation with the coding agent.
              </p>
            </div>
          ) : (
            <AgentChat
              status={status}
              project={selectedProject}
              session={activeSession}
              onSessionCreated={handleSessionCreated}
              onBusyChange={setBusy}
              onOpenSettings={onOpenSettings}
              onTokensUsed={(tokens) => {
                if (activeSession) {
                  setSessionsByProject((prev) => ({
                    ...prev,
                    [selectedProjectId]: (prev[selectedProjectId] || []).map((item) =>
                      item.id === activeSession.id ? { ...item, tokens } : item
                    ),
                  }));
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
