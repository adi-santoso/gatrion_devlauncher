import { useCallback, useEffect, useRef } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import { createOmpEventHandler, type OmpEvent } from './agentChatEvents';
import type { ChatMessage, LastTurnInfo, SlashCommand, SubagentInfo, TodoPhase, TurnBlock } from './agentChatTypes';
import type { Project } from '../../types/shared';

export interface AgentEventsOptions {
  projectRef: React.RefObject<Project | null>;
  handleEventRef: React.RefObject<((event: OmpEvent) => void) | null>;
  lastEventAtRef: React.RefObject<number>;
  streamingBufRef: React.RefObject<string>;
  thinkingBufRef: React.RefObject<string>;
  toolUpdateRef: React.RefObject<{ toolCallId: string; text: string } | null>;
  notifyOnFinish: boolean;
  notifySound: boolean;
  refreshStateRef: React.RefObject<() => void>;
  currentModelRef: string | null;
  blocksRef: React.RefObject<TurnBlock[]>;
  setBlocks: React.Dispatch<React.SetStateAction<TurnBlock[]>>;
  onTokensUsed?: (tokens: number, cost: number) => void;
  setNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setSubagents: React.Dispatch<React.SetStateAction<SubagentInfo[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setTodos: React.Dispatch<React.SetStateAction<TodoPhase[]>>;
  setTodosOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setCommands: React.Dispatch<React.SetStateAction<SlashCommand[]>>;
  setRetrying: React.Dispatch<React.SetStateAction<boolean>>;
  setCompacting: React.Dispatch<React.SetStateAction<boolean>>;
  setBusyState: (value: boolean) => void;
  setLastTurn: React.Dispatch<React.SetStateAction<LastTurnInfo | null>>;
}

/**
 * The live event pipeline: subscribes once to omp events from the main
 * process and re-creates the handler each render (stored in a ref so the
 * subscription always calls the latest). Also owns completion-notification
 * prefs and transient notices. Returns `showNotice` for the action handlers.
 */
export function useAgentEvents({
  projectRef,
  handleEventRef,
  lastEventAtRef,
  streamingBufRef,
  thinkingBufRef,
  toolUpdateRef,
  notifyOnFinish,
  notifySound,
  refreshStateRef,
  currentModelRef,
  blocksRef,
  setBlocks,
  onTokensUsed,
  setNotice,
  setMessages,
  setSubagents,
  setError,
  setTodos,
  setTodosOpen,
  setCommands,
  setRetrying,
  setCompacting,
  setBusyState,
  setLastTurn,
}: AgentEventsOptions) {
  const showNotice = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 3000);
  }, [setNotice]);
  const showNoticeRef = useRef(showNotice);
  showNoticeRef.current = showNotice;

  // Completion-notification prefs (read from config) — kept in a ref so the
  // event handler (recreated every render) always sees the latest value.
  const notifyRef = useRef({ notifyOnFinish: true, notifySound: false });
  notifyRef.current = { notifyOnFinish, notifySound };

  // Live event handler — recreated every render so it closes over fresh state,
  // stored in a ref so the mount-time subscription always calls the latest.
  const handleEvent = createOmpEventHandler({
    setMessages,
    lastEventAtRef,
    streamingBufRef,
    thinkingBufRef,
    toolUpdateRef,
    setBlocks,
    setSubagents,
    setError,
    setTodos,
    setTodosOpen,
    setCommands,
    setRetrying,
    setCompacting,
    setBusyState,
    setLastTurn,
    onTokensUsed,
    showNoticeRef,
    refreshStateRef,
    notifyRef,
    projectRef,
    getCurrentModelRef: () => currentModelRef,
    getBlocksFallback: () => blocksRef.current,
  });
  handleEventRef.current = handleEvent;

  useEffect(() => {
    return ipc.onOmpEvent((payload) => {
      const { projectId, event } = payload as { projectId?: string; event?: OmpEvent };
      if (projectId !== projectRef.current?.id) return;
      handleEventRef.current?.(event as OmpEvent);
    });
  }, [projectRef, handleEventRef]);

  return { showNotice };
}

export interface ChromeEffectsOptions {
  busy: boolean;
  sessionId?: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  modelsOpen: boolean;
  levelOpen: boolean;
  moreOpen: boolean;
  handoffOpen: boolean;
  setNotifyOnFinish: React.Dispatch<React.SetStateAction<boolean>>;
  setNotifySound: React.Dispatch<React.SetStateAction<boolean>>;
  setModelsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setLevelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMoreOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setHandoffOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setModelSearch: React.Dispatch<React.SetStateAction<string>>;
}

/**
 * View-chrome behaviors: focus the composer on session change, load the
 * completion-notification prefs, close dropdowns on Escape, and reset the
 * model search when the picker closes.
 */
export function useAgentChromeEffects({
  busy,
  sessionId,
  inputRef,
  modelsOpen,
  levelOpen,
  moreOpen,
  handoffOpen,
  setNotifyOnFinish,
  setNotifySound,
  setModelsOpen,
  setLevelOpen,
  setMoreOpen,
  setHandoffOpen,
  setModelSearch,
}: ChromeEffectsOptions) {
  // Focus the input when a conversation is opened, ready to type.
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Completion-notification prefs live in config (agent.notifyOnFinish +
  // notifications.sound). Read once on mount so toggles in the header menu
  // can persist and immediately affect the next agent_end.
  useEffect(() => {
    ipc.getConfig().then((result) => {
      if (!result?.success) return;
      setNotifyOnFinish(result.config?.agent?.notifyOnFinish ?? true);
      setNotifySound(result.config?.notifications?.sound ?? false);
    }).catch(() => {});
  }, [setNotifyOnFinish, setNotifySound]);

  // Escape closes the header dropdowns; the search query resets on close.
  useEffect(() => {
    if (!modelsOpen && !levelOpen && !moreOpen && !handoffOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setModelsOpen(false); setLevelOpen(false); setMoreOpen(false); setHandoffOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modelsOpen, levelOpen, moreOpen, handoffOpen, setModelsOpen, setLevelOpen, setMoreOpen, setHandoffOpen]);

  useEffect(() => {
    if (!modelsOpen) setModelSearch('');
  }, [modelsOpen, setModelSearch]);
}