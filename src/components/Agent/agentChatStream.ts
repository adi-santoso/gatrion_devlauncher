import { useCallback, useEffect } from 'react';
import type { ChatTool } from './agentChatTypes';

export interface AgentStreamOptions {
  visible: boolean;
  visibleRef: React.RefObject<boolean>;
  streamingBufRef: React.RefObject<string>;
  thinkingBufRef: React.RefObject<string>;
  toolUpdateRef: React.RefObject<{ toolCallId: string; text: string } | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  messages: unknown[];
  streaming: string;
  tools: ChatTool[];
  nearBottom: boolean;
  setStreaming: React.Dispatch<React.SetStateAction<string>>;
  setThinking: React.Dispatch<React.SetStateAction<string>>;
  setTools: React.Dispatch<React.SetStateAction<ChatTool[]>>;
  setScrollTop: React.Dispatch<React.SetStateAction<number>>;
  setNearBottom: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Streaming-buffer flush (render rate cap) plus scroll tracking. Buffered
 * deltas are pushed into state on a 30ms timer so a burst of RPC events never
 * causes a render per delta; while the view is hidden the buffers accumulate
 * without re-rendering, and returning flushes everything at once.
 */
export function useAgentStream({
  visible,
  visibleRef,
  streamingBufRef,
  thinkingBufRef,
  toolUpdateRef,
  scrollRef,
  bottomRef,
  messages,
  streaming,
  tools,
  nearBottom,
  setStreaming,
  setThinking,
  setTools,
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

  // Push whatever accumulated in the streaming buffers into React state. The
  // pending text is captured before clearing the ref so the updater closes
  // over a stable string instead of reading the (already cleared) ref when
  // React invokes it. No-op while the view is hidden. Memoized (all deps are
  // stable refs/setters) so the flush-rate interval is created exactly once.
  const flushBuffers = useCallback(() => {
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
  }, [visibleRef, streamingBufRef, thinkingBufRef, toolUpdateRef, setStreaming, setThinking, setTools]);

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
  }, [messages, streaming, tools, nearBottom, scrollToBottom]);

  return { isNearBottom, scrollToBottom, handleScroll };
}
