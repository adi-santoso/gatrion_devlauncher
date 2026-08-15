// Pure helpers shared across the agent chat UI. Kept outside the component so
// they can be unit-tested and reused without pulling in React state.
import type { IconName } from '../Common/Icon';

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
}

export const normalizeTranscriptMessage = (item: TranscriptEntry): NormalizedMessage => {
  const { text, thinking } = extractContentParts(item.content);
  return {
    id: item.id || uid(),
    // Real transcript entries carry an omp entry id — used to branch the
    // conversation from this exact message (locally-generated ids lack it).
    entryId: typeof item.id === 'string' ? item.id : undefined,
    role: item.role === 'user' ? 'user' : 'assistant',
    content: text,
    thinking: thinking.trim() || undefined,
  };
};

// Compact a tool call's args into a single-line display string.
export const argsToString = (args: unknown): string => {
  if (typeof args === 'string') return args;
  if (args && typeof args === 'object') return JSON.stringify(args).slice(0, 160);
  return '';
};
