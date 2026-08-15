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
import { MARKDOWN_STREAM_LIMIT, SUGGESTIONS } from './agentChatUtils';
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
      {handoffOpen && (
        <div className="relative shrink-0 bg-base px-5 pt-3">
          <div className="max-w-[760px] mx-auto rounded-xl border border-border bg-surface-2 shadow-card p-3">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="fileText" size={13} className="text-accent" />
              <p className="text-xs font-semibold text-ink">Custom instructions</p>
              <span className="text-[10px] text-ink-faint">applied to the next agent response</span>
              <button
                type="button"
                onClick={() => setHandoffOpen(false)}
                className="ml-auto text-ink-faint hover:text-ink flex items-center"
                aria-label="Close instructions"
              >
                <Icon name="x" size={12} />
              </button>
            </div>
            <textarea
              autoFocus
              value={handoffText}
              onChange={(event) => setHandoffText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); handleHandoff(); }
              }}
              rows={2}
              placeholder="e.g. Always explain changes before editing files…"
              className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50 resize-none"
            />
            <div className="flex items-center gap-2 mt-2.5">
              <button
                type="button"
                onClick={handleHandoff}
                disabled={!handoffText.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply
              </button>
              <span className="text-[10px] text-ink-faint">Ctrl/⌘+Enter to apply</span>
            </div>
          </div>
        </div>
      )}

      {/* Subagent activity chips */}
      {subagents.length > 0 && (
        <div className="shrink-0 bg-base px-5 pt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Subagents</span>
          {subagents.map((agent, index) => {
            const agentStatus = agent.status || (typeof agent.progress === 'number' ? (agent.progress < 1 ? 'running' : 'done') : 'idle');
            const running = agentStatus === 'running' || agentStatus === 'in_progress' || agentStatus === 'working';
            const done = agentStatus === 'done' || agentStatus === 'completed';
            return (
              <span
                key={agent.id || agent.name || `sub-${index}`}
                title={agent.task || agent.name || 'subagent'}
                className="inline-flex items-center gap-1.5 text-[11px] text-ink-soft bg-surface-2 border border-border rounded-full px-2.5 py-1"
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${running ? 'bg-warning animate-pulse' : done ? 'bg-success' : 'bg-ink-faint/50'}`} />
                <Icon name="bot" size={11} className="text-accent shrink-0" />
                <span className="max-w-[200px] truncate">{agent.task || agent.name || 'subagent'}</span>
                {typeof agent.progress === 'number' && agent.progress < 1 && (
                  <span className="text-ink-faint tabular-nums">{Math.round(agent.progress * 100)}%</span>
                )}
              </span>
            );
          })}
        </div>
      )}

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
        {todos.length > 0 && (
          <div className="absolute right-4 top-4 z-20 w-64 max-h-[60%] flex flex-col rounded-xl border border-border bg-surface shadow-card overflow-hidden">
            <button
              type="button"
              onClick={() => setTodosOpen((value) => !value)}
              className="flex items-center gap-2 px-3 py-2 text-left border-b border-border bg-surface-2"
            >
              <Icon name="check" size={12} className="text-accent" />
              <span className="text-xs font-semibold text-ink flex-1">Todos</span>
              <span className="text-[10px] text-ink-faint tabular-nums">{todos.reduce((sum, phase) => sum + (phase.tasks?.length || 0), 0)}</span>
              <Icon name={todosOpen ? 'chevronDown' : 'chevronRight'} size={11} className="text-ink-faint" />
            </button>
            {todosOpen && (
              <div className="overflow-auto p-2 space-y-2">
                {todos.map((phase) => (
                  <div key={phase.id}>
                    {phase.name && phase.name !== 'Todos' && (
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint px-1 mb-1">{phase.name}</p>
                    )}
                    {(phase.tasks || []).map((task) => (
                      <div key={task.id} className="flex items-start gap-2 px-1 py-0.5">
                        <span className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${task.status === 'done' ? 'bg-success border-success text-white' : task.status === 'in_progress' ? 'border-accent' : 'border-border'}`}>
                          {task.status === 'done' && <Icon name="check" size={8} />}
                        </span>
                        <span className={`text-xs leading-snug ${task.status === 'done' ? 'text-ink-faint line-through' : task.status === 'in_progress' ? 'text-ink' : 'text-ink-soft'}`}>{task.content}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {historyError ? (
          <div className="max-w-[560px] mx-auto pt-2 px-4">
            <div className="rounded-xl border border-danger/30 bg-danger-soft/40 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 w-6 h-6 rounded-md bg-danger/15 flex items-center justify-center shrink-0">
                  <Icon name="warn" size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">Couldn&apos;t load this conversation</p>
                  <p className="text-xs text-ink-soft mt-0.5 break-words">{historyError}</p>
                  <button
                    type="button"
                    onClick={() => setHistoryRetry((n) => n + 1)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
                  >
                    <Icon name="refreshCw" size={12} />
                    Retry
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : historyLoading ? (
          <div className="max-w-[760px] mx-auto space-y-5 pt-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-md bg-accent/15 flex items-center justify-center">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-accent/40 border-t-transparent animate-spin" />
              </span>
              <span className="text-xs font-semibold text-ink-soft">Loading conversation…</span>
            </div>
            <div className="space-y-1.5">
              <div className="skeleton h-3.5 w-3/4 rounded" />
              <div className="skeleton h-3.5 w-1/2 rounded" />
              <div className="skeleton h-3.5 w-2/3 rounded" />
            </div>
            <div className="flex justify-end">
              <div className="skeleton h-9 w-40 rounded-2xl" />
            </div>
            <div className="space-y-1.5">
              <div className="skeleton h-3.5 w-full rounded" />
              <div className="skeleton h-3.5 w-4/5 rounded" />
            </div>
            <div className="flex justify-end">
              <div className="skeleton h-9 w-56 rounded-2xl" />
            </div>
          </div>
        ) : isFresh ? (
          <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center">
            <div className="relative w-16 h-16 mx-auto mb-5">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent/15 to-accent/5" />
              <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 flex items-center justify-center text-accent-hover">
                <Icon name="messageSquare" size={24} />
              </div>
            </div>
            {notConfigured ? (
              <>
                <p className="text-base font-semibold text-ink">Agent is not configured yet</p>
                <p className="text-sm text-ink-faint mt-1.5 max-w-md leading-relaxed">
                  omp is installed but no AI provider is set up. Configure one to start chatting with the coding agent.
                </p>
                <button
                  onClick={() => onOpenSettings?.()}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors"
                >
                  <Icon name="gear" size={14} />
                  Open Agent settings
                </button>
              </>
            ) : (
              <>
                <p className="text-[22px] font-bold tracking-[-0.02em] mb-2 text-ink">What can I help you build?</p>
                <p className="text-[13.5px] text-ink-faint leading-relaxed mb-7">
                  Ask it to fix a bug, refactor code, or explore <span className="text-ink-soft font-medium">{project?.name}</span>.
                </p>
                <div className="grid grid-cols-2 gap-2.5 w-full max-w-md">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => handleSend(suggestion)}
                      disabled={busy}
                      className="text-left text-[12.5px] px-3.5 py-3 rounded-lg border border-border bg-surface-2 text-ink-soft hover:border-accent/50 hover:text-ink leading-snug transition-colors disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
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
      {bashRuns.length > 0 && (
        <div className="shrink-0 bg-base px-5 pt-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <Icon name="terminal" size={12} className="text-accent" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Terminal</span>
            <span className="text-[10px] text-ink-faint">runs in {project?.name}</span>
            <button
              type="button"
              onClick={() => setBashRuns([])}
              className="ml-auto text-[10px] text-ink-faint hover:text-ink transition-colors"
            >
              Clear
            </button>
          </div>
          {bashRuns.map((run) => (
            <div key={run.id} className="rounded-xl border border-border bg-surface overflow-hidden">
              <button
                type="button"
                onClick={() => updateBashRun(run.id, { expanded: !run.expanded })}
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
              >
                <span className="text-[11px] font-mono text-ink-soft truncate flex-1">$ {run.command}</span>
                {run.status === 'running' && (
                  <span className="flex items-center gap-1.5 text-[10px] text-warning shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full border-2 border-warning border-t-transparent animate-spin" />
                    running…
                  </span>
                )}
                {run.status === 'cancelling' && <span className="text-[10px] text-ink-faint shrink-0">cancelling…</span>}
                {run.status === 'done' && (
                  <span className={`text-[10px] font-mono shrink-0 ${run.exitCode === 0 ? 'text-success' : 'text-warning'}`}>
                    {run.cancelled ? 'cancelled' : run.timedOut ? 'timed out' : `exit ${run.exitCode ?? '?'}`}
                  </span>
                )}
                {run.status === 'error' && <span className="text-[10px] text-danger shrink-0">failed</span>}
                <Icon name={run.expanded ? 'chevronDown' : 'chevronRight'} size={11} className="text-ink-faint shrink-0" />
              </button>
              {run.status === 'running' && (
                <div className="px-3 pb-2">
                  <button
                    type="button"
                    onClick={() => abortBashRun(run.id)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger bg-danger/10 border border-danger/25 rounded-lg px-2.5 py-1 hover:bg-danger/20 transition-colors"
                  >
                    <Icon name="stop" size={10} />
                    Stop
                  </button>
                </div>
              )}
              {run.expanded && (run.output || run.error) && (
                <pre className="border-t border-border px-3 py-2 text-xs font-mono text-ink-soft whitespace-pre-wrap break-all max-h-64 overflow-auto">
                  {run.error || run.output}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

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
