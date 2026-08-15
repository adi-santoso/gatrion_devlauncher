import { useCallback, useEffect, useRef, useState } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import { fileToAttachment, MAX_ATTACHMENTS, MAX_IMAGE_BYTES } from './imageAttachment';
import type { ComposerAttachment } from './ChatComposer';
import AgentChatView from './AgentChatView';
import { uid, normalizeTranscriptMessage, cleanIpcError } from './agentChatUtils';
import { computeContextPercent, currentModelInfo, filterSlashCommands, mergeModelOptions } from './agentChatMessages';
import { createOmpEventHandler, type OmpEvent } from './agentChatEvents';
import type {
  AgentChatProps,
  BashRun,
  ChatImage,
  ChatMessage,
  ChatTool,
  ContextUsage,
  LastTurnInfo,
  ModelOption,
  SlashCommand,
  SubagentInfo,
  TodoPhase,
} from './agentChatTypes';
import type { AgentSession, Project } from '../../types/shared';

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

interface RunTurnOptions {
  text: string;
  images?: ChatImage[];
  appendUser?: boolean;
}

const HISTORY_ERROR_FALLBACK = 'The agent did not respond. Check that your network/proxy is reachable, then retry.';

export default function AgentChat({
  status,
  project,
  session,
  onSessionCreated,
  onBusyChange,
  onTokensUsed,
  onOpenSettings,
  // False while the user is browsing another menu — the view stays mounted
  // (hidden) so the conversation survives, but streaming must not keep
  // re-rendering at the flush rate while invisible (that starves the
  // renderer and freezes the visible view).
  visible = true,
}: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [thinking, setThinking] = useState('');
  const [tools, setTools] = useState<ChatTool[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Set when loading an existing session's transcript fails (timeout, dead
  // proxy, omp down) so the skeleton is replaced by an actionable error
  // instead of spinning forever. Retry bumps a counter that re-runs the load.
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [nearBottom, setNearBottom] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  // Last finished turn: token count + estimated cost (computed from usage and
  // the active model's list price). Shown under the composer.
  const [lastTurn, setLastTurn] = useState<LastTurnInfo | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState<string | null>(null);
  const [levelOpen, setLevelOpen] = useState(false);
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [autoCompaction, setAutoCompaction] = useState(true);
  const [fastMode, setFastMode] = useState(false);
  const [autoRetry, setAutoRetry] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [todos, setTodos] = useState<TodoPhase[]>([]);
  const [todosOpen, setTodosOpen] = useState(true);
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tokensPerSecond, setTokensPerSecond] = useState<number | null>(null);
  const [subagents, setSubagents] = useState<SubagentInfo[]>([]);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffText, setHandoffText] = useState('');
  const [bashRuns, setBashRuns] = useState<BashRun[]>([]);
  const [bashInputOpen, setBashInputOpen] = useState(false);
  const [bashCommand, setBashCommand] = useState('');
  const [notifyOnFinish, setNotifyOnFinish] = useState(true);
  const [notifySound, setNotifySound] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const busyRef = useRef(false);
  const lastEventAtRef = useRef(0);
  const sentSessionIdRef = useRef<string | null>(null);
  // Streaming deltas are buffered and flushed on an interval, so a burst of
  // RPC events never causes a render per delta (which re-parses markdown and
  // could saturate the main thread and freeze the app mid-reply). While the
  // Agent view is hidden the buffers keep accumulating but are never pushed
  // into state — the chat re-renders only once the user returns (or when
  // agent_end commits the final message), so a background turn cannot freeze
  // whatever menu is on screen.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const streamingBufRef = useRef('');
  const thinkingBufRef = useRef('');
  // Latest tool output update, flushed on the same interval (tool output can
  // stream many chunks per second; each one must not re-render the chat).
  const toolUpdateRef = useRef<{ toolCallId: string; text: string } | null>(null);
  // Short replies get live markdown while typing; anything longer than this is
  // streamed as plain text, because re-parsing a large accumulated document on
  // every flush starves the renderer and freezes the app mid-reply. The final
  // message is always rendered through Markdown once the turn completes.
  const projectRef = useRef<Project | null>(project);
  const sessionRef = useRef<AgentSession | null>(session);
  const messagesRef = useRef(messages);
  const handleEventRef = useRef<((event: OmpEvent) => void) | null>(null);
  // Unsent input is remembered per session so switching away and back does
  // not lose what was being typed (draft per session).
  const draftsRef = useRef<Record<string, string>>({});
  // Completion-notification prefs (read from config) — kept in a ref so the
  // event handler (recreated every render) always sees the latest value.
  const notifyRef = useRef({ notifyOnFinish: true, notifySound: false });
  notifyRef.current = { notifyOnFinish, notifySound };
  projectRef.current = project;
  sessionRef.current = session;
  messagesRef.current = messages;

  const setBusyState = (value: boolean) => {
    busyRef.current = value;
    setBusy(value);
    onBusyChange?.(value);
  };

  // Session state from get_state: context usage, auto-compaction, fast mode,
  // todo phases. Applied whenever get_state is fetched (mount, poll, events).
  const applyState = useCallback((state: Record<string, unknown>) => {
    if (!state) return;
    if (state.thinkingLevel) setThinkingLevel(String(state.thinkingLevel));
    setContextUsage((state.contextUsage as ContextUsage) || null);
    if (typeof state.autoCompactionEnabled === 'boolean') setAutoCompaction(state.autoCompactionEnabled);
    if (typeof state.fastModeEnabled === 'boolean') setFastMode(state.fastModeEnabled);
    if (Array.isArray(state.todoPhases)) setTodos(state.todoPhases as TodoPhase[]);
    if (typeof state.tokensPerSecond === 'number') setTokensPerSecond(state.tokensPerSecond);
  }, []);

  const refreshState = useCallback(() => {
    const currentProject = projectRef.current;
    if (!currentProject) return;
    ipc.ompGetState(currentProject.id, currentProject.path).then((result) => {
      if (result?.success) applyState(result.state);
    }).catch(() => {});
  }, [applyState]);

  const refreshStateRef = useRef(refreshState);
  refreshStateRef.current = refreshState;

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  const handleScroll = () => {
    setScrollTop(scrollRef.current?.scrollTop || 0);
    setNearBottom(isNearBottom());
  };

  // Push whatever accumulated in the streaming buffers into React state. The
  // pending text is captured before clearing the ref so the updater closes
  // over a stable string instead of reading the (already cleared) ref when
  // React invokes it. No-op while the view is hidden.
  const flushBuffers = () => {
    if (!visibleRef.current) return;
    const pending = streamingBufRef.current;
    if (pending) {
      streamingBufRef.current = '';
      setStreaming((prev) => prev + pending);
    }
    const thinkPending = thinkingBufRef.current;
    if (thinkPending) {
      thinkingBufRef.current = '';
      setThinking((prev) => prev + thinkPending);
    }
    if (toolUpdateRef.current) {
      const { toolCallId, text } = toolUpdateRef.current;
      toolUpdateRef.current = null;
      setTools((prev) => {
        const next = [...prev];
        const target = next.filter((item) => item.id === toolCallId).pop();
        if (target) target.body = text.slice(0, 2000);
        return next;
      });
    }
  };

  // Flush buffered streaming deltas at a bounded rate (render rate cap). The
  // function only touches refs/setters, so the mount-time closure stays valid.
  useEffect(() => {
    const timer = setInterval(flushBuffers, 30);
    return () => clearInterval(timer);
  }, []);

  // Returning to the Agent view shows everything that streamed while hidden
  // in a single render instead of replaying it chunk by chunk.
  useEffect(() => {
    if (visible) flushBuffers();
  }, [visible]);

  useEffect(() => {
    if (nearBottom) scrollToBottom('auto');
  }, [messages, streaming, tools, nearBottom, scrollToBottom]);

  // Load history when the active session changes. Existing sessions (those
  // with a sessionPath) show a skeleton until omp returns their transcript;
  // brand-new sessions skip straight to the empty state.
  // Keyed on the session id (not sessionPath): the first send on a new
  // session updates its sessionPath in the registry, and that same logical
  // session must NOT be cleared/reloaded mid-conversation.
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
  }, [project?.id, session?.id, project?.path, historyRetry]);

  // Live events from the main process — uses refs so the handler always sees
  // the current project/session even though the subscription is created once.
  useEffect(() => {
    return ipc.onOmpEvent((payload) => {
      const { projectId, event } = payload as { projectId?: string; event?: OmpEvent };
      if (projectId !== projectRef.current?.id) return;
      // Via ref so the handler always sees the current streaming/thinking
      // state instead of the first render's stale closure.
      handleEventRef.current?.(event as OmpEvent);
    });
  }, []);

  // Load the model list + current default so the model can be switched
  // directly from the chat header. The authoritative list comes from the
  // running omp process (get_available_models) — this also covers providers
  // that discover models at runtime (models.yml has no explicit list).
  // Config-based options are merged in first so explicitly-declared models
  // take precedence. Refetched when the session changes so picks made in
  // Settings are picked up too.
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
  }, [project?.id, session?.id, applyState]);

  // Keep the context-usage indicator fresh while a conversation is active.
  // While the agent is working the poll is faster so the live token/s badge
  // and context bar stay current. Skipped while the view is hidden — a
  // background turn must not churn IPC or re-render the hidden chat; the
  // indicator refreshes on return and after every agent_end anyway.
  const hasMessages = messages.length > 0;
  useEffect(() => {
    if (!projectRef.current || !visible || (!busy && !hasMessages)) return;
    refreshState();
    const timer = setInterval(refreshState, busy ? 5000 : 20000);
    return () => clearInterval(timer);
  }, [project?.id, busy, visible, hasMessages, refreshState]);

  // Subscribe to subagent progress and poll their registry while the agent is
  // running; rendered as activity chips above the input. Also skipped while
  // hidden for the same reason as the context poll.
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
  }, [project?.id, busy, visible]);

  // Load available slash commands for the / menu (also updated live through
  // the available_commands_update event).
  useEffect(() => {
    const targetProject = projectRef.current;
    if (!targetProject) return;
    let cancelled = false;
    ipc.ompGetCommands(targetProject.id, targetProject.path).then((result) => {
      if (!cancelled && result?.success && Array.isArray(result.commands)) setCommands(result.commands as SlashCommand[]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [project?.id]);

  // Focus the input when a conversation is opened, ready to type.
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  // Completion-notification prefs live in config (agent.notifyOnFinish +
  // notifications.sound). Read once on mount so toggles in the header menu
  // can persist and immediately affect the next agent_end.
  useEffect(() => {
    ipc.getConfig().then((result) => {
      if (!result?.success) return;
      setNotifyOnFinish(result.config?.agent?.notifyOnFinish ?? true);
      setNotifySound(result.config?.notifications?.sound ?? false);
    }).catch(() => {});
  }, []);

  // Escape closes the header dropdowns; the search query resets on close.
  useEffect(() => {
    if (!modelsOpen && !levelOpen && !moreOpen && !handoffOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setModelsOpen(false); setLevelOpen(false); setMoreOpen(false); setHandoffOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modelsOpen, levelOpen, moreOpen, handoffOpen]);

  useEffect(() => {
    if (!modelsOpen) setModelSearch('');
  }, [modelsOpen]);

  // Grow the textarea with its content (up to ~10 lines), then scroll.
  const resizeInput = (el: HTMLTextAreaElement) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  };

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 3000);
  }, []);

  // Reached from the live event handler (which is re-created every render but
  // reads stable refs) — keep the latest showNotice available without making
  // handleEvent depend on a changing identity.
  const showNoticeRef = useRef(showNotice);
  showNoticeRef.current = showNotice;

  // Derived values the event handler and header need.
  const currentModel = currentModelInfo(models, defaultModel);
  const currentModelRef = currentModel.ref;
  const currentModelLabel = currentModel.label;
  const currentModelVision = currentModel.vision;

  // Live event handler — recreated every render so it closes over fresh state,
  // stored in a ref so the mount-time subscription always calls the latest.
  const handleEvent = createOmpEventHandler({
    setMessages,
    lastEventAtRef,
    streamingBufRef,
    thinkingBufRef,
    toolUpdateRef,
    setStreaming,
    setThinking,
    setTools,
    setSubagents,
    setError,
    setTodos,
    setTodosOpen,
    setCommands,
    setRetrying,
    setCompacting,
    setBusyState,
    setLastTurn,
    onTokensUsed,
    showNoticeRef,
    refreshStateRef,
    notifyRef,
    projectRef,
    getCurrentModelRef: () => currentModelRef,
    getStreamingFallback: () => streaming.trim() || streamingBufRef.current.trim(),
    getThinkingFallback: () => thinking.trim() || thinkingBufRef.current.trim(),
  });
  handleEventRef.current = handleEvent;

  const refreshHistory = () => {
    const currentProject = projectRef.current;
    const currentSession = sessionRef.current;
    if (!currentProject || !currentSession) return;
    ipc.ompGetMessages(currentProject.id, currentProject.path, { sessionPath: currentSession.sessionPath }).then((result) => {
      if (!result?.success) return;
      setMessages(result.messages.map((item) => normalizeTranscriptMessage(item as { id?: string; role?: string; content?: unknown })));
    }).catch(() => {});
  };

  // Shared turn runner: appends the user message (unless the caller already
  // placed it, e.g. edit/retry), starts the RPC turn and arms the safety
  // timeout that recovers from silent failures.
  const runTurn = async ({ text, images = [], appendUser = true }: RunTurnOptions): Promise<void> => {
    if (busyRef.current || !project) return;
    setError(null);
    if (appendUser) {
      setMessages((prev) => [...prev, {
        id: uid(),
        role: 'user',
        content: text || '',
        images: images.length ? images : undefined,
        createdAt: new Date().toISOString(),
      }]);
    }
    setStreaming('');
    streamingBufRef.current = '';
    setThinking('');
    thinkingBufRef.current = '';
    setTools([]);
    setNearBottom(true);
    setBusyState(true);
    const ompImages = images.map((image) => ({ type: 'image', data: image.base64, mimeType: image.mimeType }));
    try {
      const result = await ipc.ompChat(project.id, project.path, text, { sessionId: session?.id, sessionPath: session?.sessionPath, images: ompImages.length ? ompImages : undefined });
      if (!result?.success) {
        setError(result?.error || 'Failed to start conversation');
        setBusyState(false);
        return;
      }
      // Remember the session created by this send so the session-change
      // effect does not reset the live conversation when it appears.
      sentSessionIdRef.current = (result.sessionId as string | undefined) ?? null;
      onSessionCreated?.(result.sessionId as string, result.session);
    } catch (caught) {
      setError((caught instanceof Error ? caught.message : String(caught)) || 'Failed to start conversation');
      setBusyState(false);
    }
    // Safety: if no agent_end arrives and no events have streamed for a while
    // (event shape mismatch or a silent failure), refresh from omp's own
    // transcript. Only fires when the turn is actually quiet, so long-running
    // generations with live events are never disturbed.
    setTimeout(() => {
      if (busyRef.current && Date.now() - lastEventAtRef.current > 8000) {
        refreshHistory();
        setBusyState(false);
      }
    }, 25000);
  };

  const handleSend = async (preset?: string) => {
    const message = (preset ?? input).trim();
    if ((!message && attachments.length === 0) || !project) return;
    // While the agent is working, sending steers the running turn with the new
    // instruction instead of starting a fresh one.
    if (busyRef.current) {
      const text = message || 'Here is an attached image — please analyze it.';
      setInput('');
      saveDraftRef.current?.('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
      setMessages((prev) => [...prev, {
        id: uid(),
        role: 'user',
        content: text,
        steered: true,
        createdAt: new Date().toISOString(),
      }]);
      try {
        await ipc.ompSteer(project.id, project.path, text);
      } catch (caught) {
        setError((caught instanceof Error ? caught.message : String(caught)) || 'Failed to steer the agent');
      }
      return;
    }
    // omp expects a text prompt; when only images are attached, use a neutral prompt.
    const text = message || 'Here is an attached image — please analyze it.';
    const images: ChatImage[] = attachments.map((attachment) => ({ dataUrl: attachment.dataUrl, base64: attachment.base64, mimeType: attachment.mimeType }));
    setInput('');
    saveDraftRef.current?.('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setAttachments([]);
    await runTurn({ text, images });
  };

  // runTurnRef keeps the latest runTurn reachable from the memoized
  // edit/retry handlers without re-creating them (which would defeat the
  // AssistantMessage memo during streaming).
  const runTurnRef = useRef(runTurn);
  runTurnRef.current = runTurn;

  // Retry regenerates the last assistant reply by re-asking its prompt. omp
  // transcripts are append-only, so the old turn still exists on disk — proper
  // history rewriting would use omp's branch feature.
  const handleRetry = useCallback(async (message: ChatMessage) => {
    if (busyRef.current || !projectRef.current) return;
    const list = messagesRef.current;
    const index = list.findIndex((item) => item.id === message.id);
    if (index < 0) return;
    const precedingUser = list.slice(0, index).reverse().find((item) => item.role === 'user');
    if (!precedingUser) return;
    setMessages((prev) => prev.filter((item) => item.id !== message.id));
    await runTurnRef.current({
      text: precedingUser.content || 'Here is an attached image — please analyze it.',
      images: precedingUser.images || [],
      appendUser: false,
    });
  }, []);

  // Edit rewrites the (last) user message, drops everything after it, and
  // re-asks with the corrected prompt.
  const handleEditSave = useCallback(async (messageId: string, newText: string) => {
    if (busyRef.current || !projectRef.current) return;
    const list = messagesRef.current;
    const index = list.findIndex((item) => item.id === messageId);
    if (index < 0) return;
    const edited = list[index];
    setMessages((prev) => {
      const next = prev.slice(0, index + 1);
      next[index] = { ...next[index], content: newText };
      return next;
    });
    await runTurnRef.current({ text: newText, images: edited.images || [], appendUser: false });
  }, []);

  const handleStop = async () => {
    if (project) ipc.ompAbort(project.id, project.path).catch(() => {});
    // Keep whatever streamed so far as a marked partial reply instead of
    // discarding it — a follow-up agent_end replaces it with canonical text.
    const partial = (streaming || streamingBufRef.current).trim();
    const partialThinking = (thinking || thinkingBufRef.current).trim();
    if (partial) {
      setMessages((prev) => [...prev, {
        id: uid(),
        role: 'assistant',
        content: partial,
        thinking: partialThinking || undefined,
        stopped: true,
      }]);
    }
    setBusyState(false);
    setStreaming('');
    streamingBufRef.current = '';
    setThinking('');
    thinkingBufRef.current = '';
  };

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

  const insertSlashCommand = (command: SlashCommand) => {
    setInput(`/${command.name} `);
    saveDraftRef.current?.(`/${command.name} `);
    if (inputRef.current) inputRef.current.focus();
  };

  // Unsent input is kept per session (see draftsRef). Writing through this
  // ref keeps every caller stable without re-creating memoized handlers.
  const saveDraft = (text: string) => {
    const key = `${projectRef.current?.id}:${sessionRef.current?.id || 'new'}`;
    draftsRef.current[key] = text;
  };
  const saveDraftRef = useRef(saveDraft);
  saveDraftRef.current = saveDraft;

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
  const handleBranch = useCallback(async (entryId: string) => {
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
  }, [showNotice]);

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

  const notConfigured = Boolean(status?.installed && !status?.configured);
  const isFresh = messages.length === 0 && !streaming && !historyLoading;
  // Index of the most recent user message — the only one that can be edited.
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') { lastUserIndex = i; break; }
  }
  const modelQuery = modelSearch.trim().toLowerCase();
  const filteredModels = modelQuery
    ? models.filter((model) => `${model.ref} ${model.label}`.toLowerCase().includes(modelQuery))
    : models;

  const contextPercent = computeContextPercent(contextUsage);
  // Slash-command palette: shown while typing a / command without a space.
  const slashOpen = input.startsWith('/') && !input.includes(' ') && input.length > 1;
  const slashQuery = slashOpen ? input.slice(1).toLowerCase() : '';
  const slashMatches = filterSlashCommands(commands, slashQuery);

  const handleFiles = useCallback(async (fileList: FileList | File[] | null) => {
    const files = Array.from(fileList || []).filter((file) => file.type?.startsWith('image/'));
    if (files.length === 0) return;
    const results: ComposerAttachment[] = [];
    for (const file of files) {
      if (file.size > MAX_IMAGE_BYTES) continue;
      try {
        const attachment = await fileToAttachment(file);
        results.push({ ...attachment, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
      } catch { /* unreadable image — skip */ }
    }
    if (results.length === 0) return;
    setAttachments((prev) => [...prev, ...results].slice(0, MAX_ATTACHMENTS));
  }, []);

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

  return (
    <AgentChatView
      project={project}
      session={session}
      status={status}
      onOpenSettings={onOpenSettings}
      busy={busy}
      thinkingLevel={thinkingLevel}
      levelOpen={levelOpen}
      setLevelOpen={setLevelOpen}
      handleSetThinkingLevel={handleSetThinkingLevel}
      models={models}
      modelsOpen={modelsOpen}
      setModelsOpen={setModelsOpen}
      modelSearch={modelSearch}
      setModelSearch={setModelSearch}
      filteredModels={filteredModels}
      currentModelLabel={currentModelLabel}
      currentModelRef={currentModelRef}
      handleSelectModel={handleSelectModel}
      contextPercent={contextPercent}
      contextUsage={contextUsage}
      tokensPerSecond={tokensPerSecond}
      compacting={compacting}
      retrying={retrying}
      moreOpen={moreOpen}
      setMoreOpen={setMoreOpen}
      handleExport={handleExport}
      handleCompact={handleCompact}
      autoCompaction={autoCompaction}
      toggleAutoCompaction={toggleAutoCompaction}
      fastMode={fastMode}
      toggleFastMode={toggleFastMode}
      autoRetry={autoRetry}
      toggleAutoRetry={toggleAutoRetry}
      notifyOnFinish={notifyOnFinish}
      toggleNotifyOnFinish={toggleNotifyOnFinish}
      handleStop={handleStop}
      handoffOpen={handoffOpen}
      setHandoffOpen={setHandoffOpen}
      handoffText={handoffText}
      setHandoffText={setHandoffText}
      handleHandoff={handleHandoff}
      subagents={subagents}
      notice={notice}
      error={error}
      todos={todos}
      todosOpen={todosOpen}
      setTodosOpen={setTodosOpen}
      historyError={historyError}
      historyRetry={historyRetry}
      setHistoryRetry={setHistoryRetry}
      historyLoading={historyLoading}
      isFresh={isFresh}
      notConfigured={notConfigured}
      messages={messages}
      lastUserIndex={lastUserIndex}
      handleEditSave={handleEditSave}
      handleRetry={handleRetry}
      handleBranch={handleBranch}
      tools={tools}
      streaming={streaming}
      thinking={thinking}
      scrollRef={scrollRef}
      handleScroll={handleScroll}
      scrollTop={scrollTop}
      nearBottom={nearBottom}
      setNearBottom={setNearBottom}
      scrollToBottom={scrollToBottom}
      bottomRef={bottomRef}
      bashRuns={bashRuns}
      setBashRuns={setBashRuns}
      updateBashRun={updateBashRun}
      abortBashRun={abortBashRun}
      attachments={attachments}
      setAttachments={setAttachments}
      bashInputOpen={bashInputOpen}
      setBashInputOpen={setBashInputOpen}
      bashCommand={bashCommand}
      setBashCommand={setBashCommand}
      runBash={runBash}
      fileInputRef={fileInputRef}
      inputRef={inputRef}
      input={input}
      setInput={setInput}
      saveDraftRef={saveDraftRef}
      resizeInput={resizeInput}
      handleSend={handleSend}
      handleFiles={handleFiles}
      slashOpen={slashOpen}
      slashMatches={slashMatches}
      insertSlashCommand={insertSlashCommand}
      currentModelVision={currentModelVision}
      lastTurn={lastTurn}
    />
  );
}

