import * as ipc from '../../utils/ipcRenderer';
import { uid, normalizeTranscriptMessage } from './agentChatUtils';
import type { BashRun, ChatMessage } from './agentChatTypes';
import type { AgentSession, Project } from '../../types/shared';

export interface AgentControlsDeps {
  project: Project;
  session: AgentSession | null;
  projectRef: React.RefObject<Project | null>;
  sessionRef: React.RefObject<AgentSession | null>;
  showNotice: (text: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setMoreOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setAutoCompaction: React.Dispatch<React.SetStateAction<boolean>>;
  autoCompaction: boolean;
  setFastMode: React.Dispatch<React.SetStateAction<boolean>>;
  fastMode: boolean;
  setAutoRetry: React.Dispatch<React.SetStateAction<boolean>>;
  autoRetry: boolean;
  setNotifyOnFinish: React.Dispatch<React.SetStateAction<boolean>>;
  notifyOnFinish: boolean;
  setHandoffOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handoffText: string;
  setHandoffText: React.Dispatch<React.SetStateAction<string>>;
  setBashRuns: React.Dispatch<React.SetStateAction<BashRun[]>>;
  setBashCommand: React.Dispatch<React.SetStateAction<string>>;
  setBashInputOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLevelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setThinkingLevel: React.Dispatch<React.SetStateAction<string | null>>;
  thinkingLevel: string | null;
  setModelsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDefaultModel: React.Dispatch<React.SetStateAction<string | null>>;
  currentModelRef: string | null;
}

/**
 * Builds the header/menu action handlers for the chat (model picker, thinking
 * level, "more" menu toggles, export, handoff, inline bash, and branching).
 * Kept as a factory so AgentChat can wire it with fresh state every render
 * while the file stays small.
 */
export function createAgentControls({
  project,
  session,
  projectRef,
  sessionRef,
  showNotice,
  setMessages,
  setError,
  setMoreOpen,
  setAutoCompaction,
  autoCompaction,
  setFastMode,
  fastMode,
  setAutoRetry,
  autoRetry,
  setNotifyOnFinish,
  notifyOnFinish,
  setHandoffOpen,
  handoffText,
  setHandoffText,
  setBashRuns,
  setBashCommand,
  setBashInputOpen,
  setLevelOpen,
  setThinkingLevel,
  thinkingLevel,
  setModelsOpen,
  setDefaultModel,
  currentModelRef,
}: AgentControlsDeps) {
  const handleCompact = async () => {
    setMoreOpen(false);
    if (!project) return;
    try {
      await ipc.ompCompact(project.id, project.path);
      showNotice('Context compacted');
    } catch (caught) {
      setError((caught instanceof Error ? caught.message : String(caught)) || 'Compact failed');
    }
  };

  const toggleAutoCompaction = async () => {
    setMoreOpen(false);
    if (!project) return;
    const next = !autoCompaction;
    setAutoCompaction(next);
    try {
      await ipc.ompSetAutoCompaction(project.id, project.path, next);
    } catch (caught) {
      setAutoCompaction(!next);
      setError((caught instanceof Error ? caught.message : String(caught)) || 'Failed to toggle auto-compaction');
    }
  };

  const toggleFastMode = async () => {
    setMoreOpen(false);
    if (!project) return;
    const next = !fastMode;
    setFastMode(next);
    try {
      await ipc.ompSetFastMode(project.id, project.path, next);
    } catch (caught) {
      setFastMode(!next);
      setError((caught instanceof Error ? caught.message : String(caught)) || 'Fast mode is unavailable for the current model');
    }
  };

  const toggleAutoRetry = async () => {
    setMoreOpen(false);
    if (!project) return;
    const next = !autoRetry;
    setAutoRetry(next);
    try {
      await ipc.ompSetAutoRetry(project.id, project.path, next);
    } catch (caught) {
      setAutoRetry(!next);
      setError((caught instanceof Error ? caught.message : String(caught)) || 'Failed to toggle auto-retry');
    }
  };

  const toggleNotifyOnFinish = async () => {
    setMoreOpen(false);
    const next = !notifyOnFinish;
    setNotifyOnFinish(next);
    try {
      await ipc.updateConfig({ agent: { notifyOnFinish: next } });
    } catch {
      setNotifyOnFinish(!next);
    }
  };

  const handleExport = async () => {
    setMoreOpen(false);
    if (!project) return;
    try {
      const result = await ipc.ompExportConversation(project.id, project.path, session?.sessionPath || '', session?.title || project.name);
      const exportResult = result as { success: boolean; canceled?: boolean; path?: string; error?: string };
      if (exportResult.success && !exportResult.canceled) {
        showNotice(`Exported to ${exportResult.path || ''}`);
      } else if (!exportResult.success) {
        setError(exportResult.error || 'Export failed');
      }
      // A canceled save dialog is a quiet no-op.
    } catch (caught) {
      setError((caught instanceof Error ? caught.message : String(caught)) || 'Export failed');
    }
  };

  const handleHandoff = async () => {
    const instructions = handoffText.trim();
    setHandoffOpen(false);
    if (!project || !instructions) return;
    try {
      await ipc.ompHandoff(project.id, project.path, instructions);
      setHandoffText('');
      showNotice('Custom instructions applied');
    } catch (caught) {
      setError((caught instanceof Error ? caught.message : String(caught)) || 'Failed to apply instructions');
    }
  };

  const updateBashRun = (runId: string, patch: Partial<BashRun>) => {
    setBashRuns((prev) => prev.map((run) => (run.id === runId ? { ...run, ...patch } : run)));
  };

  const runBash = async (command: string) => {
    const text = command.trim();
    if (!text || !project) return;
    setBashCommand('');
    setBashInputOpen(false);
    const run: BashRun = {
      id: uid(),
      command: text,
      status: 'running',
      output: '',
      exitCode: null,
      cancelled: false,
      timedOut: false,
      error: null,
      expanded: true,
      createdAt: new Date().toISOString(),
    };
    setBashRuns((prev) => [run, ...prev].slice(0, 6));
    try {
      const result = await ipc.ompBash(project.id, project.path, text);
      if (result?.success) {
        const data = ((result as { data?: unknown }).data || {}) as { output?: string; exitCode?: number | null; cancelled?: boolean; timedOut?: boolean };
        updateBashRun(run.id, {
          status: 'done',
          output: data.output || '',
          exitCode: data.exitCode ?? null,
          cancelled: !!data.cancelled,
          timedOut: !!data.timedOut,
        });
        showNotice(data.cancelled ? 'Command cancelled' : `Command finished (exit ${data.exitCode ?? '?'})`);
      } else {
        updateBashRun(run.id, { status: 'error', error: result?.error || 'Command failed' });
      }
    } catch (caught) {
      updateBashRun(run.id, { status: 'error', error: (caught instanceof Error ? caught.message : String(caught)) || 'Command failed' });
    }
  };

  const abortBashRun = async (runId: string) => {
    updateBashRun(runId, { status: 'cancelling' });
    if (project) ipc.ompAbortBash(project.id, project.path).catch(() => {});
    // The omp bash response resolves with cancelled: true once aborted and
    // replaces this transient state.
  };

  // Fork the conversation from a specific transcript entry (omp branch). The
  // session context moves to the new branch, then the transcript is reloaded.
  const handleBranch = async (entryId: string) => {
    const currentProject = projectRef.current;
    const currentSession = sessionRef.current;
    if (!currentProject || !entryId) return;
    try {
      const result = await ipc.ompBranch(currentProject.id, currentProject.path, entryId);
      if (!result?.success) {
        setError(result?.error || 'Branch failed');
        return;
      }
      showNotice('Branched — conversation continues from this message');
      const msgs = await ipc.ompGetMessages(currentProject.id, currentProject.path, { sessionPath: currentSession?.sessionPath });
      if (msgs?.success) setMessages(msgs.messages.map((item) => normalizeTranscriptMessage(item as { id?: string; role?: string; content?: unknown })));
    } catch (caught) {
      setError((caught instanceof Error ? caught.message : String(caught)) || 'Branch failed');
    }
  };

  const handleSetThinkingLevel = async (level: string) => {
    setLevelOpen(false);
    if (!project || level === thinkingLevel) return;
    setThinkingLevel(level); // optimistic — applied for real by the RPC call
    try {
      await ipc.ompSetThinkingLevel(project.id, project.path, level);
    } catch {
      ipc.ompGetState(project.id, project.path).then((result) => {
        if (result?.success && result.state?.thinkingLevel) setThinkingLevel(result.state.thinkingLevel);
      }).catch(() => {});
    }
  };

  const handleSelectModel = async (ref: string) => {
    setModelsOpen(false);
    if (!ref || ref === currentModelRef) return;
    const [provider, ...rest] = ref.split('/');
    const modelId = rest.join('/');
    setDefaultModel(ref); // optimistic — applied for real by config write below
    try {
      await ipc.ompConfigSetDefault(ref);
      if (project) {
        // Apply immediately to the live RPC process (if it is running).
        ipc.ompSetModel(project.id, project.path, provider, modelId).catch(() => {});
      }
    } catch {
      ipc.ompConfigGet().then((result) => { if (result?.success) setDefaultModel(result.defaultModel || null); }).catch(() => {});
    }
  };

  return {
    handleCompact,
    toggleAutoCompaction,
    toggleFastMode,
    toggleAutoRetry,
    toggleNotifyOnFinish,
    handleExport,
    handleHandoff,
    updateBashRun,
    runBash,
    abortBashRun,
    handleBranch,
    handleSetThinkingLevel,
    handleSelectModel,
  };
}
