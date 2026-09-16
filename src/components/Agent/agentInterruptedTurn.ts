import type { ChatMessage, TurnBlock } from './agentChatTypes';
import { blocksToSegments, blocksToText, blocksToThinking } from './agentChatUtils';

/** Preserve the arrival position of each mid-turn message, even after Stop. */
export function commitInterruptedTurn(prev: ChatMessage[], blocks: TurnBlock[], stopped = false): ChatMessage[] {
  const timelineId = blocks[0].id;
  const next = prev.filter(message => message.timelineId !== timelineId);
  let group: TurnBlock[] = [];
  const flush = () => {
    if (!group.length) return;
    next.push({
      id: group[0].id, timelineId, role: 'assistant',
      content: blocksToText(group), thinking: blocksToThinking(group) || undefined,
      segments: blocksToSegments(group), stopped,
    });
    group = [];
  };
  for (const block of blocks) {
    if (block.kind === 'user') {
      flush();
      if (block.message) next.push({ ...block.message, timelineId });
    } else group.push(block);
  }
  flush();
  return next;
}
