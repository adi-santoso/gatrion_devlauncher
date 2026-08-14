import { useState, useCallback } from 'react';

/**
 * useToasts — toast notifications with 5s auto-dismiss.
 */
export const useToasts = () => {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((type, message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      dismissToast(id);
    }, 5000);
  }, [dismissToast]);

  return { toasts, dismissToast, showToast };
};
