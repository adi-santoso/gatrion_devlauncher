import * as ipc from '../../utils/ipcRenderer';

const statusClasses = {
  running: 'bg-success/10 text-success border-success/20', starting: 'bg-warning/10 text-warning border-warning/20',
  stopping: 'bg-warning/10 text-warning border-warning/20', error: 'bg-danger/10 text-danger border-danger/20',
  stopped: 'bg-surface-3 text-ink-faint border-border'
};

export default function ProjectDetailHeader({ project, onStart, onStop, onRestart, onEdit }) {
  const status = (project?.status || 'stopped').toLowerCase();
  const busy = status === 'starting' || status === 'stopping';
  const appUrl = Number.isInteger(project?.port) ? `http://localhost:${project.port}` : null;

  const handleOpenBrowser = () => {
    if (appUrl) {
      ipc.openExternalUrl(appUrl);
    }
  };

  const handleRevealInExplorer = () => {
    if (project?.path) {
      ipc.revealInExplorer(project.path);
    }
  };

  const handleOpenInEditor = () => {
    if (project?.path) {
      ipc.openInEditor(project.path);
    }
  };

  return (
    <header className="border-b border-border bg-surface/50 rounded-xl p-5 shadow-card space-y-3">
      {/* Top Header Row */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-surface-3 border border-border flex items-center justify-center text-xl shrink-0 shadow-sm">
            {project?.emoji || '📁'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-display font-extrabold text-2xl tracking-tight text-ink">{project?.name}</h1>
              <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusClasses[status] || statusClasses.stopped}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
            <p
              onClick={handleRevealInExplorer}
              title="Click to reveal in File Explorer"
              className="text-xs font-mono text-ink-faint mt-1 truncate hover:text-accent cursor-pointer transition-colors"
            >
              {project?.path || 'No path specified'}
            </p>
          </div>
        </div>

        {/* Action Group */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Open App / Browser */}
          {appUrl && (
            <button
              onClick={handleOpenBrowser}
              title={`Open ${appUrl} in browser`}
              className="px-3.5 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-semibold border border-emerald-500/30 flex items-center gap-1.5 transition-colors"
            >
              🌐 Open App
            </button>
          )}

          {/* Desktop Integration Shortcuts */}
          <button
            onClick={handleRevealInExplorer}
            title="Reveal project folder in File Explorer"
            className="px-3 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border flex items-center gap-1.5 transition-colors"
          >
            📁 Explorer
          </button>
          <button
            onClick={handleOpenInEditor}
            title="Open project folder in VS Code / Editor"
            className="px-3 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border flex items-center gap-1.5 transition-colors"
          >
            💻 Editor
          </button>

          {/* Lifecycle Controls */}
          {status === 'running' ? (
            <>
              <button
                onClick={onRestart}
                className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-semibold text-accent border border-accent/30 transition-colors"
              >
                ↻ Restart
              </button>
              <button
                onClick={onStop}
                className="px-3.5 py-2 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger border border-danger/25 text-xs font-semibold transition-colors"
              >
                ■ Stop
              </button>
            </>
          ) : busy ? (
            <button disabled className="px-3.5 py-2 rounded-lg bg-warning/10 text-warning border border-warning/20 text-xs font-semibold cursor-wait">
              {status === 'starting' ? 'Starting...' : 'Stopping...'}
            </button>
          ) : (
            <button
              onClick={onStart}
              className="px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-glow transition-colors"
            >
              ▶ Start Project
            </button>
          )}

          <button
            onClick={onEdit}
            title="Edit project configuration"
            className="px-3 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors ml-1"
          >
            ⚙️ Edit
          </button>
        </div>
      </div>

      {/* Sub Metadata Line (Matching devlauncher-mockup.html) */}
      <div className="flex items-center gap-4 text-[11px] font-mono text-ink-faint pt-2 border-t border-border/40 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="text-ink-soft font-semibold">{project?.type || 'CUSTOM'}</span>
        </span>
        {appUrl && (
          <button onClick={handleOpenBrowser} className="hover:text-accent hover:underline flex items-center gap-1">
            <span>{appUrl}</span>
          </button>
        )}
        {project?.pid != null && (
          <span>PID <strong className="text-ink-soft">{project.pid}</strong></span>
        )}
        {(project?.uptime || project?.metrics?.uptime) && (
          <span>Uptime <strong className="text-ink-soft">{project?.metrics?.uptime || project.uptime}</strong></span>
        )}
        {project?.metrics?.memoryMb != null && (
          <span>RAM <strong className="text-emerald-400 font-semibold">{project.metrics.memoryMb} MB</strong></span>
        )}
        {project?.startCommand && (
          <span className="truncate max-w-xs">Cmd: <code className="text-ink-soft">{project.startCommand}</code></span>
        )}
      </div>
      {project?.processCommands?.length > 1 && (
        <div className="grid gap-2 sm:grid-cols-2 pt-1">
          {project.processCommands.map((command) => (
            <div key={command.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px]">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{command.name}</p>
                <p className="font-mono text-ink-faint truncate">{command.command}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={command.status === 'RUNNING' ? 'text-success' : command.status === 'ERROR' ? 'text-danger' : 'text-warning'}>{command.status}</p>
                <p className="font-mono text-ink-faint">{command.port ? `:${command.port}` : ''}{command.pid ? ` PID ${command.pid}` : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
