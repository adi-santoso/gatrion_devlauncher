import ProjectCard from './ProjectCard';
import CrashBanner from '../ProjectDetail/CrashBanner';

const stripAnsi = (value) => typeof value === 'string'
  ? value.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
  : '';

const formatLog = (log) => {
  if (typeof log === 'string') return { message: stripAnsi(log), time: '' };
  if (!log) return { message: '', time: '' };
  return {
    message: stripAnsi(log.message ?? log.text ?? String(log)),
    time: log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : (log.time || ''),
    type: (log.type || log.level || '').toLowerCase()
  };
};

export default function DashboardView({
  activities,
  recentActivity = [],
  projects = [],
  latestOutput = [],
  latestOutputProject,
  onOpenModal,
  onNavigate,
  onStop,
  onStart,
  onRestart,
  onStartAll,
  onStopAll
}) {
  const runningProjects = projects.filter((project) => project.status?.toLowerCase() === 'running');
  const startingCount = projects.filter((project) => project.status?.toLowerCase() === 'starting').length;
  const erroredProjects = projects.filter((project) => project.status?.toLowerCase() === 'error');
  const errorCount = erroredProjects.length;
  const logs = latestOutput.slice(-8).map(formatLog);
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const startWorkspace = () => onStartAll ? onStartAll() : projects.filter((project) => !['running', 'starting'].includes(project.status?.toLowerCase())).forEach((project) => onStart?.(project));
  const stopWorkspace = () => onStopAll ? onStopAll() : runningProjects.forEach((project) => onStop?.(project));

  return (
    <div className="view mx-auto max-w-[1400px]">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-accent">{dateLabel}</p>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Your local workspace</h1>
          <p className="mt-1 text-xs text-ink-soft">Run, inspect, and use every project without leaving DevLauncher.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={stopWorkspace} disabled={!onStopAll && !onStop} className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-50">Stop all</button>
          <button type="button" onClick={startWorkspace} disabled={!onStartAll && !onStart} className="rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">Start workspace</button>
        </div>
      </header>

      {erroredProjects.length > 0 && (
        <div className="mb-6 space-y-2">
          {erroredProjects.map((project) => (
            <CrashBanner
              key={project.id}
              message={`Project "${project.name}" encountered an error or exited unexpectedly.`}
              timestamp={project.errorMessage ? `Details: ${project.errorMessage}` : null}
              onRestart={() => onRestart?.(project)}
            />
          ))}
        </div>
      )}

      <section className="grid overflow-hidden rounded-xl border border-border bg-surface/80 sm:grid-cols-2 xl:grid-cols-4">
        <div className="border-b border-border p-4 sm:border-r xl:border-b-0"><span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-faint">Running</span><p className="mt-1 font-display text-xl font-bold text-success">{runningProjects.length} <small className="text-[10px] font-medium text-ink-soft">of {projects.length} projects</small></p></div>
        <div className="border-b border-border p-4 xl:border-b-0 xl:border-r"><span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-faint">Starting</span><p className="mt-1 font-display text-xl font-bold">{startingCount} <small className="text-[10px] font-medium text-ink-soft">in progress</small></p></div>
        <div className="border-b border-border p-4 sm:border-r sm:border-b-0"><span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-faint">Needs attention</span><p className={`mt-1 font-display text-xl font-bold ${errorCount ? 'text-danger' : ''}`}>{errorCount} <small className="text-[10px] font-medium text-ink-soft">errors</small></p></div>
        <div className="p-4"><span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-ink-faint">CPU / RAM</span><p className="mt-1 font-display text-sm font-bold text-ink-soft">Unavailable</p><span className="text-[10px] text-ink-faint">Pending backend monitoring</span></div>
      </section>

      <section className="mt-6">
        <div className="mb-2.5 flex items-center justify-between"><h2 className="font-display text-sm font-bold">Running now</h2><button type="button" onClick={() => onNavigate?.('projects')} className="text-[10px] font-medium text-accent hover:text-accent-hover">Manage projects</button></div>
        {runningProjects.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {runningProjects.map((project) => <ProjectCard key={project.id || project.name} project={project} onStop={onStop} onStart={onStart} onRestart={onRestart} onNavigate={onNavigate} />)}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-surface/60 py-9 text-center"><p className="text-xs text-ink-faint">No projects running</p><button type="button" onClick={() => projects.length ? startWorkspace() : onOpenModal?.('project')} className="mt-2 text-xs font-semibold text-accent">{projects.length ? 'Start workspace' : '+ Add your first project'}</button></div>
        )}
      </section>

      <div className="mb-2.5 mt-6 flex items-center justify-between"><h2 className="font-display text-sm font-bold">Live workspace</h2><span className="font-mono text-[9px] text-ink-faint">real process data</span></div>
      <section className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <div className="overflow-hidden rounded-xl border border-border bg-surface/80 shadow-card">
          <div className="flex h-11 items-center justify-between border-b border-border px-4"><h3 className="font-display text-xs font-bold">Latest output</h3><span className="font-mono text-[8px] text-ink-faint">{latestOutputProject || 'No stream selected'}</span></div>
          <div className="min-h-36 max-h-52 overflow-y-auto bg-base/60 px-4 py-3 font-mono text-[10px] leading-5">
            {logs.length > 0 ? logs.map((log, index) => <p key={index} className={log.type === 'error' ? 'text-danger' : log.type === 'warn' || log.type === 'warning' ? 'text-warning' : 'text-ink-soft'}>{log.time && <span className="mr-2 text-ink-faint">{log.time}</span>}{log.message}</p>) : <p className="text-ink-faint">No real process output available.</p>}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface/80 shadow-card">
          <div className="flex h-11 items-center justify-between border-b border-border px-4"><h3 className="font-display text-xs font-bold">Recent activity</h3><span className="font-mono text-[8px] text-ink-faint">current session</span></div>
          <div className="px-4 py-1">
            {recentActivity.length > 0 ? recentActivity.slice(0, 6).map((event, index) => <div key={event.id || index} className="grid grid-cols-[7px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-border/60 py-2.5 last:border-0"><span className={`h-2 w-2 rounded-full ${event.type === 'danger' || event.type === 'error' ? 'bg-danger' : event.type === 'success' ? 'bg-success' : 'bg-ink-faint'}`} /><p className="truncate text-[10px]"><strong className="font-semibold">{event.project}</strong> {event.message}</p><time className="font-mono text-[8px] text-ink-faint">{event.time}</time></div>) : <p className="py-6 text-center text-xs text-ink-faint">No activity this session.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
