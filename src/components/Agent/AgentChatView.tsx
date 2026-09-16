// Presentational layer of the agent chat — renders the header, messages list,
// streaming block, tool cards, bash runner and composer. All state/handlers
// live in AgentChat; this component only wires them into JSX.
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import Icon from '../Common/Icon';
import VirtualList from '../Common/VirtualList';
import { AssistantMessage, UserMessage } from './MessageBubble';
import ChatComposer, { type ComposerAttachment } from './ChatComposer';
import ChatHeader from './ChatHeader';
import LiveTurnBlocks from './LiveTurnBlocks';
import { BashRunnerList, HandoffPopover, HistoryStates, SubagentChips, SystemMessage, TodosPanel } from './agentChatWidgets';
import type {
  BashRun,
  ChatMessage,
  ContextUsage,
  LastTurnInfo,
  ModelOption,
  SlashCommand,
  SubagentInfo,
  TodoPhase,
  TurnBlock,
} from './agentChatTypes';
import type { AgentSession, Project } from '../../types/shared';
import type { OmpStatusResult } from '../../data/agent';
import { useAgentI18n } from './useAgentI18n';
import { useAgentActivity } from './AgentActivity';
import './agentChat.css';
import type { OmpEvent } from './agentChatEvents';

export interface AgentChatViewProps {
  project: Project;
  session: AgentSession;
  status: OmpStatusResult;
  onOpenSettings?: () => void;
  // Header
  busy: boolean;
  activityEvent: OmpEvent | null;
  thinkingLevel: string | null;
  levelOpen: boolean;
  setLevelOpen: Dispatch<SetStateAction<boolean>>;
  handleSetThinkingLevel: (level: string) => void;
  models: ModelOption[];
  modelsOpen: boolean;
  setModelsOpen: Dispatch<SetStateAction<boolean>>;
  modelSearch: string;
  setModelSearch: Dispatch<SetStateAction<string>>;
  filteredModels: ModelOption[];
  currentModelLabel: string | null;
  currentModelRef: string | null;
  handleSelectModel: (ref: string) => void;
  contextPercent: number | null;
  contextUsage: ContextUsage | null;
  /** Per-provider context window from models.yml (overrides omp's default). */
  contextWindowOverride: number | null;
  tokensPerSecond: number | null;
  compacting: boolean;
  retrying: boolean;
  moreOpen: boolean;
  setMoreOpen: Dispatch<SetStateAction<boolean>>;
  handleExport: () => void;
  handleCompact: () => void;
  autoCompaction: boolean;
  toggleAutoCompaction: () => void;
  fastMode: boolean;
  toggleFastMode: () => void;
  autoRetry: boolean;
  toggleAutoRetry: () => void;
  notifyOnFinish: boolean;
  toggleNotifyOnFinish: () => void;
  handleStop: () => void;
  // Handoff popover
  handoffOpen: boolean;
  setHandoffOpen: Dispatch<SetStateAction<boolean>>;
  handoffText: string;
  setHandoffText: Dispatch<SetStateAction<string>>;
  handleHandoff: () => void;
  // Subagents
  subagents: SubagentInfo[];
  // Messages area
  notice: string | null;
  error: string | null;
  todos: TodoPhase[];
  todosOpen: boolean;
  setTodosOpen: Dispatch<SetStateAction<boolean>>;
  historyError: string | null;
  historyRetry: number;
  setHistoryRetry: Dispatch<SetStateAction<number>>;
  historyLoading: boolean;
  isFresh: boolean;
  notConfigured: boolean;
  messages: ChatMessage[];
  lastUserIndex: number;
  handleEditSave: (messageId: string, newText: string) => void;
  handleRetry: (message: ChatMessage) => void;
  handleBranch: (entryId: string) => void;
  /** Ordered text/thinking/tool timeline of the in-progress turn. */
  blocks: TurnBlock[];
  scrollRef: RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  scrollTop: number;
  nearBottom: boolean;
  hasNewResponse: boolean;
  setNearBottom: Dispatch<SetStateAction<boolean>>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  bottomRef: RefObject<HTMLDivElement | null>;
  // Bash runner
  bashRuns: BashRun[];
  setBashRuns: Dispatch<SetStateAction<BashRun[]>>;
  updateBashRun: (runId: string, patch: Partial<BashRun>) => void;
  abortBashRun: (runId: string) => void;
  // Composer
  attachments: ComposerAttachment[];
  setAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
  bashInputOpen: boolean;
  setBashInputOpen: Dispatch<SetStateAction<boolean>>;
  bashCommand: string;
  setBashCommand: Dispatch<SetStateAction<string>>;
  runBash: (command: string) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  saveDraftRef: MutableRefObject<(text: string) => void>;
  resizeInput: (el: HTMLTextAreaElement) => void;
  handleSend: (preset?: string) => void;
  handleRetryDelivery: (message: ChatMessage) => void;
  handleFiles: (fileList: FileList | File[] | null) => void;
  slashOpen: boolean;
  slashMatches: SlashCommand[];
  insertSlashCommand: (command: SlashCommand) => void;
  currentModelVision: boolean | null;
  lastTurn: LastTurnInfo | null;
}

export default function AgentChatView(props: AgentChatViewProps) {
  const {
    project,
    session,
    status,
    onOpenSettings,
    busy,
    thinkingLevel,
    levelOpen,
    setLevelOpen,
    handleSetThinkingLevel,
    models,
    modelsOpen,
    setModelsOpen,
    modelSearch,
    setModelSearch,
    filteredModels,
    currentModelLabel,
    currentModelRef,
    handleSelectModel,
    contextPercent,
    contextUsage,
    contextWindowOverride,
    tokensPerSecond,
    compacting,
    retrying,
    moreOpen,
    setMoreOpen,
    handleExport,
    handleCompact,
    autoCompaction,
    toggleAutoCompaction,
    fastMode,
    toggleFastMode,
    autoRetry,
    toggleAutoRetry,
    notifyOnFinish,
    toggleNotifyOnFinish,
    handleStop,
    handoffOpen,
    setHandoffOpen,
    handoffText,
    setHandoffText,
    handleHandoff,
    subagents,
    notice,
    error,
    todos,
    todosOpen,
    setTodosOpen,
    historyError,
    setHistoryRetry,
    historyLoading,
    isFresh,
    notConfigured,
    messages,
    lastUserIndex,
    handleEditSave,
    handleRetry,
    handleBranch,
    blocks,
    scrollRef,
    handleScroll,
    scrollTop,
    nearBottom,
    hasNewResponse,
    setNearBottom,
    scrollToBottom,
    bottomRef,
    bashRuns,
    setBashRuns,
    updateBashRun,
    abortBashRun,
    attachments,
    setAttachments,
    bashInputOpen,
    setBashInputOpen,
    bashCommand,
    setBashCommand,
    runBash,
    fileInputRef,
    inputRef,
    input,
    setInput,
    saveDraftRef,
    resizeInput,
    handleSend,
    handleRetryDelivery,
    handleFiles,
    slashOpen,
    slashMatches,
    insertSlashCommand,
    currentModelVision,
    lastTurn,
  } = props;
  const t = useAgentI18n();
  const activity = useAgentActivity(project.id, session?.id || '', busy, blocks, retrying, compacting, props.activityEvent);

  return (
    <div className="agent-chat relative flex flex-col flex-1 min-h-0 min-w-0">
      {/* Header */}
      <ChatHeader
        project={project}
        session={session}
        busy={busy}
        status={status}
        thinkingLevel={thinkingLevel}
        levelOpen={levelOpen}
        setLevelOpen={setLevelOpen}
        handleSetThinkingLevel={handleSetThinkingLevel}
        models={models}
        modelsOpen={modelsOpen}
        setModelsOpen={setModelsOpen}
        modelSearch={modelSearch}
        setModelSearch={setModelSearch}
        filteredModels={filteredModels}
        currentModelLabel={currentModelLabel}
        currentModelRef={currentModelRef}
        handleSelectModel={handleSelectModel}
        onOpenSettings={onOpenSettings}
        contextPercent={contextPercent}
        contextUsage={contextUsage}
        contextWindowOverride={contextWindowOverride}
        tokensPerSecond={tokensPerSecond}
        compacting={compacting}
        retrying={retrying}
        moreOpen={moreOpen}
        setMoreOpen={setMoreOpen}
        handleExport={handleExport}
        setHandoffOpen={setHandoffOpen}
        handleCompact={handleCompact}
        autoCompaction={autoCompaction}
        toggleAutoCompaction={toggleAutoCompaction}
        fastMode={fastMode}
        toggleFastMode={toggleFastMode}
        autoRetry={autoRetry}
        toggleAutoRetry={toggleAutoRetry}
        notifyOnFinish={notifyOnFinish}
        toggleNotifyOnFinish={toggleNotifyOnFinish}
        handleStop={handleStop}
      />

      {/* Custom instructions (handoff) popover */}
      <HandoffPopover
        open={handoffOpen}
        text={handoffText}
        setText={setHandoffText}
        onApply={handleHandoff}
        onClose={() => setHandoffOpen(false)}
      />

      {/* Subagent activity chips */}
      <SubagentChips subagents={subagents} />

      {/* Messages */}
      <div
        ref={scrollRef}
        role="region"
        aria-label={t('Conversation')}
        onScroll={handleScroll}
        className="relative flex-1 min-h-0 overflow-auto px-6 pt-7 pb-5 bg-base"
      >
        {(notice || error) && (
          <div className="max-w-[760px] mx-auto space-y-2">
            {notice && (
              <div role="status" className="text-sm px-4 py-3 rounded-xl border border-success/25 bg-success/10 text-success">{notice}</div>
            )}
            {error && (
              <div role="alert" className="text-sm px-4 py-3 rounded-xl border border-danger/25 bg-danger/10 text-danger whitespace-pre-wrap break-words">{t(error)}</div>
            )}
          </div>
        )}
        <HistoryStates
          historyError={historyError}
          historyLoading={historyLoading}
          isFresh={isFresh}
          notConfigured={notConfigured}
          installed={status?.installed}
          project={project}
          busy={busy}
          onRetry={() => setHistoryRetry((n) => n + 1)}
          onOpenSettings={onOpenSettings}
          onSend={handleSend}
        />
        {!historyError && !historyLoading && !isFresh && (
          <div className="max-w-[760px] mx-auto">
            <VirtualList
              items={messages}
              scrollRef={scrollRef}
              scrollTop={scrollTop}
              estimatedHeight={120}
              rowGap={26}
              threshold={400}
              renderItem={(message, index) => (
                <div className="message-in" data-message-id={message.id}>
                  {message.role === 'user' ? (
                    <UserMessage message={message} isLast={index === lastUserIndex} busy={busy} onSave={handleEditSave} onBranch={handleBranch} onRetryDelivery={handleRetryDelivery} />
                  ) : message.role === 'system' ? (
                    <SystemMessage message={message} />
                  ) : (
                    <AssistantMessage message={message} isLast={index === messages.length - 1} busy={busy} onRetry={handleRetry} onBranch={handleBranch} />
                  )}
                </div>
              )}
              getKey={(message, index) => message.id || String(index)}
            />
            <div className="mt-[26px] space-y-[26px]">
              {/* The live turn timeline: text, thinking and tool calls render in
                  their chronological order (a tool card appears right where it
                  happened, between the text segments around it). */}
              {busy && <LiveTurnBlocks blocks={blocks} busy={busy} onRetryDelivery={handleRetryDelivery} />}
              <div ref={bottomRef} />
            </div>
          </div>
        )}
      </div>

      {/* Scroll to latest */}
      {!nearBottom && !isFresh && (
        <button
          type="button"
          onClick={() => { scrollToBottom(); setNearBottom(true); }}
          className="agent-status-in self-center -mt-9 mb-2 shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border shadow-card z-10 text-[11px] text-ink-soft hover:text-ink hover:border-border-hover transition-colors"
          title={t('Jump to latest')}
        >
          <Icon name="arrowDown" size={12} />
          <span aria-live="polite">{t(hasNewResponse ? 'New response ↓' : 'Scroll to bottom')}</span>
        </button>
      )}

      {/* Bash command runner — collapsible terminal blocks per command */}
      <BashRunnerList
        runs={bashRuns}
        projectName={project?.name}
        onUpdateRun={updateBashRun}
        onAbortRun={abortBashRun}
        onClear={() => setBashRuns([])}
      />

      {/* Agent TODO progress — pinned just above the composer so it stays in
          view next to the input instead of scrolling away at the top of the
          history. */}
      <div className="px-5 pt-2 pb-0">
        <div className="max-w-[760px] mx-auto">
          <TodosPanel todos={todos} open={todosOpen} setOpen={setTodosOpen} />
        </div>
      </div>

      {/* Input */}
      <ChatComposer
        busy={busy}
        activity={activity}
        notConfigured={notConfigured}
        unavailableReason={!status?.installed ? t('Install omp in Agent settings to start chatting...') : historyLoading ? t('Loading conversation...') : historyError ? t('Retry loading this conversation before sending.') : undefined}
        project={project}
        attachments={attachments}
        setAttachments={setAttachments}
        bashInputOpen={bashInputOpen}
        setBashInputOpen={setBashInputOpen}
        bashCommand={bashCommand}
        setBashCommand={setBashCommand}
        runBash={runBash}
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
    </div>
  );
}
