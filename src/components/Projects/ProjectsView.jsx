import React, { useState } from 'react';
import FilterBar from './FilterBar';
import BulkToolbar from './BulkToolbar';
import ProjectGridCard from './ProjectGridCard';
import ProjectListRow from './ProjectListRow';

export default function ProjectsView({
  projects = [],
  onStart,
  onStop,
  onRestart,
  onDelete,
  onNavigate,
  onOpenModal,
  onConfirmDelete,
  onShowToast
}) {
  const [viewMode, setViewMode] = useState('grid');
  const [selectedProjects, setSelectedProjects] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All types');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [sortBy, setSortBy] = useState('Sort: Recently used');

  const handleToggleSelect = (projectId) => {
    const newSelected = new Set(selectedProjects);
    if (newSelected.has(projectId)) {
      newSelected.delete(projectId);
    } else {
      newSelected.add(projectId);
    }
    setSelectedProjects(newSelected);
  };

  const handleClearSelection = () => {
    setSelectedProjects(new Set());
  };

  const handleBulkStart = () => {
    console.log('Start selected projects:', Array.from(selectedProjects));
  };

  const handleBulkStop = () => {
    console.log('Stop selected projects:', Array.from(selectedProjects));
  };

  const handleBulkDelete = () => {
    onConfirmDelete?.('the selected projects');
  };

  return (
    <div className="view space-y-4">
      <FilterBar
        onSearch={setSearchQuery}
        onFilterType={setTypeFilter}
        onFilterStatus={setStatusFilter}
        onSort={setSortBy}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <BulkToolbar
        selectedCount={selectedProjects.size}
        onClearSelection={handleClearSelection}
        onBulkStart={handleBulkStart}
        onBulkStop={handleBulkStop}
        onBulkDelete={handleBulkDelete}
      />

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectGridCard
              key={project.id}
              project={{
                ...project,
                onStart: () => onStart(project),
                onStop: () => onStop(project),
                onRestart: () => onRestart(project),
                onDelete: () => onDelete(project),
                onShowMenu: () => onShowToast?.('info', 'Menu clicked')
              }}
              isSelected={selectedProjects.has(project.id)}
              onToggleSelect={() => handleToggleSelect(project.id)}
              onShowDetail={() => onNavigate(project)}
            />
          ))}

          <div
            className="relative bg-surface border border-border rounded-xl p-4 shadow-card border-dashed flex flex-col items-center justify-center text-center py-8 hover:border-accent/50 transition-colors cursor-pointer"
            onClick={onOpenModal}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-faint mb-2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            <p className="text-xs text-ink-soft font-medium">Add Project</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((project) => (
            <ProjectListRow
              key={project.id}
              project={{
                ...project,
                onStart: () => onStart(project),
                onStop: () => onStop(project)
              }}
              isSelected={selectedProjects.has(project.id)}
              onToggleSelect={() => handleToggleSelect(project.id)}
              onShowDetail={() => onNavigate(project)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
