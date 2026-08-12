import React, { useMemo } from 'react';

// Tiny sparkline from a list of numeric samples
const Sparkline = ({ samples, stroke = '#34d399', height = 22 }) => {
  const points = useMemo(() => {
    const values = (samples || []).filter((value) => value != null && Number.isFinite(value));
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const width = 96;
    return values.map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [samples, height]);
  if (!points) return null;
  return (
    <svg width="96" height={height} viewBox={`0 0 96 ${height}`} className="mt-1 block" aria-hidden="true">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
};

export default function ProjectCard({ project, onStart, onStop, onRestart, onNavigate, getMetricHistory }) {
  const cpu = project.cpu ?? project.cpuUsage;
  const memory = project.memory ?? project.mem ?? project.memoryUsage;
  const history = typeof getMetricHistory === 'function' ? getMetricHistory(project.id) : [];
  const cpuSamples = useMemo(() => history.map((sample) => sample.cpu), [history]);
  const memorySamples = useMemo(() => history.map((sample) => sample.memory), [history]);
  const status = (project.status || '').toLowerCase();
  const isRunning = status === 'running';
  const isStarting = status === 'starting';
  const isStopping = status === 'stopping';
  const isError = status === 'error';
  const hasLogs = project.logs?.length > 0;

  return (
    <article className="group min-w-0 rounded-xl border border-border bg-surface/80 p-4 shadow-card transition-all hover:shadow-lg">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button 
            type="button" 
            onClick={() => onNavigate?.(project)} 
            className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center text-sm font-bold transition-all ${
              project.color 
                ? `bg-${project.color}-100 text-${project.color}` 
                : 'bg-gradient-to-br from-accent-soft to-accent text-white'
            }`}
          >
            {project.emoji || project.name?.slice(0, 1)?.toUpperCase() || '?'}
          </button>
          <button 
            type="button" 
            onClick={() => onNavigate?.(project)} 
            className="min-w-0 flex-1 text-left truncate"
          >
            <strong className="block truncate font-display text-xs font-bold leading-tight hover:text-accent">
              {project.name}
            </strong>
            <span className="flex items-center gap-1 truncate">
              <span className="truncate font-mono text-[9px] text-ink-faint capitalize">
                {project.type || project.stack || 'Web Application'}
              </span>
              {Array.isArray(project.tags) && project.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="shrink-0 rounded px-1 py-0.5 bg-surface-3 text-[8px] text-ink-faint">{tag}</span>
              ))}
            </span>
          </button>
        </div>
        <span className={`ml-2 shrink-0 rounded-md px-2 py-0.5 font-mono text-[8px] font-medium uppercase tracking-wide ${
          isRunning 
            ? 'bg-success/10 text-emerald-600 dark:text-emerald-400 animate-pulse' 
            : isStarting 
            ? 'bg-blue-100/10 text-blue-600 dark:text-blue-400' 
            : isError
            ? 'bg-red-100/10 text-red-600 dark:text-red-400'
            : 'bg-gray-100/10 text-gray-600 dark:text-gray-400'
        }`}>
          {isRunning && <><span className="inline-block h-1.5 w-1.5 rounded-full bg-current mr-1"></span>Running</>}
          {!isRunning && !isStarting && !isStopping && !isError && <><span className="inline-block h-1.5 w-1.5 rounded-sm bg-current mr-1"></span>Stopped</>}
          {isStarting && <><span className="inline-block h-1.5 w-1.5 rounded-full bg-current mr-1 animate-pulse"></span>Starting</>}
          {isStopping && <><span className="inline-block h-1.5 w-1.5 rounded-full bg-current mr-1 animate-pulse"></span>Stopping</>}
          {isError && <><span className="inline-block h-1.5 w-1.5 rounded-full bg-current mr-1"></span>Error</>}
        </span>
      </div>
      
      <div className="space-y-2.5">
        {(project.port || project.url) && (
          <div className="flex flex-wrap gap-2 font-mono text-[9px]">
            {project.port && (
              <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-1 text-ink-soft">
                <svg className="h-3 w-3 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                {project.port}
              </span>
            )}
            {project.protocol && (
              <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-1 text-ink-soft">
                {project.protocol}
              </span>
            )}
            {project.pid != null && (
              <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-1 text-ink-soft">
                <svg className="h-3 w-3 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                PID {project.pid}
              </span>
            )}
            {project.uptime && (
              <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-1 text-ink-soft">
                <svg className="h-3 w-3 text-ink-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {project.uptime}
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-mono text-[7px] uppercase tracking-wider text-ink-faint">CPU Usage</span>
                {cpu != null && cpu > 80 && <span className="animate-pulse text-[8px] text-warning">⚠️</span>}
              </div>
              <strong className="font-mono text-sm font-bold text-emerald-500 dark:text-emerald-400 block">
                {cpu != null ? `${Number(cpu).toFixed(1)}%` : 'N/A'}
              </strong>
              {cpu != null && (
                <div className="mt-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${
                      cpu > 80 ? 'bg-red-500' : cpu > 60 ? 'bg-yellow-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(cpu, 100)}%` }}
                  />
                </div>
              )}
              {isRunning && <Sparkline samples={cpuSamples} stroke="#34d399" />}
            </div>
            <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-mono text-[7px] uppercase tracking-wider text-ink-faint">Memory</span>
                {memory != null && typeof memory === 'number' && memory > 1600 && <span className="animate-pulse text-[8px] text-warning">⚠️</span>}
              </div>
              <strong className="font-mono text-sm font-bold text-blue-500 dark:text-blue-400 block">
                {memory != null 
                  ? (typeof memory === 'number' ? `${memory.toFixed(1)} MB` : String(memory))
                  : 'N/A'}
              </strong>
              {memory != null && typeof memory === 'number' && (
                <div className="mt-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${
                      memory > 3072 ? 'bg-red-500' : memory > 2048 ? 'bg-yellow-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min((memory / (2 * 1024)) * 100, 100)}%` }}
                  />
                </div>
              )}
              {isRunning && <Sparkline samples={memorySamples} stroke="#60a5fa" />}
            </div>
          </div>

        {!hasLogs && !isRunning && !isStarting && !isStopping && (
          <div className="text-center rounded-lg border border-dashed border-border bg-surface/30 px-3 py-2">
            <span className="font-mono text-[9px] text-ink-faint">No live activity</span>
          </div>
        )}

        <div className="flex gap-1.5 pt-2">
          <button 
            type="button" 
            onClick={() => onNavigate?.(project)}
            className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] font-semibold text-ink-soft transition-colors hover:border-accent hover:bg-accent/5 hover:text-accent"
          >
            Inspect
          </button>
          {!isRunning && !isStarting && !isStopping && (
            <button 
              type="button" 
              onClick={() => onStart?.(project)}
              className="rounded-lg bg-accent px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Start
            </button>
          )}
          {isRunning && (
            <>
              <button 
                type="button" 
                onClick={() => onRestart?.(project)}
                title="Restart"
                className="w-9 rounded-lg border border-border bg-surface-2 text-ink-faint transition-colors hover:border-accent hover:text-accent"
              >
                <svg className="h-4 w-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button 
                type="button" 
                onClick={() => onStop?.(project)}
                title="Stop"
                className="w-9 rounded-lg border border-danger/20 bg-danger/10 text-danger transition-colors hover:bg-danger/20"
              >
                <svg className="h-4 w-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
