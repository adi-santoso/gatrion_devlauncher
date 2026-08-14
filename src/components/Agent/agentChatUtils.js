// Pure helpers shared across the agent chat UI. Kept outside the component so
// they can be unit-tested and reused without pulling in React state.

export const TOOL_ICONS = {
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

export const SUGGESTIONS = [
  'Explain what this project does',
  'Find and fix a bug',
  'Refactor this code',
  'Write tests for the core logic',
];

export const THINKING_LEVELS = [
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

export const uid = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// omp message content can be a plain string or an array of typed blocks
// ({ type: 'text' | 'thinking' | ... }). Split text and reasoning apart so
// thinking can be persisted per message instead of only shown while streaming.
export const extractContentParts = (content) => {
  if (typeof content === 'string') return { text: content, thinking: '' };
  if (Array.isArray(content)) {
    let text = '';
    let thinking = '';
    for (const part of content) {
      if (!part) continue;
      if (part.type === 'text') text += part.text || '';
      else if (/think|reason/i.test(part.type || '')) thinking += part.text || '';
    }
    return { text, thinking };
  }
  return { text: '', thinking: '' };
};

export const normalizeTranscriptMessage = (item) => {
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
export const argsToString = (args) => {
  if (typeof args === 'string') return args;
  if (args && typeof args === 'object') return JSON.stringify(args).slice(0, 160);
  return '';
};
