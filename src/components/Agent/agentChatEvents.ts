// omp RPC event handling — a factory that builds the live event handler for
// the AgentChat view. The handler is recreated every render (so it closes over
// fresh state values) but only touches refs/setters, keeping the subscription
// in AgentChat stable across renders.
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import { estimateCost } from '../../utils/costEstimate';
import { argsToString, normalizeTranscriptMessage } from './agentChatUtils';
import { extractTurnUsage, mergeFinishedTurn } from './agentChatMessages';
import type { ChatMessage, ChatTool, LastTurnInfo, SlashCommand, SubagentInfo, TodoPhase } from './agentChatTypes';

/** omp RPC event payload (fields are optional — shapes vary by event type). */
export interface OmpEvent {
  type?: string;
  assistantMessageEvent?: { type?: string; delta?: string };
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  partialResult?: { content?: Array<{ text?: string } | null | undefined> };
  result?: { content?: Array<{ text?: string } | null | undefined> };
  messages?: Array<Record<string, unknown>>;
  message?: string;
  goal?: string;
  phases?: TodoPhase[];
  todoPhases?: TodoPhase[];
  commands?: SlashCommand[];
  error?: string;
  [key: string]: unknown;
}

export interface OmpEventContext {
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  lastEventAtRef: MutableRefObject<number>;
  streamingBufRef: MutableRefObject<string>;
  thinkingBufRef: MutableRefObject<string>;
  toolUpdateRef: MutableRefObject<{ toolCallId: string; text: string } | null>;
  setStreaming: Dispatch<SetStateAction<string>>;
  setThinking: Dispatch<SetStateAction<string>>;
  setTools: Dispatch<SetStateAction<ChatTool[]>>;
  setSubagents: Dispatch<SetStateAction<SubagentInfo[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setTodos: Dispatch<SetStateAction<TodoPhase[]>>;
  setTodosOpen: Dispatch<SetStateAction<boolean>>;
  setCommands: Dispatch<SetStateAction<SlashCommand[]>>;
  setRetrying: Dispatch<SetStateAction<boolean>>;
  setCompacting: Dispatch<SetStateAction<boolean>>;
  setBusyState: (value: boolean) => void;
  setLastTurn: Dispatch<SetStateAction<LastTurnInfo | null>>;
  onTokensUsed?: (tokens: number, cost: number) => void;
  showNoticeRef: MutableRefObject<(text: string) => void>;
  refreshStateRef: MutableRefObject<() => void>;
  notifyRef: MutableRefObject<{ notifyOnFinish: boolean; notifySound: boolean }>;
  projectRef: MutableRefObject<{ id: string; name: string } | null>;
  /** Latest current-model ref (for the token cost estimate at agent_end). */
  getCurrentModelRef: () => string | null;
  /** Flushed streaming text fallback: `streaming.trim() || streamingBufRef.current.trim()`. */
  getStreamingFallback: () => string;
  /** Flushed thinking fallback: `thinking.trim() || thinkingBufRef.current.trim()`. */
  getThinkingFallback: () => string;
}

// Real omp RPC event shapes (verified against omp 17.x on 2026-08):
//   message_update.assistantMessageEvent = { type: 'text_delta', delta }
//   tool_execution_start/update/end = { toolCallId, toolName, args, result }
//   agent_end = { messages: [...full transcript...] }

export function createOmpEventHandler(context: OmpEventContext): (event: OmpEvent) => void {
  const {
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
    getCurrentModelRef,
    getStreamingFallback,
    getThinkingFallback,
  } = context;

  return (event: OmpEvent): void => {
    const type = event?.type || '';
    lastEventAtRef.current = Date.now();
    if (type === 'message_update') {
      const assistantEvent = event.assistantMessageEvent;
      if (!assistantEvent) return;
      if (assistantEvent.type === 'text_delta' && typeof assistantEvent.delta === 'string') {
        streamingBufRef.current += assistantEvent.delta;
      } else if (/think|reason/i.test(assistantEvent.type || '') && typeof assistantEvent.delta === 'string') {
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
        id: event.toolCallId || '',
        name: event.toolName || '',
        arg: argsToString(event.args),
        state: 'running',
        body: '',
      }]);
      return;
    }
    if (type === 'tool_execution_update') {
      const text = event.partialResult?.content?.map((part) => part?.text).filter(Boolean).join('') || '';
      toolUpdateRef.current = { toolCallId: event.toolCallId || '', text };
      return;
    }
    if (type === 'tool_execution_end') {
      const text = event.result?.content?.map((part) => part?.text).filter(Boolean).join('') || '';
      setTools((prev) => {
        const next = [...prev];
        const target = next.filter((item) => item.id === event.toolCallId).pop()
          || (event.toolName ? next.filter((item) => item.name === event.toolName).pop() : undefined);
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
        .map((item) => normalizeTranscriptMessage(item as { id?: string; role?: string; content?: unknown }))
        .filter((item) => item.content.trim() || item.thinking);
      const streamingFallback = getStreamingFallback();
      const thinkingFallback = getThinkingFallback();
      const assistantContent = turnMessages
        .filter((item) => item.role === 'assistant')
        .map((item) => item.content)
        .join('\n\n') || streamingFallback;
      const finishedText = assistantContent;
      const usage = extractTurnUsage(event.messages);
      const cost = estimateCost(getCurrentModelRef(), {
        prompt: usage.promptTokens,
        completion: usage.completionTokens,
        total: usage.totalTokens,
      });
      setLastTurn({ tokens: usage.totalTokens || 0, cost: cost.total });
      onTokensUsed?.(usage.totalTokens || 0, cost.total);
      setMessages((prev) => mergeFinishedTurn(prev, turnMessages, {
        streaming: streamingFallback,
        thinking: thinkingFallback,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      }).next);
      setStreaming('');
      streamingBufRef.current = '';
      setThinking('');
      thinkingBufRef.current = '';
      setSubagents([]);
      setBusyState(false);
      refreshStateRef.current?.();
      // Native notification when the turn completes while the app is not
      // focused (e.g. minimized or another window is active) — opt-out via
      // the header menu, sound follows the global notifications.sound pref.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible' && notifyRef.current.notifyOnFinish) {
        Promise.resolve(ipc.showNotification({
          title: `Agent finished — ${projectRef.current?.name || 'project'}`,
          body: (finishedText || 'The agent completed its turn.').slice(0, 200),
          silent: !notifyRef.current.notifySound,
        })).catch(() => {});
      }
      return;
    }
    if (type === 'todo_reminder') {
      setTodos(Array.isArray(event.phases) ? event.phases : Array.isArray(event.todoPhases) ? event.todoPhases : []);
      setTodosOpen(true);
      return;
    }
    if (type === 'todo_auto_clear') {
      setTodos([]);
      return;
    }
    if (type === 'available_commands_update') {
      if (Array.isArray(event.commands)) setCommands(event.commands);
      return;
    }
    if (type === 'auto_retry_start') { setRetrying(true); return; }
    if (type === 'auto_retry_end') { setRetrying(false); return; }
    if (type === 'auto_compaction_start') { setCompacting(true); return; }
    if (type === 'auto_compaction_end') { setCompacting(false); return; }
    if (type === 'model_changed' || type === 'thinking_level_changed') {
      refreshStateRef.current?.();
      return;
    }
    if (type === 'rpc_error' || type === 'rpc_exit') {
      setBusyState(false);
      if (type === 'rpc_error') setError(event.error || 'Agent process failed');
      return;
    }
  };
}
