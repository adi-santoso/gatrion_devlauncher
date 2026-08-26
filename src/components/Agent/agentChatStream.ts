import { useCallback, useEffect } from 'react';
import { appendStreamedBlock, updateToolBlock } from './agentChatUtils';
import type { StreamedPart, TurnBlock } from './agentChatTypes';

export interface AgentStreamOptions {
  visible: boolean;
  visibleRef: React.RefObject<boolean>;
  /** Ordered streamed text/thinking deltas awaiting flush (arrival order). */
  streamQueueRef: React.RefObject<StreamedPart[]>;
  toolUpdateRef: React.RefObject<{ toolCallId: string; text: string } | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  messages: unknown[];
  blocks: TurnBlock[];
  nearBottom: boolean;
  setBlocks: React.Dispatch<React.SetStateAction<TurnBlock[]>>;
  setScrollTop: React.Dispatch<React.SetStateAction<number>>;
  setNearBottom: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Streaming-buffer flush (render rate cap) plus scroll tracking. Buffered
 * deltas are pushed into the ordered turn timeline on a 30ms timer so a burst
 * of RPC events never causes a render per delta; while the view is hidden the
 * buffers accumulate without re-rendering, and returning flushes everything at
 * once.
 */
export function useAgentStream({
  visible,
  visibleRef,
  streamQueueRef,
  toolUpdateRef,
  scrollRef,
  bottomRef,
  messages,
  blocks,
  nearBottom,
  setBlocks,
  setScrollTop,
  setNearBottom,
}: AgentStreamOptions) {
  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, [scrollRef]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, [bottomRef]);

  const handleScroll = () => {
    setScrollTop(scrollRef.current?.scrollTop || 0);
    setNearBottom(isNearBottom());
  };

  // Push whatever accumulated in the streaming queue into the turn timeline.
  // The pending parts are captured before clearing the ref so the updater
  // closes over a stable array instead of reading the (already cleared) ref
  // when React invokes it. Parts are consumed in ARRIVAL ORDER and each one
  // appends to the last block of its own kind, so text/thinking that
  // interleave stay chronological (a late text delta never jumps above a
  // thought block). No-op while the view is hidden. Memoized (all deps are
  // stable refs/setters) so the flush-rate interval is created exactly once.
  const flushBuffers = useCallback(() => {
    if (!visibleRef.current) return;
    const pending = streamQueueRef.current;
    if (pending.length) {
      streamQueueRef.current = [];
      for (const part of pending) {
        setBlocks((prev) => appendStreamedBlock(prev, part.kind, part.text));
      }
    }
    if (toolUpdateRef.current) {
      const { toolCallId, text } = toolUpdateRef.current;
      toolUpdateRef.current = null;
      setBlocks((prev) => updateToolBlock(prev, toolCallId, '', { body: text.slice(0, 2000) }));
    }
  }, [visibleRef, streamQueueRef, toolUpdateRef, setBlocks]);

  // Flush buffered streaming deltas at a bounded rate (render rate cap).
  useEffect(() => {
    const timer = setInterval(flushBuffers, 30);
    return () => clearInterval(timer);
  }, [flushBuffers]);

  // Returning to the Agent view shows everything that streamed while hidden
  // in a single render instead of replaying it chunk by chunk.
  useEffect(() => {
    if (visible) flushBuffers();
  }, [visible, flushBuffers]);

  useEffect(() => {
    if (nearBottom) scrollToBottom('auto');
  }, [messages, blocks, nearBottom, scrollToBottom]);

  return { isNearBottom, scrollToBottom, handleScroll };
}
