const statusColor = {
  running: 'text-success bg-success/10',
  starting: 'text-blue-500 bg-blue-500/10',
  stopping: 'text-warning bg-warning/10',
  stopped: 'text-ink-faint bg-surface-3/60',
  error: 'text-danger bg-danger/10',
};

const Chip = ({ count, status }) => {
  if (count === 0) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold ${statusColor[status] || statusColor.stopped}`}>
      {count} {status}
      {count > 1 ? 's' : ''}
    </span>
  );
};

const Spinner = () => (
  <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

export default function PresetCard({
  preset,
  index = 0,
  total = 0,
  projects = [],
  progress = null,
  onStart,
  onStop,
  onRestart,
  onEdit,
  onDuplicate,
  onDelete,
  onMove,
}) {
  const presetProjects = (preset.projectIds || [])
    .map((id) => projects.find((project) => project.id === id))
    .filter(Boolean);
  const counts = {
    running: presetProjects.filter((p) => p.status?.toLowerCase() === 'running').length,
    starting: presetProjects.filter((p) => p.status?.toLowerCase() === 'starting').length,
    stopping: presetProjects.filter((p) => p.status?.toLowerCase() === 'stopping').length,
    error: presetProjects.filter((p) => p.status?.toLowerCase() === 'error').length,
    stopped: presetProjects.filter((p) => p.status?.toLowerCase() === 'stopped').length,
  };
  const anyActive = counts.running + counts.starting + counts.stopping > 0;
  const anyStoppable = counts.running + counts.starting > 0;
  const anyStartable = counts.stopped + counts.error > 0 || presetProjects.some((p) => !p);

  const progressActive = progress?.active === true;
  const done = Math.min(progress?.done ?? 0, progress?.total ?? presetProjects.length);
  const totalCount = progress?.total ?? presetProjects.length;

  const iconButtonClass = 'p-0.5 rounded hover:bg-surface-3 transition-colors';

  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-surface/80 shadow-card"
      style={{ borderLeft: `3px solid ${preset.color || '#6D5EF5'}` }}
    >
      <div className="flex items-start justify-between gap-2 p-3 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: preset.color || '#6D5EF5' }} />
            <h3 className="truncate font-display text-xs font-bold" title={preset.name}>{preset.name}</h3>
            {preset.autoStart && (
              <span
                className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 font-mono text-[8px] font-semibold text-accent"
                title="Starts automatically on app launch"
              >auto</span>
            )}
          </div>
          {preset.description && (
            <p className="mt-0.5 truncate text-[10px] text-ink-faint" title={preset.description}>{preset.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 text-ink-faint">
          {onMove && index > 0 && (
            <button type="button" onClick={() => onMove(preset.id, -1)} aria-label={`Move preset ${preset.name} left`} className={iconButtonClass}>←</button>
          )}
          {onMove && index < total - 1 && (
            <button type="button" onClick={() => onMove(preset.id, 1)} aria-label={`Move preset ${preset.name} right`} className={iconButtonClass}>→</button>
          )}
          {onEdit && (
            <button type="button" onClick={() => onEdit(preset)} aria-label={`Edit preset ${preset.name}`} className={`${iconButtonClass} hover:text-ink`}>✎</button>
          )}
          {onDuplicate && (
            <button type="button" onClick={() => onDuplicate(preset)} aria-label={`Duplicate preset ${preset.name}`} className={`${iconButtonClass} hover:text-ink`}>⧉</button>
          )}
          {onDelete && (
            <button type="button" onClick={() => onDelete(preset)} aria-label={`Delete preset ${preset.name}`} className={`${iconButtonClass} hover:text-danger`}>✕</button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5">
        <Chip count={counts.running} status="running" />
        <Chip count={counts.starting} status="starting" />
        <Chip count={counts.error} status="error" />
        <Chip count={counts.stopped} status="stopped" />
        {presetProjects.length > 0 && counts.running + counts.starting + counts.stopping + counts.error + counts.stopped === 0 && (
          <span className="font-mono text-[9px] text-ink-faint">{presetProjects.length} projects</span>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 bg-surface-2/60 px-3 py-2">
        {progressActive ? (
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-warning">
            <Spinner />
            Starting {done}/{totalCount}…
          </span>
        ) : (
          <>
            {anyStartable && onStart && (
              <button
                type="button"
                onClick={() => onStart(preset)}
                className="rounded-lg bg-accent px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-accent-hover"
              >
                {anyActive ? 'Start rest' : 'Start'}
              </button>
            )}
            {anyStoppable && onStop && (
              <button
                type="button"
                onClick={() => onStop(preset)}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-500 hover:bg-red-500/20"
              >
                Stop
              </button>
            )}
            {anyStoppable && onRestart && (
              <button
                type="button"
                onClick={() => onRestart(preset)}
                className="rounded-lg border border-border bg-surface-3 px-2.5 py-1 text-[10px] font-semibold text-ink-soft hover:text-ink"
              >
                Restart
              </button>
            )}
            {!anyActive && !anyStartable && (
              <span className="font-mono text-[9px] text-ink-faint">all projects running</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
