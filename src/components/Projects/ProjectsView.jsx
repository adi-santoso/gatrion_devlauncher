import React, { useEffect, useMemo, useRef, useState } from 'react';
import ProjectListRow from './ProjectListRow';
import BulkToolbar from './BulkToolbar';
import BulkTagModal from '../Modals/BulkTagModal';

export const TYPE_LABELS = {
  LARAVEL: 'Laravel',
  NEXTJS: 'Next.js',
  VUE: 'Vue.js',
  REACT_VITE: 'React (Vite)',
  GOLANG: 'Go',
  NODEJS: 'Node.js',
  CUSTOM: 'Custom',
};

export const typeLabel = (type) => TYPE_LABELS[type] || type || 'CUSTOM';

const STATUS_CHIPS = [
  { key: 'running', label: 'running', className: 'text-success bg-success/10 hover:bg-success/20' },
  { key: 'starting', label: 'starting', className: 'text-blue-500 bg-blue-500/10 hover:bg-blue-500/20' },
  { key: 'stopped', label: 'stopped', className: 'text-ink-soft bg-surface-3/60 hover:bg-surface-3' },
  { key: 'error', label: 'error', className: 'text-danger bg-danger/10 hover:bg-danger/20' },
];

export default function ProjectsView({
  projects = [],
  onStart,
  onStop,
  onForceStop,
  onRestart,
  onDelete,
  onBulkStart,
  onBulkStop,
  onBulkRestart,
  onBulkDelete,
  onBulkTagEdit,
  onEdit,
  onNavigate,
  onOpenModal,
  onDuplicate,
  onBulkSavePreset
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [selectedIds, setSelectedIds] = useState([]);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const selectAllRef = useRef(null);

  const types = useMemo(
    () => [...new Set(projects.map((project) => project.type).filter(Boolean))].sort(),
    [projects]
  );
  const tags = useMemo(
    () => [...new Set(projects.flatMap((project) => project.tags || []).filter(Boolean))].sort(),
    [projects]
  );
  const query = searchQuery.trim().toLowerCase();

  const filteredProjects = useMemo(() => projects.filter((project) => {
    const status = (project.status || 'stopped').toLowerCase();
    const searchable = [
      project.name,
      project.path,
      project.type,
      typeLabel(project.type),
      project.port != null ? String(project.port) : '',
      ...(Array.isArray(project.tags) ? project.tags : []),
      project.startCommand,
      ...(Array.isArray(project.commands) ? project.commands.map((c) => c.name) : []),
      ...(Array.isArray(project.customCommands) ? project.customCommands.map((c) => c.label) : []),
    ].map((value) => String(value || '').toLowerCase());
    const matchesSearch = !query || searchable.some((value) => value.includes(query));
    return matchesSearch
      && (typeFilter === 'all' || project.type === typeFilter)
      && (statusFilter === 'all' || status === statusFilter)
      && (tagFilter === 'all' || (Array.isArray(project.tags) && project.tags.includes(tagFilter)));
  }), [projects, query, typeFilter, statusFilter, tagFilter]);

  const sortedProjects = useMemo(() => {
    const factor = sort.dir === 'desc' ? -1 : 1;
    const compare = (a, b) => {
      if (sort.key === 'status') return (a.status || '').localeCompare(b.status || '') * factor;
      if (sort.key === 'type') return typeLabel(a.type).localeCompare(typeLabel(b.type)) * factor;
      if (sort.key === 'port') return ((a.port || 0) - (b.port || 0)) * factor;
      return (a.name || '').localeCompare(b.name || '') * factor;
    };
    return [...filteredProjects].sort(compare);
  }, [filteredProjects, sort]);

  // Keep selection scoped to projects that are still visible under current filters
  useEffect(() => {
    const visibleIds = new Set(sortedProjects.map((project) => project.id));
    setSelectedIds((previous) => {
      const retained = previous.filter((id) => visibleIds.has(id));
      return retained.length === previous.length ? previous : retained;
    });
  }, [sortedProjects]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedVisibleProjects = useMemo(
    () => sortedProjects.filter((project) => selectedIdSet.has(project.id)),
    [sortedProjects, selectedIdSet]
  );

  const handleSelectAll = (checked) => {
    setSelectedIds(checked ? sortedProjects.map((project) => project.id) : []);
  };

  const handleSelectOne = (id, checked) => {
    setSelectedIds((previous) => (
      checked
        ? (previous.includes(id) ? previous : [...previous, id])
        : previous.filter((item) => item !== id)
    ));
  };

  const handleClearSelection = () => setSelectedIds([]);

  const handleBulkStartClick = () => {
    if (selectedVisibleProjects.length > 0) onBulkStart?.(selectedVisibleProjects);
  };

  const handleBulkStopClick = () => {
    if (selectedVisibleProjects.length > 0) onBulkStop?.(selectedVisibleProjects);
  };

  const handleBulkRestartClick = () => {
    if (selectedVisibleProjects.length > 0) onBulkRestart?.(selectedVisibleProjects);
  };

  const handleBulkDeleteClick = () => {
    if (selectedVisibleProjects.length > 0) onBulkDelete?.(selectedVisibleProjects);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setStatusFilter('all');
    setTagFilter('all');
  };

  const toggleSort = (key) => {
    setSort((previous) => (
      previous.key === key
        ? { key, dir: previous.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'asc' }
    ));
  };

  const sortIndicator = (key) => {
    if (sort.key !== key) return <span className="ml-1 text-[9px] text-ink-faint opacity-60">⇅</span>;
    return <span className="ml-1 text-[9px] text-accent">{sort.dir === 'asc' ? '▲' : '▼'}</span>;
  };

  const allSelected = sortedProjects.length > 0
    && sortedProjects.every((project) => selectedIdSet.has(project.id));
  const someSelected = selectedVisibleProjects.length > 0 && !allSelected;

  // Keyboard shortcuts: Ctrl/Cmd+A selects all visible, Escape clears the selection
  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      const isTyping = target
        && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        if (isTyping || sortedProjects.length === 0) return;
        event.preventDefault();
        handleSelectAll(!allSelected);
      } else if (event.key === 'Escape' && !isTyping) {
        if (selectedIds.length > 0) handleClearSelection();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedProjects, allSelected, selectedIds.length]);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  // Counts for the clickable summary chips (overall, not filter-scoped)
  const statusCounts = useMemo(() => {
    const counts = { running: 0, starting: 0, stopping: 0, stopped: 0, error: 0 };
    for (const project of projects) {
      const status = (project.status || 'stopped').toLowerCase();
      if (counts[status] != null) counts[status] += 1;
    }
    return counts;
  }, [projects]);

  const toggleStatusFilter = (status) => {
    setStatusFilter((previous) => (previous === status ? 'all' : status));
  };

  return (
    <div className="view space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-faint">Project registry</p>
          <h1 className="font-display font-bold text-2xl mt-1">Projects</h1>
          <p className="text-sm text-ink-faint mt-1">Configure launch commands and manage local processes.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onOpenModal} className="px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors">
            + Add Project
          </button>
        </div>
      </div>

      <BulkToolbar
        selectedCount={selectedVisibleProjects.length}
        onClearSelection={handleClearSelection}
        onBulkStart={handleBulkStartClick}
        onBulkStop={handleBulkStopClick}
        onBulkRestart={handleBulkRestartClick}
        onBulkDelete={handleBulkDeleteClick}
        onBulkSavePreset={onBulkSavePreset ? () => onBulkSavePreset(selectedIds) : undefined}
        onBulkTagEdit={() => setTagModalOpen(true)}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-56 max-w-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search name, path, tag, port, command..." aria-label="Search projects" className="w-full bg-surface-3 border border-border rounded-lg pl-8 pr-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"/>
        </div>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by type" className="bg-surface-3 border border-border rounded-lg px-3 py-2 text-xs text-ink-soft focus:outline-none">
          <option value="all">All types</option>
          {types.map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status" className="bg-surface-3 border border-border rounded-lg px-3 py-2 text-xs text-ink-soft focus:outline-none">
          <option value="all">All statuses</option>
          <option value="running">Running</option><option value="starting">Starting</option>
          <option value="stopping">Stopping</option><option value="stopped">Stopped</option><option value="error">Error</option>
        </select>
        {tags.length > 0 && (
          <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} aria-label="Filter by tag" className="bg-surface-3 border border-border rounded-lg px-3 py-2 text-xs text-ink-soft focus:outline-none">
            <option value="all">All tags</option>
            {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        )}
      </div>

      {/* Clickable status summary */}
      {projects.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_CHIPS.map((chip) => {
            const count = statusCounts[chip.key] || 0;
            if (count === 0) return null;
            const active = statusFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => toggleStatusFilter(chip.key)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10px] font-semibold transition-colors ${chip.className} ${active ? 'ring-1 ring-accent/50' : ''}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {count} {chip.label}
              </button>
            );
          })}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="bg-surface border border-dashed border-border rounded-xl shadow-card px-6 py-14 text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
          </div>
          <h2 className="font-display font-bold text-base text-ink">No projects yet</h2>
          <p className="text-xs text-ink-faint mt-1.5 max-w-sm mx-auto leading-relaxed">
            Add your first project folder and Gatrion will detect the framework, command, and port automatically.
          </p>
          <button onClick={onOpenModal} className="mt-5 px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors">
            + Add Project
          </button>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl shadow-card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-faint border-b border-border">
                <th className="pl-4 pr-2 py-3 w-10">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => handleSelectAll(event.target.checked)}
                    aria-label="Select all projects"
                    className="w-4 h-4 accent-accent rounded border-border cursor-pointer"
                  />
                </th>
                <th className="font-medium px-3 py-3">
                  <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center hover:text-ink" aria-label="Sort by name">
                    Project {sortIndicator('name')}
                  </button>
                </th>
                <th className="font-medium px-3 py-3">
                  <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center hover:text-ink" aria-label="Sort by status">
                    Status {sortIndicator('status')}
                  </button>
                </th>
                <th className="font-medium px-3 py-3">
                  <button type="button" onClick={() => toggleSort('type')} className="inline-flex items-center hover:text-ink" aria-label="Sort by type">
                    Type {sortIndicator('type')}
                  </button>
                </th>
                <th className="font-medium px-3 py-3">
                  <button type="button" onClick={() => toggleSort('port')} className="inline-flex items-center hover:text-ink" aria-label="Sort by port">
                    Port {sortIndicator('port')}
                  </button>
                </th>
                <th className="font-medium px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedProjects.map((project) => (
                <ProjectListRow
                  key={project.id}
                  project={project}
                  isSelected={selectedIdSet.has(project.id)}
                  onSelectChange={(checked) => handleSelectOne(project.id, checked)}
                  onStart={() => onStart?.(project)}
                  onStop={() => onStop?.(project)}
                  onForceStop={() => onForceStop?.(project)}
                  onRestart={() => onRestart?.(project)}
                  onEdit={() => onEdit?.(project)}
                  onDelete={() => onDelete?.(project)}
                  onDuplicate={onDuplicate ? () => onDuplicate?.(project) : undefined}
                  onShowDetail={() => onNavigate?.(project)}
                  typeLabel={typeLabel}
                />
              ))}
            </tbody>
          </table>
          {sortedProjects.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-ink-faint">No projects match current filters.</p>
              <button
                onClick={handleClearFilters}
                className="mt-3 text-xs font-medium text-accent hover:text-accent-hover"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      <BulkTagModal
        isOpen={tagModalOpen}
        onClose={() => setTagModalOpen(false)}
        projects={selectedVisibleProjects}
        onApply={(add, remove) => {
          if (selectedVisibleProjects.length > 0) onBulkTagEdit?.(selectedVisibleProjects, add, remove);
          setTagModalOpen(false);
        }}
      />
    </div>
  );
}
