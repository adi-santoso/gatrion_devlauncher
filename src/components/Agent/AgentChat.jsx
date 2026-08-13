import React, { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../Common/Icon';
import * as ipc from '../../utils/ipcRenderer';
import Markdown from './Markdown';

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

function CopyButton({ text, className = '' }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy message"
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors ${copied ? 'text-success' : 'text-ink-faint hover:text-ink-soft'} ${className}`}
    >
      <Icon name={copied ? 'check' : 'copy'} size={11} />
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

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

function ThinkingBlock({ content }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="my-1.5 rounded-xl border border-border/70 bg-surface-2/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
      >
        <Icon name="spinner" size={12} className="text-ink-faint" />
        <span className="text-xs font-medium text-ink-soft">Thinking</span>
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} className="ml-auto text-ink-faint" />
      </button>
      {expanded && (
        <div className="border-t border-border/60 px-3 py-2 text-xs text-ink-faint italic whitespace-pre-wrap break-words max-h-56 overflow-auto">{content}</div>
      )}
    </div>
  );
}

// Memoized so streaming deltas (which re-render only the streaming block)
// never re-parse/re-render every historical message on each keystroke.
const AssistantMessage = React.memo(function AssistantMessage({ message }) {
  return (
    <div className="group self-start max-w-[96%] w-full">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-5 h-5 rounded-md bg-accent/15 text-accent-hover flex items-center justify-center shrink-0">
          <Icon name="messageSquare" size={11} />
        </span>
        <span className="text-xs font-semibold text-ink-soft">Agent</span>
        <CopyButton text={message.content} className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
      </div>
      <div className="text-sm text-ink leading-relaxed">
        <Markdown content={message.content} />
      </div>
      {message.tools?.length > 0 && <div className="mt-1.5">{message.tools.map((tool, index) => <ToolCard key={index} tool={tool} />)}</div>}
    </div>
  );
});

export default function AgentChat({
  status,
  project,
  session,
  onSessionCreated,
  onBusyChange,
  onTokensUsed,
  onOpenSettings,
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
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const busyRef = useRef(false);
  const lastEventAtRef = useRef(0);
  const sentSessionIdRef = useRef(null);
  // Streaming deltas are buffered and flushed on an interval, so a burst of
  // RPC events never causes a render per delta (which re-parses markdown and
  // could saturate the main thread and freeze the app mid-reply).
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
  projectRef.current = project;
  sessionRef.current = session;

  const setBusyState = (value) => {
    busyRef.current = value;
    setBusy(value);
    onBusyChange?.(value);
  };

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  const handleScroll = () => setNearBottom(isNearBottom());

  // Flush buffered streaming deltas at a bounded rate. The pending text is
  // captured before clearing the ref so the updater closes over a stable
  // string instead of reading the (already cleared) ref when React invokes it.
  useEffect(() => {
    const timer = setInterval(() => {
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
    }, 30);
    return () => clearInterval(timer);
  }, []);

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
    setError(null);
    setNearBottom(true);
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
      setMessages(result.messages.map((item) => ({ role: item.role, content: item.content })));
    }).catch(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [project?.id, session?.id, project?.path]);

  // Live events from the main process — uses refs so the handler always sees
  // the current project/session even though the subscription is created once.
  useEffect(() => {
    return ipc.onOmpEvent(({ projectId, event }) => {
      if (projectId !== projectRef.current?.id) return;
      handleEvent(event);
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
        }));
        const seen = new Set();
        const merged = [...configOptions, ...rpcOptions].filter((option) =>
          seen.has(option.ref) ? false : (seen.add(option.ref), true)
        );
        apply(merged, current);
      }).catch(() => apply(configOptions, current));
      // Read the current thinking level so the header control reflects it.
      ipc.ompGetState(project.id, project.path).then((stateResult) => {
        if (!cancelled && stateResult?.success && stateResult.state?.thinkingLevel) {
          setThinkingLevel(stateResult.state.thinkingLevel);
        }
      }).catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [project?.id, session?.id]);

  // Focus the input when a conversation is opened, ready to type.
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  // Escape closes the header dropdowns; the search query resets on close.
  useEffect(() => {
    if (!modelsOpen && !levelOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') { setModelsOpen(false); setLevelOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modelsOpen, levelOpen]);

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
      setError(null);
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
        .map((item) => ({
          role: item.role === 'user' ? 'user' : 'assistant',
          content: extractText(item.content),
        }))
        .filter((item) => item.content.trim())
      const last = event.messages?.[event.messages.length - 1]
      onTokensUsed?.(last?.usage?.totalTokens || 0)
      setMessages((prev) => {
        const turnUser = turnMessages.filter((item) => item.role === 'user').pop()
        const assistantContent = turnMessages.filter((item) => item.role === 'assistant').map((item) => item.content).join('\n\n') || streaming.trim() || streamingBufRef.current.trim()
        let next = [...prev]
        if (turnUser) {
          // The current user message is already in the list (appended on
          // send); keep it in place, replacing it if the transcript canonicalized it.
          if (next[next.length - 1]?.role === 'user') next[next.length - 1] = turnUser
          else next.push(turnUser)
        }
        if (assistantContent) next.push({ role: 'assistant', content: assistantContent })
        return next
      })
      setStreaming('')
      streamingBufRef.current = ''
      setThinking('')
      thinkingBufRef.current = ''
      setBusyState(false)
      return
    }
    if (type === 'rpc_error' || type === 'rpc_exit') {
      setBusyState(false);
      if (type === 'rpc_error') setError(event.error || 'Agent process failed');
      return;
    }
  };

  // Content can be a plain string or an array of { type: 'text'|'toolCall'|'toolResult' } blocks.
  const extractText = (content) => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map((part) => (part?.type === 'text' ? part.text || '' : '')).join('');
    }
    return '';
  };

  const refreshHistory = () => {
    const currentProject = projectRef.current;
    const currentSession = sessionRef.current;
    if (!currentProject || !currentSession) return;
    ipc.ompGetMessages(currentProject.id, currentProject.path, { sessionPath: currentSession.sessionPath }).then((result) => {
      if (!result?.success) return;
      setMessages(result.messages.map((item) => ({ role: item.role, content: item.content })));
    }).catch(() => {});
  };

  const handleSend = async (preset) => {
    const message = (preset ?? input).trim();
    if (!message || busyRef.current || !project) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setStreaming('');
    setThinking('');
    setTools([]);
    setNearBottom(true);
    setBusyState(true);
    try {
      const result = await ipc.ompChat(project.id, project.path, message, { sessionId: session?.id, sessionPath: session?.sessionPath });
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

  const handleStop = async () => {
    if (project) ipc.ompAbort(project.id, project.path).catch(() => {});
    setBusyState(false);
    setStreaming('');
    streamingBufRef.current = '';
    setThinking('');
    thinkingBufRef.current = '';
  };

  const notConfigured = status?.installed && !status?.configured;
  const isFresh = messages.length === 0 && !streaming && !historyLoading;
  // config.yml may carry a variant suffix (e.g. "provider/model:high") that
  // is not part of the models.yml id — match on the ref prefix.
  const currentModelRef = defaultModel
    ? models.find((m) => defaultModel === m.ref || defaultModel.startsWith(`${m.ref}:`))?.ref || null
    : null;
  const currentModelLabel = models.find((m) => m.ref === currentModelRef)?.label || defaultModel || null;
  const modelQuery = modelSearch.trim().toLowerCase();
  const filteredModels = modelQuery
    ? models.filter((m) => `${m.ref} ${m.label}`.toLowerCase().includes(modelQuery))
    : models;

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

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-auto px-5 py-4 bg-base"
      >
        {historyLoading ? (
          <div className="max-w-3xl mx-auto space-y-5 pt-2">
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
            <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent-hover mb-4">
              <Icon name="messageSquare" size={24} />
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
                <p className="text-base font-semibold text-ink">Chat with the coding agent</p>
                <p className="text-sm text-ink-faint mt-1.5 leading-relaxed">
                  Ask it to fix a bug, refactor code, or explore <span className="text-ink-soft font-medium">{project?.name}</span>.
                </p>
                <div className="mt-5 grid gap-2 w-full max-w-md">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => handleSend(suggestion)}
                      disabled={busy}
                      className="text-left text-[13px] text-ink-soft bg-surface-2 border border-border rounded-xl px-4 py-2.5 hover:bg-surface-3 hover:text-ink hover:border-border-hover transition-colors disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((message, index) => (
              message.role === 'user' ? (
                <div key={index} className="flex justify-end">
                  <div className="max-w-[80%] bg-accent text-white text-sm leading-relaxed px-4 py-2.5 rounded-2xl rounded-br-md whitespace-pre-wrap break-words shadow-sm">
                    {message.content}
                  </div>
                </div>
              ) : (
                <AssistantMessage key={index} message={message} />
              )
            ))}
            {tools.length > 0 && (
              <div className="max-w-3xl mx-auto">
                {tools.map((tool, index) => <ToolCard key={`tool-${index}`} tool={tool} />)}
              </div>
            )}
            {thinking && <ThinkingBlock content={thinking} />}
            {streaming && (
              <div className="group self-start max-w-[96%] w-full">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-5 h-5 rounded-md bg-accent/15 text-accent-hover flex items-center justify-center">
                    <Icon name="messageSquare" size={11} />
                  </span>
                  <span className="text-xs font-semibold text-ink-soft">Agent</span>
                  <span className="text-[11px] text-ink-faint">typing…</span>
                </div>
                <div className="text-sm text-ink leading-relaxed">
                  {streaming.length < MARKDOWN_STREAM_LIMIT ? (
                    <Markdown content={streaming} />
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{streaming}</div>
                  )}
                  <span className="inline-block w-2 h-4 bg-accent align-text-bottom animate-pulse rounded-[2px] ml-0.5" />
                </div>
              </div>
            )}
            {error && (
              <div className="self-start max-w-[96%] text-sm px-4 py-3 rounded-xl border border-danger/25 bg-danger/10 text-danger whitespace-pre-wrap break-words">
                {error}
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
          className="absolute bottom-24 right-6 w-9 h-9 rounded-full bg-surface border border-border shadow-card flex items-center justify-center text-ink-soft hover:text-ink hover:border-border-hover transition-colors"
          title="Jump to latest"
        >
          <Icon name="arrowDown" size={14} />
        </button>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-border bg-surface px-5 py-3.5">
        <div className="max-w-3xl mx-auto">
          <div className={`flex items-end gap-2.5 border rounded-2xl bg-surface-2 px-4 py-2.5 transition-colors ${busy ? 'border-border' : 'border-border hover:border-border-hover focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/20'}`}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                resizeInput(event.target);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder={notConfigured ? 'Configure a provider to start chatting…' : 'Describe a task, ask a question…'}
              disabled={notConfigured || !project || busy}
              className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none resize-none max-h-60 py-1 disabled:opacity-50"
              style={{ overflowY: 'auto' }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || busy || notConfigured || !project}
              className="w-9 h-9 shrink-0 rounded-xl bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              <Icon name="upload" size={14} />
            </button>
          </div>
          <p className="text-[11px] text-ink-faint mt-2 flex items-center gap-2">
            <span><kbd className="px-1 py-0.5 rounded bg-surface-3 border border-border text-[10px]">Enter</kbd> to send · <kbd className="px-1 py-0.5 rounded bg-surface-3 border border-border text-[10px]">Shift+Enter</kbd> newline</span>
            <span className="w-1 h-1 rounded-full bg-ink-faint/60" />
            <span>Sessions & context are stored by omp locally</span>
            <span className="ml-auto tabular-nums">{input.length > 0 ? `${input.length.toLocaleString()} chars` : ''}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
