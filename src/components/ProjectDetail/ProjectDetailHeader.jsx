import * as ipc from '../../utils/ipcRenderer';
import StackLogo from '../Common/StackLogo';
import Icon from '../Common/Icon';

const statusClasses = {
  running: 'bg-success/10 text-success border-success/20', starting: 'bg-warning/10 text-warning border-warning/20',
  stopping: 'bg-warning/10 text-warning border-warning/20', error: 'bg-danger/10 text-danger border-danger/20',
  stopped: 'bg-surface-3 text-ink-faint border-border'
};

const btnBase = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap';
const btnSecondary = `${btnBase} bg-surface-3 hover:bg-surface-2 text-ink-soft hover:text-ink border border-border`;
const btnPrimary = `${btnBase} px-3.5 bg-accent hover:bg-accent-hover text-white font-semibold shadow-glow`;
const btnDanger = `${btnBase} px-3.5 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/25 font-semibold`;
const btnAccent = `${btnBase} bg-surface-3 hover:bg-surface-2 text-accent border border-accent/30`;

export default function ProjectDetailHeader({ project, onStart, onStop, onRestart, onEdit, onDuplicate }) {
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
          <div className="w-11 h-11 rounded-xl bg-surface-3 border border-border flex items-center justify-center text-ink-soft shrink-0 shadow-sm">
            <StackLogo type={project?.type} size={24} />
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
          {appUrl && (
            <button
              onClick={handleOpenBrowser}
              disabled={status !== 'running'}
              title={status === 'running' ? `Open ${appUrl} in browser` : 'Start the project to open the app'}
              className={`${btnBase} px-3.5 border font-semibold ${
                status === 'running'
                  ? 'text-success border-success/30 bg-success/10 hover:bg-success/20'
                  : 'bg-surface-3 opacity-50 cursor-not-allowed'
              }`}
            >
              <Icon name="globe" size={13} />
              Open App
            </button>
          )}

          <button
            onClick={handleRevealInExplorer}
            title="Reveal project folder in File Explorer"
            className={btnSecondary}
          >
            <Icon name="folder" size={13} />
            Explorer
          </button>
          <button
            onClick={handleOpenInEditor}
            title="Open project folder in VS Code / Editor"
            className={btnSecondary}
          >
            <Icon name="code" size={13} />
            Editor
          </button>

          {/* Lifecycle Controls */}
          {status === 'running' ? (
            <>
              <button onClick={onRestart} className={btnAccent}>
                <Icon name="restart" size={13} />
                Restart
              </button>
              <button onClick={onStop} className={btnDanger}>
                <Icon name="stop" size={12} />
                Stop
              </button>
            </>
          ) : busy ? (
            <button disabled className={`${btnBase} px-3.5 bg-warning/10 text-warning border border-warning/20 font-semibold cursor-wait`}>
              {status === 'starting' ? 'Starting...' : 'Stopping...'}
            </button>
          ) : status === 'error' ? (
            <button onClick={onRestart} className={btnDanger}>
              <Icon name="restart" size={13} />
              Restart
            </button>
          ) : (
            <button onClick={onStart} className={btnPrimary}>
              <Icon name="play" size={13} />
              Start Project
            </button>
          )}

          <button onClick={onEdit} title="Edit project configuration" className={btnSecondary}>
            <Icon name="gear" size={13} />
            Edit
          </button>
          {onDuplicate && (
            <button onClick={onDuplicate} title="Duplicate this project as a new entry" className={btnSecondary}>
              <Icon name="duplicate" size={13} />
              Duplicate
            </button>
          )}
        </div>
      </div>

      {/* Sub Metadata Line */}
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
        {project?.cpu != null && (
          <span>CPU <strong className={`font-semibold ${project.cpu > 80 ? 'text-danger' : project.cpu > 60 ? 'text-warning' : 'text-success'}`}>{Number(project.cpu).toFixed(1)}%</strong></span>
        )}
        {(project?.memory != null || project?.metrics?.memoryMb != null) && (
          <span>RAM <strong className="text-success font-semibold">{project?.metrics?.memoryMb != null ? project.metrics.memoryMb : Number(project.memory).toFixed(0)} MB</strong></span>
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
