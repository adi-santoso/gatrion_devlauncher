import { useState, useMemo, useEffect } from 'react';
import type { ViewProject } from './ProjectCard';
import PresetCard from './PresetCard';
import CrashBanner from '../ProjectDetail/CrashBanner';
import { getWorkspaceControlMode } from '../../utils/workspaceResults';
import type { ActivityItem } from '../../hooks/useActivities';
import type { Preset } from '../../types/shared';
import type { ProcessLogLine, ProcessStartResult } from '../../data/processes';
import { countPresetTerminal, errorSignature, formatLog, logTimestamp } from './dashboardUtils';
import { useWorkspaceActions } from './useWorkspaceActions';
import { ActivitySection, ProjectsGrid, StatsGrid, WorkspaceControls, type SystemStats } from './dashboardWidgets';

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
  const [dismissedErrors, setDismissedErrors] = useState<Record<string, string>>({});
  const runningProjects = projects.filter((project) => (project.status || '').toLowerCase() === 'running');
  const startingProjects = projects.filter((project) => project.status?.toLowerCase() === 'starting');
  const stoppingProjects = projects.filter((project) => project.status?.toLowerCase() === 'stopping');
  const stoppedProjects = projects.filter((project) => project.status?.toLowerCase() === 'stopped');
  const erroredProjects = projects.filter((project) => project.status?.toLowerCase() === 'error');
  const visibleErrors = erroredProjects.filter((project) => dismissedErrors[project.id] !== errorSignature(project));
  const activeErrorIds = JSON.stringify(erroredProjects.map((project) => project.id));

  const { workspaceAction, startWorkspace, stopWorkspace } = useWorkspaceActions({
    projects,
    onStart,
    onStartAll,
    onStop,
    onStopAll,
    onWorkspaceActionComplete,
  });

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
  const systemStats: SystemStats = useMemo(() => {
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

  const logs = [...latestOutput].sort((left, right) => logTimestamp(left) - logTimestamp(right)).slice(-8).map(formatLog);
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  const handlePresetStart = async (preset: Preset): Promise<void> => {
    setPresetRunning(preset.id);
    try {
      await onStartPreset?.(preset);
    } finally {
      setPresetRunning(null);
    }
  };

  const filteredEmpty = filteredProjects.length === 0;
  const emptyHint = searchQuery || statusFilter !== 'all'
    ? 'Try adjusting your search or filters'
    : 'Get started by creating your first project';

  return (
    <div className="view mx-auto max-w-[1600px]">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-accent">{dateLabel}</p>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Your local workspace</h1>
          <p className="mt-1 text-xs text-ink-soft">Manage and monitor all your projects in one place.</p>
        </div>
        <div className="flex gap-2">
          <WorkspaceControls
            mode={workspaceControlMode}
            runningCount={runningProjects.length}
            startingCount={startingProjects.length}
            projectCount={projects.length}
            onStartWorkspace={startWorkspace}
            onStopWorkspace={stopWorkspace}
          />
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
                    ? { active: true, done: countPresetTerminal(projects, preset), total: preset.projectIds?.length || 0 }
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

      <StatsGrid
        runningCount={runningProjects.length}
        startingCount={startingProjects.length}
        stoppedCount={stoppedProjects.length}
        errorCount={errorCount}
        totalProjects={projects.length}
        systemStats={systemStats}
      />

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

      <ProjectsGrid
        grouped={groupedProjects}
        projects={filteredProjects}
        emptyHeading="No projects found"
        emptyHint={emptyHint}
        showAddAction={!searchQuery && statusFilter === 'all' && filteredEmpty}
        onOpenModal={onOpenModal}
        onStop={onStop}
        onStart={onStart}
        onRestart={onRestart}
        onNavigate={onNavigate}
        getMetricHistory={getMetricHistory}
      />

      {/* Live Output & Activity */}
      <div className="mb-2.5 mt-8 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold">Live Activity</h2>
        <span className="font-mono text-[9px] text-ink-finite">real-time monitoring</span>
      </div>
      <ActivitySection logs={logs} recentActivity={recentActivity} />
    </div>
  );
}
