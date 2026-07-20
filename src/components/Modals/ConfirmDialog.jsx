import React from 'react';

/**
 * ConfirmDialog - Deletion confirmation dialog
 * Lines 975-990 from template
 */
const ConfirmDialog = ({ isOpen, onClose, onConfirm, projectName = 'this project' }) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div id="confirmDialog" className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div className="relative h-full flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-surface border border-border rounded-xl shadow-card p-5">
          <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center mb-3">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-danger"
            >
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
            </svg>
          </div>
          <h3 className="font-display font-bold text-sm">
            Remove <span id="confirmProjectName">"{projectName}"</span>?
          </h3>
          <p className="text-xs text-ink-faint mt-1.5 leading-relaxed">
            This only removes it from DevLauncher — your project files on disk won't be touched.
            This action can't be undone.
          </p>
          <div className="flex items-center justify-end gap-2 mt-5">
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-3 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-3.5 py-2 rounded-lg bg-danger hover:bg-danger/90 text-white text-sm font-semibold transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
