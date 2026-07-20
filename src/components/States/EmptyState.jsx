import React from 'react';

/**
 * EmptyState - First-run empty state with icon, title, message, action buttons
 * Lines 878-890 from template
 */
const EmptyState = ({ onAddProject, onImportFolder }) => {
  return (
    <div className="view">
      <div className="flex flex-col items-center justify-center text-center py-24 px-4">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-5">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="text-accent"
          >
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M9 9h6v6H9z" />
          </svg>
        </div>
        <h2 className="font-display font-bold text-xl">Welcome to DevLauncher</h2>
        <p className="text-sm text-ink-faint mt-2 max-w-sm">
          You don't have any projects yet. Point DevLauncher at a folder and it'll detect the
          stack automatically.
        </p>
        <div className="flex items-center gap-2 mt-6">
          <button
            onClick={onAddProject}
            className="px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors"
          >
            + Add Your First Project
          </button>
          <button
            onClick={onImportFolder}
            className="px-4 py-2.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-ink text-sm font-medium border border-border transition-colors"
          >
            Import from Folder
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmptyState;
