import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Keep a component mounted during its exit animation, then unmount it.
 * `mounted` controls presence in the DOM, `visible` toggles the in/out classes.
 */
export function useTransitionMount(isOpen: boolean, duration = 160): { mounted: boolean; visible: boolean } {
  const [mounted, setMounted] = useState(isOpen)
  const [visible, setVisible] = useState(isOpen)

  useEffect(() => {
    if (isOpen) {
      setMounted(true)
      const frame = window.requestAnimationFrame(() => setVisible(true))
      return () => window.cancelAnimationFrame(frame)
    }
    setVisible(false)
    const timer = setTimeout(() => setMounted(false), duration)
    return () => clearTimeout(timer)
  }, [isOpen, duration])

  return { mounted, visible }
}

export type ModalPosition = 'center' | 'top'

interface AnimatedModalProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  position?: ModalPosition
  id?: string
}

/**
 * AnimatedModal — shared backdrop + panel wrapper so every modal animates the
 * same way (fade backdrop, scale/translate panel) and plays a short exit
 * animation before unmounting instead of disappearing instantly.
 *
 * `position="top"` drops the panel from above (used by the command palette).
 */
export default function AnimatedModal({ isOpen, onClose, children, position = 'center', id }: AnimatedModalProps) {
  const { mounted, visible } = useTransitionMount(isOpen)
  if (!mounted) return null

  const align = position === 'top' ? 'items-start pt-24' : 'items-center'
  const panelAnim = position === 'top'
    ? (visible ? 'animate-panel-top-in' : 'animate-panel-top-out')
    : (visible ? 'animate-panel-in' : 'animate-panel-out')

  return (
    <div id={id} className="fixed inset-0 z-50">
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer ${visible ? 'animate-backdrop-in' : 'animate-backdrop-out'}`}
      />
      <div className={`relative h-full flex ${align} justify-center p-4 ${panelAnim} ${visible ? '' : 'pointer-events-none'}`}>
        {children}
      </div>
    </div>
  )
}
