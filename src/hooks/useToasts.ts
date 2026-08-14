import { useState, useCallback } from 'react'

export interface Toast {
  id: number
  type: string
  message: string
}

/**
 * useToasts — toast notifications with 5s auto-dismiss.
 */
export const useToasts = () => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((type: string, message: string) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, type, message }])

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      dismissToast(id)
    }, 5000)
  }, [dismissToast])

  return { toasts, dismissToast, showToast }
}
