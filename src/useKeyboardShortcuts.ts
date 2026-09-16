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
      // The active dialog owns its keyboard lifecycle, including nested menus.
      if (openModal === 'project') return
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

      // Escape - Close modals (not while typing)
      if (e.key === 'Escape' && openModal) {
        e.preventDefault()
        onCloseModal()
        return
      }

      // Typing guard: let ? and Escape type normally into inputs/textareas,
      // otherwise the global shortcut steals the keystroke.
      const target = e.target as HTMLElement | null
      const isTyping = target
        && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || (target as HTMLElement & { isContentEditable?: boolean }).isContentEditable)
      if (isTyping) return

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
