import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../Common/Icon';
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
  const [notice, setNotice] = useState(null);
  const [renaming, setRenaming] = useState(null); // { projectId, sessionId }
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
    setNotice(null);
  };

  const selectSession = (project, session) => {
    setActiveSession(session);
    setNotice(null);
  };

  const handleNewSession = async (project) => {
    const result = await ipc.ompCreateSession(project.id, '');
    if (!result?.success) return;
    setSessionsByProject((prev) => ({ ...prev, [project.id]: [...(prev[project.id] || []), result.session] }));
    setActiveSession(result.session);
    setNotice(null);
  };

  const handleDeleteSession = async (project, session) => {
    await ipc.ompDeleteSession(project.id, session.id);
    setSessionsByProject((prev) => ({ ...prev, [project.id]: (prev[project.id] || []).filter((item) => item.id !== session.id) }));
    if (activeSession?.id === session.id) setActiveSession(null);
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
      <div className="shrink-0 flex items-center gap-2.5 px-4 py-2 border border-border rounded-xl bg-surface shadow-card mb-3 flex-wrap">
        {statusLoading ? (
          <span className="text-[11px] text-ink-faint">Checking agent…</span>
        ) : status.installed ? (
          <>
            <span className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
            <span className="text-[11px] text-ink-soft">
              <b className="text-ink">omp</b> <span className="font-mono text-[10px]">{status.version || ''}</span>
            </span>
            {status.configured ? (
              <span className="text-[10px] text-success bg-success/10 border border-success/20 rounded-full px-2 py-0.5">provider ready</span>
            ) : (
              <button
                onClick={() => onOpenSettings?.()}
                className="text-[10px] text-warning bg-warning/10 border border-warning/25 rounded-full px-2.5 py-0.5 hover:bg-warning/20 transition-colors"
              >
                no provider configured — set one up
              </button>
            )}
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-ink-faint" />
            <span className="text-[11px] text-ink-soft">AI Agent requires <b className="text-ink">oh-my-pi (omp)</b></span>
            <button
              onClick={onOpenSettings}
              className="text-[10px] font-semibold text-accent bg-accent/10 border border-accent/25 rounded-full px-2.5 py-0.5 hover:bg-accent/20 transition-colors"
            >
              Install in Settings
            </button>
          </>
        )}
        <span className="ml-auto text-[10px] text-ink-faint">{sessionCount} session(s)</span>
      </div>

      <div className="flex-1 min-h-0 flex border border-border rounded-xl bg-surface shadow-card overflow-hidden">
        {/* Sessions grouped per project */}
        <div className="w-56 shrink-0 border-r border-border bg-surface-2 flex flex-col min-h-0">
          <div className="px-3 pt-3 pb-1.5 flex items-center justify-between">
            <span className="text-[9px] font-mono font-bold uppercase tracking-[0.1em] text-ink-faint">Sessions</span>
          </div>
          <div className="flex-1 overflow-auto pb-2">
            {projects.length === 0 && (
              <p className="px-3 py-4 text-[11px] text-ink-faint text-center">No projects yet.</p>
            )}
            {projects.map((project) => {
              const sessions = sessionsByProject[project.id] || [];
              const isSelected = selectedProjectId === project.id;
              return (
                <div key={project.id} className="mb-1">
                  <button
                    type="button"
                    onClick={() => selectProject(project)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-3 transition-colors ${
                      isSelected ? 'bg-surface-3/70' : ''
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? 'bg-accent' : 'bg-ink-faint/40'}`} />
                    <span className="flex-1 min-w-0 truncate text-xs font-semibold text-ink-soft">{project.name}</span>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); onOpenProject?.(project); }}
                      title="Open project detail"
                      className="text-[9px] text-ink-faint hover:text-accent flex items-center gap-0.5 shrink-0"
                    >
                      <Icon name="external" size={9} />
                    </button>
                  </button>
                  {isSelected && (
                    <div className="pb-1">
                      {sessions.map((session) => (
                        <div
                          key={session.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => selectSession(project, session)}
                          onKeyDown={(event) => event.key === 'Enter' && selectSession(project, session)}
                          className={`mx-2 my-0.5 px-2.5 py-1.5 rounded-lg cursor-pointer border transition-colors ${
                            activeSession?.id === session.id
                              ? 'bg-surface border-border shadow-sm'
                              : 'border-transparent hover:bg-surface-3'
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
                              className="w-full bg-surface-3 border border-accent/40 rounded px-1.5 py-0.5 text-[11px] font-medium text-ink focus:outline-none"
                            />
                          ) : (
                            <p className="text-[11px] font-medium text-ink truncate">{session.title}</p>
                          )}
                          <p className="text-[9px] text-ink-faint mt-0.5 flex items-center gap-1.5">
                            <span>{formatRelative(session.lastActive)}</span>
                            {session.tokens > 0 && <span className="text-warning">▦ {(session.tokens / 1000).toFixed(1)}k</span>}
                            <button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); setRenaming({ projectId: project.id, sessionId: session.id }); }}
                              className="ml-auto text-ink-faint hover:text-accent"
                              title="Rename session"
                            >
                              <Icon name="fileText" size={9} />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); handleDeleteSession(project, session); }}
                              className="text-ink-faint hover:text-danger"
                              title="Delete session"
                            >
                              <Icon name="trash" size={9} />
                            </button>
                          </p>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => handleNewSession(project)}
                        className="mx-2 mt-1 w-[calc(100%-16px)] flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[10px] text-ink-faint hover:text-ink hover:border-border-hover py-1.5 transition-colors"
                      >
                        <Icon name="plus" size={10} />
                        New session
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="border-t border-border p-2.5 text-[9px] text-ink-faint leading-relaxed">
            <p>Sessions are stored locally by omp per project. Chat history survives app restarts.</p>
          </div>
        </div>

        {/* Chat */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {!selectedProject ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-base gap-2">
              <div className="w-12 h-12 rounded-full bg-surface-2 border border-border flex items-center justify-center text-ink-faint">
                <Icon name="messageSquare" size={20} />
              </div>
              <p className="text-xs text-ink-soft font-medium">Select a project to start chatting</p>
              <p className="text-[11px] text-ink-faint">Sessions are grouped per project — pick one from the list.</p>
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

      {notice && <p className="mt-2 text-[11px] text-ink-faint">{notice}</p>}
    </div>
  );
}
