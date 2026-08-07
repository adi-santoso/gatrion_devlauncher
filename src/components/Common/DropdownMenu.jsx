import React, { useState, useRef, useEffect } from 'react';

export default function DropdownMenu({ trigger, children, isOpen, onClose }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const dropdownRef = useRef(null);

  const open = isOpen !== undefined ? isOpen : internalOpen;
  const closeMenu = () => {
    if (isOpen !== undefined && onClose) onClose();
    else setInternalOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        closeMenu();
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') closeMenu();
    };

    if (open) {
      // Defer listener attachment so the same click that opened the menu
      // is not treated as an outside click and immediately closes it.
      const frame = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
      }, 0);
      return () => {
        clearTimeout(frame);
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }

    return undefined;
  }, [open, isOpen, onClose]);

  const handleToggle = (e) => {
    e.stopPropagation();
    if (open) closeMenu();
    else if (isOpen === undefined) setInternalOpen(true);
    // Controlled mode: parent is responsible for opening via isOpen
  };

  const items = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    if (child.type === DropdownItem) {
      return React.cloneElement(child, {
        onClick: (event) => {
          child.props.onClick?.(event);
          closeMenu();
        },
      });
    }
    return child;
  });

  return (
    <div ref={dropdownRef} className="relative">
      <div onClick={handleToggle} aria-haspopup="menu" aria-expanded={open}>{trigger}</div>
      {open && (
        <div role="menu" className="dropdown-menu absolute right-0 top-full mt-1 w-44 bg-surface-2 border border-border rounded-lg shadow-card py-1 z-20">
          {items}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ children, onClick, danger }) {
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
  );
}

export function DropdownSeparator() {
  return <div className="h-px bg-border my-1"></div>;
}
