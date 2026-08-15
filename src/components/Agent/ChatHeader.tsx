import type { Dispatch, SetStateAction } from 'react';
import Icon from '../Common/Icon';
import { THINKING_LEVELS } from './agentChatUtils';
import type { ContextUsage, ModelOption } from './agentChatTypes';
import type { AgentSession, Project } from '../../types/shared';
import type { OmpStatusResult } from '../../data/agent';

interface ChatHeaderProps {
  project: Project;
  session: AgentSession;
  busy: boolean;
  status: OmpStatusResult;
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
  onOpenSettings?: () => void;
  contextPercent: number | null;
  contextUsage: ContextUsage | null;
  tokensPerSecond: number | null;
  compacting: boolean;
  retrying: boolean;
  moreOpen: boolean;
  setMoreOpen: Dispatch<SetStateAction<boolean>>;
  handleExport: () => void;
  setHandoffOpen: Dispatch<SetStateAction<boolean>>;
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
}

export default function ChatHeader({
  project,
  session,
  busy,
  status,
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
  onOpenSettings,
  contextPercent,
  contextUsage,
  tokensPerSecond,
  compacting,
  retrying,
  moreOpen,
  setMoreOpen,
  handleExport,
  setHandoffOpen,
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
}: ChatHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-surface shrink-0">
      <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent-hover flex items-center justify-center shrink-0">
        <Icon name="messageSquare" size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink truncate leading-tight">{project?.name || 'Agent'}</p>
        <p className="text-[11px] text-ink-faint truncate">{session?.title || (busy ? 'working…' : 'New conversation')}</p>
      </div>
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {project && status?.installed && status?.configured && (
          <div className="relative hidden lg:block">
            <button
              type="button"
              onClick={() => setLevelOpen((value) => !value)}
              disabled={busy}
              title="Thinking level"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-soft bg-surface-2 border border-border rounded-full px-2.5 py-1 hover:border-border-hover hover:text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="brain" size={11} className="text-warning" />
              <span className="capitalize">{thinkingLevel || 'thinking'}</span>
              <Icon name="chevronDown" size={11} className="text-ink-faint" />
            </button>
            {levelOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setLevelOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-40 rounded-xl border border-border bg-surface shadow-card z-50 py-1">
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Thinking</p>
                  {THINKING_LEVELS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleSetThinkingLevel(value)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                        value === thinkingLevel ? 'text-accent bg-accent/5' : 'text-ink-soft hover:bg-surface-3 hover:text-ink'
                      }`}
                    >
                      <span className="flex-1">{label}</span>
                      {value === thinkingLevel && <Icon name="check" size={12} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {models.length > 0 && (
          <div className="relative hidden lg:block">
            <button
              type="button"
              onClick={() => setModelsOpen((value) => !value)}
              disabled={busy}
              title="Switch model"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-soft bg-surface-2 border border-border rounded-full px-2.5 py-1 hover:border-border-hover hover:text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="bolt" size={11} className="text-accent" />
              <span className="max-w-[150px] truncate font-mono">{currentModelLabel || 'Select model'}</span>
              <Icon name="chevronDown" size={11} className="text-ink-faint" />
            </button>
            {modelsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setModelsOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-72 max-h-96 overflow-hidden rounded-xl border border-border bg-surface shadow-card z-50 flex flex-col">
                  <div className="p-2 border-b border-border shrink-0">
                    <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 focus-within:border-accent/50">
                      <Icon name="search" size={12} className="text-ink-faint" />
                      <input
                        autoFocus
                        value={modelSearch}
                        onChange={(event) => setModelSearch(event.target.value)}
                        placeholder="Search models…"
                        className="flex-1 bg-transparent text-xs text-ink placeholder:text-ink-faint focus:outline-none"
                      />
                      {modelSearch && (
                        <button type="button" onClick={() => setModelSearch('')} className="text-ink-faint hover:text-ink" aria-label="Clear search">
                          <Icon name="x" size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-auto">
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Model · {filteredModels.length}</p>
                    {filteredModels.map((model) => (
                      <button
                        key={model.ref}
                        type="button"
                        onClick={() => handleSelectModel(model.ref)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                          model.ref === currentModelRef ? 'text-accent bg-accent/5' : 'text-ink-soft hover:bg-surface-3 hover:text-ink'
                        }`}
                      >
                        <span className="flex-1 min-w-0 truncate font-mono">{model.label}</span>
                        {model.ref === currentModelRef && <Icon name="check" size={12} />}
                      </button>
                    ))}
                    {filteredModels.length === 0 && (
                      <p className="px-3 py-5 text-xs text-ink-faint text-center">No models match “{modelSearch}”</p>
                    )}
                  </div>
                  <div className="border-t border-border mt-1 pt-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => { setModelsOpen(false); onOpenSettings?.(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-ink-faint hover:text-accent transition-colors"
                    >
                      <Icon name="gear" size={12} />
                      Manage models in Settings…
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        {status?.installed && status?.configured && (
          <span className="hidden xl:inline-flex items-center gap-1.5 text-[11px] text-ink-faint bg-surface-2 border border-border rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            {status.version ? `omp ${status.version}` : 'omp'}
          </span>
        )}
        {contextPercent != null && (
          <div
            className="hidden md:flex items-center gap-1.5 text-[11px]"
            title={`${contextUsage?.tokens?.toLocaleString() || 0} / ${contextUsage?.contextWindow?.toLocaleString() || '?'} tokens in context`}
          >
            <span className="w-14 h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <span
                className={`block h-full rounded-full transition-all ${contextPercent >= 90 ? 'bg-danger' : contextPercent >= 70 ? 'bg-warning' : 'bg-accent'}`}
                style={{ width: `${Math.min(100, contextPercent)}%` }}
              />
            </span>
            <span className={`tabular-nums ${contextPercent >= 90 ? 'text-danger' : contextPercent >= 70 ? 'text-warning' : 'text-ink-faint'}`}>{contextPercent}%</span>
          </div>
        )}
        {busy && tokensPerSecond != null && (
          <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-ink-soft bg-surface-2 border border-border rounded-full px-2.5 py-1 tabular-nums">
            <Icon name="bolt" size={11} className="text-accent" />
            {tokensPerSecond >= 10 ? Math.round(tokensPerSecond) : tokensPerSecond.toFixed(1)} tok/s
          </span>
        )}
        {(compacting || retrying) && (
          <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-warning bg-warning/10 border border-warning/25 rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
            {compacting ? 'Compacting…' : 'Retrying…'}
          </span>
        )}
        {project && status?.installed && status?.configured && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((value) => !value)}
              disabled={busy}
              title="Session options"
              className="w-7 h-7 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-3 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="more" size={14} />
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-60 rounded-xl border border-border bg-surface shadow-card z-50 py-1 dropdown-menu">
                  <button
                    type="button"
                    onClick={handleExport}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
                  >
                    <Icon name="download" size={12} />
                    Export conversation
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMoreOpen(false); setHandoffOpen(true); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
                  >
                    <Icon name="fileText" size={12} />
                    Custom instructions…
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    onClick={handleCompact}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
                  >
                    <Icon name="minimize" size={12} />
                    Compact context
                  </button>
                  <button
                    type="button"
                    onClick={toggleAutoCompaction}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
                  >
                    <Icon name="refreshCw" size={12} />
                    <span className="flex-1">Auto-compact</span>
                    {autoCompaction && <Icon name="check" size={12} className="text-accent" />}
                  </button>
                  <button
                    type="button"
                    onClick={toggleFastMode}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
                  >
                    <Icon name="bolt" size={12} />
                    <span className="flex-1">Fast mode</span>
                    {fastMode && <Icon name="check" size={12} className="text-accent" />}
                  </button>
                  <button
                    type="button"
                    onClick={toggleAutoRetry}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
                  >
                    <Icon name="restart" size={12} />
                    <span className="flex-1">Auto-retry</span>
                    {autoRetry && <Icon name="check" size={12} className="text-accent" />}
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    onClick={toggleNotifyOnFinish}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-soft hover:bg-surface-3 hover:text-ink transition-colors"
                  >
                    <Icon name="bell" size={12} />
                    <span className="flex-1">Notify when finished</span>
                    {notifyOnFinish && <Icon name="check" size={12} className="text-accent" />}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {busy && (
          <button
            onClick={handleStop}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-danger bg-danger/10 border border-danger/25 rounded-full px-3 py-1.5 hover:bg-danger/20 transition-colors"
          >
            <Icon name="stop" size={11} />
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
