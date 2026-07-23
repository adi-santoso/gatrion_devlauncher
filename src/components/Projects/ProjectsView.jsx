import React, { useState } from 'react';
import ProjectListRow from './ProjectListRow';

export default function ProjectsView({ projects = [], onStart, onStop, onRestart, onDelete, onEdit, onNavigate, onOpenModal }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const types = [...new Set(projects.map((project) => project.type).filter(Boolean))].sort();
  const query = searchQuery.trim().toLowerCase();
  const filteredProjects = projects.filter((project) => {
    const status = (project.status || 'stopped').toLowerCase();
    const matchesSearch = !query || [project.name, project.path, project.type]
      .some((value) => String(value || '').toLowerCase().includes(query));
    return matchesSearch
      && (typeFilter === 'all' || project.type === typeFilter)
      && (statusFilter === 'all' || status === statusFilter);
  });

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
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-ink-faint border-b border-border">
            <th className="font-medium px-5 py-3">Project</th><th className="font-medium px-3 py-3">Status</th>
            <th className="font-medium px-3 py-3">Type</th><th className="font-medium px-3 py-3">Port</th>
            <th className="font-medium px-5 py-3 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-border">
            {filteredProjects.map((project) => (
              <ProjectListRow key={project.id} project={project}
                onStart={() => onStart?.(project)} onStop={() => onStop?.(project)} onRestart={() => onRestart?.(project)}
                onEdit={() => onEdit?.(project)} onDelete={() => onDelete?.(project)} onShowDetail={() => onNavigate?.(project)}/>
            ))}
          </tbody>
        </table>
        {filteredProjects.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink-faint">No projects match current filters.</p>}
      </div>
    </div>
  );
}
