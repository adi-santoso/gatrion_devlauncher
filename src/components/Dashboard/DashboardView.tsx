import { useState, useMemo, useEffect } from 'react';
import ProjectCard, { type ViewProject } from './ProjectCard';
import PresetCard from './PresetCard';
import CrashBanner from '../ProjectDetail/CrashBanner';
import { getWorkspaceControlMode } from '../../utils/workspaceResults';
import type { ActivityItem } from '../../hooks/useActivities';
import type { Preset } from '../../types/shared';
import type { ProcessLogLine, ProcessStartResult } from '../../data/processes';

export interface WorkspaceActionComplete {
  action: string;
  completed: number;
  failed: number;
}

export interface MetricSample {
  t: number;
  cpu: number | null;
  memory: number | null;
}

/** Activity items rendered in the feed may carry optional id/detail. */
export type FeedActivity = ActivityItem & { id?: string | number; detail?: string };

interface DashboardViewProps {
  recentActivity?: FeedActivity[];
  projects?: ViewProject[];
  latestOutput?: ProcessLogLine[];
  onOpenModal?: (modal: string) => void;
  onNavigate?: (projectOrView: ViewProject | string) => void;
  onStop?: (project: ViewProject) => void;
  onStart?: (project: ViewProject) => unknown;
  onRestart?: (project: ViewProject) => void;
  onStartAll?: (projects: ViewProject[]) => Promise<ProcessStartResult[] | { success: boolean; error?: string }>;
  onStopAll?: (projects: ViewProject[]) => Promise<unknown>;
  onWorkspaceActionComplete?: (result: WorkspaceActionComplete) => void;
  presets?: Preset[];
  onStartPreset?: (preset: Preset) => Promise<unknown>;
  onStopPreset?: (preset: Preset) => Promise<unknown>;
  onRestartPreset?: (preset: Preset) => Promise<unknown>;
  onEditPreset?: (preset: Preset) => void;
  onDuplicatePreset?: (preset: Preset) => void;
  onDeletePreset?: (preset: Preset) => void;
  onMovePreset?: (presetId: string, direction: number) => void;
  onCreatePreset?: () => void;
  getMetricHistory?: (projectId: string) => MetricSample[];
}

const stripAnsi = (value: unknown): string => typeof value === 'string'
  ? value.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
  : '';

interface FormattedLog {
  message: string;
  time: string;
  type: string;
  projectName?: string;
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));

const formatLog = (log: ProcessLogLine | string): FormattedLog => {
  if (typeof log === 'string') return { message: stripAnsi(log), time: '', type: '' };
  if (!log) return { message: '', time: '', type: '' };
  const text = log.message ?? log.text;
  return {
    message: stripAnsi(asString(text) || String(log)),
    time: log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : asString(log.time),
    type: asString(log.type || log.level).toLowerCase(),
    projectName: asString(log.projectName),
  };
};

const logTimestamp = (log: ProcessLogLine): number => {
  const timestamp = log?.timestamp ? Date.parse(String(log.timestamp)) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const errorSignature = (project: ViewProject): string => `${project.startedAt || 'unknown'}:${project.errorMessage || 'unknown-error'}`;

export default function DashboardView({
  recentActivity = [],
  projects = [],
  latestOutput = [],
  onOpenModal,
  onNavigate,
  onStop,
  onStart,
  onRestart,
  onStartAll,
  onStopAll,
  onWorkspaceActionComplete,
  presets = [],
  onStartPreset,
  onStopPreset,
  onRestartPreset,
  onEditPreset,
  onDuplicatePreset,
  onDeletePreset,
  onMovePreset,
  onCreatePreset,
  getMetricHistory,
}: DashboardViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [groupByTag, setGroupByTag] = useState(false);
  const [presetRunning, setPresetRunning] = useState<string | null>(null); // presetId currently starting
  const [workspaceAction, setWorkspaceAction] = useState('idle'); // 'idle', 'starting', 'stopping'
  const [workspaceTargets, setWorkspaceTargets] = useState<string[]>([]);
  const [workspaceInitialFailures, setWorkspaceInitialFailures] = useState(0);
  const [dismissedErrors, setDismissedErrors] = useState<Record<string, string>>({});
  const runningProjects = projects.filter((project) => (project.status || '').toLowerCase() === 'running');
  const startingProjects = projects.filter((project) => project.status?.toLowerCase() === 'starting');
  const stoppingProjects = projects.filter((project) => project.status?.toLowerCase() === 'stopping');
  const stoppedProjects = projects.filter((project) => project.status?.toLowerCase() === 'stopped');
  const erroredProjects = projects.filter((project) => project.status?.toLowerCase() === 'error');
  const visibleErrors = erroredProjects.filter((project) => dismissedErrors[project.id] !== errorSignature(project));
  const activeErrorIds = JSON.stringify(erroredProjects.map((project) => project.id));

  useEffect(() => {
    const activeIds = new Set<string>(JSON.parse(activeErrorIds));
    setDismissedErrors((current) => {
      const retained = Object.fromEntries(Object.entries(current).filter(([id]) => activeIds.has(id)));
      return Object.keys(retained).length === Object.keys(current).length ? current : retained;
    });
  }, [activeErrorIds]);
  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return projects
      .filter((project) => !query || [project.name, project.type, project.stack]
        .some((value) => value?.toLowerCase().includes(query)))
      .filter((project) => statusFilter === 'all' || (project.status || '').toLowerCase() === statusFilter)
      .sort((left, right) => {
        if (sortBy === 'cpu' || sortBy === 'memory') return (Number(right[sortBy]) || 0) - (Number(left[sortBy]) || 0);
        return String(left[sortBy as keyof ViewProject] || '').localeCompare(String(right[sortBy as keyof ViewProject] || ''));
      });
  }, [projects, searchQuery, statusFilter, sortBy]);

  // Calculate system-wide stats from running projects
  const systemStats = useMemo(() => {
    const running = projects.filter(p => p.status?.toLowerCase() === 'running');

    let totalCpu = 0;
    let totalMemory = 0;
    let runningCount = 0;

    running.forEach(p => {
      if (p.cpu != null) {
        totalCpu += parseFloat(String(p.cpu)) || 0;
      }
      if (p.memory != null) {
        totalMemory += parseFloat(String(p.memory)) || 0;
      }
      runningCount++;
    });

    return {
      cpu: runningCount > 0 ? Math.min(100, totalCpu).toFixed(1) : null,
      memory: runningCount > 0 ? Math.round(totalMemory) : null,
      runningCount,
    };
  }, [projects]);

  const activeCount = runningProjects.length + startingProjects.length + stoppingProjects.length;
  const errorCount = erroredProjects.length;
  const workspaceControlMode = getWorkspaceControlMode(projects, workspaceAction);

  // Group filtered projects by tag when grouping is enabled
  const groupedProjects = useMemo(() => {
    if (!groupByTag) return null;
    const groups = new Map<string, ViewProject[]>();
    for (const project of filteredProjects) {
      const tags = Array.isArray(project.tags) && project.tags.length > 0 ? project.tags : ['untagged'];
      for (const tag of tags) {
        if (!groups.has(tag)) groups.set(tag, []);
        groups.get(tag)!.push(project);
      }
    }
    return [...groups.entries()];
  }, [filteredProjects, groupByTag]);

  useEffect(() => {
    if (workspaceAction === 'idle' || workspaceTargets.length === 0) return;
    const targetProjects = workspaceTargets
      .map((id) => projects.find((project) => project.id === id))
      .filter((project): project is ViewProject => Boolean(project));
    if (targetProjects.length !== workspaceTargets.length) {
      setWorkspaceAction('idle');
      setWorkspaceTargets([]);
      setWorkspaceInitialFailures(0);
      return;
    }

    const terminalStatuses = workspaceAction === 'starting'
      ? ['running', 'error', 'stopped']
      : ['stopped', 'error'];
    if (targetProjects.every((project) => terminalStatuses.includes((project.status || '').toLowerCase()))) {
      const failedTargets = workspaceAction === 'starting'
        ? targetProjects.filter((project) => ['error', 'stopped'].includes((project.status || '').toLowerCase())).length
        : targetProjects.filter((project) => (project.status || '').toLowerCase() === 'error').length;
      const failed = failedTargets + workspaceInitialFailures;
      onWorkspaceActionComplete?.({
        action: workspaceAction,
        completed: targetProjects.length - failedTargets,
        failed,
      });
      setWorkspaceAction('idle');
      setWorkspaceTargets([]);
      setWorkspaceInitialFailures(0);
    }
  }, [projects, workspaceAction, workspaceTargets, workspaceInitialFailures, onWorkspaceActionComplete]);

  const logs = [...latestOutput].sort((left, right) => logTimestamp(left) - logTimestamp(right)).slice(-8).map(formatLog);
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  // Preset helpers
  const countPresetTerminal = (preset: Preset): number => {
    const ids = preset.projectIds || [];
    return projects.filter((p) => ids.includes(p.id) && ['running', 'error', 'stopped'].includes((p.status || '').toLowerCase())).length;
  };

  const handlePresetStart = async (preset: Preset): Promise<void> => {
    setPresetRunning(preset.id);
    try {
      await onStartPreset?.(preset);
    } finally {
      setPresetRunning(null);
    }
  };

  const startWorkspace = async (): Promise<void> => {
    const projectsToStart = projects.filter(p => !['running', 'starting', 'stopping'].includes((p.status || '').toLowerCase()));
    if (projectsToStart.length === 0) return;

    setWorkspaceAction('starting');
    try {
      const result = onStartAll
        ? await onStartAll(projectsToStart)
        : await Promise.all(projectsToStart.map(project => onStart?.(project)));
      const items: ProcessStartResult[] = (Array.isArray(result) ? result : []).filter(
        (item): item is ProcessStartResult => Boolean(item) && typeof item === 'object' && item != null && 'success' in item
      );
      const acceptedIds = Array.isArray(result)
        ? items.filter((item) => item.success).map((item) => item.projectId)
        : projectsToStart.map((project) => project.id);
      setWorkspaceInitialFailures(Array.isArray(result) ? items.filter((item) => !item.success).length : 0);
      if (acceptedIds.length > 0) setWorkspaceTargets(acceptedIds);
      else {
        setWorkspaceAction('idle');
        setWorkspaceInitialFailures(0);
      }
    } catch {
      setWorkspaceAction('idle');
      setWorkspaceTargets([]);
      setWorkspaceInitialFailures(0);
    }
  };

  const stopWorkspace = async (): Promise<void> => {
    const projectsToStop = projects.filter((project) => ['running', 'starting'].includes((project.status || '').toLowerCase()));
    if (projectsToStop.length === 0) return;

    setWorkspaceAction('stopping');
    setWorkspaceTargets(projectsToStop.map((project) => project.id));
    try {
      if (onStopAll) await onStopAll(projectsToStop);
      else await Promise.all(projectsToStop.map(project => onStop?.(project)));
    } catch {
      setWorkspaceAction('idle');
      setWorkspaceTargets([]);
      setWorkspaceInitialFailures(0);
    }
  };

  return (
    <div className="view mx-auto max-w-[1600px]">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-accent">{dateLabel}</p>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Your local workspace</h1>
          <p className="mt-1 text-xs text-ink-soft">Manage and monitor all your projects in one place.</p>
        </div>
        <div className="flex gap-2">
          {workspaceControlMode === 'starting' ? (
            <button type="button" disabled className="rounded-lg bg-blue-500/20 px-3 py-2 text-xs font-semibold text-blue-500 cursor-wait flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Starting workspace...
            </button>
          ) : workspaceControlMode === 'stopping' ? (
            <button type="button" disabled className="rounded-lg bg-yellow-500/20 px-3 py-2 text-xs font-semibold text-yellow-500 cursor-wait flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Stopping workspace...
            </button>
          ) : workspaceControlMode === 'all-active' ? (
            <button
              type="button"
              onClick={stopWorkspace}
              disabled={!onStopAll && !onStop}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Stop all
            </button>
          ) : workspaceControlMode === 'partial' ? (
            <>
              <button
                type="button"
                onClick={stopWorkspace}
                disabled={runningProjects.length + startingProjects.length === 0 || (!onStopAll && !onStop)}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Stop all
              </button>
              <button
                type="button"
                onClick={startWorkspace}
                disabled={(!onStartAll && !onStart) || projects.every(p => ['running', 'starting', 'stopping'].includes((p.status || '').toLowerCase()))}
                className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-500 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start remaining
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startWorkspace}
              disabled={(!onStartAll && !onStart) || projects.length === 0}
              className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start workspace
            </button>
          )}
        </div>
      </header>

      {/* Workspace Presets */}
      {(presets.length > 0 || onCreatePreset) && (
        <section className="mb-6" aria-label="Workspace presets">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Workspace Presets</h2>
            {onCreatePreset && (
              <button type="button" onClick={onCreatePreset} className="text-[11px] font-medium text-accent hover:text-accent-hover">+ New preset</button>
            )}
          </div>
          {presets.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {presets.map((preset, index) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  index={index}
                  total={presets.length}
                  projects={projects}
                  progress={presetRunning === preset.id
                    ? { active: true, done: countPresetTerminal(preset), total: preset.projectIds?.length || 0 }
                    : null}
                  onStart={handlePresetStart}
                  onStop={onStopPreset}
                  onRestart={onRestartPreset}
                  onEdit={onEditPreset}
                  onDuplicate={onDuplicatePreset}
                  onDelete={onDeletePreset}
                  onMove={onMovePreset}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-surface/60 px-4 py-6 text-center">
              <p className="text-xs text-ink-faint">
                Start a whole stack with one click — save a group of projects as a workspace preset.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Workspace Alerts */}
      {visibleErrors.length > 0 && (
        <section aria-label="Workspace errors" className="mb-5 space-y-2">
          {visibleErrors.map((project) => (
            <CrashBanner
              key={project.id}
              message={`Project "${project.name}" could not start or exited unexpectedly.`}
              timestamp={project.errorMessage ? `Details: ${project.errorMessage}` : null}
              onRestart={() => onRestart?.(project)}
              onDismiss={() => setDismissedErrors((current) => ({
                ...current,
                [project.id]: errorSignature(project),
              }))}
            />
          ))}
        </section>
      )}

      {/* Stats Grid */}
      <section className="grid overflow-hidden rounded-xl border border-border bg-surface/80 sm:grid-cols-2 lg:grid-cols-5">
        <div className="border-b border-border p-4 sm:border-r xl:border-b-0">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-faint">Running</span>
          <p className="mt-1 flex items-baseline gap-1 font-display text-2xl font-bold text-emerald-500 dark:text-emerald-400">
            {runningProjects.length}
            <small className="text-[10px] font-medium text-ink-soft">of {projects.length}</small>
          </p>
        </div>
        <div className="border-b border-border p-4 xl:border-b-0 xl:border-r">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-faint">Starting</span>
          <p className="mt-1 flex items-baseline gap-1 font-display text-2xl font-bold text-blue-500 dark:text-blue-400">
            {startingProjects.length}
            <small className="text-[10px] font-medium text-ink-soft">in progress</small>
          </p>
        </div>
        <div className="border-b border-border p-4 sm:border-r sm:border-b-0">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-faint">Stopped</span>
          <p className="mt-1 flex items-baseline gap-1 font-display text-2xl font-bold text-gray-500 dark:text-gray-400">
            {stoppedProjects.length}
            <small className="text-[10px] font-medium text-ink-soft">ready to start</small>
          </p>
        </div>
        <div className="border-b border-border p-4 sm:border-r xl:border-b-0">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-faint">Errors</span>
          <p className={`mt-1 flex items-baseline gap-1 font-display text-2xl font-bold ${errorCount ? 'text-red-500 dark:text-red-400' : 'text-ink-soft'}`}>
            {errorCount}
          </p>
        </div>
        <div className="p-4">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-faint">System</span>
          {systemStats.runningCount > 0 ? (
            <>
              <div className="mt-1 flex items-baseline gap-2">
                <p className={`font-display text-sm font-bold ${
                  systemStats.cpu != null && parseFloat(systemStats.cpu) > 80
                    ? 'text-red-500 dark:text-red-400'
                    : 'text-ink-soft'
                }`}>
                  CPU: {systemStats.cpu}%
                </p>
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <p className="font-display text-sm font-bold text-blue-500 dark:text-blue-400">
                  RAM: {systemStats.memory} MB
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 font-display text-sm font-bold text-ink-soft">CPU / RAM</p>
              <span className="text-[10px] text-ink-faint">Available when running</span>
            </>
          )}
        </div>
      </section>

      {/* Search & Filters */}
      <section className="mt-6 mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-sm font-bold">Projects</h2>
            <p className="font-mono text-[9px] text-ink-faint">{filteredProjects.length} of {projects.length} displayed</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 rounded-lg border border-border bg-surface-2 px-3 py-2 pl-9 text-xs font-medium text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
              />
              <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-medium text-ink focus:border-accent focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="running">Running</option>
              <option value="starting">Starting</option>
              <option value="stopped">Stopped</option>
              <option value="error">Error</option>
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-medium text-ink focus:border-accent focus:outline-none"
            >
              <option value="name">Sort by Name</option>
              <option value="status">Sort by Status</option>
              <option value="cpu">Sort by CPU</option>
              <option value="memory">Sort by Memory</option>
            </select>

            {/* Group by tag */}
            <button
              type="button"
              onClick={() => setGroupByTag((value) => !value)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${groupByTag ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border bg-surface-2 text-ink-soft hover:text-ink'}`}
              aria-pressed={groupByTag}
            >
              Group by tag
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        {(activeCount > 0 || errorCount > 0) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {activeCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-3 py-1 font-mono text-[9px] font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse"></span>
                {activeCount} active
              </span>
            )}
            {errorCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-3 py-1 font-mono text-[9px] font-semibold text-danger">
                {errorCount} error{errorCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </section>

      {/* Projects Grid */}
      {groupedProjects ? (
        <section className="space-y-6">
          {groupedProjects.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-surface/60 py-12 text-center">
              <p className="mt-1 text-xs text-ink-faint">No projects match current filters.</p>
            </div>
          )}
          {groupedProjects.map(([tag, tagProjects]) => (
            <div key={tag}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">{tag}</h3>
                <span className="font-mono text-[9px] text-ink-faint">{tagProjects.length}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {tagProjects.map((project) => (
                  <ProjectCard
                    key={project.id || project.name}
                    project={project}
                    onStop={onStop}
                    onStart={onStart}
                    onRestart={onRestart}
                    onNavigate={onNavigate}
                    getMetricHistory={getMetricHistory}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id || project.name}
              project={project}
              onStop={onStop}
              onStart={onStart}
              onRestart={onRestart}
              onNavigate={onNavigate}
              getMetricHistory={getMetricHistory}
            />
          ))}

          {/* Empty State */}
          {filteredProjects.length === 0 && (
            <div className="col-span-full">
              <div className="rounded-xl border border-dashed border-border bg-surface/60 py-12 text-center">
                <svg className="mx-auto h-12 w-12 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p className="mt-3 font-display text-sm font-semibold text-ink">No projects found</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {searchQuery || statusFilter !== 'all'
                    ? 'Try adjusting your search or filters'
                    : 'Get started by creating your first project'}
                </p>
                {!searchQuery && statusFilter === 'all' && (
                  <button
                    type="button"
                    onClick={() => onOpenModal?.('project')}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-hover"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Project
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Live Output & Activity */}
      <div className="mb-2.5 mt-8 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold">Live Activity</h2>
        <span className="font-mono text-[9px] text-ink-finite">real-time monitoring</span>
      </div>
      <section className="grid gap-3 lg:grid-cols-2">
        {/* Latest Logs */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface/80 shadow-card">
          <div className="flex h-11 items-center justify-between border-b border-border px-4">
            <h3 className="font-display text-xs font-bold">Recent Logs</h3>
            <span className="font-mono text-[8px] text-ink-faint">last 8 entries</span>
          </div>
          <div className="min-h-32 max-h-52 overflow-y-auto bg-base/60 px-4 py-3 font-mono text-[10px] leading-5">
            {logs.length > 0 ? logs.map((log, index) => (
              <p key={index} className={`${log.type === 'error' ? 'text-danger' : log.type === 'warn' || log.type === 'warning' ? 'text-warning' : 'text-ink-soft'}`}>
                {log.time && <span className="mr-2 text-ink-faint">{log.time}</span>}
                {log.projectName && <span className="mr-2 text-accent">[{log.projectName}]</span>}
                {log.message}
              </p>
            )) : (
              <p className="text-ink-faint">No log activity available.</p>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface/80 shadow-card">
          <div className="flex h-11 items-center justify-between border-b border-border px-4">
            <h3 className="font-display text-xs font-bold">Activity Feed</h3>
            <span className="font-mono text-[8px] text-ink-faint">current session</span>
          </div>
          <div className="max-h-52 overflow-y-auto px-4 py-2">
            {recentActivity.length > 0 ? (
              recentActivity.slice(0, 10).map((event, index) => (
                <div
                  key={event.id || index}
                  className="flex items-center gap-2.5 border-b border-border/60 py-2.5 last:border-0"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${
                    event.type === 'danger' || event.type === 'error'
                      ? 'bg-danger'
                      : event.type === 'success'
                      ? 'bg-success'
                      : event.type === 'accent'
                      ? 'bg-accent'
                      : 'bg-ink-faint'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-medium text-ink">
                      <strong className="font-semibold">{event.project}</strong>
                      {' '}
                      {event.message}
                    </p>
                    {event.detail && (
                      <span className="mt-0.5 block truncate font-mono text-[8px] text-ink-faint">{event.detail}</span>
                    )}
                  </div>
                  <time className="shrink-0 font-mono text-[8px] text-ink-faint whitespace-nowrap">{event.time}</time>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-xs text-ink-faint">No activity yet this session.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
