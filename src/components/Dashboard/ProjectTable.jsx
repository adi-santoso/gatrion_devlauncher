const getStatusColor = (status) => {
  const colors = {
    running: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/20', dot: 'bg-success' },
    starting: { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/20', dot: 'bg-warning' },
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
            const statusColor = getStatusColor(project.status);
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
                    {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                  </span>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-ink-soft">{project.port || '—'}</td>
                <td className="px-3 py-3 font-mono text-xs text-ink-soft">{project.pid || '—'}</td>
                <td className="px-3 py-3 font-mono text-xs text-ink-soft">{project.cpu || '—'}</td>
                <td className="px-3 py-3 font-mono text-xs text-ink-soft">{project.memory || '—'}</td>
                <td className="px-5 py-3 text-right">
                  {project.status === 'running' && (
                    <button
                      onClick={() => onStop && onStop(project)}
                      className="text-xs font-medium text-danger hover:underline"
                    >
                      Stop
                    </button>
                  )}
                  {project.status === 'stopped' && (
                    <button
                      onClick={() => onStart && onStart(project)}
                      className="text-xs font-medium text-success hover:underline"
                    >
                      Start
                    </button>
                  )}
                  {project.status === 'error' && (
                    <button
                      onClick={() => onRestart && onRestart(project)}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      Restart
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
