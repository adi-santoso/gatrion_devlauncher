import { useCallback, useRef } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import { fileToAttachment, MAX_ATTACHMENTS, MAX_IMAGE_BYTES } from './imageAttachment';
import { blocksToSegments, blocksToText, blocksToThinking, uid } from './agentChatUtils';
import type { ComposerAttachment } from './ChatComposer';
import type { ChatImage, ChatMessage, SlashCommand, TurnBlock } from './agentChatTypes';
import type { AgentSession, Project } from '../../types/shared';

export interface AgentTurnOptions {
  project: Project;
  session: AgentSession | null;
  input: string;
  attachments: ComposerAttachment[];
  busyRef: React.RefObject<boolean>;
  projectRef: React.RefObject<Project | null>;
  sessionRef: React.RefObject<AgentSession | null>;
  messagesRef: React.RefObject<ChatMessage[]>;
  sentSessionIdRef: React.RefObject<string | null>;
  lastEventAtRef: React.RefObject<number>;
  draftsRef: React.RefObject<Record<string, string>>;
  streamingBufRef: React.RefObject<string>;
  thinkingBufRef: React.RefObject<string>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  refreshHistory: () => void;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setAttachments: React.Dispatch<React.SetStateAction<ComposerAttachment[]>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setBlocks: React.Dispatch<React.SetStateAction<TurnBlock[]>>;
  blocksRef: React.RefObject<TurnBlock[]>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setNearBottom: React.Dispatch<React.SetStateAction<boolean>>;
  setBusyState: (value: boolean) => void;
  onSessionCreated?: (sessionId: string, session?: AgentSession) => void;
}

interface RunTurnOptions {
  text: string;
  images?: ChatImage[];
  appendUser?: boolean;
}

/**
 * Owns the send/stop/retry/edit turn execution plus drafts and image
 * attachments. Returns stable (ref-backed) handlers so memoized message
 * components are not re-created during streaming.
 */
export function useAgentTurn({
  project,
  session,
  input,
  attachments,
  busyRef,
  projectRef,
  sessionRef,
  messagesRef,
  sentSessionIdRef,
  lastEventAtRef,
  draftsRef,
  streamingBufRef,
  thinkingBufRef,
  inputRef,
  refreshHistory,
  setInput,
  setAttachments,
  setMessages,
  setBlocks,
  blocksRef,
  setError,
  setNearBottom,
  setBusyState,
  onSessionCreated,
}: AgentTurnOptions) {
  // Shared turn runner: appends the user message (unless the caller already
  // placed it, e.g. edit/retry), starts the RPC turn and arms the safety
  // timeout that recovers from silent failures.
  const runTurn = async ({ text, images = [], appendUser = true }: RunTurnOptions): Promise<void> => {
    if (busyRef.current || !project) return;
    setError(null);
    if (appendUser) {
      setMessages((prev) => [...prev, {
        id: uid(),
        role: 'user',
        content: text || '',
        images: images.length ? images : undefined,
        createdAt: new Date().toISOString(),
      }]);
    }
    setBlocks([]);
    streamingBufRef.current = '';
    thinkingBufRef.current = '';
    setNearBottom(true);
    setBusyState(true);
    const ompImages = images.map((image) => ({ type: 'image', data: image.base64, mimeType: image.mimeType }));
    try {
      const result = await ipc.ompChat(project.id, project.path, text, { sessionId: session?.id, sessionPath: session?.sessionPath, images: ompImages.length ? ompImages : undefined });
      if (!result?.success) {
        setError(result?.error || 'Failed to start conversation');
        setBusyState(false);
        return;
      }
      // Remember the session created by this send so the session-change
      // effect does not reset the live conversation when it appears.
      sentSessionIdRef.current = (result.sessionId as string | undefined) ?? null;
      onSessionCreated?.(result.sessionId as string, result.session);
    } catch (caught) {
      setError((caught instanceof Error ? caught.message : String(caught)) || 'Failed to start conversation');
      setBusyState(false);
    }
    // Safety: if no agent_end arrives and no events have streamed for a while
    // (event shape mismatch or a silent failure), refresh from omp's own
    // transcript. Only fires when the turn is actually quiet, so long-running
    // generations with live events are never disturbed.
    setTimeout(() => {
      if (busyRef.current && Date.now() - lastEventAtRef.current > 8000) {
        refreshHistory();
        setBusyState(false);
      }
    }, 25000);
  };

  // Unsent input is kept per session (see draftsRef). Writing through this
  // ref keeps every caller stable without re-creating memoized handlers.
  const saveDraft = (text: string) => {
    const key = `${projectRef.current?.id}:${sessionRef.current?.id || 'new'}`;
    draftsRef.current[key] = text;
  };
  const saveDraftRef = useRef(saveDraft);
  saveDraftRef.current = saveDraft;

  const handleSend = async (preset?: string) => {
    const message = (preset ?? input).trim();
    if ((!message && attachments.length === 0) || !project) return;
    // While the agent is working, sending steers the running turn with the new
    // instruction instead of starting a fresh one.
    if (busyRef.current) {
      const text = message || 'Here is an attached image — please analyze it.';
      setInput('');
      saveDraftRef.current?.('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
      setMessages((prev) => [...prev, {
        id: uid(),
        role: 'user',
        content: text,
        steered: true,
        createdAt: new Date().toISOString(),
      }]);
      try {
        await ipc.ompSteer(project.id, project.path, text);
      } catch (caught) {
        setError((caught instanceof Error ? caught.message : String(caught)) || 'Failed to steer the agent');
      }
      return;
    }
    // omp expects a text prompt; when only images are attached, use a neutral prompt.
    const text = message || 'Here is an attached image — please analyze it.';
    const images: ChatImage[] = attachments.map((attachment) => ({ dataUrl: attachment.dataUrl, base64: attachment.base64, mimeType: attachment.mimeType }));
    setInput('');
    saveDraftRef.current?.('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setAttachments([]);
    await runTurn({ text, images });
  };

  // runTurnRef keeps the latest runTurn reachable from the memoized
  // edit/retry handlers without re-creating them (which would defeat the
  // AssistantMessage memo during streaming).
  const runTurnRef = useRef(runTurn);
  runTurnRef.current = runTurn;

  // Retry regenerates the last assistant reply by re-asking its prompt. omp
  // transcripts are append-only, so the old turn still exists on disk — proper
  // history rewriting would use omp's branch feature.
  const handleRetry = useCallback(async (message: ChatMessage) => {
    if (busyRef.current || !projectRef.current) return;
    const list = messagesRef.current;
    const index = list.findIndex((item) => item.id === message.id);
    if (index < 0) return;
    const precedingUser = list.slice(0, index).reverse().find((item) => item.role === 'user');
    if (!precedingUser) return;
    setMessages((prev) => prev.filter((item) => item.id !== message.id));
    await runTurnRef.current({
      text: precedingUser.content || 'Here is an attached image — please analyze it.',
      images: precedingUser.images || [],
      appendUser: false,
    });
  }, [busyRef, projectRef, messagesRef, setMessages]);

  // Edit rewrites the (last) user message, drops everything after it, and
  // re-asks with the corrected prompt.
  const handleEditSave = useCallback(async (messageId: string, newText: string) => {
    if (busyRef.current || !projectRef.current) return;
    const list = messagesRef.current;
    const index = list.findIndex((item) => item.id === messageId);
    if (index < 0) return;
    const edited = list[index];
    setMessages((prev) => {
      const next = prev.slice(0, index + 1);
      next[index] = { ...next[index], content: newText };
      return next;
    });
    await runTurnRef.current({ text: newText, images: edited.images || [], appendUser: false });
  }, [busyRef, projectRef, messagesRef, setMessages]);

  const handleStop = async () => {
    if (project) ipc.ompAbort(project.id, project.path).catch(() => {});
    // Keep whatever streamed so far as a marked partial reply (timeline
    // blocks preserved, so tool calls survive a stop) instead of discarding
    // it — a follow-up agent_end replaces it with canonical text.
    const blocks = blocksRef.current;
    const partial = blocksToText(blocks) || streamingBufRef.current.trim();
    const partialThinking = blocksToThinking(blocks) || thinkingBufRef.current.trim();
    const segments = blocksToSegments(blocks);
    if (partial || segments.length > 0) {
      setMessages((prev) => [...prev, {
        id: uid(),
        role: 'assistant',
        content: partial,
        thinking: partialThinking || undefined,
        segments: segments.length ? segments : undefined,
        stopped: true,
      }]);
    }
    setBusyState(false);
    setBlocks([]);
    streamingBufRef.current = '';
    thinkingBufRef.current = '';
  };

  const insertSlashCommand = (command: SlashCommand) => {
    setInput(`/${command.name} `);
    saveDraftRef.current?.(`/${command.name} `);
    if (inputRef.current) inputRef.current.focus();
  };

  const handleFiles = useCallback(async (fileList: FileList | File[] | null) => {
    const files = Array.from(fileList || []).filter((file) => file.type?.startsWith('image/'));
    if (files.length === 0) return;
    const results: ComposerAttachment[] = [];
    for (const file of files) {
      if (file.size > MAX_IMAGE_BYTES) continue;
      try {
        const attachment = await fileToAttachment(file);
        results.push({ ...attachment, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
      } catch { /* unreadable image — skip */ }
    }
    if (results.length === 0) return;
    setAttachments((prev) => [...prev, ...results].slice(0, MAX_ATTACHMENTS));
  }, [setAttachments]);

  // Grow the textarea with its content (up to ~10 lines), then scroll.
  const resizeInput = (el: HTMLTextAreaElement) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  };

  return {
    runTurn,
    handleSend,
    handleRetry,
    handleEditSave,
    handleStop,
    saveDraft,
    saveDraftRef,
    insertSlashCommand,
    handleFiles,
    resizeInput,
  };
}
