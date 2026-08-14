import { useState, useRef, useEffect, useCallback, Children, isValidElement, cloneElement } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactElement, ReactNode } from 'react'

interface DropdownMenuProps {
  trigger: ReactNode
  children: ReactNode
  isOpen?: boolean
  onClose?: () => void
}

interface DropdownItemProps {
  children?: ReactNode
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void
  danger?: boolean
}

export default function DropdownMenu({ trigger, children, isOpen, onClose }: DropdownMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const open = isOpen !== undefined ? isOpen : internalOpen
  const closeMenu = useCallback(() => {
    if (isOpen !== undefined && onClose) onClose()
    else setInternalOpen(false)
  }, [isOpen, onClose])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeMenu()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }

    if (open) {
      // Defer listener attachment so the same click that opened the menu
      // is not treated as an outside click and immediately closes it.
      const frame = setTimeout(() => {
        document.addEventListener('click', handleClickOutside)
        document.addEventListener('keydown', handleEscape)
      }, 0)
      return () => {
        clearTimeout(frame)
        document.removeEventListener('click', handleClickOutside)
        document.removeEventListener('keydown', handleEscape)
      }
    }

    return undefined
  }, [open, isOpen, onClose, closeMenu])

  const handleToggle = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (open) closeMenu()
    else if (isOpen === undefined) setInternalOpen(true)
    // Controlled mode: parent is responsible for opening via isOpen
  }

  const items = Children.map(children, (child) => {
    if (!isValidElement(child)) return child
    if (child.type === DropdownItem) {
      const item = child as ReactElement<DropdownItemProps>
      return cloneElement(item, {
        onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
          item.props.onClick?.(event)
          closeMenu()
        },
      })
    }
    return child
  })

  return (
    <div ref={dropdownRef} className="relative">
      <div onClick={handleToggle} role="button" aria-haspopup="menu" aria-expanded={open} className="cursor-pointer">{trigger}</div>
      {open && (
        <div role="menu" className="dropdown-menu absolute right-0 top-full mt-1 w-44 bg-surface-2 border border-border rounded-lg shadow-card py-1 z-20">
          {items}
        </div>
      )}
    </div>
  )
}

export function DropdownItem({ children, onClick, danger }: DropdownItemProps) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors ${
        danger
          ? 'text-danger hover:bg-danger/10'
          : 'text-ink-soft hover:text-ink hover:bg-surface-3'
      }`}
    >
      {children}
    </button>
  )
}

export function DropdownSeparator() {
  return <div className="h-px bg-border my-1"></div>
}
