import React from 'react';

export default function ProjectListRow({
  project,
  isSelected,
  onToggleSelect,
  onShowDetail
}) {
  const status = (project.status || 'stopped').toLowerCase();

  const renderStatusDot = () => {
    if (status === 'running') {
      return (
        <span className="relative flex w-2 h-2" style={{ color: project.color }}>
          <span className="pulse-dot"></span>
          <span
            className="relative w-2 h-2 rounded-full"
            style={{ backgroundColor: project.color }}
          ></span>
        </span>
      );
    } else if (status === 'starting' || status === 'stopping') {
      return (
        <svg width="8" height="8" className="animate-spin text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
      );
    } else {
      return <span className="w-2 h-2 rounded-full bg-ink-faint"></span>;
    }
  };

  const renderStatus = () => {
    if (status === 'running') {
      return (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-success/10 text-success">
          ↑ {project.uptime || 'running'}
        </span>
      );
    } else if (status === 'starting' || status === 'stopping') {
      return (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning/15 text-warning uppercase">
          {status === 'starting' ? 'Starting…' : 'Stopping…'}
        </span>
      );
    } else {
      return (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-3 text-ink-faint">
          idle {project.idleTime || ''}
        </span>
      );
    }
  };

  const renderActionButton = () => {
    if (status === 'running') {
      return (
        <button
          onClick={project.onStop}
          className="text-xs font-medium text-danger hover:underline"
        >
          Stop
        </button>
      );
    } else if (status === 'starting' || status === 'stopping') {
      return (
        <span className="text-xs font-medium text-warning cursor-wait">
          {status === 'starting' ? 'Booting…' : 'Stopping…'}
        </span>
      );
    } else {
      return (
        <button
          onClick={project.onStart}
          className="text-xs font-medium text-success hover:underline"
        >
          Start
        </button>
      );
    }
  };

  return (
    <div className="flex items-center gap-4 bg-surface border border-border rounded-lg px-4 py-3">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        className="project-select w-3.5 h-3.5 rounded border-border bg-surface-3 accent-accent"
      />
      {renderStatusDot()}
      <p
        className="text-sm font-medium w-40 truncate cursor-pointer hover:text-accent"
        onClick={onShowDetail}
      >
        {project.name}
      </p>
      <p className="text-xs font-mono text-ink-faint w-28">
        {project.type} · :{project.port}
      </p>
      <p className="text-xs font-mono text-ink-faint flex-1 truncate">
        {project.path}
      </p>
      {renderStatus()}
      {renderActionButton()}
    </div>
  );
}
