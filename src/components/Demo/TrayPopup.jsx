import React from 'react';

/**
 * TrayPopup - Tray menu popup showing running projects
 * Lines 1084-1101 from template
 */
const TrayPopup = ({ isOpen, runningProjects = [], onClose, onStopProject, onQuit }) => {
  if (!isOpen) return null;

  return (
    <div
      id="trayPopup"
      className="fixed bottom-16 left-4 z-40 w-64 bg-surface-2 border border-border rounded-xl shadow-card py-2"
    >
      <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
        Running ({runningProjects.length})
      </p>
      {runningProjects.map((project) => (
        <div
          key={project.id}
          className="flex items-center justify-between px-3 py-1.5 hover:bg-surface-3 text-xs"
        >
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
            {project.name}
          </span>
          <button
            onClick={() => onStopProject(project.id)}
            className="text-ink-faint hover:text-danger"
          >
            Stop
          </button>
        </div>
      ))}
      <div className="h-px bg-border my-1.5"></div>
      <button
        onClick={onClose}
        className="w-full text-left px-3 py-1.5 text-xs text-ink-soft hover:bg-surface-3 hover:text-ink"
      >
        Open DevLauncher
      </button>
      <button
        onClick={onQuit}
        className="w-full text-left px-3 py-1.5 text-xs text-danger hover:bg-danger/10"
      >
        Quit
      </button>
    </div>
  );
};

export default TrayPopup;
