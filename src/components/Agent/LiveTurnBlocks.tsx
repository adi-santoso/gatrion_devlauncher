// Renders the in-progress turn's timeline: text, thinking and tool cards in
// their chronological order. Kept as its own presentational component so the
// block ordering logic stays in one place and AgentChatView stays small.
import Icon from '../Common/Icon';
import Markdown from './Markdown';
import ThinkingBlock from './ThinkingBlock';
import ToolCard from './ToolCard';
import { MARKDOWN_STREAM_LIMIT } from './agentChatUtils';
import type { TurnBlock } from './agentChatTypes';

interface LiveTurnBlocksProps {
  blocks: TurnBlock[];
  busy: boolean;
}

export default function LiveTurnBlocks({ blocks, busy }: LiveTurnBlocksProps) {
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
    <>
      {blocks.map((block, index) => {
        if (block.kind === 'tool') {
          return <ToolCard key={block.id} tool={block.tool || { name: 'tool' }} />;
        }
        if (block.kind === 'thinking') {
          return <ThinkingBlock key={block.id} content={block.text} isStreaming />;
        }
        const isLastText = index === blocks.length - 1;
        return (
          <div key={block.id} className="flex gap-[13px]">
            <div className="w-7 h-7 rounded-[7px] bg-accent text-white shadow-[0_0_10px_rgba(109,94,245,.35)] flex items-center justify-center shrink-0 mt-0.5">
              <Icon name="messageSquare" size={12} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10.5px] font-semibold font-mono uppercase tracking-[0.07em] text-ink-faint">Assistant</span>
              </div>
              <div className="text-sm text-ink leading-[1.7]">
                {block.text.length < MARKDOWN_STREAM_LIMIT ? (
                  <Markdown content={block.text} />
                ) : (
                  <div className="whitespace-pre-wrap break-words">{block.text}</div>
                )}
                {isLastText && <span className="inline-block w-1.5 h-4 bg-accent animate-cursor-blink ml-0.5 align-middle rounded-sm" />}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
