export default function ProjectCard({ project, onStop, onRestart, onNavigate }) {
  const cpu = project.cpu ?? project.cpuUsage;
  const memory = project.memory ?? project.mem ?? project.memoryUsage;

  return (
    <article className="min-w-0 rounded-xl border border-border bg-gradient-to-br from-surface-2 to-surface p-3.5 shadow-card">
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={() => onNavigate?.(project)} className="w-9 h-9 shrink-0 rounded-lg border border-border bg-surface-3 flex items-center justify-center text-base hover:border-border-hover">
          {project.emoji || project.name?.slice(0, 1)?.toUpperCase() || '?'}
        </button>
        <button type="button" onClick={() => onNavigate?.(project)} className="min-w-0 flex-1 text-left">
          <strong className="block truncate font-display text-xs font-bold hover:text-accent">{project.name}</strong>
          <span className="block truncate font-mono text-[9px] text-ink-faint">{project.stack || project.type || 'Project'}</span>
        </button>
        <span className="rounded-full bg-success/10 px-2 py-1 font-mono text-[8px] font-semibold uppercase text-success">Running</span>
      </div>

      <div className="mt-3.5 flex gap-3 font-mono text-[9px] text-ink-soft">
        <span>{project.port ? `:${project.port}` : 'no port'}</span>
        {project.pid != null && <span>PID {project.pid}</span>}
        {project.uptime && <span>{project.uptime}</span>}
      </div>

      <div className="my-3 grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border bg-base/50 px-2 py-1.5"><span className="block font-mono text-[7px] uppercase tracking-wider text-ink-faint">CPU</span><strong className="mt-0.5 block font-mono text-[10px] font-semibold text-ink-soft">{cpu ?? 'Unavailable'}</strong></div>
        <div className="rounded-md border border-border bg-base/50 px-2 py-1.5"><span className="block font-mono text-[7px] uppercase tracking-wider text-ink-faint">Memory</span><strong className="mt-0.5 block font-mono text-[10px] font-semibold text-ink-soft">{memory ?? 'Unavailable'}</strong></div>
      </div>

      <div className="flex gap-1.5">
        <button type="button" onClick={() => onNavigate?.(project)} className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-2 text-[11px] font-semibold text-ink-soft hover:text-ink">Inspect</button>
        <button type="button" onClick={() => onRestart?.(project)} title="Restart" className="w-8 rounded-lg border border-border bg-surface-2 text-ink-faint hover:text-accent">↻</button>
        <button type="button" onClick={() => onStop?.(project)} title="Stop" className="w-8 rounded-lg border border-danger/20 bg-danger/10 text-danger hover:bg-danger/15">■</button>
      </div>
    </article>
  );
}
