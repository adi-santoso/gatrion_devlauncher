import React, { useState } from 'react';

/**
 * DemoPanel - Demo quick-nav panel (template preview)
 * Lines 1106-1128 from template
 */
const DemoPanel = ({ onNavigate, onOpenModal, onToggleTray }) => {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const togglePanel = () => {
    setIsPanelOpen(!isPanelOpen);
  };

  const handleNavigate = (view) => {
    onNavigate(view);
    setIsPanelOpen(false);
  };

  const handleOpenModal = (modal) => {
    onOpenModal(modal);
    setIsPanelOpen(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <button
        onClick={togglePanel}
        className="w-11 h-11 rounded-full bg-accent shadow-glow flex items-center justify-center text-white"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.32.4.6.73.79.24.14.5.21.78.21H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      </button>
      {isPanelOpen && (
        <div
          id="demoPanelBody"
          className="absolute bottom-14 right-0 w-64 bg-surface-2 border border-border rounded-xl shadow-card p-3"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint mb-2">
            Template Preview — jump anywhere
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => handleNavigate('dashboard')}
              className="px-2 py-1.5 rounded-lg bg-surface-3 hover:bg-surface text-[11px] text-ink-soft hover:text-ink text-left transition-colors"
            >
              Dashboard
            </button>
            <button
              onClick={() => handleNavigate('projects')}
              className="px-2 py-1.5 rounded-lg bg-surface-3 hover:bg-surface text-[11px] text-ink-soft hover:text-ink text-left transition-colors"
            >
              Projects
            </button>
            <button
              onClick={() => handleNavigate('project-detail')}
              className="px-2 py-1.5 rounded-lg bg-surface-3 hover:bg-surface text-[11px] text-ink-soft hover:text-ink text-left transition-colors"
            >
              Project Detail
            </button>
            <button
              onClick={() => handleNavigate('settings')}
              className="px-2 py-1.5 rounded-lg bg-surface-3 hover:bg-surface text-[11px] text-ink-soft hover:text-ink text-left transition-colors"
            >
              Settings
            </button>
            <button
              onClick={() => handleNavigate('empty')}
              className="px-2 py-1.5 rounded-lg bg-surface-3 hover:bg-surface text-[11px] text-ink-soft hover:text-ink text-left transition-colors"
            >
              Empty State
            </button>
            <button
              onClick={() => handleNavigate('loading')}
              className="px-2 py-1.5 rounded-lg bg-surface-3 hover:bg-surface text-[11px] text-ink-soft hover:text-ink text-left transition-colors"
            >
              Loading Skeleton
            </button>
          </div>
          <div className="h-px bg-border my-2.5"></div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => handleOpenModal('updateBanner')}
              className="px-2 py-1.5 rounded-lg bg-surface-3 hover:bg-surface text-[11px] text-ink-soft hover:text-ink text-left transition-colors"
            >
              Update Banner
            </button>
            <button
              onClick={() => handleOpenModal('portConflict')}
              className="px-2 py-1.5 rounded-lg bg-surface-3 hover:bg-surface text-[11px] text-ink-soft hover:text-ink text-left transition-colors"
            >
              Port Conflict
            </button>
            <button
              onClick={onToggleTray}
              className="px-2 py-1.5 rounded-lg bg-surface-3 hover:bg-surface text-[11px] text-ink-soft hover:text-ink text-left transition-colors"
            >
              Tray Menu
            </button>
            <button
              onClick={() => handleOpenModal('commandPalette')}
              className="px-2 py-1.5 rounded-lg bg-surface-3 hover:bg-surface text-[11px] text-ink-soft hover:text-ink text-left transition-colors"
            >
              Cmd Palette
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DemoPanel;
