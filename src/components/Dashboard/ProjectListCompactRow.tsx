import { useEffect, useState } from 'react';
import StackLogo from '../Common/StackLogo';
import type { ViewProject } from './ProjectCard';

const FORCE_STOP_DELAY_MS = 10000;

const PlayIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 5.14v13.72c0 .8.87 1.3 1.56.88l11-6.86a1.03 1.03 0 000-1.76l-11-6.86A1.03 1.03 0 007 5.14z" />
  </svg>
);

const StopIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

const RestartIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 11-2.64-6.36" /><path d="M21 3v6h-6" />
  </svg>
);

const ForceIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
  </svg>
);

const SpinnerIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin" aria-hidden="true">
    <path d="M21 12a9 9 0 11-6.219-8.56" />
  </svg>
);

const statusStyles: Record<string, string> = {
  running: 'bg-success/10 text-success border-success/20',
  starting: 'bg-warning/10 text-warning border-warning/20',
  stopping: 'bg-warning/10 text-warning border-warning/20',
  error: 'bg-danger/10 text-danger border-danger/20',
  stopped: 'bg-surface-3 text-ink-faint border-border'
};

const lifecycleButtonClass = 'w-7 h-7 inline-flex items-center justify-center rounded-md border border-border bg-surface-2 shrink-0 transition-colors';

interface ProjectListCompactRowProps {
  project: ViewProject;
  onNavigate?: (project: ViewProject) => void;
  onStart?: (project: ViewProject) => unknown;
  onStop?: (project: ViewProject) => void;
  onRestart?: (project: ViewProject) => void;
  onForceStop?: (project: ViewProject) => void;
}

/** One-line dashboard row: identity + status + port + lifecycle actions. */
export default function ProjectListCompactRow({
  project,
  onNavigate,
  onStart,
  onStop,
  onRestart,
  onForceStop,
}: ProjectListCompactRowProps) {
  const status = (project.status || 'stopped').toLowerCase();
  const [showForceStop, setShowForceStop] = useState(false);

  useEffect(() => {
    if (status !== 'stopping') {
      setShowForceStop(false);
      return undefined;
    }
    const timer = setTimeout(() => setShowForceStop(true), FORCE_STOP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const renderLifecycleAction = () => {
    if (status === 'running') {
      return (
        <>
          <button type="button" onClick={() => onRestart?.(project)} title="Restart" aria-label={`Restart ${project.name}`} className={`${lifecycleButtonClass} text-ink-soft hover:text-accent hover:border-accent/40`}>
            <RestartIcon />
          </button>
          <button type="button" onClick={() => onStop?.(project)} title="Stop" aria-label={`Stop ${project.name}`} className={`${lifecycleButtonClass} text-danger`}>
            <StopIcon />
          </button>
        </>
      );
    }
    if (status === 'starting' || (status === 'stopping' && !showForceStop)) {
      return (
        <span className={`${lifecycleButtonClass} text-warning cursor-wait`} title={status === 'starting' ? 'Starting…' : 'Stopping…'}>
          <SpinnerIcon />
        </span>
      );
    }
    if (status === 'stopping' && showForceStop) {
      return (
        <button type="button" onClick={() => onForceStop?.(project)} title="Force stop" aria-label={`Force stop ${project.name}`} className={`${lifecycleButtonClass} text-danger border-danger/40 hover:bg-danger/10`}>
          <ForceIcon />
        </button>
      );
    }
    return (
      <button type="button" onClick={() => onStart?.(project)} title="Start" aria-label={`Start ${project.name}`} className={`${lifecycleButtonClass} text-success hover:border-success/40`}>
        <PlayIcon />
      </button>
    );
  };

  return (
    <div className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 transition-colors hover:border-border hover:bg-surface-2/60">
      <button type="button" onClick={() => onNavigate?.(project)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="w-8 h-8 shrink-0 rounded-lg bg-surface-3 flex items-center justify-center">
          <StackLogo type={project.type} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <strong className="truncate font-display text-xs font-bold text-ink group-hover:text-accent">{project.name}</strong>
            {Array.isArray(project.tags) && project.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="shrink-0 rounded bg-surface-3 px-1 py-0.5 text-[8px] text-ink-faint">{tag}</span>
            ))}
          </span>
          <span className="flex items-center gap-2 font-mono text-[9px] text-ink-faint">
            <span className="capitalize">{project.type || project.stack || 'Web Application'}</span>
            {project.port != null && <span>:{project.port}</span>}
          </span>
        </span>
      </button>
      <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-medium ${statusStyles[status] || statusStyles.stopped}`}>
        {(status === 'starting' || status === 'stopping' || status === 'running') && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
      <div className="flex shrink-0 items-center gap-1.5">{renderLifecycleAction()}</div>
    </div>
  );
}
