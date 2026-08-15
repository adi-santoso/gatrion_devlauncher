import { useEffect } from 'react'

export interface KeyboardShortcutDeps {
  openModal: string | null
  onOpenModal: (modalName: string) => void
  onCloseModal: () => void
  onStartAll: () => void
  onStopAll: () => void
  setOpenModal: (modal: string | null) => void
}

/**
 * Global keyboard shortcuts: Ctrl/Cmd+K palette, Ctrl+N new project,
 * Ctrl+Shift+S/X start/stop all, Escape close modals, ? shortcuts.
 * Re-binds only when the modal registry changes.
 */
export function useKeyboardShortcuts({ openModal, onOpenModal, onCloseModal, onStartAll, onStopAll, setOpenModal }: KeyboardShortcutDeps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K - Open command palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpenModal('command')
        return
      }

      // Ctrl+N - Add new project
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        onOpenModal('project')
        return
      }

      // Ctrl+Shift+S - Start all projects
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        onStartAll()
        return
      }

      // Ctrl+Shift+X - Stop all projects
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'x') {
        e.preventDefault()
        onStopAll()
        return
      }

      // Escape - Close modals
      if (e.key === 'Escape' && openModal) {
        e.preventDefault()
        onCloseModal()
        return
      }

      // ? - Open shortcuts modal
      if (e.key === '?' && !openModal) {
        e.preventDefault()
        setOpenModal('shortcuts')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openModal, onOpenModal, onCloseModal, onStartAll, onStopAll, setOpenModal])
}
