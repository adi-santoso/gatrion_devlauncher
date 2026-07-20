import StatCard from './StatCard';
import ResourceChart from './ResourceChart';
import ActivityList from './ActivityList';
import ProjectCard from './ProjectCard';
import ProjectTable from './ProjectTable';
import TerminalViewer from './TerminalViewer';
import ComponentShowcase from './ComponentShowcase';

// Sample data for demonstration
const defaultStats = [
  {
    title: 'Total Projects',
    value: '12',
    subtitle: 'across 6 stacks',
    icon: <rect x="3" y="3" width="18" height="18" rx="2" />
  },
  {
    title: 'Running Now',
    value: '3',
    subtitle: '1 starting, 0 error',
    color: 'text-success',
    showPulseDot: true
  },
  {
    title: 'CPU Usage',
    value: '7.4',
    unit: '%',
    subtitle: '▾ 1.2% vs last hour',
    subtitleColor: 'text-success',
    icon: <path d="M3 12h4l3 8 4-16 3 8h4" />
  },
  {
    title: 'Memory',
    value: '612',
    unit: 'MB',
    subtitle: '▴ 40MB vs last hour',
    subtitleColor: 'text-warning',
    icon: (
      <>
        <rect x="4" y="6" width="16" height="12" rx="1" />
        <path d="M8 10v4M12 10v4M16 10v4" />
      </>
    )
  }
];

const defaultActivities = [
  { type: 'success', project: 'gateway-service', message: 'started', time: '2 min ago · port 8080' },
  { type: 'danger', project: 'admin-dashboard', message: 'crashed', time: '14 min ago · exit code 1' },
  { type: 'faint', project: 'payment-api', message: 'stopped', time: '32 min ago' },
  { type: 'accent', project: 'storefront-web', message: 'added', time: '1 hour ago · Next.js' }
];

const defaultProjects = [
  {
    name: 'storefront-web',
    type: 'React (Vite)',
    stack: 'React (Vite)',
    emoji: '⚛️',
    path: 'C:/projects/storefront-web',
    port: '5173',
    status: 'running',
    cpu: '3.1%',
    memory: '182MB',
    uptime: '2h 14m',
    color: '#61DAFB',
    pid: '18420'
  },
  {
    name: 'internal-crm',
    type: 'Vue.js',
    stack: 'Vue.js',
    emoji: '🟢',
    path: 'C:/projects/internal-crm',
    port: '5174',
    status: 'starting',
    color: '#42B883'
  },
  {
    name: 'billing-service',
    type: 'Laravel',
    stack: 'Laravel',
    emoji: '🔴',
    path: 'C:/projects/billing-service',
    port: '8000',
    status: 'stopped',
    uptime: '2d',
    color: '#FF6B57'
  }
];

const defaultTableProjects = [
  {
    name: 'storefront-web',
    type: 'React',
    emoji: '⚛️',
    status: 'running',
    port: '5173',
    pid: '18420',
    cpu: '3.1%',
    memory: '182MB'
  },
  {
    name: 'payment-api',
    type: 'Node.js',
    emoji: '🟩',
    status: 'running',
    port: '3000',
    pid: '18391',
    cpu: '1.8%',
    memory: '140MB'
  },
  {
    name: 'admin-dashboard',
    type: 'Next.js',
    emoji: '⚡',
    status: 'error',
    port: '3001'
  },
  {
    name: 'billing-service',
    type: 'Laravel',
    emoji: '🔴',
    status: 'stopped',
    port: '8000'
  }
];

const defaultLogs = [
  { time: '14:22:01', level: 'info', message: 'starting dev server…' },
  { time: '14:22:03', level: 'ready', message: 'listening on http://localhost:8080' },
  { time: '14:22:18', level: 'warn', message: 'upstream latency 842ms for /api/orders' },
  { time: '14:22:25', level: 'error', message: 'ECONNREFUSED 127.0.0.1:5432' },
  { time: '14:22:27', level: 'ready', message: 'database connection restored' }
];

export default function DashboardView({
  stats = defaultStats,
  activities = defaultActivities,
  projects = defaultProjects,
  tableProjects = defaultTableProjects,
  logs = defaultLogs,
  onOpenModal,
  onShowToast,
  onNavigate,
  onStop,
  onStart,
  onRestart
}) {
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
        <div className="grid grid-cols-3 gap-4">
          {projects.map((project, index) => (
            <ProjectCard
              key={index}
              project={project}
              onStop={onStop}
              onStart={onStart}
              onRestart={onRestart}
              onNavigate={onNavigate}
              onShowToast={onShowToast}
            />
          ))}
        </div>
      </section>

      {/* Projects Table */}
      <ProjectTable
        projects={tableProjects}
        onStop={onStop}
        onStart={onStart}
        onRestart={onRestart}
      />

      {/* Terminal Viewer */}
      <TerminalViewer
        projectName="gateway-service"
        port="8080"
        pid="19042"
        logs={logs}
      />

      {/* Component Showcase */}
      <ComponentShowcase
        onOpenModal={onOpenModal}
        onShowToast={onShowToast}
      />
    </div>
  );
}
