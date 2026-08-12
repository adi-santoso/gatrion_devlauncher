import React, { useEffect, useState } from 'react';

/**
 * Toast - Individual toast notification component
 */
const Toast = ({ type = 'success', message, onDismiss }) => {
  const [leaving, setLeaving] = useState(false);

  // Play the slide-out animation, then let the parent remove the toast
  const dismiss = () => {
    setLeaving(true);
    setTimeout(onDismiss, 180);
  };
  const variants = {
    success: {
      border: 'border-success/30',
      icon: 'text-success',
      path: '<path d="M20 6L9 17l-5-5"/>',
    },
    error: {
      border: 'border-danger/30',
      icon: 'text-danger',
      path: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    },
    warning: {
      border: 'border-warning/30',
      icon: 'text-warning',
      path: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    },
    info: {
      border: 'border-accent/30',
      icon: 'text-accent',
      path: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    },
  };

  const variant = variants[type] || variants.success;

  useEffect(() => {
    const timer = setTimeout(() => {
      setLeaving(true);
      setTimeout(onDismiss, 180);
    }, 4000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className={`flex items-start gap-2.5 bg-surface-2 border ${variant.border} rounded-lg px-3.5 py-3 shadow-card ${leaving ? 'animate-toast-out' : 'animate-toast-in'}`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={`${variant.icon} shrink-0 mt-0.5`}
        dangerouslySetInnerHTML={{ __html: variant.path }}
      />
      <p className="text-xs text-ink flex-1">{message}</p>
      <button
        onClick={dismiss}
        className="text-ink-faint hover:text-ink shrink-0"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
};

/**
 * ToastContainer - Toast notification container (fixed bottom-right)
 * Lines 1074-1075 + JavaScript 1182-1199 from template
 */
const ToastContainer = ({ toasts, onDismiss }) => {
  return (
    <div id="toastContainer" className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 w-80">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          type={toast.type}
          message={toast.message}
          onDismiss={() => onDismiss(toast.id)}
        />
      ))}
    </div>
  );
};

export default ToastContainer;
