import { useCallback, useEffect, useRef } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import { normalizeTranscriptMessage, cleanIpcError } from './agentChatUtils';
import { mergeModelOptions } from './agentChatMessages';
import type {
  ChatMessage,
  ChatTool,
  ContextUsage,
  ModelOption,
  SlashCommand,
  SubagentInfo,
  TodoPhase,
} from './agentChatTypes';
import type { AgentSession, Project } from '../../types/shared';

const HISTORY_ERROR_FALLBACK = 'The agent did not respond. Check that your network/proxy is reachable, then retry.';

interface ProviderModelInfo {
  id: string;
  name?: string;
  [key: string]: unknown;
}

interface ProviderInfo {
  name: string;
  models?: ProviderModelInfo[];
  [key: string]: unknown;
}

export interface SessionHistoryOptions {
  projectId?: string;
  sessionId?: string;
  projectPath?: string;
  projectRef: React.RefObject<Project | null>;
  sessionRef: React.RefObject<AgentSession | null>;
  sentSessionIdRef: React.RefObject<string | null>;
  draftsRef: React.RefObject<Record<string, string>>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  streamingBufRef: React.RefObject<string>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setStreaming: React.Dispatch<React.SetStateAction<string>>;
  setThinking: React.Dispatch<React.SetStateAction<string>>;
  setTools: React.Dispatch<React.SetStateAction<ChatTool[]>>;
  setSubagents: React.Dispatch<React.SetStateAction<SubagentInfo[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setHistoryLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setHistoryError: React.Dispatch<React.SetStateAction<string | null>>;
  setNearBottom: React.Dispatch<React.SetStateAction<boolean>>;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  historyRetry: number;
}

/**
 * Loads the active session's transcript whenever the session (or a manual
 * retry) changes, restoring drafts and clearing the previous conversation.
 * Returns `refreshHistory` for manual reloads (e.g. the turn-safety timeout).
 */
export function useAgentSessionHistory({
  projectId,
  sessionId,
  projectPath,
  projectRef,
  sessionRef,
  sentSessionIdRef,
  draftsRef,
  inputRef,
  streamingBufRef,
  setMessages,
  setStreaming,
  setThinking,
  setTools,
  setSubagents,
  setError,
  setHistoryLoading,
  setHistoryError,
  setNearBottom,
  setInput,
  historyRetry,
}: SessionHistoryOptions) {
  const refreshHistory = useCallback(() => {
    const currentProject = projectRef.current;
    const currentSession = sessionRef.current;
    if (!currentProject || !currentSession) return;
    ipc.ompGetMessages(currentProject.id, currentProject.path, { sessionPath: currentSession.sessionPath }).then((result) => {
      if (!result?.success) return;
      setMessages(result.messages.map((item) => normalizeTranscriptMessage(item as { id?: string; role?: string; content?: unknown })));
    }).catch(() => {});
  }, [projectRef, sessionRef, setMessages]);

  useEffect(() => {
    // Snapshot the render-time project/session through refs, then key the
    // deps on their ids so unrelated project updates (status, logs) don't
    // reload the transcript mid-conversation.
    const targetProject = projectRef.current;
    const targetSession = sessionRef.current;
    // The very first message can create the session implicitly (no active
    // session selected). That transition must not wipe the live conversation.
    // But the guard is only for THAT immediate transition: once the user has
    // navigated to a different session (or deselects), the "just created"
    // moment is over — returning here must reload the transcript normally.
    if (sentSessionIdRef.current && targetSession?.id !== sentSessionIdRef.current) {
      sentSessionIdRef.current = null;
    }
    if (targetSession?.id && targetSession.id === sentSessionIdRef.current) {
      sentSessionIdRef.current = null;
      setHistoryLoading(false);
      return;
    }
    setMessages([]);
    setStreaming('');
    streamingBufRef.current = '';
    setThinking('');
    setTools([]);
    setSubagents([]);
    setError(null);
    setHistoryError(null);
    setNearBottom(true);
    // Restore this session's draft (empty if it never had one).
    const draftKey = `${targetProject?.id}:${targetSession?.id || 'new'}`;
    setInput(draftsRef.current[draftKey] || '');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    const hasHistory = Boolean(targetProject && targetSession?.sessionPath);
    setHistoryLoading(hasHistory);
    if (!targetProject || !targetSession) return;
    // A session without a sessionPath is brand-new — it has no history to
    // load, and fetching anyway could clobber the first message with a stale
    // (or wrong-session) response.
    if (!targetSession.sessionPath) return;
    let cancelled = false;
    ipc.ompGetMessages(targetProject.id, targetProject.path, { sessionPath: targetSession.sessionPath }).then((result) => {
      if (cancelled) return;
      setHistoryLoading(false);
      if (!result?.success) {
        setHistoryError(cleanIpcError(result?.error, HISTORY_ERROR_FALLBACK));
        return;
      }
      setMessages(result.messages.map((item) => normalizeTranscriptMessage(item as { id?: string; role?: string; content?: unknown })));
    }).catch((loadError: unknown) => {
      if (cancelled) return;
      setHistoryLoading(false);
      setHistoryError(cleanIpcError(loadError, HISTORY_ERROR_FALLBACK));
    });
    return () => { cancelled = true; };
    // historyRetry only changes when the user clicks Retry on a failed load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sessionId, projectPath, historyRetry]);

  return { refreshHistory };
}

export interface RuntimeDataOptions {
  projectId?: string;
  sessionId?: string;
  projectRef: React.RefObject<Project | null>;
  visible: boolean;
  busy: boolean;
  hasMessages: boolean;
  setModels: React.Dispatch<React.SetStateAction<ModelOption[]>>;
  setDefaultModel: React.Dispatch<React.SetStateAction<string | null>>;
  setSubagents: React.Dispatch<React.SetStateAction<SubagentInfo[]>>;
  setCommands: React.Dispatch<React.SetStateAction<SlashCommand[]>>;
  applyState: (state: Record<string, unknown>) => void;
}

/**
 * Loads runtime data from the running omp process: the model list + current
 * default, subagent progress, slash commands, and a periodic context poll.
 * All polls are skipped while the view is hidden so a background turn cannot
 * churn IPC or re-render the hidden chat.
 */
export function useAgentRuntimeData({
  projectId,
  sessionId,
  projectRef,
  visible,
  busy,
  hasMessages,
  setModels,
  setDefaultModel,
  setSubagents,
  setCommands,
  applyState,
}: RuntimeDataOptions) {
  // Model list + current default, merged from models.yml and the live RPC.
  useEffect(() => {
    let cancelled = false;
    const apply = (options: ModelOption[], current: string | null) => {
      if (cancelled) return;
      setModels(options);
      setDefaultModel(current);
    };
    // Snapshot the render-time project so the async chain below always talks
    // to the project this effect was created for (project?.id is the dep).
    const targetProject = projectRef.current;
    ipc.ompConfigGet().then((result) => {
      if (cancelled) return;
      const current = result?.defaultModel || null;
      const configOptions: ModelOption[] = ((result?.providers as ProviderInfo[]) || []).flatMap((provider) =>
        (provider.models || []).map((model) => ({
          ref: `${provider.name}/${model.id}`,
          label: `${provider.name} · ${model.name || model.id}`,
          vision: null, // explicit models.yml entries carry no input-type info
        }))
      );
      if (!targetProject) {
        apply(configOptions, current);
        return;
      }
      ipc.ompGetModels(targetProject.id, targetProject.path).then((rpcResult) => {
        const rpcOptions: ModelOption[] = (rpcResult?.models || []).map((model) => {
          const typed = model as { provider?: string; input?: string[] };
          return {
            ref: `${typed.provider}/${model.id}`,
            label: `${typed.provider} · ${model.name || model.id}`,
            vision: (typed.input || []).includes('image'),
          };
        });
        apply(mergeModelOptions(configOptions, rpcOptions), current);
      }).catch(() => apply(configOptions, current));
      // Read the current session state (thinking level, context usage,
      // auto-compaction, todo phases) so the header controls reflect it.
      ipc.ompGetState(targetProject.id, targetProject.path).then((stateResult) => {
        if (!cancelled && stateResult?.success) applyState(stateResult.state);
      }).catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [projectId, sessionId, projectRef, applyState, setModels, setDefaultModel]);

  // Keep the context-usage indicator fresh while a conversation is active.
  // Polls once immediately, then on a timer (faster while the agent works).
  useEffect(() => {
    const poll = () => {
      const currentProject = projectRef.current;
      if (!currentProject) return;
      ipc.ompGetState(currentProject.id, currentProject.path).then((result) => {
        if (result?.success) applyState(result.state);
      }).catch(() => {});
    };
    if (!projectRef.current || !visible || (!busy && !hasMessages)) return undefined;
    poll();
    const timer = setInterval(poll, busy ? 5000 : 20000);
    return () => clearInterval(timer);
  }, [projectRef, busy, visible, hasMessages, applyState]);

  // Subagent progress — subscribe while the agent is running and poll the
  // registry; rendered as activity chips above the input.
  useEffect(() => {
    const targetProject = projectRef.current;
    if (!targetProject || !visible || !busy) return;
    ipc.ompSetSubagentSubscription(targetProject.id, targetProject.path, 'progress').catch(() => {});
    const fetchSubagents = () => {
      ipc.ompGetSubagents(targetProject.id, targetProject.path).then((result) => {
        if (result?.success && Array.isArray(result.subagents)) setSubagents(result.subagents as SubagentInfo[]);
      }).catch(() => {});
    };
    fetchSubagents();
    const timer = setInterval(fetchSubagents, 4000);
    return () => clearInterval(timer);
  }, [projectRef, busy, visible, setSubagents]);

  // Slash commands for the / menu (also updated live via events).
  useEffect(() => {
    const targetProject = projectRef.current;
    if (!targetProject) return;
    let cancelled = false;
    ipc.ompGetCommands(targetProject.id, targetProject.path).then((result) => {
      if (!cancelled && result?.success && Array.isArray(result.commands)) setCommands(result.commands as SlashCommand[]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [projectRef, setCommands]);
}

export interface SessionStateOptions {
  projectRef: React.RefObject<Project | null>;
  setThinkingLevel: React.Dispatch<React.SetStateAction<string | null>>;
  setContextUsage: React.Dispatch<React.SetStateAction<ContextUsage | null>>;
  setAutoCompaction: React.Dispatch<React.SetStateAction<boolean>>;
  setFastMode: React.Dispatch<React.SetStateAction<boolean>>;
  setTodos: React.Dispatch<React.SetStateAction<TodoPhase[]>>;
  setTokensPerSecond: React.Dispatch<React.SetStateAction<number | null>>;
}

export interface SessionStateResult {
  applyState: (state: Record<string, unknown>) => void;
  refreshStateRef: React.RefObject<() => void>;
}

/**
 * Session-state sync shared by the runtime polls and the live event handler:
 * `applyState` merges a get_state payload into chat state and `refreshState`
 * refetches it (kept in a ref so the event handler always calls the latest).
 */
export function useAgentSessionState({
  projectRef,
  setThinkingLevel,
  setContextUsage,
  setAutoCompaction,
  setFastMode,
  setTodos,
  setTokensPerSecond,
}: SessionStateOptions): SessionStateResult {
  const applyState = useCallback((state: Record<string, unknown>) => {
    if (!state) return;
    if (state.thinkingLevel) setThinkingLevel(String(state.thinkingLevel));
    setContextUsage((state.contextUsage as ContextUsage) || null);
    if (typeof state.autoCompactionEnabled === 'boolean') setAutoCompaction(state.autoCompactionEnabled);
    if (typeof state.fastModeEnabled === 'boolean') setFastMode(state.fastModeEnabled);
    if (Array.isArray(state.todoPhases)) setTodos(state.todoPhases as TodoPhase[]);
    if (typeof state.tokensPerSecond === 'number') setTokensPerSecond(state.tokensPerSecond);
  }, [setThinkingLevel, setContextUsage, setAutoCompaction, setFastMode, setTodos, setTokensPerSecond]);

  const refreshState = useCallback(() => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    ipc.ompGetState(currentProject.id, currentProject.path).then((result) => {
      if (result?.success) applyState(result.state);
    }).catch(() => {});
  }, [projectRef, applyState]);

  const refreshStateRef = useRef(refreshState);
  refreshStateRef.current = refreshState;

  return { applyState, refreshStateRef };
}

