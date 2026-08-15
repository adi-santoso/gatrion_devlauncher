import { useRef, useState } from 'react';
import type { ComposerAttachment } from './ChatComposer';
import AgentChatView from './AgentChatView';
import { computeContextPercent, currentModelInfo, filterSlashCommands } from './agentChatMessages';
import { type OmpEvent } from './agentChatEvents';
import { useAgentSessionHistory, useAgentRuntimeData, useAgentSessionState } from './agentChatEffects';
import { useAgentEvents, useAgentChromeEffects } from './agentChatEventHooks';
import { useAgentStream } from './agentChatStream';
import { createAgentControls } from './agentChatControls';
import { useAgentTurn } from './useAgentTurn';
import type {
  AgentChatProps,
  BashRun,
  ChatMessage,
  ChatTool,
  ContextUsage,
  LastTurnInfo,
  ModelOption,
  SlashCommand,
  SubagentInfo,
  TodoPhase,
} from './agentChatTypes';
import type { AgentSession, Project } from '../../types/shared';

export default function AgentChat({
  status,
  project,
  session,
  onSessionCreated,
  onBusyChange,
  onTokensUsed,
  onOpenSettings,
  // False while the user is browsing another menu — the view stays mounted
  // (hidden) so the conversation survives, but streaming must not keep
  // re-rendering at the flush rate while invisible (that starves the
  // renderer and freezes the visible view).
  visible = true,
}: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [thinking, setThinking] = useState('');
  const [tools, setTools] = useState<ChatTool[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Set when loading an existing session's transcript fails (timeout, dead
  // proxy, omp down) so the skeleton is replaced by an actionable error
  // instead of spinning forever. Retry bumps a counter that re-runs the load.
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [nearBottom, setNearBottom] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  // Last finished turn: token count + estimated cost (computed from usage and
  // the active model's list price). Shown under the composer.
  const [lastTurn, setLastTurn] = useState<LastTurnInfo | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState<string | null>(null);
  const [levelOpen, setLevelOpen] = useState(false);
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [autoCompaction, setAutoCompaction] = useState(true);
  const [fastMode, setFastMode] = useState(false);
  const [autoRetry, setAutoRetry] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [todos, setTodos] = useState<TodoPhase[]>([]);
  const [todosOpen, setTodosOpen] = useState(true);
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tokensPerSecond, setTokensPerSecond] = useState<number | null>(null);
  const [subagents, setSubagents] = useState<SubagentInfo[]>([]);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffText, setHandoffText] = useState('');
  const [bashRuns, setBashRuns] = useState<BashRun[]>([]);
  const [bashInputOpen, setBashInputOpen] = useState(false);
  const [bashCommand, setBashCommand] = useState('');
  const [notifyOnFinish, setNotifyOnFinish] = useState(true);
  const [notifySound, setNotifySound] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const busyRef = useRef(false);
  const lastEventAtRef = useRef(0);
  const sentSessionIdRef = useRef<string | null>(null);
  // Streaming deltas are buffered and flushed on an interval, so a burst of
  // RPC events never causes a render per delta (which re-parses markdown and
  // could saturate the main thread and freeze the app mid-reply). While the
  // Agent view is hidden the buffers keep accumulating but are never pushed
  // into state — the chat re-renders only once the user returns (or when
  // agent_end commits the final message), so a background turn cannot freeze
  // whatever menu is on screen.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const streamingBufRef = useRef('');
  const thinkingBufRef = useRef('');
  // Latest tool output update, flushed on the same interval (tool output can
  // stream many chunks per second; each one must not re-render the chat).
  const toolUpdateRef = useRef<{ toolCallId: string; text: string } | null>(null);
  // Short replies get live markdown while typing; anything longer than this is
  // streamed as plain text, because re-parsing a large accumulated document on
  // every flush starves the renderer and freezes the app mid-reply. The final
  // message is always rendered through Markdown once the turn completes.
  const projectRef = useRef<Project | null>(project);
  const sessionRef = useRef<AgentSession | null>(session);
  const messagesRef = useRef(messages);
  const handleEventRef = useRef<((event: OmpEvent) => void) | null>(null);
  // Unsent input is remembered per session so switching away and back does
  // not lose what was being typed (draft per session).
  const draftsRef = useRef<Record<string, string>>({});
  projectRef.current = project;
  sessionRef.current = session;
  messagesRef.current = messages;

  const setBusyState = (value: boolean) => {
    busyRef.current = value;
    setBusy(value);
    onBusyChange?.(value);
  };

  // Session state from get_state: context usage, auto-compaction, fast mode,
  // todo phases. Applied whenever get_state is fetched (mount, poll, events).
  const { applyState, refreshStateRef } = useAgentSessionState({
    projectRef,
    setThinkingLevel,
    setContextUsage,
    setAutoCompaction,
    setFastMode,
    setTodos,
    setTokensPerSecond,
  });

  // Streaming-buffer flush (render rate cap) + scroll tracking.
  const { scrollToBottom, handleScroll } = useAgentStream({
    visible,
    visibleRef,
    streamingBufRef,
    thinkingBufRef,
    toolUpdateRef,
    scrollRef,
    bottomRef,
    messages,
    streaming,
    tools,
    nearBottom,
    setStreaming,
    setThinking,
    setTools,
    setScrollTop,
    setNearBottom,
  });

  // Load history when the active session changes (see useAgentSessionHistory).
  const { refreshHistory } = useAgentSessionHistory({
    projectId: project?.id,
    sessionId: session?.id,
    projectPath: project?.path,
    projectRef,
    sessionRef,
    sentSessionIdRef,
    draftsRef,
    inputRef,
    streamingBufRef,
    setMessages,
    setStreaming,
    setThinking,
    setTools,
    setSubagents,
    setError,
    setHistoryLoading,
    setHistoryError,
    setNearBottom,
    setInput,
    historyRetry,
  });

  // Model list, subagent progress, slash commands, context poll.
  const hasMessages = messages.length > 0;
  useAgentRuntimeData({
    projectId: project?.id,
    sessionId: session?.id,
    projectRef,
    visible,
    busy,
    hasMessages,
    setModels,
    setDefaultModel,
    setSubagents,
    setCommands,
    applyState,
  });

  // Derived values the event handler and header need.
  const currentModel = currentModelInfo(models, defaultModel);
  const currentModelRef = currentModel.ref;
  const currentModelLabel = currentModel.label;
  const currentModelVision = currentModel.vision;

  // Live event pipeline: subscription + handler + notices (see useAgentEvents).
  const { showNotice } = useAgentEvents({
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
    streaming,
    thinking,
    onTokensUsed,
    setNotice,
    setMessages,
    setStreaming,
    setThinking,
    setTools,
    setSubagents,
    setError,
    setTodos,
    setTodosOpen,
    setCommands,
    setRetrying,
    setCompacting,
    setBusyState,
    setLastTurn,
  });

  // View chrome: input focus, notify prefs, Escape, model search reset.
  useAgentChromeEffects({
    busy,
    sessionId: session?.id,
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
  });

  // Turn execution (send/retry/edit/stop), drafts and attachments.
  const {
    handleSend,
    handleRetry,
    handleEditSave,
    handleStop,
    saveDraftRef,
    insertSlashCommand,
    handleFiles,
    resizeInput,
  } = useAgentTurn({
    project,
    session,
    input,
    streaming,
    thinking,
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
    setStreaming,
    setThinking,
    setTools,
    setError,
    setNearBottom,
    setBusyState,
    onSessionCreated,
  });

  // Header / "more" menu / bash / branch handlers (see agentChatControls).
  const controls = createAgentControls({
    project,
    session,
    projectRef,
    sessionRef,
    showNotice,
    setMessages,
    setError,
    setMoreOpen,
    setAutoCompaction,
    autoCompaction,
    setFastMode,
    fastMode,
    setAutoRetry,
    autoRetry,
    setNotifyOnFinish,
    notifyOnFinish,
    setHandoffOpen,
    handoffText,
    setHandoffText,
    setBashRuns,
    setBashCommand,
    setBashInputOpen,
    setLevelOpen,
    setThinkingLevel,
    thinkingLevel,
    setModelsOpen,
    setDefaultModel,
    currentModelRef,
  });

  const notConfigured = Boolean(status?.installed && !status?.configured);
  const isFresh = messages.length === 0 && !streaming && !historyLoading;
  // Index of the most recent user message — the only one that can be edited.
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') { lastUserIndex = i; break; }
  }
  const modelQuery = modelSearch.trim().toLowerCase();
  const filteredModels = modelQuery
    ? models.filter((model) => `${model.ref} ${model.label}`.toLowerCase().includes(modelQuery))
    : models;

  const contextPercent = computeContextPercent(contextUsage);
  // Slash-command palette: shown while typing a / command without a space.
  const slashOpen = input.startsWith('/') && !input.includes(' ') && input.length > 1;
  const slashQuery = slashOpen ? input.slice(1).toLowerCase() : '';
  const slashMatches = filterSlashCommands(commands, slashQuery);

  return (
    <AgentChatView
      project={project}
      session={session}
      status={status}
      onOpenSettings={onOpenSettings}
      busy={busy}
      thinkingLevel={thinkingLevel}
      levelOpen={levelOpen}
      setLevelOpen={setLevelOpen}
      handleSetThinkingLevel={controls.handleSetThinkingLevel}
      models={models}
      modelsOpen={modelsOpen}
      setModelsOpen={setModelsOpen}
      modelSearch={modelSearch}
      setModelSearch={setModelSearch}
      filteredModels={filteredModels}
      currentModelLabel={currentModelLabel}
      currentModelRef={currentModelRef}
      handleSelectModel={controls.handleSelectModel}
      contextPercent={contextPercent}
      contextUsage={contextUsage}
      tokensPerSecond={tokensPerSecond}
      compacting={compacting}
      retrying={retrying}
      moreOpen={moreOpen}
      setMoreOpen={setMoreOpen}
      handleExport={controls.handleExport}
      handleCompact={controls.handleCompact}
      autoCompaction={autoCompaction}
      toggleAutoCompaction={controls.toggleAutoCompaction}
      fastMode={fastMode}
      toggleFastMode={controls.toggleFastMode}
      autoRetry={autoRetry}
      toggleAutoRetry={controls.toggleAutoRetry}
      notifyOnFinish={notifyOnFinish}
      toggleNotifyOnFinish={controls.toggleNotifyOnFinish}
      handleStop={handleStop}
      handoffOpen={handoffOpen}
      setHandoffOpen={setHandoffOpen}
      handoffText={handoffText}
      setHandoffText={setHandoffText}
      handleHandoff={controls.handleHandoff}
      subagents={subagents}
      notice={notice}
      error={error}
      todos={todos}
      todosOpen={todosOpen}
      setTodosOpen={setTodosOpen}
      historyError={historyError}
      historyRetry={historyRetry}
      setHistoryRetry={setHistoryRetry}
      historyLoading={historyLoading}
      isFresh={isFresh}
      notConfigured={notConfigured}
      messages={messages}
      lastUserIndex={lastUserIndex}
      handleEditSave={handleEditSave}
      handleRetry={handleRetry}
      handleBranch={controls.handleBranch}
      tools={tools}
      streaming={streaming}
      thinking={thinking}
      scrollRef={scrollRef}
      handleScroll={handleScroll}
      scrollTop={scrollTop}
      nearBottom={nearBottom}
      setNearBottom={setNearBottom}
      scrollToBottom={scrollToBottom}
      bottomRef={bottomRef}
      bashRuns={bashRuns}
      setBashRuns={setBashRuns}
      updateBashRun={controls.updateBashRun}
      abortBashRun={controls.abortBashRun}
      attachments={attachments}
      setAttachments={setAttachments}
      bashInputOpen={bashInputOpen}
      setBashInputOpen={setBashInputOpen}
      bashCommand={bashCommand}
      setBashCommand={setBashCommand}
      runBash={controls.runBash}
      fileInputRef={fileInputRef}
      inputRef={inputRef}
      input={input}
      setInput={setInput}
      saveDraftRef={saveDraftRef}
      resizeInput={resizeInput}
      handleSend={handleSend}
      handleFiles={handleFiles}
      slashOpen={slashOpen}
      slashMatches={slashMatches}
      insertSlashCommand={insertSlashCommand}
      currentModelVision={currentModelVision}
      lastTurn={lastTurn}
    />
  );
}
