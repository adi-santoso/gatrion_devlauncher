import React, { useState, useEffect, useRef, useMemo } from 'react';
import StackLogo from '../Common/StackLogo';
import { typeLabel } from '../../utils/typeLabels';

const Svg = ({ children, size = 15 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0 text-ink-faint"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const Icons = {
  plus: <Svg><path d="M12 5v14M5 12h14" /></Svg>,
  grid: <Svg><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></Svg>,
  folder: <Svg><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></Svg>,
  gear: <Svg><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 01-.1 1l2 1.5-2 3.5-2.5-1A7 7 0 0115 18l-.4 3h-4l-.4-3a7 7 0 01-1.6-1L6 18l-2-3.5L6 13a7 7 0 010-2L4 9.5 6 6l2.6 1A7 7 0 0110 6l.4-3h4l.4 3a7 7 0 011.6 1L19 6l2 3.5-2 1.5a7 7 0 010 1z" /></Svg>,
  moon: <Svg><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></Svg>,
  keyboard: <Svg><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 13h10" /></Svg>,
  play: <Svg><path d="M7 4.9v14.2c0 .9.95 1.4 1.7.9l11-7.1c.7-.45.7-1.45 0-1.9l-11-7.1c-.75-.5-1.7 0-1.7.9z" /></Svg>,
  stop: <Svg><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>,
  layers: <Svg><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></Svg>,
  search: <Svg size={14}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></Svg>,
};

const ACTIONS = [
  { id: 'new-project', name: 'Add New Project', icon: Icons.plus },
  { id: 'view-dashboard', name: 'Go to Dashboard', icon: Icons.grid },
  { id: 'view-projects', name: 'Go to Projects Registry', icon: Icons.folder },
  { id: 'view-settings', name: 'Go to Settings', icon: Icons.gear },
  { id: 'toggle-theme', name: 'Toggle Dark/Light Theme', icon: Icons.moon },
  { id: 'shortcuts', name: 'Keyboard Shortcuts', icon: Icons.keyboard },
  { id: 'start-all', name: 'Start All Projects', icon: Icons.play },
  { id: 'stop-all', name: 'Stop All Projects', icon: Icons.stop },
];

/** Wrap matched parts of `text` in a highlighted <mark>. */
const Highlighted = ({ text, query }) => {
  if (!query) return text;
  const lower = text.toLowerCase();
  const index = lower.indexOf(query.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-transparent font-semibold text-accent">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
};

const CommandPalette = ({
  isOpen,
  onClose,
  onItemSelect,
  onSelectCommand,
  projects = [],
  presets = [],
  actions = ACTIONS
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const handleSelect = onItemSelect || onSelectCommand;

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (!isOpen) {
      setSearchQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const matches = (text) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return String(text || '').toLowerCase().includes(query);
  };

  const projectItems = useMemo(() => projects.map((project) => ({
    kind: 'project',
    id: project.id,
    name: project.name || project.label || '',
    subtitle: project.path || '',
    meta: typeLabel(project.type),
    icon: <StackLogo type={project.type} size={15} />,
    project,
    searchable: [
      project.name,
      project.path,
      project.type,
      typeLabel(project.type),
      project.port != null ? String(project.port) : '',
      ...(Array.isArray(project.tags) ? project.tags : []),
      project.startCommand,
      ...(Array.isArray(project.commands) ? project.commands.map((c) => c.name) : []),
      ...(Array.isArray(project.customCommands) ? project.customCommands.map((c) => c.label) : []),
    ],
  })), [projects]);

  const presetItems = useMemo(() => presets.map((preset) => ({
    kind: 'preset',
    id: `preset-${preset.id}`,
    name: preset.name || '',
    subtitle: `${preset.projectIds?.length || 0} project(s)`,
    meta: '',
    icon: Icons.layers,
    preset,
    searchable: [preset.name, preset.description],
  })), [presets]);

  const actionItems = useMemo(() => (actions.length > 0 ? actions : ACTIONS).map((action) => ({
    kind: 'action',
    id: action.id,
    name: action.name || action.label || '',
    subtitle: '',
    meta: '',
    icon: action.icon || Icons.play,
    action,
    searchable: [action.name, action.label],
  })), [actions]);

  const sections = useMemo(() => {
    const filter = (items) => items.filter((item) =>
      !searchQuery || item.searchable.some(matches)
    );
    return [
      { title: 'Projects', items: filter(projectItems) },
      { title: 'Presets', items: filter(presetItems) },
      { title: 'Actions', items: filter(actionItems) },
    ].filter((section) => section.items.length > 0);
  }, [projectItems, presetItems, actionItems, searchQuery]);

  const flatItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  // Keep the active index in bounds and scrolled into view
  useEffect(() => {
    if (activeIndex >= flatItems.length) setActiveIndex(Math.max(0, flatItems.length - 1));
  }, [flatItems.length, activeIndex]);

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  if (!isOpen) return null;

  const handleItemClick = (item) => {
    // Close the palette BEFORE dispatching so commands that open another modal
    // (e.g. Add New Project, Keyboard Shortcuts) are not immediately closed again.
    onClose?.();
    if (handleSelect) {
      if (item.kind === 'project') {
        handleSelect({
          ...item.project,
          id: `project-${item.project.id}`,
          projectId: item.project.id,
          type: 'project',
          name: item.name,
        });
      } else if (item.kind === 'preset') {
        handleSelect({ id: item.id, presetId: item.preset.id, type: 'preset', name: item.name });
      } else {
        handleSelect(item.action);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatItems.length > 0) setActiveIndex((index) => Math.min(flatItems.length - 1, index + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (e.key === 'Enter') {
      const item = flatItems[activeIndex];
      if (item) {
        e.preventDefault();
        handleItemClick(item);
      }
    }
  };

  const hasResults = flatItems.length > 0;

  return (
    <div id="commandPalette" className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"></div>
      <div className="relative flex items-start justify-center pt-24 px-4">
        <div className="w-full max-w-lg bg-surface border border-border rounded-xl shadow-card overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
            {Icons.search}
            <input
              ref={inputRef}
              id="paletteInput"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              type="text"
              placeholder="Search projects, presets, or run a command…"
              className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
              aria-label="Search projects, presets, or commands"
            />
            <kbd className="text-[10px] font-mono text-ink-faint border border-border rounded px-1.5 py-0.5">
              Esc
            </kbd>
          </div>
          <div id="paletteResults" ref={listRef} className="max-h-80 overflow-y-auto py-2">
            {sections.map((section) => (
              <React.Fragment key={section.title}>
                <p className="px-4 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  {section.title}
                </p>
                {section.items.map((item) => {
                  const index = flatItems.indexOf(item);
                  const active = index === activeIndex;
                  return (
                    <button
                      key={`${item.kind}-${item.id}`}
                      onClick={() => handleItemClick(item)}
                      onMouseEnter={() => setActiveIndex(index)}
                      data-label={item.name}
                      data-active={active}
                      className={`palette-item w-full flex items-center gap-2.5 px-4 py-2 text-sm text-ink text-left transition-colors ${active ? 'bg-surface-3' : 'hover:bg-surface-3/60'}`}
                    >
                      <span className="w-5 shrink-0 flex items-center justify-center text-sm">
                        {item.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium truncate">
                          <Highlighted text={item.name} query={searchQuery.trim()} />
                        </span>
                        {item.subtitle && (
                          <span className="block truncate font-mono text-[10px] text-ink-faint">
                            {item.subtitle}
                          </span>
                        )}
                      </span>
                      {item.meta && (
                        <span className="text-xs text-ink-faint ml-auto capitalize shrink-0">{item.meta}</span>
                      )}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
            {!hasResults && (
              <p className="px-4 py-8 text-center text-xs text-ink-faint">
                {searchQuery ? 'No results found' : 'Type to search projects, presets, and commands'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
