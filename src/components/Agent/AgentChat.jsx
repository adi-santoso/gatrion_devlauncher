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

function AssistantMessage({ message }) {
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
}

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
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const busyRef = useRef(false);
  const lastEventAtRef = useRef(0);
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

  useEffect(() => {
    if (nearBottom) scrollToBottom('auto');
  }, [messages, streaming, tools, nearBottom, scrollToBottom]);

  // Load history when the active session changes. Existing sessions (those
  // with a sessionPath) show a skeleton until omp returns their transcript;
  // brand-new sessions skip straight to the empty state.
  useEffect(() => {
    setMessages([]);
    setStreaming('');
    setThinking('');
    setTools([]);
    setError(null);
    setNearBottom(true);
    const hasHistory = Boolean(project && session?.sessionPath);
    setHistoryLoading(hasHistory);
    if (!project || !session) return;
    let cancelled = false;
    ipc.ompGetMessages(project.id, project.path, { sessionPath: session.sessionPath }).then((result) => {
      if (cancelled) return;
      setHistoryLoading(false);
      if (!result?.success) return;
      setMessages(result.messages.map((item) => ({ role: item.role, content: item.content })));
    }).catch(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [project?.id, session?.id, project?.path, session?.sessionPath]);

  // Live events from the main process — uses refs so the handler always sees
  // the current project/session even though the subscription is created once.
  useEffect(() => {
    return ipc.onOmpEvent(({ projectId, event }) => {
      if (projectId !== projectRef.current?.id) return;
      handleEvent(event);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setStreaming((prev) => prev + assistantEvent.delta);
      } else if (/think|reason/i.test(assistantEvent.type) && typeof assistantEvent.delta === 'string') {
        setThinking((prev) => prev + assistantEvent.delta);
      }
      return;
    }
    if (type === 'agent_start') {
      setStreaming('');
      setThinking('');
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
      setTools((prev) => {
        const next = [...prev];
        const target = next.filter((item) => item.id === event.toolCallId).pop();
        if (target) target.body = text.slice(0, 2000);
        return next;
      });
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
      if (Array.isArray(event.messages) && event.messages.length > 0) {
        // Authoritative transcript — renders exactly what omp recorded.
        setMessages(event.messages.map((item) => ({
          role: item.role === 'user' ? 'user' : 'assistant',
          content: extractText(item.content),
        })).filter((item) => item.content.trim()));
        const last = event.messages[event.messages.length - 1];
        onTokensUsed?.(last?.usage?.totalTokens || 0);
      } else {
        // Fallback: flush streamed text then refresh via get_messages.
        setStreaming((current) => {
          if (current.trim()) setMessages((prev) => [...prev, { role: 'assistant', content: current }]);
          return '';
        });
        refreshHistory();
      }
      setStreaming('');
      setThinking('');
      setBusyState(false);
      return;
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
    setThinking('');
  };

  const notConfigured = status?.installed && !status?.configured;
  const isFresh = messages.length === 0 && !streaming && !historyLoading;

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
          {status?.installed && status?.configured && (
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-ink-faint bg-surface-2 border border-border rounded-full px-2.5 py-1">
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
                  <Markdown content={streaming} />
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
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder={notConfigured ? 'Configure a provider to start chatting…' : 'Describe a task, ask a question…'}
              disabled={notConfigured || !project || busy}
              className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none resize-none max-h-32 py-1 disabled:opacity-50"
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
          </p>
        </div>
      </div>
    </div>
  );
}
