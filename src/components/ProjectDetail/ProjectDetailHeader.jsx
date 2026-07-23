import React from 'react';

const statusClasses = {
  running: 'bg-success/10 text-success border-success/20', starting: 'bg-warning/10 text-warning border-warning/20',
  stopping: 'bg-warning/10 text-warning border-warning/20', error: 'bg-danger/10 text-danger border-danger/20',
  stopped: 'bg-surface-3 text-ink-faint border-border'
};

export default function ProjectDetailHeader({ project, onStart, onStop, onRestart, onEdit }) {
  const status = (project?.status || 'stopped').toLowerCase();
  const busy = status === 'starting' || status === 'stopping';
  return (
    <div className="flex items-start justify-between flex-wrap gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-12 h-12 rounded-xl bg-surface-3 flex items-center justify-center text-xl shrink-0">{project?.emoji || '*'}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display font-bold text-xl">{project?.name}</h2>
            <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${statusClasses[status] || statusClasses.stopped}`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>
          <p className="text-xs font-mono text-ink-faint mt-1.5 truncate">
            {project?.path} · {project?.type || 'CUSTOM'} · {project?.port == null ? 'no app port' : `:${project.port}`}
            {project?.pid != null && ` · pid ${project.pid}`}{project?.uptime && ` · uptime ${project.uptime}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {status === 'running' ? <>
          <button onClick={onRestart} className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-sm font-medium transition-colors">Restart</button>
          <button onClick={onStop} className="px-3.5 py-2 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger/15 text-sm font-medium transition-colors">Stop</button>
        </> : busy ?
          <button disabled className="px-3.5 py-2 rounded-lg bg-warning/10 text-warning border border-warning/20 text-sm font-medium cursor-wait">{status === 'starting' ? 'Starting...' : 'Stopping...'}</button>
          : <button onClick={onStart} className="px-3.5 py-2 rounded-lg bg-success/10 text-success border border-success/20 hover:bg-success/15 text-sm font-medium transition-colors">Start</button>}
        <button onClick={onEdit} className="px-3.5 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-sm font-medium transition-colors">Edit</button>
      </div>
    </div>
  );
}
