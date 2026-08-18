import { useEffect, useMemo, useState } from 'react';
import ProjectCard, { type ViewProject } from './ProjectCard';
import { type FormattedLog } from './dashboardUtils';
import type { FeedActivity } from './DashboardView';
import type { MetricSample } from './DashboardView';

export interface SystemStats {
  cpu: string | null;
  memory: number | null;
  runningCount: number;
}

// ---------------------------------------------------------------------------
// Header workspace controls (Start/Stop workspace buttons)
// ---------------------------------------------------------------------------

export interface WorkspaceControlsProps {
  mode: string;
  runningCount: number;
  startingCount: number;
  projectCount: number;
  onStartWorkspace: () => void;
  onStopWorkspace: () => void;
}

const spinnerSvg = (
  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

export function WorkspaceControls({ mode, runningCount, startingCount, projectCount, onStartWorkspace, onStopWorkspace }: WorkspaceControlsProps) {
  const hasActive = runningCount + startingCount === 0;
  if (mode === 'starting') {
    return <button type="button" disabled className="rounded-lg bg-blue-500/20 px-3 py-2 text-xs font-semibold text-blue-500 cursor-wait flex items-center gap-2">{spinnerSvg}Starting workspace...</button>;
  }
  if (mode === 'stopping') {
    return <button type="button" disabled className="rounded-lg bg-yellow-500/20 px-3 py-2 text-xs font-semibold text-yellow-500 cursor-wait flex items-center gap-2">{spinnerSvg}Stopping workspace...</button>;
  }
  if (mode === 'all-active') {
    return (
      <button
        type="button"
        onClick={onStopWorkspace}
        disabled={hasActive}
        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Stop all
      </button>
    );
  }
  if (mode === 'partial') {
    return (
      <>
        <button
          type="button"
          onClick={onStopWorkspace}
          disabled={hasActive}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Stop all
        </button>
        <button
          type="button"
          onClick={onStartWorkspace}
          disabled={projectCount === 0}
          className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-500 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Start remaining
        </button>
      </>
    );
  }
  return (
    <button
      type="button"
      onClick={onStartWorkspace}
      disabled={projectCount === 0}
      className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      Start workspace
    </button>
  );
}

// ---------------------------------------------------------------------------
// Stats grid
// ---------------------------------------------------------------------------

export interface StatsGridProps {
  runningCount: number;
  startingCount: number;
  stoppedCount: number;
  errorCount: number;
  totalProjects: number;
  systemStats: SystemStats;
}

export function StatsGrid({ runningCount, startingCount, stoppedCount, errorCount, totalProjects, systemStats }: StatsGridProps) {
  return (
    <section className="grid overflow-hidden rounded-xl border border-border bg-surface/80 sm:grid-cols-2 lg:grid-cols-5">
      <div className="border-b border-border p-4 sm:border-r xl:border-b-0">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-faint">Running</span>
        <p className="mt-1 flex items-baseline gap-1 font-display text-2xl font-bold text-emerald-500 dark:text-emerald-400">
          {runningCount}
          <small className="text-[10px] font-medium text-ink-soft">of {totalProjects}</small>
        </p>
      </div>
      <div className="border-b border-border p-4 xl:border-b-0 xl:border-r">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-faint">Starting</span>
        <p className="mt-1 flex items-baseline gap-1 font-display text-2xl font-bold text-blue-500 dark:text-blue-400">
          {startingCount}
          <small className="text-[10px] font-medium text-ink-soft">in progress</small>
        </p>
      </div>
      <div className="border-b border-border p-4 sm:border-r sm:border-b-0">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-faint">Stopped</span>
        <p className="mt-1 flex items-baseline gap-1 font-display text-2xl font-bold text-gray-500 dark:text-gray-400">
          {stoppedCount}
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
  );
}

// ---------------------------------------------------------------------------
// Live activity: recent logs + activity feed
// ---------------------------------------------------------------------------

export interface ActivitySectionProps {
  logs: FormattedLog[];
  recentActivity: FeedActivity[];
}

export function ActivitySection({ logs, recentActivity }: ActivitySectionProps) {
  return (
    <section className="grid gap-3 lg:grid-cols-2">
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
  );
}

// ---------------------------------------------------------------------------
// Project grid (grouped by tag or flat)
// ---------------------------------------------------------------------------

export interface ProjectsGridProps {
  grouped: Array<[string, ViewProject[]]> | null;
  projects: ViewProject[];
  emptyHeading: string;
  emptyHint: string;
  showAddAction: boolean;
  onOpenModal?: (modal: string) => void;
  onStop?: (project: ViewProject) => void;
  onStart?: (project: ViewProject) => unknown;
  onRestart?: (project: ViewProject) => void;
  onNavigate?: (projectOrView: ViewProject | string) => void;
  getMetricHistory?: (projectId: string) => MetricSample[];
}

// Show at most this many project cards on the dashboard before offering a
// "Show all" button, so a workspace with dozens of projects stays a manageable
// page instead of a wall of cards pushing Live Activity / logs far below the
// fold. Search & filter keep running against the full list either way.
const VISIBLE_LIMIT = 12;

export function ProjectsGrid({ grouped, projects, emptyHeading, emptyHint, showAddAction, onOpenModal, onStop, onStart, onRestart, onNavigate, getMetricHistory }: ProjectsGridProps) {
  // Flatten both modes into one ordered item list so the cap applies uniformly
  // (grouped mode can still wall up: untagged projects all land in one group).
  const flatItems = useMemo(() => {
    if (grouped) return grouped.flatMap(([tag, list]) => list.map((project) => ({ tag, project })));
    return projects.map((project) => ({ tag: null, project }));
  }, [grouped, projects]);

  const [showAll, setShowAll] = useState(false);
  const total = flatItems.length;
  // Collapse the expansion whenever the underlying filtered set changes
  // (search / filter / sort / group toggle), but not on status or metric
  // updates — those keep the same project ids.
  const idKey = useMemo(
    () => flatItems.map(({ project }) => project.id ?? project.name).join(','),
    [flatItems],
  );
  useEffect(() => { setShowAll(false); }, [idKey]);

  const limited = total > VISIBLE_LIMIT && !showAll;
  const visibleItems = limited ? flatItems.slice(0, VISIBLE_LIMIT) : flatItems;

  const renderCard = (project: ViewProject) => (
    <ProjectCard
      key={project.id || project.name}
      project={project}
      onStop={onStop}
      onStart={onStart}
      onRestart={onRestart}
      onNavigate={onNavigate}
      getMetricHistory={getMetricHistory}
    />
  );

  // Rebuild tag groups from the visible slice, preserving order.
  let rebuilt: Array<[string, ViewProject[]]> | null = null;
  if (grouped) {
    rebuilt = [];
    const byTag = new Map<string, ViewProject[]>();
    for (const item of visibleItems) {
      // Flat items carry tag: null; grouped items always have a real tag.
      if (item.tag === null) continue;
      const { tag, project } = item;
      let list = byTag.get(tag);
      if (!list) { list = []; byTag.set(tag, list); rebuilt.push([tag, list]); }
      list.push(project);
    }
  }

  return (
    <>
      {grouped && rebuilt && (
        <section className="space-y-6">
          {grouped.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-surface/60 py-12 text-center">
              <p className="mt-1 text-xs text-ink-faint">No projects match current filters.</p>
            </div>
          )}
          {rebuilt.map(([tag, tagProjects]) => (
            <div key={tag}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-soft">{tag}</h3>
                <span className="font-mono text-[9px] text-ink-faint">{tagProjects.length}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {tagProjects.map((project) => renderCard(project))}
              </div>
            </div>
          ))}
        </section>
      )}
      {!grouped && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map(({ project }) => renderCard(project))}

          {total === 0 && (
            <div className="col-span-full">
              <div className="rounded-xl border border-dashed border-border bg-surface/60 py-12 text-center">
                <svg className="mx-auto h-12 w-12 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p className="mt-3 font-display text-sm font-semibold text-ink">{emptyHeading}</p>
                <p className="mt-1 text-xs text-ink-faint">{emptyHint}</p>
                {showAddAction && (
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
      {limited && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 w-full rounded-xl border border-dashed border-border bg-surface/60 py-3 text-xs font-medium text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors"
        >
          Show all ({total} project{total > 1 ? 's' : ''})
        </button>
      )}
    </>
  );
}
