import React from 'react';

/**
 * ConfirmDialog - Deletion confirmation dialog
 * Lines 975-990 from template
 */
const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  onCancel,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      onClose();
    }
  };

  const variantStyles = {
    danger: 'bg-danger hover:bg-danger/90 text-white',
    primary: 'bg-accent hover:bg-accent-hover text-white',
  };

  return (
    <div id="confirmDialog" className="fixed inset-0 z-50">
      <div onClick={handleCancel} className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"></div>
      <div className="relative h-full flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-surface border border-border rounded-xl shadow-card p-5">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${
            confirmVariant === 'danger' ? 'bg-danger/10' : 'bg-accent/10'
          }`}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={confirmVariant === 'danger' ? 'text-danger' : 'text-accent'}
            >
              {confirmVariant === 'danger' ? (
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
              ) : (
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              )}
            </svg>
          </div>
          <h3 className="font-display font-bold text-sm">{title}</h3>
          <p className="text-xs text-ink-faint mt-1.5 leading-relaxed">{message}</p>
          <div className="flex items-center justify-end gap-2 mt-5">
            <button
              onClick={handleCancel}
              className="px-3.5 py-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-3 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${variantStyles[confirmVariant]}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
