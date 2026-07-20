import React, { useState, useEffect, useRef } from 'react';

/**
 * CommandPalette - Search overlay (Ctrl+K) with filtered items
 * Lines 995-1017 from template
 */
const CommandPalette = ({ isOpen, onClose, onItemSelect, projects = [], actions = [] }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!isOpen) {
          // Open palette (handled by parent)
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filterItems = (item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const label = item.label.toLowerCase();
    return label.includes(query);
  };

  const filteredProjects = projects.filter(filterItems);
  const filteredActions = actions.filter(filterItems);

  const handleItemClick = (item) => {
    onItemSelect(item);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div id="commandPalette" className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div className="relative flex items-start justify-center pt-24 px-4">
        <div className="w-full max-w-lg bg-surface border border-border rounded-xl shadow-card overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-ink-faint"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              id="paletteInput"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              type="text"
              placeholder="Search projects or run a command…"
              className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
            <kbd className="text-[10px] font-mono text-ink-faint border border-border rounded px-1.5 py-0.5">
              Esc
            </kbd>
          </div>
          <div id="paletteResults" className="max-h-80 overflow-y-auto py-2">
            {filteredProjects.length > 0 && (
              <>
                <p className="px-4 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Projects
                </p>
                {filteredProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleItemClick(project)}
                    data-label={project.label}
                    className="palette-item w-full flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-surface-3 text-left"
                  >
                    {project.icon} {project.name}
                  </button>
                ))}
              </>
            )}
            {filteredActions.length > 0 && (
              <>
                <p className="px-4 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Actions
                </p>
                {filteredActions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleItemClick(action)}
                    data-label={action.label}
                    className="palette-item w-full flex items-center gap-2.5 px-4 py-2 text-sm text-ink hover:bg-surface-3 text-left"
                  >
                    {action.icon} {action.name}
                  </button>
                ))}
              </>
            )}
            {filteredProjects.length === 0 && filteredActions.length === 0 && searchQuery && (
              <p className="px-4 py-8 text-center text-xs text-ink-faint">No results found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
