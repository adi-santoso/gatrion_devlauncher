const getStatusColor = (status) => {
  const colors = {
    running: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/20', dot: 'bg-success' },
    starting: { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/20', dot: 'bg-warning' },
    stopping: { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/20', dot: 'bg-warning' },
    error: { bg: 'bg-danger/10', text: 'text-danger', border: 'border-danger/20', dot: 'bg-danger' },
    stopped: { bg: 'bg-surface-3', text: 'text-ink-faint', border: 'border-border', dot: 'bg-ink-faint' }
  };
  return colors[status] || colors.stopped;
};

export default function ProjectTable({ projects = [], onStop, onStart, onRestart }) {
  return (
    <section className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="font-display font-bold text-sm">All Projects</h3>
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search projects…"
            className="bg-surface-3 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent w-56"
          />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-ink-faint border-b border-border">
            <th className="font-medium px-5 py-2.5">Project</th>
            <th className="font-medium px-3 py-2.5">Type</th>
            <th className="font-medium px-3 py-2.5">Status</th>
            <th className="font-medium px-3 py-2.5">Port</th>
            <th className="font-medium px-3 py-2.5">PID</th>
            <th className="font-medium px-3 py-2.5">CPU</th>
            <th className="font-medium px-3 py-2.5">Memory</th>
            <th className="font-medium px-5 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {projects.map((project, index) => {
            const status = (project.status || 'stopped').toLowerCase();
            const statusColor = getStatusColor(status);
            return (
              <tr key={index} className="hover:bg-surface-3/60 transition-colors">
                <td className="px-5 py-3 font-medium">{project.name}</td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
                    {project.emoji} {project.type}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusColor.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusColor.dot}`}></span>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </span>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-ink-soft">{project.port || '—'}</td>
                <td className="px-3 py-3 font-mono text-xs text-ink-soft">{status === 'running' || status === 'stopping' ? project.pid || '—' : '—'}</td>
                <td className="px-3 py-3 font-mono text-xs text-ink-soft">{project.cpu || '—'}</td>
                <td className="px-3 py-3 font-mono text-xs text-ink-soft">{project.mem || '—'}</td>
                <td className="px-5 py-3 text-right">
                  {status === 'running' ? (
                    <button
                      onClick={() => onStop?.(project)}
                      className="px-2.5 py-1 rounded bg-danger/10 text-danger hover:bg-danger/20 text-xs font-medium transition-colors"
                    >
                      Stop
                    </button>
                  ) : status === 'starting' || status === 'stopping' ? (
                    <button
                      className="px-2.5 py-1 rounded bg-warning/10 text-warning text-xs font-medium cursor-wait"
                      disabled
                    >
                      {status === 'starting' ? 'Booting…' : 'Stopping…'}
                    </button>
                  ) : (
                    <button
                      onClick={() => onStart?.(project)}
                      className="px-2.5 py-1 rounded bg-success/10 text-success hover:bg-success/20 text-xs font-medium transition-colors"
                    >
                      Start
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
