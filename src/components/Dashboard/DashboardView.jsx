import StatCard from './StatCard';
import ResourceChart from './ResourceChart';
import ActivityList from './ActivityList';
import ProjectCard from './ProjectCard';
import ProjectTable from './ProjectTable';
import TerminalViewer from './TerminalViewer';
import ComponentShowcase from './ComponentShowcase';

export default function DashboardView({
  activities = [],
  projects = [],
  onOpenModal,
  onShowToast,
  onNavigate,
  onStop,
  onStart,
  onRestart,
  onDelete
}) {
  // Compute real stats from project data
  const runningCount = projects.filter(p => p.status === 'running').length;
  const startingCount = projects.filter(p => p.status === 'starting').length;
  const errorCount = projects.filter(p => p.status === 'error').length;

  const stats = [
    {
      title: 'Total Projects',
      value: String(projects.length),
      subtitle: `across ${new Set(projects.map(p => p.type)).size} stacks`,
      icon: <rect x="3" y="3" width="18" height="18" rx="2" />
    },
    {
      title: 'Running Now',
      value: String(runningCount),
      subtitle: `${startingCount} starting, ${errorCount} error`,
      color: runningCount > 0 ? 'text-success' : undefined,
      showPulseDot: runningCount > 0
    },
    {
      title: 'CPU Usage',
      value: '—',
      unit: '',
      subtitle: 'monitoring not available',
      icon: <path d="M3 12h4l3 8 4-16 3 8h4" />
    },
    {
      title: 'Memory',
      value: '—',
      unit: '',
      subtitle: 'monitoring not available',
      icon: (
        <>
          <rect x="4" y="6" width="16" height="12" rx="1" />
          <path d="M8 10v4M12 10v4M16 10v4" />
        </>
      )
    }
  ];

  // Use real projects for the preview cards (up to 3)
  const previewProjects = projects.slice(0, 3);

  // Build table data from all projects
  const tableProjects = projects.map(p => ({
    ...p,
    type: p.type || 'Unknown',
    emoji: p.emoji || '⚙️',
    cpu: p.cpu || '—',
    memory: p.memory || '—'
  }));

  return (
    <div className="view space-y-8">
      {/* Stat Cards Grid */}
      <section className="grid grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </section>

      {/* Resource Chart + Activity List */}
      <section className="grid grid-cols-3 gap-4">
        <ResourceChart />
        <ActivityList activities={activities} />
      </section>

      {/* Projects Preview */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-base">Projects</h2>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onNavigate && onNavigate('projects');
            }}
            className="text-xs font-medium text-accent hover:text-accent-hover"
          >
            View all →
          </a>
        </div>
        {previewProjects.length > 0 ? (
          <div className="grid grid-cols-3 gap-4">
            {previewProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onStop={onStop}
                onStart={onStart}
                onRestart={onRestart}
                onDelete={onDelete}
                onNavigate={onNavigate}
                onShowToast={onShowToast}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-surface border border-border border-dashed rounded-xl">
            <p className="text-sm text-ink-faint mb-2">No projects yet</p>
            <button
              onClick={() => onOpenModal?.('project')}
              className="text-xs text-accent hover:text-accent-hover font-medium"
            >
              + Add your first project
            </button>
          </div>
        )}
      </section>

      {/* Projects Table */}
      {tableProjects.length > 0 && (
        <ProjectTable
          projects={tableProjects}
          onStop={onStop}
          onStart={onStart}
          onRestart={onRestart}
        />
      )}

      {/* Component Showcase */}
      <ComponentShowcase
        onOpenModal={onOpenModal}
        onShowToast={onShowToast}
      />
    </div>
  );
}
