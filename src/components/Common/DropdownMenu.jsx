import { useState, useRef, useEffect } from 'react';

export default function DropdownMenu({ trigger, children, isOpen, onClose }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const dropdownRef = useRef(null);

  const open = isOpen !== undefined ? isOpen : internalOpen;
  const setOpen = isOpen !== undefined ? () => {} : setInternalOpen;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        if (isOpen !== undefined && onClose) {
          onClose();
        } else {
          setInternalOpen(false);
        }
      }
    };

    if (open) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [open, isOpen, onClose]);

  const handleToggle = (e) => {
    e.stopPropagation();
    if (isOpen !== undefined && onClose) {
      if (!open) {
        // Can't open from outside, parent must control
      } else {
        onClose();
      }
    } else {
      setInternalOpen(!open);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <div onClick={handleToggle}>{trigger}</div>
      {open && (
        <div className="dropdown-menu absolute right-0 top-full mt-1 w-44 bg-surface-2 border border-border rounded-lg shadow-card py-1 z-20">
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ children, onClick, danger }) {
  return (
    <button
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
