// omp RPC event handling — a factory that builds the live event handler for
// the AgentChat view. The handler is recreated every render (so it closes over
// fresh state values) but only touches refs/setters, keeping the subscription
// in AgentChat stable across renders.
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import { estimateCost } from '../../utils/costEstimate';
import {
  appendStreamedBlock,
  argsToString,
  blocksToText,
  blocksToSegments,
  normalizeTranscriptMessage,
  uid,
  updateToolBlock,
} from './agentChatUtils';
import { extractTurnUsage, mergeFinishedTurn } from './agentChatMessages';
import { commitInterruptedTurn } from './agentInterruptedTurn';
import type { ChatMessage, ChatTool, LastTurnInfo, SlashCommand, StreamedPart, SubagentInfo, TodoPhase, TurnBlock } from './agentChatTypes';

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
  /** Ordered streamed text/thinking deltas awaiting flush (arrival order). */
  streamQueueRef: MutableRefObject<StreamedPart[]>;
  toolUpdateRef: MutableRefObject<{ toolCallId: string; text: string } | null>;
  /** The ordered text/thinking/tool timeline of the in-progress turn. */
  setBlocks: Dispatch<SetStateAction<TurnBlock[]>>;
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
  /** The live turn timeline (blocksRef, kept fresh across renders). */
  getBlocksFallback: () => TurnBlock[];
}

// Real omp RPC event shapes (verified against omp 17.x on 2026-08):
//   message_update.assistantMessageEvent = { type: 'text_delta', delta }
//   tool_execution_start/update/end = { toolCallId, toolName, args, result }
//   agent_end = { messages: [...full transcript...] }

// Commit any buffered text/thinking into the timeline in ARRIVAL ORDER before
// a tool block is inserted, so the tool card lands after the text/thinking
// that preceded it (the flush interval may not have run yet — e.g. the view
// is hidden). Each part appends to the last block of its own kind, so a text
// delta separated from earlier text by a thinking block stays on its own text
// block in the correct chronological position.
const commitPendingStream = (
  setBlocks: Dispatch<SetStateAction<TurnBlock[]>>,
  streamQueueRef: MutableRefObject<StreamedPart[]>,
) => {
  if (!streamQueueRef.current.length) return;
  const pending = streamQueueRef.current;
  streamQueueRef.current = [];
  for (const part of pending) {
    setBlocks((prev) => appendStreamedBlock(prev, part.kind, part.text));
  }
};

export function createOmpEventHandler(context: OmpEventContext): (event: OmpEvent) => void {
  const {
    setMessages,
    lastEventAtRef,
    streamQueueRef,
    toolUpdateRef,
    setBlocks,
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
    getBlocksFallback,
  } = context;

  return (event: OmpEvent): void => {
    const type = event?.type || '';
    lastEventAtRef.current = Date.now();
    if (type === 'message_update') {
      const assistantEvent = event.assistantMessageEvent;
      if (!assistantEvent) return;
      // toolcall_* events stream the tool's JSON ARGUMENTS — they are not
      // reply text. Rendering them produced raw JSON like {"path": "."} in the
      // middle of the chat; the tool itself surfaces via tool_execution_*.
      if (/^toolcall/i.test(assistantEvent.type || '')) return;
      if (typeof assistantEvent.delta !== 'string') return;
      // Both text and thinking deltas go into ONE ordered queue so the flush
      // consumes them in arrival order — a text delta arriving after a
      // thinking delta is appended after it, never drawn on top of the
      // thought like a cut-in.
      const kind = /think|reason/i.test(assistantEvent.type || '') ? 'thinking' : 'text';
      streamQueueRef.current.push({ kind, text: assistantEvent.delta });
      return;
    }
    if (type === 'agent_start') {
      // The user can send guidance while the initial RPC prompt is starting.
      // runTurn already cleared the previous turn; do not drop that guidance.
      setBusyState(true);
      setSubagents([]);
      setError(null);
      // A new turn starts a fresh TODO plan — clear the previous turn's list so
      // switching sessions or starting over doesn't show stale todos.
      setTodos([]);
      setTodosOpen(true);
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
      // Commit buffered text/thinking first so this tool card lands AFTER the
      // text that preceded it in real time, not above the whole reply.
      commitPendingStream(setBlocks, streamQueueRef);
      const toolId = event.toolCallId || '';
      const tool: ChatTool = {
        id: toolId,
        name: event.toolName || '',
        arg: argsToString(event.args),
        state: 'running',
        body: '',
      };
      setBlocks((prev) => [...prev, { id: uid(), kind: 'tool', text: '', toolId, tool }]);
      return;
    }
    if (type === 'tool_execution_update') {
      const text = event.partialResult?.content?.map((part) => part?.text).filter(Boolean).join('') || '';
      toolUpdateRef.current = { toolCallId: event.toolCallId || '', text };
      return;
    }
    if (type === 'tool_execution_end') {
      const text = event.result?.content?.map((part) => part?.text).filter(Boolean).join('') || '';
      const toolId = event.toolCallId || '';
      const toolName = event.toolName || '';
      if (toolUpdateRef.current?.toolCallId === toolId) toolUpdateRef.current = null;
      setBlocks((prev) => updateToolBlock(prev, toolId, toolName, { state: event.isError ? 'error' : 'done', body: text.slice(0, 4000) }));
      return;
    }
    if (type === 'agent_end') {
      // agent_end.messages is TURN-scoped (verified against omp 17.x: the
      // second turn's event only carries that turn's user+assistant messages,
      // not the whole session). Merge the finished turn into the existing
      // conversation instead of replacing it, or earlier turns vanish.
      //
      // Fold any deltas still sitting in the 30ms flush window into the
      // blocks first — agent_end can arrive right after the last delta, and
      // discarding the buffers here would drop the final text/thinking chunk
      // (and any unflushed tool output) from the merged transcript. The queue
      // is consumed in ARRIVAL order, and each part appends to the last block
      // of its own kind, so the final chunk lands in the right position.
      const pending = streamQueueRef.current;
      const pendingTool = toolUpdateRef.current;
      streamQueueRef.current = [];
      toolUpdateRef.current = null;
      let blocks = getBlocksFallback();
      for (const part of pending) {
        blocks = appendStreamedBlock(blocks, part.kind, part.text);
      }
      if (pendingTool) blocks = updateToolBlock(blocks, pendingTool.toolCallId, '', { body: pendingTool.text.slice(0, 2000) });
      const turnMessages = (Array.isArray(event.messages) ? event.messages : [])
        .map((item) => normalizeTranscriptMessage(item as { id?: string; role?: string; content?: unknown }))
        .filter((item) => item.content.trim() || item.thinking);
      const blockText = blocksToText(blocks);
      const canonicalText = turnMessages
        .filter((item) => item.role === 'assistant')
        .map((item) => item.content)
        .join('\n\n');
      const finishedText = blockText || canonicalText;
      const usage = extractTurnUsage(event.messages);
      const cost = estimateCost(getCurrentModelRef(), {
        prompt: usage.promptTokens,
        completion: usage.completionTokens,
        total: usage.totalTokens,
      });
      setLastTurn({ tokens: usage.totalTokens || 0, cost: cost.total });
      onTokensUsed?.(usage.totalTokens || 0, cost.total);
      setMessages((prev) => mergeFinishedTurn(prev, turnMessages, {
        blocks,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      }).next);
      streamQueueRef.current = [];
      setBlocks([]);
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
    if (type === 'auto_compaction_start') {
      setCompacting(true);
      return;
    }
    if (type === 'auto_compaction_end') {
      setCompacting(false);
      // Surface the compaction as a notice entry in the chat list so the user
      // can see that history was summarized and roughly how much was dropped.
      const compacted = event.messages || event.summary
        ? (Array.isArray(event.messages) ? event.messages.length : 0)
        : 0;
      setMessages((prev) => [...prev, {
        id: uid(),
        role: 'system',
        kind: 'compact',
        content: 'Context compacted — earlier conversation was summarized to stay within the context window.',
        detail: compacted > 0 ? `${compacted} older message(s) folded into a summary.` : 'Older messages were folded into a summary.',
        createdAt: new Date().toISOString(),
      }]);
      return;
    }
    if (type === 'model_changed' || type === 'thinking_level_changed') {
      refreshStateRef.current?.();
      return;
    }
    if (type === 'rpc_restarting') {
      const delay = typeof event.delayMs === 'number' ? event.delayMs : 1000;
      showNoticeRef.current?.(`Agent process crashed — restarting in ${Math.round(delay / 1000)}s…`);
      return;
    }
    if (type === 'rpc_restarted') {
      showNoticeRef.current?.('Agent process restarted');
      setBusyState(false);
      refreshStateRef.current?.();
      return;
    }
    if (type === 'rpc_error' || type === 'rpc_exit') {
      const pending = streamQueueRef.current;
      streamQueueRef.current = [];
      const partial = pending.reduce((blocks, part) => appendStreamedBlock(blocks, part.kind, part.text), getBlocksFallback());
      if (partial.some(block => block.kind === 'user')) {
        setMessages(previous => commitInterruptedTurn(previous, partial, true));
        setBlocks([]);
      } else if (partial.length) {
        setMessages(previous => [...previous, { id: uid(), role: 'assistant', content: blocksToText(partial), segments: blocksToSegments(partial), stopped: true }]);
        setBlocks([]);
      }
      setBusyState(false);
      if (type === 'rpc_error') setError(event.error || 'Agent process failed');
      return;
    }
  };
}
