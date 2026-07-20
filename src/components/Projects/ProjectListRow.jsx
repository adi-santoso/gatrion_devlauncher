import React from 'react';

export default function ProjectListRow({
  project,
  isSelected,
  onToggleSelect,
  onShowDetail
}) {
  const renderStatusDot = () => {
    if (project.status === 'running') {
      return (
        <span className="relative flex w-2 h-2" style={{ color: project.color }}>
          <span className="pulse-dot"></span>
          <span
            className="relative w-2 h-2 rounded-full"
            style={{ backgroundColor: project.color }}
          ></span>
        </span>
      );
    } else {
      return <span className="w-2 h-2 rounded-full bg-ink-faint"></span>;
    }
  };

  const renderStatus = () => {
    if (project.status === 'running') {
      return (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-success/10 text-success">
          ↑ {project.uptime}
        </span>
      );
    } else {
      return (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-3 text-ink-faint">
          idle {project.idleTime}
        </span>
      );
    }
  };

  const renderActionButton = () => {
    if (project.status === 'running') {
      return (
        <button
          onClick={project.onStop}
          className="text-xs font-medium text-danger hover:underline"
        >
          Stop
        </button>
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
