// Presentational layer of the agent chat — renders the header, messages list,
// streaming block, tool cards, bash runner and composer. All state/handlers
// live in AgentChat; this component only wires them into JSX.
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import Icon from '../Common/Icon';
import VirtualList from '../Common/VirtualList';
import Markdown from './Markdown';
import ThinkingBlock from './ThinkingBlock';
import { AssistantMessage, UserMessage } from './MessageBubble';
import ChatComposer, { type ComposerAttachment } from './ChatComposer';
import ToolCard from './ToolCard';
import ChatHeader from './ChatHeader';
import { MARKDOWN_STREAM_LIMIT } from './agentChatUtils';
import { BashRunnerList, HandoffPopover, HistoryStates, SubagentChips, TodosPanel } from './agentChatWidgets';
import type {
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
import type { OmpStatusResult } from '../../data/agent';

export interface AgentChatViewProps {
  project: Project;
  session: AgentSession;
  status: OmpStatusResult;
  onOpenSettings?: () => void;
  // Header
  busy: boolean;
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
  tools: ChatTool[];
  streaming: string;
  thinking: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  scrollTop: number;
  nearBottom: boolean;
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
    tools,
    streaming,
    thinking,
    scrollRef,
    handleScroll,
    scrollTop,
    nearBottom,
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
    handleFiles,
    slashOpen,
    slashMatches,
    insertSlashCommand,
    currentModelVision,
    lastTurn,
  } = props;

  return (
    <div className="flex flex-col min-w-0 h-full">
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
        onScroll={handleScroll}
        className="relative flex-1 min-h-0 overflow-auto px-6 pt-7 pb-5 bg-base"
      >
        {(notice || error) && (
          <div className="max-w-[760px] mx-auto space-y-2">
            {notice && (
              <div className="text-sm px-4 py-3 rounded-xl border border-success/25 bg-success/10 text-success">{notice}</div>
            )}
            {error && (
              <div className="text-sm px-4 py-3 rounded-xl border border-danger/25 bg-danger/10 text-danger whitespace-pre-wrap break-words">{error}</div>
            )}
          </div>
        )}
        <TodosPanel todos={todos} open={todosOpen} setOpen={setTodosOpen} />
        <HistoryStates
          historyError={historyError}
          historyLoading={historyLoading}
          isFresh={isFresh}
          notConfigured={notConfigured}
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
                <div className="message-in" style={{ animationDelay: `${Math.min(index * 30, 150)}ms` }}>
                  {message.role === 'user' ? (
                    <UserMessage message={message} isLast={index === lastUserIndex} busy={busy} onSave={handleEditSave} onBranch={handleBranch} />
                  ) : (
                    <AssistantMessage message={message} isLast={index === messages.length - 1} busy={busy} onRetry={handleRetry} onBranch={handleBranch} />
                  )}
                </div>
              )}
              getKey={(message, index) => message.id || String(index)}
            />
            <div className="mt-[26px] space-y-[26px]">
              {tools.length > 0 && (
                <div className="max-w-[760px] mx-auto">
                  {tools.map((tool, index) => <ToolCard key={`tool-${index}`} tool={tool} />)}
                </div>
              )}
              {busy && !streaming && !thinking && tools.length === 0 && (
                <div className="flex items-center gap-1.5 self-start pl-1 pt-1">
                  <span className="w-2 h-2 rounded-full bg-ink-faint animate-dot-pulse" />
                  <span className="w-2 h-2 rounded-full bg-ink-faint animate-dot-pulse-delay-1" />
                  <span className="w-2 h-2 rounded-full bg-ink-faint animate-dot-pulse-delay-2" />
                </div>
              )}
              {thinking && <ThinkingBlock content={thinking} isStreaming />}
              {streaming && (
                <div className="flex gap-[13px]">
                  <div className="w-7 h-7 rounded-[7px] bg-accent text-white shadow-[0_0_10px_rgba(109,94,245,.35)] flex items-center justify-center shrink-0 mt-0.5">
                    <Icon name="messageSquare" size={12} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10.5px] font-semibold font-mono uppercase tracking-[0.07em] text-ink-faint">Assistant</span>
                    </div>
                    <div className="text-sm text-ink leading-[1.7]">
                      {streaming.length < MARKDOWN_STREAM_LIMIT ? (
                        <Markdown content={streaming} />
                      ) : (
                        <div className="whitespace-pre-wrap break-words">{streaming}</div>
                      )}
                      <span className="inline-block w-1.5 h-4 bg-accent animate-cursor-blink ml-0.5 align-middle rounded-sm" />
                    </div>
                  </div>
                </div>
              )}
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
          className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border shadow-card backdrop-blur-sm z-10 text-[11px] text-ink-soft hover:text-ink hover:border-border-hover transition-colors"
          title="Jump to latest"
        >
          <Icon name="arrowDown" size={12} />
          Scroll to bottom
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

      {/* Input */}
      <ChatComposer
        busy={busy}
        notConfigured={notConfigured}
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
