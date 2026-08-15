import { useState, useEffect, useRef, useMemo } from 'react';
import { Fragment } from 'react';
import StackLogo from '../Common/StackLogo';
import AnimatedModal from '../Common/AnimatedModal';
import { typeLabel } from '../../utils/typeLabels';
import * as ipc from '../../utils/ipcRenderer';
import type { ViewProject } from '../Dashboard/ProjectCard';
import type { PresetCardData } from '../Dashboard/PresetCard';
import type { ReactNode } from 'react';
import { ACTIONS, Icons, type ActionDef } from './commandPaletteActions';

/** Wrap matched parts of `text` in a highlighted <mark>. */
const Highlighted = ({ text, query }: { text: string; query: string }) => {
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

/** Project as consumed by the palette (may carry a legacy `label`). */
export interface PaletteProject extends ViewProject {
  label?: string;
}

interface PaletteSession {
  id: string;
  projectId?: string;
  title?: string;
  tokens?: number;
  [key: string]: unknown;
}

interface PaletteFile {
  path: string;
  name?: string;
  dir?: string;
  project?: string;
}

type PaletteItemKind = 'project' | 'session' | 'file' | 'preset' | 'action';

interface PaletteItem {
  kind: PaletteItemKind;
  id: string;
  name: string;
  subtitle: string;
  meta: string;
  icon?: ReactNode;
  searchable: Array<string | undefined>;
  project?: PaletteProject;
  preset?: PresetCardData;
  action?: ActionDef;
  projectId?: string;
  sessionId?: string;
  filePath?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose?: () => void;
  onItemSelect?: (command: Record<string, unknown>) => void;
  onSelectCommand?: (command: Record<string, unknown>) => void;
  projects?: PaletteProject[];
  presets?: PresetCardData[];
  actions?: ActionDef[];
}

const CommandPalette = ({
  isOpen,
  onClose,
  onItemSelect,
  onSelectCommand,
  projects = [],
  presets = [],
  actions = ACTIONS,
}: CommandPaletteProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Workspace search results (agent sessions across projects + filenames).
  const [sessions, setSessions] = useState<PaletteSession[]>([]);
  const [files, setFiles] = useState<PaletteFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const searchSeqRef = useRef(0);
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

  // Refresh the session index every time the palette opens so newly created
  // conversations show up immediately.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    ipc.ompListAllSessions().then((result) => {
      if (!cancelled && result?.success) setSessions((result.sessions as PaletteSession[]) || []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen]);

  // Debounced filename search across project roots (min 2 chars to avoid
  // noise). A sequence ref discards stale results from a previous query.
  useEffect(() => {
    if (!isOpen) {
      setFiles([]);
      setFilesLoading(false);
      return;
    }
    const query = searchQuery.trim();
    const seq = ++searchSeqRef.current;
    if (query.length < 2) {
      setFiles([]);
      setFilesLoading(false);
      return;
    }
    setFilesLoading(true);
    const timer = setTimeout(async () => {
      const roots = projects.map((project) => project.path).filter(Boolean);
      try {
        const result = await ipc.searchWorkspaceFiles(query, roots);
        if (searchSeqRef.current !== seq) return;
        setFiles(result?.success ? (result.files as PaletteFile[]) || [] : []);
      } catch {
        if (searchSeqRef.current === seq) setFiles([]);
      } finally {
        if (searchSeqRef.current === seq) setFilesLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [isOpen, searchQuery, projects]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const projectItems = useMemo(() => projects.map((project) => ({
    kind: 'project' as const,
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

  // Agent sessions across every project (from the omp registry).
  const sessionItems = useMemo(() => {
    const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
    return (sessions || []).map((session) => ({
      kind: 'session' as const,
      id: `session-${session.projectId}-${session.id}`,
      name: session.title || 'Untitled session',
      subtitle: projectNameById.get(session.projectId || '') || session.projectId || '',
      meta: (session.tokens || 0) > 0 ? `${((session.tokens || 0) / 1000).toFixed(1)}k tokens` : '',
      icon: Icons.message,
      projectId: session.projectId,
      sessionId: session.id,
      searchable: [session.title, projectNameById.get(session.projectId || '') || '', session.id],
    }));
  }, [sessions, projects]);

  // Filename hits from the workspace scanner.
  const fileItems = useMemo(() => (files || []).map((file) => ({
    kind: 'file' as const,
    id: `file-${file.path}`,
    name: file.name || '',
    subtitle: file.dir || '',
    meta: file.project || '',
    icon: Icons.file,
    filePath: file.path,
    searchable: [file.name, file.dir, file.path, file.project],
  })), [files]);

  const presetItems = useMemo(() => presets.map((preset) => ({
    kind: 'preset' as const,
    id: `preset-${preset.id}`,
    name: preset.name || '',
    subtitle: `${preset.projectIds?.length || 0} project(s)`,
    meta: '',
    icon: Icons.layers,
    preset,
    searchable: [preset.name, preset.description],
  })), [presets]);

  const actionItems = useMemo(() => (actions.length > 0 ? actions : ACTIONS).map((action) => ({
    kind: 'action' as const,
    id: action.id,
    name: action.name || action.label || '',
    subtitle: '',
    meta: '',
    icon: action.icon || Icons.play,
    action,
    searchable: [action.name, action.label],
  })), [actions]);

  const sections = useMemo(() => {
    // `matches` is local so the memo only depends on searchQuery (a fresh
    // function identity each render would otherwise churn the memo).
    const matches = (text: string | undefined | null): boolean => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return String(text || '').toLowerCase().includes(query);
    };
    const filter = (items: PaletteItem[]): PaletteItem[] => items.filter((item) =>
      !searchQuery || item.searchable.some(matches)
    );
    const fileSection = searchQuery.trim().length >= 2
      ? [{ title: 'Files', items: filter(fileItems) }]
      : [];
    return [
      { title: 'Projects', items: filter(projectItems) },
      ...fileSection,
      { title: 'Sessions', items: filter(sessionItems) },
      { title: 'Presets', items: filter(presetItems) },
      { title: 'Actions', items: filter(actionItems) },
    ].filter((section) => section.items.length > 0);
  }, [projectItems, sessionItems, fileItems, presetItems, actionItems, searchQuery]);

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

  const handleItemClick = (item: PaletteItem): void => {
    // Close the palette BEFORE dispatching so commands that open another modal
    // (e.g. Add New Project, Keyboard Shortcuts) are not immediately closed again.
    onClose?.();
    if (handleSelect) {
      if (item.kind === 'project' && item.project) {
        handleSelect({
          ...item.project,
          id: `project-${item.project.id}`,
          projectId: item.project.id,
          type: 'project',
          name: item.name,
        });
      } else if (item.kind === 'preset' && item.preset) {
        handleSelect({ id: item.id, presetId: item.preset.id, type: 'preset', name: item.name });
      } else if (item.kind === 'session') {
        handleSelect({
          id: item.id,
          type: 'session',
          projectId: item.projectId,
          sessionId: item.sessionId,
          name: item.name,
        });
      } else if (item.kind === 'file') {
        handleSelect({
          id: item.id,
          type: 'file',
          filePath: item.filePath,
          project: item.subtitle,
          name: item.name,
        });
      } else if (item.action) {
        handleSelect(item.action);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
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
  const canSearchFiles = searchQuery.trim().length >= 2;

  return (
    <AnimatedModal id="commandPalette" isOpen={isOpen} onClose={onClose ?? (() => {})} position="top">
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
              placeholder="Search projects, sessions, files, or run a command…"
              className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
              aria-label="Search projects, sessions, files, or commands"
            />
            <kbd className="text-[10px] font-mono text-ink-faint border border-border rounded px-1.5 py-0.5">
              Esc
            </kbd>
          </div>
          <div id="paletteResults" ref={listRef} className="max-h-80 overflow-y-auto py-2">
            {sections.map((section) => (
              <Fragment key={section.title}>
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
              </Fragment>
            ))}
            {!hasResults && (
              <p className="px-4 py-8 text-center text-xs text-ink-faint">
                {searchQuery
                  ? (filesLoading && canSearchFiles ? 'Searching files…' : 'No results found')
                  : 'Type to search projects, sessions, files, and commands'}
              </p>
            )}
          </div>
        </div>
    </AnimatedModal>
  );
};

export default CommandPalette;
