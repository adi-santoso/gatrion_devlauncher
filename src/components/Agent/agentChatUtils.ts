// Pure helpers shared across the agent chat UI. Kept outside the component so
// they can be unit-tested and reused without pulling in React state.
import type { IconName } from '../Common/Icon';
import type { ChatTool, MessageSegment, TurnBlock } from './agentChatTypes';

export const TOOL_ICONS: Record<string, IconName> = {
  read: 'fileText',
  write: 'code',
  edit: 'code',
  bash: 'terminal',
  grep: 'search',
  glob: 'folder',
  web_search: 'globe',
  github: 'gitBranch',
  lsp: 'code',
  todo: 'check',
};

export const SUGGESTIONS: string[] = [
  'Explain what this project does',
  'Find and fix a bug',
  'Refactor this code',
  'Write tests for the core logic',
];

export const THINKING_LEVELS: Array<[string, string]> = [
  ['off', 'Off'],
  ['minimal', 'Minimal'],
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
  ['xhigh', 'X-High'],
  ['max', 'Max'],
];

// Streaming text above this length renders as plain pre-wrapped text instead
// of live markdown (re-parsing the whole buffer every flush gets too costly).
export const MARKDOWN_STREAM_LIMIT = 12000;

export const uid = (): string => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Strip Electron's IPC wrapping noise ("Error invoking remote method
 * 'omp-get-messages': Error: …") so the underlying failure is readable in the
 * UI. Returns the fallback when nothing usable is extracted.
 */
export const cleanIpcError = (error: unknown, fallback = 'Something went wrong'): string => {
  const raw = error && typeof error === 'object' ? (error as { message?: unknown; error?: unknown }).message || (error as { error?: unknown }).error : error;
  if (!raw || typeof raw !== 'string') return fallback;
  return (
    raw
      .replace(/^Error invoking remote method '[^']+':\s*/i, '')
      .replace(/^Error:\s*/i, '')
      .trim()
      .slice(0, 300) || fallback
  );
};

// omp message content can be a plain string or an array of typed blocks
// ({ type: 'text' | 'thinking' | ... }). Split text and reasoning apart so
// thinking can be persisted per message instead of only shown while streaming.
export const extractContentParts = (content: unknown): { text: string; thinking: string } => {
  if (typeof content === 'string') return { text: content, thinking: '' };
  if (Array.isArray(content)) {
    let text = '';
    let thinking = '';
    for (const part of content) {
      if (!part) continue;
      const block = part as { type?: unknown; text?: unknown };
      if (block.type === 'text') text += block.text || '';
      else if (/think|reason/i.test(String(block.type || ''))) thinking += block.text || '';
    }
    return { text, thinking };
  }
  return { text: '', thinking: '' };
};

export interface TranscriptEntry {
  id?: string;
  role?: string;
  content?: unknown;
  [key: string]: unknown;
}

export interface NormalizedMessage {
  id: string;
  entryId?: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  segments?: MessageSegment[];
}

export const normalizeTranscriptMessage = (item: TranscriptEntry): NormalizedMessage => {
  const { text, thinking } = extractContentParts(item.content);
  const segments = contentPartsToSegments(item.content);
  return {
    id: item.id || uid(),
    // Real transcript entries carry an omp entry id — used to branch the
    // conversation from this exact message (locally-generated ids lack it).
    entryId: typeof item.id === 'string' ? item.id : undefined,
    role: item.role === 'user' ? 'user' : 'assistant',
    content: text,
    thinking: thinking.trim() || undefined,
    // Only carry segments when the entry actually has tool parts — the plain
    // text/thinking case keeps the legacy content/thinking rendering so
    // reloaded history looks exactly as before.
    segments: segments.some((segment) => segment.kind === 'tool') ? segments : undefined,
  };
};

// Build ordered segments from a transcript content array, keeping tool parts
// (best-effort: omp's stored shapes vary) so reloaded history can show tool
// calls in their chronological position, not just text.
const contentPartsToSegments = (content: unknown): MessageSegment[] => {
  if (typeof content === 'string') return [];
  if (!Array.isArray(content)) return [];
  const segments: MessageSegment[] = []
  for (const part of content) {
    if (!part) continue
    const block = part as { type?: unknown; text?: unknown; name?: unknown; toolName?: unknown; tool?: unknown; args?: unknown; input?: unknown; id?: unknown; toolCallId?: unknown }
    const type = String(block.type || '')
    if (type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      segments.push({ kind: 'text', text: block.text })
    } else if (/think|reason/i.test(type) && typeof block.text === 'string' && block.text.trim()) {
      segments.push({ kind: 'thinking', text: block.text })
    } else if (/tool/i.test(type)) {
      segments.push({
        kind: 'tool',
        tool: {
          id: String(block.id || block.toolCallId || `tool-${segments.length}`),
          name: String(block.name || block.toolName || block.tool || 'tool'),
          arg: argsToString(block.args || block.input),
          state: 'done',
        },
      })
    }
  }
  return segments
};

// Compact a tool call's args into a single-line display string.
export const argsToString = (args: unknown): string => {
  if (typeof args === 'string') return args;
  if (args && typeof args === 'object') return JSON.stringify(args).slice(0, 160);
  return '';
};

// ---------------------------------------------------------------------------
// Live turn blocks (ordered text / thinking / tool timeline)
// ---------------------------------------------------------------------------

/** Append text to the last text block, or start a new one after the current blocks. */
export const appendTextBlock = (blocks: TurnBlock[], text: string): TurnBlock[] => {
  if (!text) return blocks;
  const last = blocks[blocks.length - 1];
  if (last && last.kind === 'text') {
    const next = [...blocks];
    next[next.length - 1] = { ...last, text: last.text + text };
    return next;
  }
  return [...blocks, { id: uid(), kind: 'text', text }];
};

/** Append text to the last thinking block, or start a new one after the current blocks. */
export const appendThinkingBlock = (blocks: TurnBlock[], text: string): TurnBlock[] => {
  if (!text) return blocks;
  const last = blocks[blocks.length - 1];
  if (last && last.kind === 'thinking') {
    const next = [...blocks];
    next[next.length - 1] = { ...last, text: last.text + text };
    return next;
  }
  return [...blocks, { id: uid(), kind: 'thinking', text }];
};

/** Patch a tool block by its call id (falls back to name matching when the id is empty). */
export const updateToolBlock = (blocks: TurnBlock[], toolId: string, name: string, patch: Partial<ChatTool>): TurnBlock[] => {
  return blocks.map((block) => {
    if (block.kind !== 'tool') return block;
    const tool = block.tool as ChatTool | null | undefined;
    if (!tool) return block;
    const matches = toolId ? tool.id === toolId : Boolean(name) && tool.name === name;
    return matches ? { ...block, tool: { ...tool, ...patch } } : block;
  });
};

/** Commit the in-progress turn blocks as ordered message segments (text kept, empty ones dropped). */
export const blocksToSegments = (blocks: TurnBlock[]): MessageSegment[] => {
  const segments: MessageSegment[] = [];
  for (const block of blocks) {
    if (block.kind === 'text' && !block.text.trim()) continue;
    if (block.kind === 'tool') {
      if (block.tool) segments.push({ kind: 'tool', tool: block.tool });
      continue;
    }
    segments.push({ kind: block.kind, text: block.text });
  }
  return segments;
};

/** All text content of the turn, in order (newline-joined between segments). */
export const blocksToText = (blocks: TurnBlock[]): string =>
  blocks.filter((block) => block.kind === 'text' && block.text.trim()).map((block) => block.text).join('\n\n');

/** All thinking content of the turn, in order (newline-joined between segments). */
export const blocksToThinking = (blocks: TurnBlock[]): string =>
  blocks.filter((block) => block.kind === 'thinking' && block.text.trim()).map((block) => block.text).join('\n\n');
