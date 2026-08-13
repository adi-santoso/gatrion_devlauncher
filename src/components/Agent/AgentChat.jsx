import React, { useEffect, useRef, useState } from 'react';
import Icon from '../Common/Icon';
import * as ipc from '../../utils/ipcRenderer';

// Tiny formatter: code blocks, inline code, bold. Everything else stays plain
// so streaming output renders without parsing HTML.
function formatInline(text) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="px-1 py-0.5 rounded bg-surface-3 border border-border text-[10.5px] font-mono text-accent-hover">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function RichText({ content }) {
  const blocks = content.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {blocks.map((block, index) => {
        if (block.startsWith('```') && block.endsWith('```')) {
          const code = block.slice(3, -3).replace(/^[a-zA-Z]+\n/, '');
          return (
            <pre key={index} className="my-2 p-2.5 rounded-lg bg-base border border-border text-[10.5px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
              {code}
            </pre>
          );
        }
        return block.split('\n').map((line, lineIndex) => (
          <p key={`${index}-${lineIndex}`} className="my-1">{formatInline(line) || '\u00A0'}</p>
        ));
      })}
    </>
  );
}

function ToolCard({ tool }) {
  const stateClass = tool.state === 'done' ? 'text-success' : tool.state === 'running' ? 'text-warning' : 'text-ink-faint';
  return (
    <div className="border border-border rounded-lg bg-surface overflow-hidden my-1.5">
      <div className="flex items-center gap-2 px-3 py-1.5 font-mono text-[10.5px] bg-surface-2 border-b border-border">
        <span className="text-accent-hover font-bold">{tool.name}</span>
        <span className="text-ink-soft truncate">{tool.arg || ''}</span>
        <span className={`ml-auto flex items-center gap-1.5 text-[9.5px] font-sans ${stateClass}`}>
          {tool.state === 'running' && <span className="w-2.5 h-2.5 rounded-full border-2 border-warning border-t-transparent animate-spin" />}
          {tool.state === 'done' && <Icon name="check" size={10} />}
          {tool.label || tool.state}
        </span>
      </div>
      {tool.body && <div className="px-3 py-1.5 text-[10.5px] font-mono text-ink-soft whitespace-pre-wrap break-all">{tool.body}</div>}
    </div>
  );
}

const TOOL_NAMES = ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'task', 'eval', 'web_search', 'lsp', 'github', 'todo'];

function MessageView({ message }) {
  if (message.role === 'user') {
    return (
      <div className="self-end max-w-[75%] bg-accent text-white text-xs leading-relaxed px-3.5 py-2 rounded-2xl rounded-br-md whitespace-pre-wrap break-words">
        {message.content}
      </div>
    );
  }
  return (
    <div className="self-start max-w-[94%] text-xs leading-relaxed text-ink">
      <div className="flex items-center gap-1.5 mb-1 text-[10px] text-ink-faint">
        <Icon name="messageSquare" size={11} />
        Agent
      </div>
      <RichText content={message.content} />
      {message.tools?.map((tool, index) => <ToolCard key={index} tool={tool} />)}
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
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [tools, setTools] = useState([]);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const busyRef = useRef(false);
  const projectRef = useRef(project);
  const sessionRef = useRef(session);
  projectRef.current = project;
  sessionRef.current = session;

  const setBusyState = (value) => {
    busyRef.current = value;
    setBusy(value);
    onBusyChange?.(value);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming, tools]);

  // Load history when the active session changes
  useEffect(() => {
    setMessages([]);
    setStreaming('');
    setTools([]);
    setError(null);
    if (!project || !session) return;
    let cancelled = false;
    ipc.ompGetMessages(project.id, project.path, { sessionPath: session.sessionPath }).then((result) => {
      if (cancelled || !result?.success) return;
      const history = result.messages.map((item) => ({ role: item.role, content: item.content }));
      setMessages(history);
    }).catch(() => {});
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
    if (type === 'message_update') {
      const assistantEvent = event.assistantMessageEvent;
      if (assistantEvent?.type === 'text_delta' && typeof assistantEvent.delta === 'string') {
        setStreaming((prev) => prev + assistantEvent.delta);
      }
      return;
    }
    if (type === 'agent_start') {
      setStreaming('');
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
        label: 'running',
        body: '',
      }]);
      return;
    }
    if (type === 'tool_execution_update') {
      const text = event.partialResult?.content?.map((part) => part?.text).filter(Boolean).join('') || '';
      setTools((prev) => {
        const next = [...prev];
        const target = next.filter((item) => item.id === event.toolCallId).pop();
        if (target) target.body = text.slice(0, 300);
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
          target.label = 'done';
          target.body = text.slice(0, 400);
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

  const handleSend = async () => {
    const message = input.trim();
    if (!message || busyRef.current || !project) return;
    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setStreaming('');
    setTools([]);
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
    // Safety: if no agent_end arrives (event shape mismatch), refresh after a delay.
    setTimeout(() => {
      if (busyRef.current) {
        refreshHistory();
        setBusyState(false);
      }
    }, 20000);
  };

  const handleStop = async () => {
    if (project) ipc.ompAbort(project.id, project.path).catch(() => {});
    setBusyState(false);
    setStreaming('');
  };

  const notConfigured = status?.installed && !status?.configured;

  return (
    <div className="flex flex-col min-w-0 h-full">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-surface shrink-0">
        <span className="text-xs font-semibold text-ink">
          {project?.name || 'Agent'}
          <span className="text-ink-faint font-normal ml-2 text-[11px]">{session?.title || (busy ? 'working…' : '')}</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          {status?.installed && status?.configured && (
            <span className="text-[10px] font-mono text-ink-faint bg-surface-2 border border-border rounded-full px-2.5 py-1">
              provider ready
            </span>
          )}
          {busy && (
            <button onClick={handleStop} className="inline-flex items-center gap-1 text-[10px] text-ink-faint hover:text-danger transition-colors">
              <Icon name="stop" size={11} />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-auto px-4 py-3 space-y-3 bg-base">
        {messages.length === 0 && !streaming && (
          <div className="text-center pt-10">
            <div className="w-11 h-11 rounded-full bg-surface-2 border border-border flex items-center justify-center text-ink-faint mx-auto mb-2.5">
              <Icon name="messageSquare" size={18} />
            </div>
            {notConfigured ? (
              <>
                <p className="text-xs font-semibold text-ink">Agent is not configured yet</p>
                <p className="text-[11px] text-ink-faint mt-1 max-w-sm mx-auto leading-relaxed">
                  omp is installed but no AI provider is set up. Configure one to start chatting with the coding agent.
                </p>
                <button
                  onClick={() => ipc.ompOpenDocs()}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors"
                >
                  <Icon name="external" size={12} />
                  Open provider docs
                </button>
              </>
            ) : (
              <p className="text-xs text-ink-faint">Ask the agent to fix a bug, refactor code, or explore this project.</p>
            )}
          </div>
        )}
        {messages.map((message, index) => (
          <MessageView key={index} message={message} />
        ))}
        {tools.length > 0 && (
          <div className="self-start max-w-[94%] w-full">
            {tools.map((tool, index) => <ToolCard key={index} tool={tool} />)}
          </div>
        )}
        {streaming && (
          <div className="self-start max-w-[94%] text-xs leading-relaxed text-ink">
            <div className="flex items-center gap-1.5 mb-1 text-[10px] text-ink-faint">
              <Icon name="messageSquare" size={11} />
              Agent
            </div>
            <RichText content={streaming} />
            <span className="inline-block w-1.5 h-3.5 bg-accent align-text-bottom animate-pulse rounded-[1px]" />
          </div>
        )}
        {error && (
          <div className="self-start max-w-[94%] text-xs px-3 py-2 rounded-lg border border-danger/25 bg-danger/10 text-danger whitespace-pre-wrap break-words">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
        <div className="flex items-end gap-2 border border-border rounded-xl bg-surface-2 px-3 py-2">
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
            disabled={notConfigured || !project}
            className="flex-1 bg-transparent text-xs text-ink placeholder:text-ink-faint focus:outline-none resize-none max-h-28 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || busy || notConfigured || !project}
            className="w-8 h-8 shrink-0 rounded-lg bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <Icon name="upload" size={13} />
          </button>
        </div>
        <p className="text-[9px] text-ink-faint mt-1.5 flex items-center gap-2">
          <span>Enter to send · Shift+Enter newline</span>
          <span className="w-1 h-1 rounded-full bg-ink-faint" />
          <span>Context & sessions are stored by omp locally</span>
        </p>
      </div>
    </div>
  );
}
