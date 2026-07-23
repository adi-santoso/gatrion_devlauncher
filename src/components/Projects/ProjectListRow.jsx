import React from 'react';

const statusClasses = {
  running: 'bg-success/10 text-success border-success/20', starting: 'bg-warning/10 text-warning border-warning/20',
  stopping: 'bg-warning/10 text-warning border-warning/20', error: 'bg-danger/10 text-danger border-danger/20',
  stopped: 'bg-surface-3 text-ink-faint border-border'
};

export default function ProjectListRow({ project, onStart, onStop, onRestart, onEdit, onDelete, onShowDetail }) {
  const status = (project.status || 'stopped').toLowerCase();
  const busy = status === 'starting' || status === 'stopping';
  return (
    <tr className="hover:bg-surface-3/60 transition-colors">
      <td className="px-5 py-3"><button onClick={onShowDetail} className="flex items-center gap-3 text-left group">
        <span className="w-9 h-9 rounded-lg bg-surface-3 flex items-center justify-center shrink-0">{project.emoji || '*'}</span>
        <span className="min-w-0"><span className="block font-medium group-hover:text-accent transition-colors">{project.name}</span>
          <span className="block text-[11px] font-mono text-ink-faint max-w-72 truncate">{project.path}</span></span>
      </button></td>
      <td className="px-3 py-3"><span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${statusClasses[status] || statusClasses.stopped}`}>
        {busy && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"/>}{status.charAt(0).toUpperCase() + status.slice(1)}
      </span></td>
      <td className="px-3 py-3 text-xs font-mono text-ink-soft">{project.type || 'CUSTOM'}</td>
      <td className="px-3 py-3 text-xs font-mono text-ink-soft">{project.port == null ? '-' : `:${project.port}`}</td>
      <td className="px-5 py-3"><div className="flex items-center justify-end gap-2">
        {status === 'running' ? <><button onClick={onRestart} className="text-xs font-medium text-accent hover:underline">Restart</button><button onClick={onStop} className="text-xs font-medium text-danger hover:underline">Stop</button></>
          : busy ? <span className="text-xs text-warning">Please wait...</span>
            : <button onClick={onStart} className="text-xs font-medium text-success hover:underline">Start</button>}
        <button onClick={onShowDetail} className="text-xs font-medium text-ink-soft hover:text-ink">Details</button>
        <button onClick={onEdit} className="text-xs font-medium text-ink-soft hover:text-ink">Edit</button>
        <button onClick={onDelete} className="text-xs font-medium text-danger hover:underline">Delete</button>
      </div></td>
    </tr>
  );
}
