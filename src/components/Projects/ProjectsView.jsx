import React, { useEffect, useMemo, useRef, useState } from 'react';
import ProjectListRow from './ProjectListRow';
import BulkToolbar from './BulkToolbar';

export default function ProjectsView({
  projects = [],
  onStart,
  onStop,
  onForceStop,
  onRestart,
  onDelete,
  onBulkStart,
  onBulkDelete,
  onEdit,
  onNavigate,
  onOpenModal
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name-asc');
  const [selectedIds, setSelectedIds] = useState([]);
  const selectAllRef = useRef(null);

  const types = useMemo(
    () => [...new Set(projects.map((project) => project.type).filter(Boolean))].sort(),
    [projects]
  );
  const query = searchQuery.trim().toLowerCase();

  const filteredProjects = useMemo(() => projects.filter((project) => {
    const status = (project.status || 'stopped').toLowerCase();
    const matchesSearch = !query || [project.name, project.path, project.type]
      .some((value) => String(value || '').toLowerCase().includes(query));
    return matchesSearch
      && (typeFilter === 'all' || project.type === typeFilter)
      && (statusFilter === 'all' || status === statusFilter);
  }), [projects, query, typeFilter, statusFilter]);

  const sortedProjects = useMemo(() => [...filteredProjects].sort((a, b) => {
    if (sortBy === 'name-asc') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'name-desc') return (b.name || '').localeCompare(a.name || '');
    if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
    if (sortBy === 'type') return (a.type || '').localeCompare(b.type || '');
    if (sortBy === 'port') return (a.port || 0) - (b.port || 0);
    return 0;
  }), [filteredProjects, sortBy]);

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
    selectedVisibleProjects.forEach((project) => onStop?.(project));
  };

  const handleBulkDeleteClick = () => {
    if (selectedVisibleProjects.length > 0) onBulkDelete?.(selectedVisibleProjects);
  };

  const allSelected = sortedProjects.length > 0
    && sortedProjects.every((project) => selectedIdSet.has(project.id));
  const someSelected = selectedVisibleProjects.length > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <div className="view space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-faint">Project registry</p>
          <h1 className="font-display font-bold text-2xl mt-1">Projects</h1>
          <p className="text-sm text-ink-faint mt-1">Configure launch commands and manage local processes.</p>
        </div>
        <button onClick={onOpenModal} className="px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors">
          + Add Project
        </button>
      </div>

      <BulkToolbar
        selectedCount={selectedVisibleProjects.length}
        onClearSelection={handleClearSelection}
        onBulkStart={handleBulkStartClick}
        onBulkStop={handleBulkStopClick}
        onBulkDelete={handleBulkDeleteClick}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-56 max-w-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search name or path..." aria-label="Search projects" className="w-full bg-surface-3 border border-border rounded-lg pl-8 pr-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"/>
        </div>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by type" className="bg-surface-3 border border-border rounded-lg px-3 py-2 text-xs text-ink-soft focus:outline-none">
          <option value="all">All types</option>
          {types.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status" className="bg-surface-3 border border-border rounded-lg px-3 py-2 text-xs text-ink-soft focus:outline-none">
          <option value="all">All statuses</option>
          <option value="running">Running</option><option value="starting">Starting</option>
          <option value="stopping">Stopping</option><option value="stopped">Stopped</option><option value="error">Error</option>
        </select>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort by" className="bg-surface-3 border border-border rounded-lg px-3 py-2 text-xs text-ink-soft focus:outline-none ml-auto">
          <option value="name-asc">Sort: Name (A-Z)</option>
          <option value="name-desc">Sort: Name (Z-A)</option>
          <option value="status">Sort: Status</option>
          <option value="type">Sort: Type</option>
          <option value="port">Sort: Port</option>
        </select>
      </div>

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
                <th className="font-medium px-3 py-3">Project</th>
                <th className="font-medium px-3 py-3">Status</th>
                <th className="font-medium px-3 py-3">Type</th>
                <th className="font-medium px-3 py-3">Port</th>
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
                  onShowDetail={() => onNavigate?.(project)}
                />
              ))}
            </tbody>
          </table>
          {sortedProjects.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-ink-faint">No projects match current filters.</p>
              <button
                onClick={() => { setSearchQuery(''); setTypeFilter('all'); setStatusFilter('all'); }}
                className="mt-3 text-xs font-medium text-accent hover:text-accent-hover"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
