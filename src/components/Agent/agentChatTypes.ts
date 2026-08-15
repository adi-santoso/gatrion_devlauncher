import type { AgentSession, Project } from '../../types/shared';
import type { OmpStatusResult } from '../../data/agent';
import type { ImageAttachment } from './imageAttachment';

/** An image attached to a user message (stored with the preview data URL). */
export type ChatImage = Pick<ImageAttachment, 'mimeType' | 'dataUrl' | 'base64'> & { id?: string; name?: string };

/** A chat message in the local transcript (normalized from omp entries). */
export interface ChatMessage {
  id: string;
  entryId?: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  /** Chronological text/thinking/tool segments (present when tools exist). */
  segments?: MessageSegment[];
  images?: ChatImage[];
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  createdAt?: string;
  stopped?: boolean;
  steered?: boolean;
}

/** A tool call rendered as a collapsible card (ToolCard). */
export interface ChatTool {
  id: string;
  name: string;
  arg?: string;
  state: string;
  body?: string;
  [key: string]: unknown;
}

/**
 * A committed segment of an assistant message — the transcript keeps text,
 * thinking and tool calls in their chronological order instead of collapsing
 * them into one blob.
 */
export interface MessageSegment {
  kind: 'text' | 'thinking' | 'tool';
  text?: string;
  tool?: ChatTool;
}

/**
 * A chronological block of the in-progress turn. Text/thinking deltas and
 * tool executions all land in one ordered list so the chat renders them
 * interleaved by time instead of grouping each type together.
 */
export interface TurnBlock {
  id: string;
  kind: 'text' | 'thinking' | 'tool';
  /** Accumulated text (for text/thinking blocks). */
  text: string;
  /** Present for tool blocks. */
  tool?: ChatTool | null;
  /** omp tool call id — used to match update/end events. */
  toolId?: string;
}

/** Model picker option (merged from models.yml + live omp RPC). */
export interface ModelOption {
  ref: string;
  label: string;
  vision: boolean | null;
}

/** Context-usage report from omp get_state. */
export interface ContextUsage {
  percent?: number;
  tokens?: number;
  contextWindow?: number;
  [key: string]: unknown;
}

/** Slash command offered by omp (available_commands). */
export interface SlashCommand {
  name: string;
  description?: string;
  input?: { hint?: string };
  [key: string]: unknown;
}

/** Subagent progress chip. */
export interface SubagentInfo {
  id?: string;
  name?: string;
  task?: string;
  status?: string;
  progress?: number;
  [key: string]: unknown;
}

/** Todo tracking phase (todo_reminder). */
export interface TodoTask {
  id: string;
  content: string;
  status: string;
}

export interface TodoPhase {
  id: string;
  name?: string;
  tasks?: TodoTask[];
  [key: string]: unknown;
}

/** Inline bash command runner entry. */
export interface BashRun {
  id: string;
  command: string;
  status: 'running' | 'done' | 'error' | 'cancelling';
  output: string;
  exitCode: number | null;
  cancelled: boolean;
  timedOut: boolean;
  error: string | null;
  expanded: boolean;
  createdAt: string;
}

/** Token/cost summary of the last finished turn (under the composer). */
export interface LastTurnInfo {
  tokens: number;
  cost: number;
}

export interface AgentChatProps {
  status: OmpStatusResult;
  project: Project;
  session: AgentSession;
  onSessionCreated?: (sessionId: string, session?: AgentSession) => void;
  onBusyChange?: (busy: boolean) => void;
  onTokensUsed?: (tokens: number, cost: number) => void;
  onOpenSettings?: () => void;
  /** False while the user is browsing another menu — the view stays mounted
   * (hidden) so the conversation survives, but streaming must not keep
   * re-rendering at the flush rate while invisible. */
  visible?: boolean;
}
