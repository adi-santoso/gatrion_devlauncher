// Pure helpers for the agent chat transcript — merging finished turns into
// the local conversation, normalizing omp context/model data, and filtering
// slash commands. Kept outside the component so they can be unit-tested and
// reused without pulling in React state.
import { blocksToSegments, blocksToText, blocksToThinking, uid, type NormalizedMessage } from './agentChatUtils';
import type { ChatMessage, ContextUsage, ModelOption, SlashCommand, TurnBlock } from './agentChatTypes';

/** Token usage reported on the last transcript entry of an agent_end event. */
export interface TurnUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** Pull prompt/completion/total token counts out of the last entry's usage. */
export function extractTurnUsage(messages: unknown[] | undefined): TurnUsage {
  const last = messages && messages.length > 0 ? messages[messages.length - 1] : undefined;
  const usage = ((last as { usage?: unknown } | undefined)?.usage || {}) as TurnUsage;
  return {
    promptTokens: typeof usage.promptTokens === 'number' ? usage.promptTokens : undefined,
    completionTokens: typeof usage.completionTokens === 'number' ? usage.completionTokens : undefined,
    totalTokens: typeof usage.totalTokens === 'number' ? usage.totalTokens : undefined,
  };
}

export interface MergeFinishedTurnOptions {
  /** The live turn timeline (text/thinking/tool blocks in chronological order). */
  blocks: TurnBlock[];
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface MergeFinishedTurnResult {
  next: ChatMessage[];
  finishedText: string;
  assistantContent: string;
  assistantThinking: string;
}

/**
 * Merge a finished turn (agent_end.messages is TURN-scoped — verified against
 * omp 17.x: the second turn's event only carries that turn's user+assistant
 * messages, not the whole session) into the existing conversation instead of
 * replacing it, or earlier turns vanish.
 */
export function mergeFinishedTurn(
  prev: ChatMessage[],
  turnMessages: NormalizedMessage[],
  options: MergeFinishedTurnOptions,
): MergeFinishedTurnResult {
  const turnUser = turnMessages.filter((item) => item.role === 'user').pop();
  const assistantMessages = turnMessages.filter((item) => item.role === 'assistant');
  const canonicalContent = assistantMessages.map((item) => item.content).join('\n\n');
  const canonicalThinking = assistantMessages.map((item) => item.thinking).filter(Boolean).join('\n\n');
  // The live blocks carry the true chronological order (text and tool calls
  // interleaved). Text content falls back to the canonical transcript when the
  // turn streamed no text (e.g. thinking-only replies, or when the RPC process
  // was respawned mid-turn).
  const blockText = blocksToText(options.blocks);
  const blockThinking = blocksToThinking(options.blocks);
  const assistantContent = blockText || canonicalContent;
  const assistantThinking = blockThinking || canonicalThinking;
  const segments = blocksToSegments(options.blocks);
  const finishedText = assistantContent;

  const next = [...prev];
  if (turnUser) {
    // The current user message is already in the list (appended on send);
    // keep it in place, merging the canonical transcript text in without
    // dropping locally-attached image previews.
    if (next[next.length - 1]?.role === 'user') {
      next[next.length - 1] = { ...next[next.length - 1], ...turnUser, id: next[next.length - 1].id };
    } else {
      next.push(turnUser);
    }
  }
  const lastAssistant = assistantMessages.pop();
  // A tool-only turn (no text streamed) must still commit its tool cards.
  if (assistantContent || segments.length > 0) {
    // A stopped partial reply is replaced by the canonical transcript;
    // otherwise append a fresh assistant message.
    let replaced = false;
    for (let i = next.length - 1; i >= 0; i -= 1) {
      if (next[i].role === 'assistant') {
        if (next[i].stopped) {
          next[i] = {
            ...next[i],
            content: assistantContent,
            thinking: assistantThinking || next[i].thinking,
            segments: segments.length ? segments : next[i].segments,
            stopped: false,
            promptTokens: options.promptTokens,
            completionTokens: options.completionTokens,
            totalTokens: options.totalTokens,
          };
          replaced = true;
        }
        break;
      }
    }
    if (!replaced) {
      next.push({
        id: uid(),
        entryId: lastAssistant?.entryId,
        role: 'assistant',
        content: assistantContent,
        thinking: assistantThinking || undefined,
        segments: segments.length ? segments : undefined,
        promptTokens: options.promptTokens,
        completionTokens: options.completionTokens,
        totalTokens: options.totalTokens,
        createdAt: new Date().toISOString(),
      });
    }
  }
  return { next, finishedText, assistantContent, assistantThinking };
}

/**
 * omp reports contextUsage.percent both as a fraction (0.55 per the RPC docs)
 * and as a raw percentage (30.63) depending on the runtime — normalize either
 * form, then clamp so the indicator can never overflow past 100%.
 */
export function computeContextPercent(usage: ContextUsage | null): number | null {
  if (!usage) return null;
  let ratio = usage.percent;
  if (ratio == null) ratio = usage.contextWindow ? (usage.tokens || 0) / usage.contextWindow : 0;
  const pct = ratio > 1 ? ratio : ratio * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

/** Merge config-declared models (first — they take precedence) with live RPC-discovered ones. */
export function mergeModelOptions(configOptions: ModelOption[], rpcOptions: ModelOption[]): ModelOption[] {
  const seen = new Set<string>();
  return [...configOptions, ...rpcOptions].filter((option) =>
    seen.has(option.ref) ? false : (seen.add(option.ref), true)
  );
}

export interface CurrentModelInfo {
  ref: string | null;
  label: string | null;
  vision: boolean | null;
}

/**
 * config.yml may carry a variant suffix (e.g. "provider/model:high") that is
 * not part of the models.yml id — match on the ref prefix.
 */
export function currentModelInfo(models: ModelOption[], defaultModel: string | null): CurrentModelInfo {
  const ref = defaultModel
    ? models.find((model) => defaultModel === model.ref || defaultModel.startsWith(`${model.ref}:`))?.ref || null
    : null;
  const matched = ref ? models.find((model) => model.ref === ref) : undefined;
  return {
    ref,
    label: matched?.label || defaultModel || null,
    vision: matched?.vision ?? null,
  };
}

export function filterSlashCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  return query
    ? commands.filter((cmd) => `${cmd.name} ${cmd.description || ''}`.toLowerCase().includes(query))
    : commands;
}
