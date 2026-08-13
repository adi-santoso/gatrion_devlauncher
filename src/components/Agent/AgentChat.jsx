import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../Common/Icon';
import * as ipc from '../../utils/ipcRenderer';
import Markdown from './Markdown';
import ThinkingBlock from './ThinkingBlock';
import { AssistantMessage, UserMessage } from './MessageBubble';
import { fileToAttachment, MAX_ATTACHMENTS, MAX_IMAGE_BYTES } from './imageAttachment';

const TOOL_ICONS = {
  read: 'fileText',
  write: 'code',
  edit: 'code',
  bash: 'terminal',
  grep: 'search',
  glob: 'folder',
  web_search: 'globe',
  github: 'gitBranch',
  lsp: 'code',
  todo: 'check',
};
const SUGGESTIONS = [
  'Explain what this project does',
  'Find and fix a bug',
  'Refactor this code',
  'Write tests for the core logic',
];
const THINKING_LEVELS = [
  ['off', 'Off'],
  ['minimal', 'Minimal'],
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
  ['xhigh', 'X-High'],
  ['max', 'Max'],
];

const uid = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// omp message content can be a plain string or an array of typed blocks
// ({ type: 'text' | 'thinking' | ... }). Split text and reasoning apart so
// thinking can be persisted per message instead of only shown while streaming.
const extractContentParts = (content) => {
  if (typeof content === 'string') return { text: content, thinking: '' };
  if (Array.isArray(content)) {
    let text = '';
    let thinking = '';
    for (const part of content) {
      if (!part) continue;
      if (part.type === 'text') text += part.text || '';
      else if (/think|reason/i.test(part.type || '')) thinking += part.text || '';
    }
    return { text, thinking };
  }
  return { text: '', thinking: '' };
};

const normalizeTranscriptMessage = (item) => {
  const { text, thinking } = extractContentParts(item.content);
  return {
    id: item.id || uid(),
    // Real transcript entries carry an omp entry id — used to branch the
    // conversation from this exact message (locally-generated ids lack it).
    entryId: typeof item.id === 'string' ? item.id : undefined,
    role: item.role === 'user' ? 'user' : 'assistant',
    content: text,
    thinking: thinking.trim() || undefined,
  };
};

function ToolCard({ tool }) {
  const [expanded, setExpanded] = useState(false);
  const running = tool.state === 'running';
  const done = tool.state === 'done';
  return (
    <div className={`my-1.5 rounded-xl border overflow-hidden transition-colors ${running ? 'border-accent/25 bg-accent/[0.03]' : 'border-border bg-surface'}`}>
      <button
        type="button"
        onClick={() => tool.body && setExpanded((value) => !value)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left ${tool.body ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${running ? 'bg-accent/15 text-accent-hover' : done ? 'bg-success/10 text-success' : 'bg-surface-3 text-ink-faint'}`}>
          <Icon name={TOOL_ICONS[tool.name] || 'bolt'} size={12} />
        </span>
        <span className="text-[13px] font-semibold text-ink font-mono">{tool.name}</span>
        {tool.arg && <span className="min-w-0 flex-1 truncate text-xs text-ink-faint font-mono">{tool.arg}</span>}
        <span className={`ml-auto flex items-center gap-1.5 text-[11px] font-medium shrink-0 ${running ? 'text-warning' : done ? 'text-success' : 'text-ink-faint'}`}>
          {running && <span className="w-3 h-3 rounded-full border-2 border-warning border-t-transparent animate-spin" />}
          {done && <Icon name="check" size={11} />}
          {running ? 'working…' : done ? 'done' : 'idle'}
        </span>
        {tool.body && (
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} className="text-ink-faint shrink-0" />
        )}
      </button>
      {expanded && tool.body && (
        <div className="border-t border-border px-3 py-2">
          <pre className="text-xs font-mono text-ink-soft whitespace-pre-wrap break-all max-h-52 overflow-auto">{tool.body}</pre>
        </div>
      )}
    </div>
  );
}

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
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [thinking, setThinking] = useState('');
  const [tools, setTools] = useState([]);
  const [error, setError] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [nearBottom, setNearBottom] = useState(true);
  const [models, setModels] = useState([]);
  const [defaultModel, setDefaultModel] = useState(null);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState(null);
  const [levelOpen, setLevelOpen] = useState(false);
  const [contextUsage, setContextUsage] = useState(null);
  const [autoCompaction, setAutoCompaction] = useState(true);
  const [fastMode, setFastMode] = useState(false);
  const [autoRetry, setAutoRetry] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [todos, setTodos] = useState([]);
  const [todosOpen, setTodosOpen] = useState(true);
  const [commands, setCommands] = useState([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [tokensPerSecond, setTokensPerSecond] = useState(null);
  const [subagents, setSubagents] = useState([]);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffText, setHandoffText] = useState('');
  const [bashRuns, setBashRuns] = useState([]); // { id, command, status, output, exitCode, ... }
  const [bashInputOpen, setBashInputOpen] = useState(false);
  const [bashCommand, setBashCommand] = useState('');
  const [notifyOnFinish, setNotifyOnFinish] = useState(true);
  const [notifySound, setNotifySound] = useState(false);
  const [attachments, setAttachments] = useState([]); // { id, name, mimeType, dataUrl, base64, bytes }
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const busyRef = useRef(false);
  const lastEventAtRef = useRef(0);
  const sentSessionIdRef = useRef(null);
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
  const toolUpdateRef = useRef(null);
  // Short replies get live markdown while typing; anything longer than this is
  // streamed as plain text, because re-parsing a large accumulated document on
  // every flush starves the renderer and freezes the app mid-reply. The final
  // message is always rendered through Markdown once the turn completes.
  const MARKDOWN_STREAM_LIMIT = 12000;
  const projectRef = useRef(project);
  const sessionRef = useRef(session);
  const messagesRef = useRef(messages);
  const handleEventRef = useRef(null);
  // Unsent input is remembered per session so switching away and back does
  // not lose what was being typed (draft per session).
  const draftsRef = useRef({});
  // Completion-notification prefs (read from config) — kept in a ref so the
  // event handler (recreated every render) always sees the latest value.
  const notifyRef = useRef({ notifyOnFinish: true, notifySound: false });
  notifyRef.current = { notifyOnFinish, notifySound };
  projectRef.current = project;
  sessionRef.current = session;
  messagesRef.current = messages;

  const setBusyState = (value) => {
    busyRef.current = value;
    setBusy(value);
    onBusyChange?.(value);
  };

  // Session state from get_state: context usage, auto-compaction, fast mode,
  // todo phases. Applied whenever get_state is fetched (mount, poll, events).
  const applyState = useCallback((state) => {
    if (!state) return;
    if (state.thinkingLevel) setThinkingLevel(state.thinkingLevel);
    setContextUsage(state.contextUsage || null);
    if (typeof state.autoCompactionEnabled === 'boolean') setAutoCompaction(state.autoCompactionEnabled);
    if (typeof state.fastModeEnabled === 'boolean') setFastMode(state.fastModeEnabled);
    if (Array.isArray(state.todoPhases)) setTodos(state.todoPhases);
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

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  const handleScroll = () => setNearBottom(isNearBottom());

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Returning to the Agent view shows everything that streamed while hidden
  // in a single render instead of replaying it chunk by chunk.
  useEffect(() => {
    if (visible) flushBuffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // The very first message can create the session implicitly (no active
    // session selected). That transition must not wipe the live conversation.
    if (session?.id && session.id === sentSessionIdRef.current) {
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
    setNearBottom(true);
    // Restore this session's draft (empty if it never had one).
    const draftKey = `${project?.id}:${session?.id || 'new'}`;
    setInput(draftsRef.current[draftKey] || '');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    const hasHistory = Boolean(project && session?.sessionPath);
    setHistoryLoading(hasHistory);
    if (!project || !session) return;
    // A session without a sessionPath is brand-new — it has no history to
    // load, and fetching anyway could clobber the first message with a stale
    // (or wrong-session) response.
    if (!session.sessionPath) return;
    let cancelled = false;
    ipc.ompGetMessages(project.id, project.path, { sessionPath: session.sessionPath }).then((result) => {
      if (cancelled) return;
      setHistoryLoading(false);
      if (!result?.success) return;
      setMessages(result.messages.map((item) => normalizeTranscriptMessage(item)));
    }).catch(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [project?.id, session?.id, project?.path]);

  // Live events from the main process — uses refs so the handler always sees
  // the current project/session even though the subscription is created once.
  useEffect(() => {
    return ipc.onOmpEvent(({ projectId, event }) => {
      if (projectId !== projectRef.current?.id) return;
      // Via ref so the handler always sees the current streaming/thinking
      // state instead of the first render's stale closure.
      handleEventRef.current?.(event);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const apply = (options, current) => {
      if (cancelled) return;
      setModels(options);
      setDefaultModel(current);
    };
    ipc.ompConfigGet().then((result) => {
      if (cancelled) return;
      const current = result?.defaultModel || null;
      const configOptions = (result?.providers || []).flatMap((provider) =>
        (provider.models || []).map((model) => ({
          ref: `${provider.name}/${model.id}`,
          label: `${provider.name} · ${model.name || model.id}`,
          vision: null, // explicit models.yml entries carry no input-type info
        }))
      );
      if (!project) {
        apply(configOptions, current);
        return;
      }
      ipc.ompGetModels(project.id, project.path).then((rpcResult) => {
        const rpcOptions = (rpcResult?.models || []).map((model) => ({
          ref: `${model.provider}/${model.id}`,
          label: `${model.provider} · ${model.name || model.id}`,
          vision: (model.input || []).includes('image'),
        }));
        const seen = new Set();
        const merged = [...configOptions, ...rpcOptions].filter((option) =>
          seen.has(option.ref) ? false : (seen.add(option.ref), true)
        );
        apply(merged, current);
      }).catch(() => apply(configOptions, current));
      // Read the current session state (thinking level, context usage,
      // auto-compaction, todo phases) so the header controls reflect it.
      ipc.ompGetState(project.id, project.path).then((stateResult) => {
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
  useEffect(() => {
    if (!project || !visible || (!busy && messages.length === 0)) return;
    refreshState();
    const timer = setInterval(refreshState, busy ? 5000 : 20000);
    return () => clearInterval(timer);
  }, [project?.id, busy, visible, messages.length > 0, refreshState]);

  // Subscribe to subagent progress and poll their registry while the agent is
  // running; rendered as activity chips above the input. Also skipped while
  // hidden for the same reason as the context poll.
  useEffect(() => {
    if (!project || !visible || !busy) return;
    ipc.ompSetSubagentSubscription(project.id, project.path, 'progress').catch(() => {});
    const fetchSubagents = () => {
      ipc.ompGetSubagents(project.id, project.path).then((result) => {
        if (result?.success && Array.isArray(result.subagents)) setSubagents(result.subagents);
      }).catch(() => {});
    };
    fetchSubagents();
    const timer = setInterval(fetchSubagents, 4000);
    return () => clearInterval(timer);
  }, [project?.id, busy, visible]);

  // Load available slash commands for the / menu (also updated live through
  // the available_commands_update event).
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    ipc.ompGetCommands(project.id, project.path).then((result) => {
      if (!cancelled && result?.success && Array.isArray(result.commands)) setCommands(result.commands);
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
    const onKey = (event) => {
      if (event.key === 'Escape') { setModelsOpen(false); setLevelOpen(false); setMoreOpen(false); setHandoffOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modelsOpen, levelOpen, moreOpen, handoffOpen]);

  useEffect(() => {
    if (!modelsOpen) setModelSearch('');
  }, [modelsOpen]);

  // Grow the textarea with its content (up to ~10 lines), then scroll.
  const resizeInput = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  };

  // Real omp RPC event shapes (verified against omp 17.x on 2026-08):
  //   message_update.assistantMessageEvent = { type: 'text_delta', delta }
  //   tool_execution_start/update/end = { toolCallId, toolName, args, result }
  //   agent_end = { messages: [...full transcript...] }
  const argsToString = (args) => {
    if (typeof args === 'string') return args;
    if (args && typeof args === 'object') return JSON.stringify(args).slice(0, 160);
    return '';
  };

  const handleEvent = (event) => {
    const type = event?.type || '';
    lastEventAtRef.current = Date.now();
    if (type === 'message_update') {
      const assistantEvent = event.assistantMessageEvent;
      if (!assistantEvent) return;
      if (assistantEvent.type === 'text_delta' && typeof assistantEvent.delta === 'string') {
        streamingBufRef.current += assistantEvent.delta;
      } else if (/think|reason/i.test(assistantEvent.type) && typeof assistantEvent.delta === 'string') {
        thinkingBufRef.current += assistantEvent.delta;
      }
      return;
    }
    if (type === 'agent_start') {
      setStreaming('');
      streamingBufRef.current = '';
      setThinking('');
      thinkingBufRef.current = '';
      setTools([]);
      setSubagents([]);
      setError(null);
      return;
    }
    // Live status notices surfaced inline instead of being swallowed.
    if (type === 'notice') {
      if (typeof event.message === 'string' && event.message.trim()) showNoticeRef.current?.(event.message.trim().slice(0, 160));
      return;
    }
    if (type === 'goal_updated') {
      const goal = typeof event.goal === 'string' ? event.goal : typeof event.message === 'string' ? event.message : '';
      if (goal && goal.trim()) showNoticeRef.current?.(`Goal: ${goal.trim().slice(0, 120)}`);
      return;
    }
    if (type === 'ttsr_triggered' || type === 'irc_message') {
      const text = typeof event.message === 'string' ? event.message : '';
      if (text && text.length < 140) showNoticeRef.current?.(text);
      return;
    }
    if (type === 'tool_execution_start') {
      setTools((prev) => [...prev, {
        id: event.toolCallId,
        name: event.toolName || '',
        arg: argsToString(event.args),
        state: 'running',
        body: '',
      }]);
      return;
    }
    if (type === 'tool_execution_update') {
      const text = event.partialResult?.content?.map((part) => part?.text).filter(Boolean).join('') || '';
      toolUpdateRef.current = { toolCallId: event.toolCallId, text };
      return;
    }
    if (type === 'tool_execution_end') {
      const text = event.result?.content?.map((part) => part?.text).filter(Boolean).join('') || '';
      setTools((prev) => {
        const next = [...prev];
        const target = next.filter((item) => item.id === event.toolCallId).pop() || (event.toolName ? next.filter((item) => item.name === event.toolName).pop() : null);
        if (target) {
          target.state = 'done';
          target.body = text.slice(0, 4000);
        }
        return next;
      });
      return;
    }
    if (type === 'agent_end') {
      // agent_end.messages is TURN-scoped (verified against omp 17.x: the
      // second turn's event only carries that turn's user+assistant messages,
      // not the whole session). Merge the finished turn into the existing
      // conversation instead of replacing it, or earlier turns vanish.
      const turnMessages = (Array.isArray(event.messages) ? event.messages : [])
        .map((item) => normalizeTranscriptMessage(item))
        .filter((item) => item.content.trim() || item.thinking)
      const finishedText = turnMessages.filter((item) => item.role === 'assistant').map((item) => item.content).join('\n\n')
        || streaming.trim() || streamingBufRef.current.trim()
      const last = event.messages?.[event.messages.length - 1]
      const usage = last?.usage || {}
      const promptTokens = typeof usage.promptTokens === 'number' ? usage.promptTokens : undefined
      const completionTokens = typeof usage.completionTokens === 'number' ? usage.completionTokens : undefined
      const totalTokens = typeof usage.totalTokens === 'number' ? usage.totalTokens : undefined
      onTokensUsed?.(totalTokens || 0)
      setMessages((prev) => {
        const turnUser = turnMessages.filter((item) => item.role === 'user').pop()
        const assistantContent = turnMessages.filter((item) => item.role === 'assistant').map((item) => item.content).join('\n\n') || streaming.trim() || streamingBufRef.current.trim()
        const assistantThinking = turnMessages.filter((item) => item.role === 'assistant').map((item) => item.thinking).filter(Boolean).join('\n\n') || thinking.trim() || thinkingBufRef.current.trim()
        let next = [...prev]
        if (turnUser) {
          // The current user message is already in the list (appended on
          // send); keep it in place, merging the canonical transcript text
          // in without dropping locally-attached image previews.
          if (next[next.length - 1]?.role === 'user') {
            next[next.length - 1] = { ...next[next.length - 1], ...turnUser, id: next[next.length - 1].id }
          } else {
            next.push(turnUser)
          }
        }
        const lastAssistant = turnMessages.filter((item) => item.role === 'assistant').pop()
        if (assistantContent) {
          // A stopped partial reply is replaced by the canonical transcript;
          // otherwise append a fresh assistant message.
          let replaced = false
          for (let i = next.length - 1; i >= 0; i -= 1) {
            if (next[i].role === 'assistant') {
              if (next[i].stopped) {
                next[i] = {
                  ...next[i],
                  content: assistantContent,
                  thinking: assistantThinking || next[i].thinking,
                  stopped: false,
                  promptTokens,
                  completionTokens,
                  totalTokens,
                }
                replaced = true
              }
              break
            }
          }
          if (!replaced) {
            next.push({
              id: uid(),
              entryId: lastAssistant?.entryId,
              role: 'assistant',
              content: assistantContent,
              thinking: assistantThinking || undefined,
              promptTokens,
              completionTokens,
              totalTokens,
              createdAt: new Date().toISOString(),
            })
          }
        }
        return next
      })
      setStreaming('')
      streamingBufRef.current = ''
      setThinking('')
      thinkingBufRef.current = ''
      setSubagents([])
      setBusyState(false)
      refreshStateRef.current?.()
      // Native notification when the turn completes while the app is not
      // focused (e.g. minimized or another window is active) — opt-out via
      // the header menu, sound follows the global notifications.sound pref.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible' && notifyRef.current.notifyOnFinish) {
        Promise.resolve(ipc.showNotification({
          title: `Agent finished — ${projectRef.current?.name || 'project'}`,
          body: (finishedText || 'The agent completed its turn.').slice(0, 200),
          silent: !notifyRef.current.notifySound,
        })).catch(() => {})
      }
      return
    }
    if (type === 'todo_reminder') {
      setTodos(Array.isArray(event.phases) ? event.phases : Array.isArray(event.todoPhases) ? event.todoPhases : [])
      setTodosOpen(true)
      return
    }
    if (type === 'todo_auto_clear') {
      setTodos([])
      return
    }
    if (type === 'available_commands_update') {
      if (Array.isArray(event.commands)) setCommands(event.commands)
      return
    }
    if (type === 'auto_retry_start') { setRetrying(true); return }
    if (type === 'auto_retry_end') { setRetrying(false); return }
    if (type === 'auto_compaction_start') { setCompacting(true); return }
    if (type === 'auto_compaction_end') { setCompacting(false); return }
    if (type === 'model_changed' || type === 'thinking_level_changed') {
      refreshStateRef.current?.()
      return
    }
    if (type === 'rpc_error' || type === 'rpc_exit') {
      setBusyState(false);
      if (type === 'rpc_error') setError(event.error || 'Agent process failed');
      return;
    }
  };

  handleEventRef.current = handleEvent;

  const refreshHistory = () => {
    const currentProject = projectRef.current;
    const currentSession = sessionRef.current;
    if (!currentProject || !currentSession) return;
    ipc.ompGetMessages(currentProject.id, currentProject.path, { sessionPath: currentSession.sessionPath }).then((result) => {
      if (!result?.success) return;
      setMessages(result.messages.map((item) => normalizeTranscriptMessage(item)));
    }).catch(() => {});
  };

  // Shared turn runner: appends the user message (unless the caller already
  // placed it, e.g. edit/retry), starts the RPC turn and arms the safety
  // timeout that recovers from silent failures.
  const runTurn = async ({ text, images = [], appendUser = true }) => {
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
      sentSessionIdRef.current = result.sessionId;
      onSessionCreated?.(result.sessionId, result.session);
    } catch (error) {
      setError(error.message || 'Failed to start conversation');
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

  const handleSend = async (preset) => {
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
      } catch (error) {
        setError(error.message || 'Failed to steer the agent');
      }
      return;
    }
    // omp expects a text prompt; when only images are attached, use a neutral prompt.
    const text = message || 'Here is an attached image — please analyze it.';
    const images = attachments.map((attachment) => ({ dataUrl: attachment.dataUrl, base64: attachment.base64, mimeType: attachment.mimeType }));
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
  const handleRetry = useCallback(async (message) => {
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
  const handleEditSave = useCallback(async (messageId, newText) => {
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

  const showNotice = useCallback((text) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 3000);
  }, []);

  // Reached from the live event handler (which is re-created every render but
  // reads stable refs) — keep the latest showNotice available without making
  // handleEvent depend on a changing identity.
  const showNoticeRef = useRef(showNotice);
  showNoticeRef.current = showNotice;

  const handleCompact = async () => {
    setMoreOpen(false);
    if (!project) return;
    try {
      await ipc.ompCompact(project.id, project.path);
      showNotice('Context compacted');
    } catch (error) {
      setError(error.message || 'Compact failed');
    }
  };

  const toggleAutoCompaction = async () => {
    setMoreOpen(false);
    if (!project) return;
    const next = !autoCompaction;
    setAutoCompaction(next);
    try {
      await ipc.ompSetAutoCompaction(project.id, project.path, next);
    } catch (error) {
      setAutoCompaction(!next);
      setError(error.message || 'Failed to toggle auto-compaction');
    }
  };

  const toggleFastMode = async () => {
    setMoreOpen(false);
    if (!project) return;
    const next = !fastMode;
    setFastMode(next);
    try {
      await ipc.ompSetFastMode(project.id, project.path, next);
    } catch (error) {
      setFastMode(!next);
      setError(error.message || 'Fast mode is unavailable for the current model');
    }
  };

  const toggleAutoRetry = async () => {
    setMoreOpen(false);
    if (!project) return;
    const next = !autoRetry;
    setAutoRetry(next);
    try {
      await ipc.ompSetAutoRetry(project.id, project.path, next);
    } catch (error) {
      setAutoRetry(!next);
      setError(error.message || 'Failed to toggle auto-retry');
    }
  };

  const insertSlashCommand = (command) => {
    setInput(`/${command.name} `);
    saveDraftRef.current?.(`/${command.name} `);
    if (inputRef.current) inputRef.current.focus();
  };

  // Unsent input is kept per session (see draftsRef). Writing through this
  // ref keeps every caller stable without re-creating memoized handlers.
  const saveDraft = (text) => {
    const key = `${projectRef.current?.id}:${sessionRef.current?.id || 'new'}`;
    draftsRef.current[key] = text;
  };
  const saveDraftRef = useRef(saveDraft);
  saveDraftRef.current = saveDraft;

  const handleExport = async () => {
    setMoreOpen(false);
    if (!project) return;
    try {
      const result = await ipc.ompExportConversation(project.id, project.path, session?.sessionPath || null, session?.title || project.name);
      if (result?.success && !result.canceled) {
        showNotice(`Exported to ${result.path}`);
      } else if (!result?.success) {
        setError(result?.error || 'Export failed');
      }
      // A canceled save dialog is a quiet no-op.
    } catch (error) {
      setError(error.message || 'Export failed');
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
    } catch (error) {
      setError(error.message || 'Failed to apply instructions');
    }
  };

  const updateBashRun = (runId, patch) => {
    setBashRuns((prev) => prev.map((run) => (run.id === runId ? { ...run, ...patch } : run)));
  };

  const runBash = async (command) => {
    const text = command.trim();
    if (!text || !project) return;
    setBashCommand('');
    setBashInputOpen(false);
    const run = {
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
        const data = result.data || {};
        updateBashRun(run.id, {
          status: 'done',
          output: data.output || '',
          exitCode: data.exitCode,
          cancelled: !!data.cancelled,
          timedOut: !!data.timedOut,
        });
        showNotice(data.cancelled ? 'Command cancelled' : `Command finished (exit ${data.exitCode ?? '?'})`);
      } else {
        updateBashRun(run.id, { status: 'error', error: result?.error || 'Command failed' });
      }
    } catch (error) {
      updateBashRun(run.id, { status: 'error', error: error.message || 'Command failed' });
    }
  };

  const abortBashRun = async (runId) => {
    updateBashRun(runId, { status: 'cancelling' });
    if (project) ipc.ompAbortBash(project.id, project.path).catch(() => {});
    // The omp bash response resolves with cancelled: true once aborted and
    // replaces this transient state.
  };

  // Fork the conversation from a specific transcript entry (omp branch). The
  // session context moves to the new branch, then the transcript is reloaded.
  const handleBranch = useCallback(async (entryId) => {
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
      if (msgs?.success) setMessages(msgs.messages.map((item) => normalizeTranscriptMessage(item)));
    } catch (error) {
      setError(error.message || 'Branch failed');
    }
  }, []);

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

  const notConfigured = status?.installed && !status?.configured;
  const isFresh = messages.length === 0 && !streaming && !historyLoading;
  // Index of the most recent user message — the only one that can be edited.
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') { lastUserIndex = i; break; }
  }
  // config.yml may carry a variant suffix (e.g. "provider/model:high") that
  // is not part of the models.yml id — match on the ref prefix.
  const currentModelRef = defaultModel
    ? models.find((m) => defaultModel === m.ref || defaultModel.startsWith(`${m.ref}:`))?.ref || null
    : null;
  const currentModelLabel = models.find((m) => m.ref === currentModelRef)?.label || defaultModel || null;
  const currentModelVision = models.find((m) => m.ref === currentModelRef)?.vision;
  const modelQuery = modelSearch.trim().toLowerCase();
  const filteredModels = modelQuery
    ? models.filter((m) => `${m.ref} ${m.label}`.toLowerCase().includes(modelQuery))
    : models;

  // omp reports contextUsage.percent both as a fraction (0.55 per the RPC docs)
  // and as a raw percentage (30.63) depending on the runtime — normalize either
  // form, then clamp so the indicator can never overflow past 100%.
  const contextPercent = contextUsage
    ? (() => {
      let ratio = contextUsage.percent;
      if (ratio == null) ratio = contextUsage.contextWindow ? contextUsage.tokens / contextUsage.contextWindow : 0;
      const pct = ratio > 1 ? ratio : ratio * 100;
      return Math.min(100, Math.max(0, Math.round(pct)));
    })()
    : null;
  // Slash-command palette: shown while typing a / command without a space.
  const slashOpen = input.startsWith('/') && !input.includes(' ') && input.length > 1;
  const slashQuery = slashOpen ? input.slice(1).toLowerCase() : '';
  const slashMatches = slashQuery
    ? commands.filter((cmd) => `${cmd.name} ${cmd.description || ''}`.toLowerCase().includes(slashQuery))
    : commands;

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter((file) => file.type?.startsWith('image/'));
    if (files.length === 0) return;
    const results = [];
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

  const handleSetThinkingLevel = async (level) => {
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

  const handleSelectModel = async (ref) => {
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
    <div className="flex flex-col min-w-0 h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-surface shrink-0">
        <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent-hover flex items-center justify-center shrink-0">
          <Icon name="messageSquare" size={14} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate leading-tight">{project?.name || 'Agent'}</p>
          <p className="text-[11px] text-ink-faint truncate">{session?.title || (busy ? 'working…' : 'New conversation')}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {project && status?.installed && status?.configured && (
            <div className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setLevelOpen((value) => !value)}
                disabled={busy}
                title="Thinking level"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-soft bg-surface-2 border border-border rounded-full px-2.5 py-1 hover:border-border-hover hover:text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Icon name="brain" size={11} className="text-warning" />
                <span className="capitalize">{thinkingLevel || 'thinking'}</span>
                <Icon name="chevronDown" size={11} className="text-ink-faint" />
              </button>
              {levelOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLevelOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-40 rounded-xl border border-border bg-surface shadow-card z-50 py-1">
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Thinking</p>
                    {THINKING_LEVELS.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleSetThinkingLevel(value)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                          value === thinkingLevel ? 'text-accent bg-accent/5' : 'text-ink-soft hover:bg-surface-3 hover:text-ink'
                        }`}
                      >
                        <span className="flex-1">{label}</span>
                        {value === thinkingLevel && <Icon name="check" size={12} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {models.length > 0 && (
            <div className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setModelsOpen((value) => !value)}
                disabled={busy}
                title="Switch model"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-soft bg-surface-2 border border-border rounded-full px-2.5 py-1 hover:border-border-hover hover:text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Icon name="bolt" size={11} className="text-accent" />
                <span className="max-w-[150px] truncate font-mono">{currentModelLabel || 'Select model'}</span>
                <Icon name="chevronDown" size={11} className="text-ink-faint" />
              </button>
              {modelsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setModelsOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-72 max-h-96 overflow-hidden rounded-xl border border-border bg-surface shadow-card z-50 flex flex-col">
                    <div className="p-2 border-b border-border shrink-0">
                      <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 focus-within:border-accent/50">
                        <Icon name="search" size={12} className="text-ink-faint" />
                        <input
                          autoFocus
                          value={modelSearch}
                          onChange={(event) => setModelSearch(event.target.value)}
                          placeholder="Search models…"
                          className="flex-1 bg-transparent text-xs text-ink placeholder:text-ink-faint focus:outline-none"
                        />
                        {modelSearch && (
                          <button type="button" onClick={() => setModelSearch('')} className="text-ink-faint hover:text-ink" aria-label="Clear search">
                            <Icon name="x" size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="overflow-auto">
                      <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Model · {filteredModels.length}</p>
                      {filteredModels.map((model) => (
                        <button
                          key={model.ref}
                          type="button"
                          onClick={() => handleSelectModel(model.ref)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                            model.ref === currentModelRef ? 'text-accent bg-accent/5' : 'text-ink-soft hover:bg-surface-3 hover:text-ink'
                          }`}
                        >
                          <span className="flex-1 min-w-0 truncate font-mono">{model.label}</span>
                          {model.ref === currentModelRef && <Icon name="check" size={12} />}
                        </button>
                      ))}
                      {filteredModels.length === 0 && (
                        <p className="px-3 py-5 text-xs text-ink-faint text-center">No models match “{modelSearch}”</p>
                      )}
                    </div>
                    <div className="border-t border-border mt-1 pt-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => { setModelsOpen(false); onOpenSettings?.(); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-ink-faint hover:text-accent transition-colors"
                      >
                        <Icon name="gear" size={12} />
                        Manage models in Settings…
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {status?.installed && status?.configured && (
            <span className="hidden xl:inline-flex items-center gap-1.5 text-[11px] text-ink-faint bg-surface-2 border border-border rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              {status.version ? `omp ${status.version}` : 'omp'}
            </span>
          )}
          {contextPercent != null && (
            <div
              className="hidden md:flex items-center gap-1.5 text-[11px]"
              title={`${contextUsage?.tokens?.toLocaleString() || 0} / ${contextUsage?.contextWindow?.toLocaleString() || '?'} tokens in context`}
            >
              <span className="w-14 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                <span
                  className={`block h-full rounded-full transition-all ${contextPercent >= 90 ? 'bg-danger' : contextPercent >= 70 ? 'bg-warning' : 'bg-accent'}`}
                  style={{ width: `${Math.min(100, contextPercent)}%` }}
                />
              </span>
              <span className={`tabular-nums ${contextPercent >= 90 ? 'text-danger' : contextPercent >= 70 ? 'text-warning' : 'text-ink-faint'}`}>{contextPercent}%</span>
            </div>
          )}
          {busy && tokensPerSecond != null && (
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-ink-soft bg-surface-2 border border-border rounded-full px-2.5 py-1 tabular-nums">
              <Icon name="bolt" size={11} className="text-accent" />
              {tokensPerSecond >= 10 ? Math.round(tokensPerSecond) : tokensPerSecond.toFixed(1)} tok/s
            </span>
          )}
          {(compacting || retrying) && (
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-warning bg-warning/10 border border-warning/25 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
              {compacting ? 'Compacting…' : 'Retrying…'}
            </span>
          )}
          {project && status?.installed && status?.configured && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((value) => !value)}
                disabled={busy}
                title="Session options"
                className="w-7 h-7 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-3 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Icon name="more" size={14} />
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-60 rounded-xl border border-border bg-surface shadow-card z-50 py-1 dropdown-menu">
                    <button
                      type="button"
                      onClick={handleExport}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
                    >
                      <Icon name="download" size={12} />
                      Export conversation
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMoreOpen(false); setHandoffOpen(true); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
                    >
                      <Icon name="fileText" size={12} />
                      Custom instructions…
                    </button>
                    <div className="my-1 border-t border-border" />
                    <button
                      type="button"
                      onClick={handleCompact}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
                    >
                      <Icon name="minimize" size={12} />
                      Compact context
                    </button>
                    <button
                      type="button"
                      onClick={toggleAutoCompaction}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
                    >
                      <Icon name="refreshCw" size={12} />
                      <span className="flex-1">Auto-compact</span>
                      {autoCompaction && <Icon name="check" size={12} className="text-accent" />}
                    </button>
                    <button
                      type="button"
                      onClick={toggleFastMode}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
                    >
                      <Icon name="bolt" size={12} />
                      <span className="flex-1">Fast mode</span>
                      {fastMode && <Icon name="check" size={12} className="text-accent" />}
                    </button>
                    <button
                      type="button"
                      onClick={toggleAutoRetry}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
                    >
                      <Icon name="restart" size={12} />
                      <span className="flex-1">Auto-retry</span>
                      {autoRetry && <Icon name="check" size={12} className="text-accent" />}
                    </button>
                    <div className="my-1 border-t border-border" />
                    <button
                      type="button"
                      onClick={toggleNotifyOnFinish}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
                    >
                      <Icon name="bell" size={12} />
                      <span className="flex-1">Notify when finished</span>
                      {notifyOnFinish && <Icon name="check" size={12} className="text-accent" />}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {busy && (
            <button
              onClick={handleStop}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-danger bg-danger/10 border border-danger/25 rounded-full px-3 py-1.5 hover:bg-danger/20 transition-colors"
            >
              <Icon name="stop" size={11} />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Custom instructions (handoff) popover */}
      {handoffOpen && (
        <div className="relative shrink-0 bg-base px-5 pt-3">
          <div className="max-w-[760px] mx-auto rounded-xl border border-border bg-surface-2 shadow-card p-3">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="fileText" size={13} className="text-accent" />
              <p className="text-xs font-semibold text-ink">Custom instructions</p>
              <span className="text-[10px] text-ink-faint">applied to the next agent response</span>
              <button
                type="button"
                onClick={() => setHandoffOpen(false)}
                className="ml-auto text-ink-faint hover:text-ink flex items-center"
                aria-label="Close instructions"
              >
                <Icon name="x" size={12} />
              </button>
            </div>
            <textarea
              autoFocus
              value={handoffText}
              onChange={(event) => setHandoffText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); handleHandoff(); }
              }}
              rows={2}
              placeholder="e.g. Always explain changes before editing files…"
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50 resize-none"
            />
            <div className="flex items-center gap-2 mt-2.5">
              <button
                type="button"
                onClick={handleHandoff}
                disabled={!handoffText.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply
              </button>
              <span className="text-[10px] text-ink-faint">Ctrl/⌘+Enter to apply</span>
            </div>
          </div>
        </div>
      )}

      {/* Subagent activity chips */}
      {subagents.length > 0 && (
        <div className="shrink-0 bg-base px-5 pt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Subagents</span>
          {subagents.map((agent, index) => {
            const status = agent.status || (typeof agent.progress === 'number' ? (agent.progress < 1 ? 'running' : 'done') : 'idle');
            const running = status === 'running' || status === 'in_progress' || status === 'working';
            const done = status === 'done' || status === 'completed';
            return (
              <span
                key={agent.id || agent.name || `sub-${index}`}
                title={agent.task || agent.name || 'subagent'}
                className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft bg-surface-2 border border-border rounded-full px-2.5 py-1"
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${running ? 'bg-warning animate-pulse' : done ? 'bg-success' : 'bg-ink-faint/50'}`} />
                <Icon name="bot" size={11} className="text-accent shrink-0" />
                <span className="max-w-[200px] truncate">{agent.task || agent.name || 'subagent'}</span>
                {typeof agent.progress === 'number' && agent.progress < 1 && (
                  <span className="text-ink-faint tabular-nums">{Math.round(agent.progress * 100)}%</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative flex-1 min-h-0 overflow-auto px-6 pt-7 pb-5 bg-base"
      >
        {(notice || error) && (
          <div className="max-w-[760px] mx-auto space-y-2">
            {notice && (
              <div className="text-sm px-4 py-3 rounded-xl border border-success/25 bg-success/10 text-success">{notice}</div>
            )}
            {error && (
              <div className="text-sm px-4 py-3 rounded-xl border border-danger/25 bg-danger/10 text-danger whitespace-pre-wrap break-words">{error}</div>
            )}
          </div>
        )}
        {todos.length > 0 && (
          <div className="absolute right-4 top-4 z-20 w-64 max-h-[60%] flex flex-col rounded-xl border border-border bg-surface shadow-card overflow-hidden">
            <button
              type="button"
              onClick={() => setTodosOpen((value) => !value)}
              className="flex items-center gap-2 px-3 py-2 text-left border-b border-border bg-surface-2"
            >
              <Icon name="check" size={12} className="text-accent" />
              <span className="text-xs font-semibold text-ink flex-1">Todos</span>
              <span className="text-[10px] text-ink-faint tabular-nums">{todos.reduce((sum, phase) => sum + (phase.tasks?.length || 0), 0)}</span>
              <Icon name={todosOpen ? 'chevronDown' : 'chevronRight'} size={11} className="text-ink-faint" />
            </button>
            {todosOpen && (
              <div className="overflow-auto p-2 space-y-2">
                {todos.map((phase) => (
                  <div key={phase.id}>
                    {phase.name && phase.name !== 'Todos' && (
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint px-1 mb-1">{phase.name}</p>
                    )}
                    {(phase.tasks || []).map((task) => (
                      <div key={task.id} className="flex items-start gap-2 px-1 py-0.5">
                        <span className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${task.status === 'done' ? 'bg-success border-success text-white' : task.status === 'in_progress' ? 'border-accent' : 'border-border'}`}>
                          {task.status === 'done' && <Icon name="check" size={8} />}
                        </span>
                        <span className={`text-xs leading-snug ${task.status === 'done' ? 'text-ink-faint line-through' : task.status === 'in_progress' ? 'text-ink' : 'text-ink-soft'}`}>{task.content}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {historyLoading ? (
          <div className="max-w-[760px] mx-auto space-y-5 pt-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-md bg-accent/15 flex items-center justify-center">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-accent/40 border-t-transparent animate-spin" />
              </span>
              <span className="text-xs font-semibold text-ink-soft">Loading conversation…</span>
            </div>
            <div className="space-y-1.5">
              <div className="skeleton h-3.5 w-3/4 rounded" />
              <div className="skeleton h-3.5 w-1/2 rounded" />
              <div className="skeleton h-3.5 w-2/3 rounded" />
            </div>
            <div className="flex justify-end">
              <div className="skeleton h-9 w-40 rounded-2xl" />
            </div>
            <div className="space-y-1.5">
              <div className="skeleton h-3.5 w-full rounded" />
              <div className="skeleton h-3.5 w-4/5 rounded" />
            </div>
            <div className="flex justify-end">
              <div className="skeleton h-9 w-56 rounded-2xl" />
            </div>
          </div>
        ) : isFresh ? (
          <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center">
            <div className="relative w-16 h-16 mx-auto mb-5">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent/15 to-accent/5" />
              <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 flex items-center justify-center text-accent-hover">
                <Icon name="messageSquare" size={24} />
              </div>
            </div>
            {notConfigured ? (
              <>
                <p className="text-base font-semibold text-ink">Agent is not configured yet</p>
                <p className="text-sm text-ink-faint mt-1.5 max-w-md leading-relaxed">
                  omp is installed but no AI provider is set up. Configure one to start chatting with the coding agent.
                </p>
                <button
                  onClick={() => onOpenSettings?.()}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors"
                >
                  <Icon name="gear" size={14} />
                  Open Agent settings
                </button>
              </>
            ) : (
              <>
                <p className="text-[22px] font-bold tracking-[-0.02em] mb-2 text-ink">What can I help you build?</p>
                <p className="text-[13.5px] text-ink-faint leading-relaxed mb-7">
                  Ask it to fix a bug, refactor code, or explore <span className="text-ink-soft font-medium">{project?.name}</span>.
                </p>
                <div className="grid grid-cols-2 gap-2.5 w-full max-w-md">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => handleSend(suggestion)}
                      disabled={busy}
                      className="text-left text-[12.5px] px-3.5 py-3 rounded-lg border border-border bg-surface-2 text-ink-soft hover:border-accent/50 hover:text-ink leading-snug transition-colors disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="max-w-[760px] mx-auto space-y-[26px]">
            {messages.map((message, index) => (
              <div key={message.id || index} className="message-in" style={{ animationDelay: `${Math.min(index * 30, 150)}ms` }}>
                {message.role === 'user' ? (
                  <UserMessage message={message} isLast={index === lastUserIndex} busy={busy} onSave={handleEditSave} onBranch={handleBranch} />
                ) : (
                  <AssistantMessage message={message} isLast={index === messages.length - 1} busy={busy} onRetry={handleRetry} onBranch={handleBranch} />
                )}
              </div>
            ))}
            {tools.length > 0 && (
              <div className="max-w-[760px] mx-auto">
                {tools.map((tool, index) => <ToolCard key={`tool-${index}`} tool={tool} />)}
              </div>
            )}
            {busy && !streaming && !thinking && tools.length === 0 && (
              <div className="flex items-center gap-1.5 self-start pl-1 pt-1">
                <span className="w-2 h-2 rounded-full bg-ink-faint animate-dot-pulse" />
                <span className="w-2 h-2 rounded-full bg-ink-faint animate-dot-pulse-delay-1" />
                <span className="w-2 h-2 rounded-full bg-ink-faint animate-dot-pulse-delay-2" />
              </div>
            )}
            {thinking && <ThinkingBlock content={thinking} isStreaming />}
            {streaming && (
              <div className="flex gap-[13px]">
                <div className="w-7 h-7 rounded-[7px] bg-accent text-white shadow-[0_0_10px_rgba(109,94,245,.35)] flex items-center justify-center shrink-0 mt-0.5">
                  <Icon name="messageSquare" size={12} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10.5px] font-semibold font-mono uppercase tracking-[0.07em] text-ink-faint">Assistant</span>
                  </div>
                  <div className="text-sm text-ink leading-[1.7]">
                    {streaming.length < MARKDOWN_STREAM_LIMIT ? (
                      <Markdown content={streaming} />
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{streaming}</div>
                    )}
                    <span className="inline-block w-1.5 h-4 bg-accent animate-cursor-blink ml-0.5 align-middle rounded-sm" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Scroll to latest */}
      {!nearBottom && !isFresh && (
        <button
          type="button"
          onClick={() => { scrollToBottom(); setNearBottom(true); }}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border shadow-card backdrop-blur-sm z-10 text-[11px] text-ink-soft hover:text-ink hover:border-border-hover transition-colors"
          title="Jump to latest"
        >
          <Icon name="arrowDown" size={12} />
          Scroll to bottom
        </button>
      )}

      {/* Bash command runner — collapsible terminal blocks per command */}
      {bashRuns.length > 0 && (
        <div className="shrink-0 bg-base px-5 pt-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <Icon name="terminal" size={12} className="text-accent" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Terminal</span>
            <span className="text-[10px] text-ink-faint">runs in {project?.name}</span>
            <button
              type="button"
              onClick={() => setBashRuns([])}
              className="ml-auto text-[10px] text-ink-faint hover:text-ink transition-colors"
            >
              Clear
            </button>
          </div>
          {bashRuns.map((run) => (
            <div key={run.id} className="rounded-xl border border-border bg-surface overflow-hidden">
              <button
                type="button"
                onClick={() => updateBashRun(run.id, { expanded: !run.expanded })}
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
              >
                <span className="text-[11px] font-mono text-ink-soft truncate flex-1">$ {run.command}</span>
                {run.status === 'running' && (
                  <span className="flex items-center gap-1.5 text-[10px] text-warning shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full border-2 border-warning border-t-transparent animate-spin" />
                    running…
                  </span>
                )}
                {run.status === 'cancelling' && <span className="text-[10px] text-ink-faint shrink-0">cancelling…</span>}
                {run.status === 'done' && (
                  <span className={`text-[10px] font-mono shrink-0 ${run.exitCode === 0 ? 'text-success' : 'text-warning'}`}>
                    {run.cancelled ? 'cancelled' : run.timedOut ? 'timed out' : `exit ${run.exitCode ?? '?'}`}
                  </span>
                )}
                {run.status === 'error' && <span className="text-[10px] text-danger shrink-0">failed</span>}
                <Icon name={run.expanded ? 'chevronDown' : 'chevronRight'} size={11} className="text-ink-faint shrink-0" />
              </button>
              {run.status === 'running' && (
                <div className="px-3 pb-2">
                  <button
                    type="button"
                    onClick={() => abortBashRun(run.id)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger bg-danger/10 border border-danger/25 rounded-lg px-2.5 py-1 hover:bg-danger/20 transition-colors"
                  >
                    <Icon name="stop" size={10} />
                    Stop
                  </button>
                </div>
              )}
              {run.expanded && (run.output || run.error) && (
                <pre className="border-t border-border px-3 py-2 text-xs font-mono text-ink-soft whitespace-pre-wrap break-all max-h-64 overflow-auto">
                  {run.error || run.output}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-border bg-base px-5 py-3.5">
        <div className="relative max-w-[760px] mx-auto">
          {busy && (
            <p className="text-[11px] text-accent mb-1.5 flex items-center gap-1.5">
              <Icon name="bolt" size={11} />
              Agent is working — type a message to steer it mid-task.
            </p>
          )}
          <div className={`relative rounded-[13px] border bg-surface-2 px-4 py-2.5 transition-all ${busy ? 'border-border' : 'border-border hover:border-border-hover focus-within:border-border-hover'}`}>
            {attachments.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pb-2.5">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="relative">
                    <img
                      src={attachment.dataUrl}
                      alt={attachment.name}
                      className="w-14 h-14 object-cover rounded-lg border border-border"
                    />
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== attachment.id))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface border border-border shadow-sm flex items-center justify-center text-ink-soft hover:text-danger transition-colors"
                      title="Remove image"
                      aria-label="Remove image"
                    >
                      <Icon name="x" size={10} />
                    </button>
                  </div>
                ))}
                <span className="text-[11px] text-ink-faint ml-auto">{attachments.length}/{MAX_ATTACHMENTS}</span>
              </div>
            )}
            {bashInputOpen && (
              <div className="flex items-center gap-2 pb-2.5">
                <span className="text-xs font-mono text-accent shrink-0">$</span>
                <input
                  autoFocus
                  value={bashCommand}
                  onChange={(event) => setBashCommand(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') { event.preventDefault(); runBash(bashCommand); }
                    if (event.key === 'Escape') setBashInputOpen(false);
                  }}
                  placeholder="Run command in project…"
                  className="flex-1 min-w-0 bg-transparent text-sm font-mono text-ink placeholder:text-ink-faint focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => runBash(bashCommand)}
                  disabled={!bashCommand.trim()}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent hover:bg-accent-hover text-white text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Run
                </button>
              </div>
            )}
            <div className="flex items-end gap-2.5">
              <button
                type="button"
                onClick={() => setBashInputOpen((value) => !value)}
                disabled={busy || notConfigured || !project}
                className="w-7 h-7 shrink-0 rounded-md text-ink-faint hover:text-ink hover:bg-surface-3 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Run command in project"
                aria-label="Run command in project"
              >
                <Icon name="terminal" size={14} />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || notConfigured || !project}
                className="w-7 h-7 shrink-0 rounded-md text-ink-faint hover:text-ink hover:bg-surface-3 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Attach image"
                aria-label="Attach image"
              >
                <Icon name="paperclip" size={14} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  handleFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  saveDraftRef.current?.(event.target.value);
                  resizeInput(event.target);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                onPaste={(event) => {
                  const pasted = Array.from(event.clipboardData?.files || []).filter((file) => file.type?.startsWith('image/'));
                  if (pasted.length > 0) {
                    event.preventDefault();
                    handleFiles(pasted);
                  }
                }}
                rows={1}
                placeholder={notConfigured ? 'Configure a provider to start chatting…' : 'Describe a task, ask a question…'}
                disabled={notConfigured || !project}
                className="flex-1 min-w-0 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none resize-none max-h-[130px] py-1 disabled:opacity-50"
                style={{ overflowY: 'auto' }}
              />
              <button
                onClick={() => handleSend()}
                disabled={(!input.trim() && attachments.length === 0) || notConfigured || !project}
                className="w-[34px] h-[34px] shrink-0 rounded-lg bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <Icon name="upload" size={14} />
              </button>
            </div>
          </div>
          {slashOpen && slashMatches.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-1.5 max-h-56 overflow-auto rounded-xl border border-border bg-surface shadow-card z-30 py-1 dropdown-menu">
              {slashMatches.map((command) => (
                <button
                  key={command.name}
                  type="button"
                  onClick={() => insertSlashCommand(command)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
                >
                  <span className="font-mono text-accent shrink-0">/{command.name}</span>
                  <span className="flex-1 min-w-0 truncate">{command.description || command.input?.hint || ''}</span>
                </button>
              ))}
            </div>
          )}
          {attachments.length > 0 && currentModelVision === false && (
            <p className="text-[11px] text-warning flex items-center gap-1.5 mt-2">
              <Icon name="warn" size={11} />
              The active model may not support images — switch to a vision-capable model from the header.
            </p>
          )}
          <div className="text-center text-[11px] font-mono text-ink-faint mt-2 flex items-center justify-center gap-2 flex-wrap">
            <span><kbd className="px-1 py-0.5 rounded bg-surface-3 border border-border text-[10px]">Enter</kbd> to send · <kbd className="px-1 py-0.5 rounded bg-surface-3 border border-border text-[10px]">Shift+Enter</kbd> newline</span>
            {input.length > 0 && <span className="tabular-nums">{input.length.toLocaleString()} chars</span>}
          </div>
          <div className="text-center text-[10px] text-ink-faint mt-1">Sessions &amp; context are stored by omp locally</div>
        </div>
      </div>
    </div>
  );
}
