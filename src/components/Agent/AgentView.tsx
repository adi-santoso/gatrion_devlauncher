import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../Common/Icon';
import { ConfirmDialog } from '../Modals';
import * as ipc from '../../utils/ipcRenderer';
import AgentChat from './AgentChat';
import AgentSessionSidebar, { type RenamingTarget } from './AgentSessionSidebar';
import useAgentSessions from './useAgentSessions';
import { cleanIpcError } from './agentChatUtils';
import type { AgentSession, Project } from '../../types/shared';
import type { OmpStatusResult } from '../../data/agent';

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
  const { sessionsByProject, setSessionsByProject, loading: sessionsLoading, errors: sessionErrors, loadSessions } = useAgentSessions(projects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<AgentSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const actionRef = useRef(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusRetry, setStatusRetry] = useState(0);
  const [renaming, setRenaming] = useState<RenamingTarget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ project: Project; session: AgentSession } | null>(null);
  const [sessionSearch, setSessionSearch] = useState('');
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const navigationRef = useRef('');
  const draftsRef = useRef<Record<string, string>>({});
  const generatedTitlesRef = useRef<Record<string, string>>({});
  const selectedProjectRef = useRef(selectedProjectId);
  selectedProjectRef.current = selectedProjectId;
  // Live context usage (tokens/contextWindow) of the active session, bubbled up
  // from AgentChat so the sidebar can show how much context is used right now.
  const [activeContextUsage, setActiveContextUsage] = useState<{ tokens?: number; contextWindow?: number } | null>(null);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;

  // Detect omp + auto-select project passed from navigation
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setStatusLoading(true);
    setStatusError(null);
    ipc.ompStatus().then((result) => {
      if (cancelled) return;
      if (!result?.success) throw new Error(result?.error || 'Could not check agent status.');
      setStatus(result);
    }).catch((error) => {
      if (!cancelled) setStatusError(cleanIpcError(error, 'Could not check agent status.'));
    }).finally(() => { if (!cancelled) setStatusLoading(false); });
    return () => { cancelled = true; };
  }, [visible, statusRetry]);

  useEffect(() => {
    const request = JSON.stringify([initialProjectId, initialSessionId]);
    if (navigationRef.current === request || busy) return;
    if (!initialProjectId) { navigationRef.current = request; return; }
    if (!projects.some((project) => project.id === initialProjectId)) return;
    navigationRef.current = request;
    setSelectedProjectId(initialProjectId);
    if (selectedProjectRef.current !== initialProjectId) setActiveSession(null);
    setPendingSessionId(initialSessionId);
  }, [initialProjectId, initialSessionId, projects, busy]);

  useEffect(() => {
    if (!pendingSessionId || busy) return;
    const list = selectedProjectId ? (sessionsByProject[selectedProjectId] || []) : [];
    const session = list.find((item) => item.id === pendingSessionId);
    if (session) {
      setPendingSessionId(null);
      setActiveSession(session);
    }
  }, [pendingSessionId, selectedProjectId, sessionsByProject, busy]);

  useEffect(() => { setActiveContextUsage(null); }, [selectedProjectId, activeSession?.id]);

  // Clicking a project name only expands/collapses its session list — it does
  // NOT open the chat. The chat opens when a session (or New session) is picked,
  // so a stray click can never start an invisible, un-resumable conversation.
  const toggleProject = (project: Project) => {
    if (busy) return;
    setPendingSessionId(null);
    if (selectedProjectId === project.id) {
      setSelectedProjectId(null);
      setActiveSession(null);
      return;
    }
    setSelectedProjectId(project.id);
    setActiveSession(null); // the chat is per-project; switching resets it
  };

  const selectSession = (project: Project, session: AgentSession) => {
    if (busy) return;
    setPendingSessionId(null);
    setSelectedProjectId(project.id);
    setActiveSession(session);
  };

  const runAction = async (key: string, action: () => Promise<void>) => {
    if (actionRef.current) return;
    actionRef.current = true;
    setPendingAction(key);
    setActionError(null);
    try { await action(); }
    catch (error) { setActionError(cleanIpcError(error, 'Could not update this session. Please try again.')); }
    finally { actionRef.current = false; setPendingAction(null); }
  };

  const handleNewSession = async (project: Project) => {
    if (busy || sessionsLoading[project.id] || sessionErrors[project.id]) return;
    await runAction(`new:${project.id}`, async () => {
      const result = await ipc.ompCreateSession(project.id, '');
      if (!result?.success || !result.session) throw new Error(result?.error || 'Could not create session.');
      const created = result.session;
      setSessionsByProject((prev) => ({ ...prev, [project.id]: [...(prev[project.id] || []), created] }));
      if (selectedProjectRef.current === project.id) {
        setSessionSearch('');
        setActiveSession(created);
      }
    });
  };

  const handleDeleteSession = async (project: Project, session: AgentSession) => {
    setConfirmDelete(null);
    if (busy) return;
    await runAction(session.id, async () => {
      const result = await ipc.ompDeleteSession(project.id, session.id);
      if (!result?.success) throw new Error(result?.error || 'Could not delete session.');
      setSessionsByProject((prev) => ({ ...prev, [project.id]: (prev[project.id] || []).filter((item) => item.id !== session.id) }));
      setActiveSession((current) => current?.id === session.id ? null : current);
    });
  };

  const handleTogglePin = async (project: Project, session: AgentSession) => {
    await runAction(session.id, async () => {
      const result = await ipc.ompTogglePin(project.id, session.id);
      if (!result?.success) throw new Error(result?.error || 'Could not pin session.');
      const updated = (result as { success: boolean; session?: AgentSession }).session;
      if (updated) {
        setSessionsByProject((prev) => ({
          ...prev,
          [project.id]: (prev[project.id] || []).map((item) => (item.id === session.id ? updated : item)),
        }));
      }
    });
  };

  const handleRenameSession = async (project: Project, session: AgentSession, title: string) => {
    const clean = title.trim().slice(0, 80);
    if (!clean || clean === session.title) {
      setRenaming(null);
      return;
    }
    await runAction(session.id, async () => {
      const result = await ipc.ompRenameSession(project.id, session.id, clean);
      if (!result?.success) throw new Error(result?.error || 'Could not rename session.');
      setSessionsByProject((prev) => ({
        ...prev,
        [project.id]: (prev[project.id] || []).map((item) => (item.id === session.id ? { ...item, title: clean } : item)),
      }));
      setActiveSession((current) => current?.id === session.id ? { ...current, title: clean } : current);
      setRenaming(null);
    });
  };

  // Adopt an omp auto-generated session title (from the first message) into the
  // sidebar registry + disk, so it doesn't stay as the "Session N" placeholder.
  const handleTitleGenerated = useCallback((title: string) => {
    if (!activeSession || !selectedProjectId) return;
    const clean = title.trim();
    if (!clean || clean === activeSession.title) return;
    // Auto-generated names may replace the default or an earlier generated
    // name, but never a name explicitly chosen by the user.
    if (!/^Session \d+$/.test(activeSession.title) && generatedTitlesRef.current[activeSession.id] !== activeSession.title) return;
    generatedTitlesRef.current[activeSession.id] = clean;
    const projectId = selectedProjectId;
    setSessionsByProject((prev) => {
      const current = (prev[projectId] || []).find((item) => item.id === activeSession.id);
      if (current && current.title === clean) return prev;
      return {
        ...prev,
        [projectId]: (prev[projectId] || []).map((item) =>
          item.id === activeSession.id ? { ...item, title: clean } : item
        ),
      };
    });
    setActiveSession((current) => current?.id === activeSession.id ? { ...current, title: clean } : current);
    ipc.ompRenameSession(projectId, activeSession.id, clean).catch(() => {});
  }, [activeSession, selectedProjectId, setSessionsByProject]);

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

  const sessionCount = projects.reduce((sum, project) => sum + (sessionsByProject[project.id]?.length || 0), 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 flex border border-border rounded-xl bg-surface shadow-card overflow-hidden">
        <AgentSessionSidebar
          projects={projects}
          sessionsByProject={sessionsByProject}
          selectedProjectId={selectedProjectId}
          activeSession={activeSession}
          loading={sessionsLoading}
          errors={sessionErrors}
          onRetry={loadSessions}
          busy={busy}
          pendingAction={pendingAction}
          sessionSearch={sessionSearch}
          onSearchChange={setSessionSearch}
          onToggleProject={toggleProject}
          onSelectSession={selectSession}
          onNewSession={handleNewSession}
          onOpenProject={onOpenProject}
          renaming={renaming}
          onStartRename={(projectId, sessionId) => setRenaming({ projectId, sessionId })}
          onCancelRename={() => setRenaming(null)}
          onRenameSession={handleRenameSession}
          onTogglePin={handleTogglePin}
          onRequestDelete={(project, session) => setConfirmDelete({ project, session })}
          status={status}
          statusLoading={statusLoading}
          statusError={statusError}
          onRetryStatus={() => setStatusRetry((n) => n + 1)}
          sessionCount={sessionCount}
          activeContextUsage={activeContextUsage}
          onOpenSettings={onOpenSettings}
        />

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
          {actionError && (
            <div role="alert" className="flex items-start gap-2 px-4 py-3 text-sm text-danger bg-danger/10 border-b border-danger/25">
              <span className="flex-1 min-w-0 break-words">{actionError}</span>
              <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss session error"><Icon name="x" size={16} /></button>
            </div>
          )}
          {!selectedProject || !activeSession ? (
            <div className="flex-1 overflow-auto flex flex-col items-center justify-center bg-base gap-3 p-6 text-center">
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
              draftsRef={draftsRef}
              status={status as OmpStatusResult}
              project={selectedProject}
              session={activeSession}
              onSessionCreated={handleSessionCreated}
              onBusyChange={setBusy}
              onOpenSettings={onOpenSettings}
              onTokensUsed={(tokens, cost) => {
                if (!activeSession || !selectedProjectId || !Number.isFinite(tokens) || tokens <= 0) return;
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
              onContextUsage={setActiveContextUsage}
              onTitleGenerated={handleTitleGenerated}
            />
          )}
        </div>
      </div>
    </div>
  );
}
