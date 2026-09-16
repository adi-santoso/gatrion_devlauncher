import { useCallback, useEffect, useRef } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import { fileToAttachment, MAX_ATTACHMENTS, MAX_IMAGE_BYTES } from './imageAttachment';
import { appendStreamedBlock, blocksToSegments, blocksToText, blocksToThinking, uid } from './agentChatUtils';
import type { ComposerAttachment } from './ChatComposer';
import type { ChatImage, ChatMessage, SlashCommand, StreamedPart, TurnBlock } from './agentChatTypes';
import type { AgentSession, Project } from '../../types/shared';
import { commitInterruptedTurn } from './agentInterruptedTurn';

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
  /** Ordered streamed text/thinking deltas awaiting flush (arrival order). */
  streamQueueRef: React.RefObject<StreamedPart[]>;
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
  deliveryId?: string;
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
  streamQueueRef,
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
  const mounted = useRef(true);
  const turnGeneration = useRef(0);
  const delivering = useRef(new Set<string>());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const patchDelivery = (id: string, patch: Partial<ChatMessage>) => {
    setBlocks(previous => previous.map(block => block.message?.id === id ? { ...block, message: { ...block.message, ...patch } } : block));
    setMessages(previous => previous.map(message => message.id === id ? { ...message, ...patch } : message));
  };
  const sendSteering = async (text: string, retryId?: string) => {
    if (retryId && delivering.current.has(retryId)) return;
    const id = retryId || uid();
    delivering.current.add(id);
    const ownerProject = project.id;
    // IDs are unique and patches only touch existing entries. A session switch
    // clears them, while the implicit new-session transition retains them.
    const ownsView = () => mounted.current && projectRef.current?.id === ownerProject;
    const pending = streamQueueRef.current;
    streamQueueRef.current = [];
    setBlocks(previous => {
      const timeline = pending.reduce((list, part) => appendStreamedBlock(list, part.kind, part.text), previous);
      return [...timeline.filter(block => !retryId || block.message?.id !== retryId), {
        id, kind: 'user', text: '', message: { id, role: 'user', content: text, steered: true, delivery: 'sending', createdAt: new Date().toISOString() },
      }];
    });
    if (retryId) setMessages(previous => previous.filter(message => message.id !== retryId));
    try {
      const result = await ipc.ompSteer(project.id, project.path, text);
      if (!result?.success) throw new Error(result?.error || 'Failed to send message');
      if (ownsView()) patchDelivery(id, { delivery: 'sent', deliveryError: undefined });
    } catch (caught) {
      if (ownsView()) patchDelivery(id, { delivery: 'failed', deliveryError: caught instanceof Error ? caught.message : String(caught) });
    } finally { delivering.current.delete(id); }
  };
  // Shared turn runner: appends the user message (unless the caller already
  // placed it, e.g. edit/retry), starts the RPC turn and arms the safety
  // timeout that recovers from silent failures.
  const runTurn = async ({ text, images = [], appendUser = true, deliveryId }: RunTurnOptions): Promise<void> => {
    if (busyRef.current || !project) return;
    const generation = ++turnGeneration.current;
    setError(null);
    if (appendUser) {
      setMessages((prev) => [...prev, {
        id: deliveryId || uid(),
        role: 'user',
        content: text || '',
        images: images.length ? images : undefined,
        createdAt: new Date().toISOString(),
        ...(deliveryId ? { delivery: 'sending' as const } : {}),
      }]);
    }
    setBlocks([]);
    streamQueueRef.current = [];
    setNearBottom(true);
    setBusyState(true);
    const ompImages = images.map((image) => ({ type: 'image', data: image.base64, mimeType: image.mimeType }));
    try {
      const result = await ipc.ompChat(project.id, project.path, text, { sessionId: session?.id, sessionPath: session?.sessionPath, images: ompImages.length ? ompImages : undefined });
      if (!result?.success) {
        if (deliveryId) patchDelivery(deliveryId, { delivery: 'failed', deliveryError: result?.error || 'Failed to send message' });
        setError(result?.error || 'Failed to start conversation');
        setBusyState(false);
        return;
      }
      // Remember the session created by this send so the session-change
      // effect does not reset the live conversation when it appears.
      sentSessionIdRef.current = (result.sessionId as string | undefined) ?? null;
      if (deliveryId) patchDelivery(deliveryId, { delivery: 'sent', deliveryError: undefined });
      onSessionCreated?.(result.sessionId as string, result.session);
    } catch (caught) {
      if (deliveryId) patchDelivery(deliveryId, { delivery: 'failed', deliveryError: caught instanceof Error ? caught.message : String(caught) });
      setError((caught instanceof Error ? caught.message : String(caught)) || 'Failed to start conversation');
      setBusyState(false);
    }
    // Safety: if no agent_end arrives and no events have streamed for a while
    // (event shape mismatch or a silent failure), refresh from omp's own
    // transcript. Only fires when the turn is actually quiet, so long-running
    // generations with live events are never disturbed.
    setTimeout(() => {
      if (mounted.current && generation === turnGeneration.current && projectRef.current?.id === project.id && busyRef.current && Date.now() - lastEventAtRef.current > 8000) {
        void ipc.ompGetState(project.id, project.path).then(result => {
          // A quiet long-running tool is still active. Only the backend can
          // confirm completion; silence alone must not enable a new prompt.
          if (mounted.current && generation === turnGeneration.current && result?.success && result.state?.isStreaming === false && busyRef.current) {
            refreshHistory();
            setBusyState(false);
          }
        }).catch(() => {});
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
      if (attachments.length > 0) {
        setError('Images can be sent after the current turn finishes.');
        return;
      }
      const text = message || 'Here is an attached image — please analyze it.';
      setError(null);
      setInput('');
      saveDraftRef.current?.('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
      await sendSteering(text);
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

  const handleRetryDelivery = async (message: ChatMessage) => {
    if (message.delivery !== 'failed' || delivering.current.has(message.id)) return;
    if (busyRef.current) return sendSteering(message.content, message.id);
    // The running task finished since failure. Retry as a new turn in the same
    // session rather than leaving a steering instruction in an idle queue.
    setMessages(previous => previous.filter(item => item.id !== message.id));
    setBlocks(previous => previous.filter(block => block.message?.id !== message.id));
    await runTurn({ text: message.content, deliveryId: message.id });
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
    const precedingUser = list.slice(0, index).reverse().find((item) => item.role === 'user' && item.delivery !== 'failed');
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
    // Fold any unflushed stream deltas into the blocks in arrival order so a
    // stop preserves the exact partial reply (text and thinking stay
    // chronological, and partial text is not dropped).
    const pending = streamQueueRef.current;
    streamQueueRef.current = [];
    const blocks = pending.reduce<TurnBlock[]>(
      (acc, part) => appendStreamedBlock(acc, part.kind, part.text),
      blocksRef.current,
    );
    const partial = blocksToText(blocks);
    const partialThinking = blocksToThinking(blocks);
    const segments = blocksToSegments(blocks);
    if (blocks.some(block => block.kind === 'user')) {
      setMessages(previous => commitInterruptedTurn(previous, blocks, true));
    } else if (partial || segments.length > 0) {
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
    // Retain the source timeline until agent_end reconciles the stopped turn.
    setBlocks(blocks.some(block => block.kind === 'user') ? blocks : []);
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
  const resizeInput = useCallback((el: HTMLTextAreaElement) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, []);

  return {
    runTurn,
    handleSend,
    handleRetryDelivery,
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
