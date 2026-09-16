// Renders the in-progress turn's timeline: text, thinking and tool cards in
// their chronological order. Kept as its own presentational component so the
// block ordering logic stays in one place and AgentChatView stays small.
import Icon from '../Common/Icon';
import Markdown from './Markdown';
import ThinkingBlock from './ThinkingBlock';
import ToolCard from './ToolCard';
import { MARKDOWN_STREAM_LIMIT } from './agentChatUtils';
import type { ChatMessage, TurnBlock } from './agentChatTypes';
import { UserMessage } from './MessageBubble';
import { useAgentI18n } from './useAgentI18n';

interface LiveTurnBlocksProps {
  blocks: TurnBlock[];
  busy: boolean;
  onRetryDelivery?: (message: ChatMessage) => void;
}

export default function LiveTurnBlocks({ blocks, busy, onRetryDelivery }: LiveTurnBlocksProps) {
  const t = useAgentI18n();
  // Working indicator while the agent has started but nothing streamed yet.
  if (blocks.length === 0) {
    if (!busy) return null;
    return (
      <div className="flex items-center gap-1.5 self-start pl-1 pt-1">
        <span className="w-2 h-2 rounded-full bg-ink-faint animate-dot-pulse" />
        <span className="w-2 h-2 rounded-full bg-ink-faint animate-dot-pulse-delay-1" />
        <span className="w-2 h-2 rounded-full bg-ink-faint animate-dot-pulse-delay-2" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.kind === 'user') return block.message ? <div key={block.id} className="message-in" data-message-id={block.message.id}><UserMessage message={block.message} isLast={false} busy={busy} onRetryDelivery={onRetryDelivery} /></div> : null;
        if (block.kind === 'tool') {
          return <ToolCard key={block.id} tool={block.tool || { name: 'tool' }} />;
        }
        if (block.kind === 'thinking') {
          return <ThinkingBlock key={block.id} content={block.text} isStreaming={busy && index === blocks.length - 1} />;
        }
        const isLastText = index === blocks.length - 1;
        return (
          <div key={block.id} className="message-in flex gap-[13px]">
            <div className="w-7 h-7 rounded-[7px] bg-accent text-white shadow-[0_0_10px_rgba(109,94,245,.35)] flex items-center justify-center shrink-0 mt-0.5">
              <Icon name="messageSquare" size={12} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10.5px] font-semibold font-mono uppercase tracking-[0.07em] text-ink-faint">{t('Assistant')}</span>
              </div>
              <div className="text-sm text-ink leading-[1.7]">
                {block.text.length < MARKDOWN_STREAM_LIMIT ? (
                  <Markdown content={block.text} />
                ) : (
                  <div className="whitespace-pre-wrap break-words">{block.text}</div>
                )}
                {isLastText && busy && <span aria-hidden="true" className="inline-block w-1.5 h-4 bg-accent animate-cursor-blink ml-0.5 align-middle rounded-sm" />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
