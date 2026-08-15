// omp RPC event handling — a factory that builds the live event handler for
// the AgentChat view. The handler is recreated every render (so it closes over
// fresh state values) but only touches refs/setters, keeping the subscription
// in AgentChat stable across renders.
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import { estimateCost } from '../../utils/costEstimate';
import {
  appendTextBlock,
  appendThinkingBlock,
  argsToString,
  blocksToText,
  normalizeTranscriptMessage,
  uid,
  updateToolBlock,
} from './agentChatUtils';
import { extractTurnUsage, mergeFinishedTurn } from './agentChatMessages';
import type { ChatMessage, ChatTool, LastTurnInfo, SlashCommand, SubagentInfo, TodoPhase, TurnBlock } from './agentChatTypes';

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

// Commit any buffered text/thinking into the timeline before a tool block is
// inserted, so the tool card lands after the text that preceded it (the flush
// interval may not have run yet — e.g. the view is hidden).
const commitPendingBuffers = (
  setBlocks: Dispatch<SetStateAction<TurnBlock[]>>,
  streamingBufRef: MutableRefObject<string>,
  thinkingBufRef: MutableRefObject<string>,
) => {
  const pendingText = streamingBufRef.current;
  if (pendingText) {
    streamingBufRef.current = '';
    setBlocks((prev) => appendTextBlock(prev, pendingText));
  }
  const pendingThinking = thinkingBufRef.current;
  if (pendingThinking) {
    thinkingBufRef.current = '';
    setBlocks((prev) => appendThinkingBlock(prev, pendingThinking));
  }
};

export function createOmpEventHandler(context: OmpEventContext): (event: OmpEvent) => void {
  const {
    setMessages,
    lastEventAtRef,
    streamingBufRef,
    thinkingBufRef,
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
      if (assistantEvent.type === 'text_delta' && typeof assistantEvent.delta === 'string') {
        streamingBufRef.current += assistantEvent.delta;
      } else if (/think|reason/i.test(assistantEvent.type || '') && typeof assistantEvent.delta === 'string') {
        thinkingBufRef.current += assistantEvent.delta;
      }
      return;
    }
    if (type === 'agent_start') {
      streamingBufRef.current = '';
      thinkingBufRef.current = '';
      setBlocks([]);
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
      // Commit buffered text/thinking first so this tool card lands AFTER the
      // text that preceded it in real time, not above the whole reply.
      commitPendingBuffers(setBlocks, streamingBufRef, thinkingBufRef);
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
      setBlocks((prev) => updateToolBlock(prev, toolId, toolName, { state: 'done', body: text.slice(0, 4000) }));
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
      // (and any unflushed tool output) from the merged transcript.
      const pendingText = streamingBufRef.current;
      const pendingThinking = thinkingBufRef.current;
      const pendingTool = toolUpdateRef.current;
      streamingBufRef.current = '';
      thinkingBufRef.current = '';
      toolUpdateRef.current = null;
      let blocks = getBlocksFallback();
      if (pendingText) blocks = appendTextBlock(blocks, pendingText);
      if (pendingThinking) blocks = appendThinkingBlock(blocks, pendingThinking);
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
      streamingBufRef.current = '';
      thinkingBufRef.current = '';
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
