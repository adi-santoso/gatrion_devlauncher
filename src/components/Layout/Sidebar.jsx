import React from 'react';

const navItems = [
  {
    id: 'dashboard',
    label: 'Workspace',
    icon: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: <><path d="M3 7h6l2 2h10v11H3z" /><path d="M3 7V4h7l2 3" /></>
  },
  {
    id: 'terminals',
    label: 'Terminals',
    icon: <><path d="M4 17l6-5-6-5" /><path d="M12 19h8" /></>
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 01-.1 1l2 1.5-2 3.5-2.5-1A7 7 0 0115 18l-.4 3h-4l-.4-3a7 7 0 01-1.6-1L6 18l-2-3.5L6 13a7 7 0 010-2L4 9.5 6 6l2.6 1A7 7 0 0110 6l.4-3h4l.4 3a7 7 0 011.6 1L19 6l2 3.5-2 1.5a7 7 0 010 1z" /></>
  }
];

const ProjectGroup = ({ title, projects, collapsed, status, onProjectSelect }) => {
  if (projects.length === 0) return null;

  return (
    <section className="mt-4">
      {!collapsed && (
        <div className="flex items-center justify-between px-3 pb-1.5 text-[9px] font-mono font-semibold uppercase tracking-[0.12em] text-ink-faint">
          <span>{title}</span>
          <span>{projects.length}</span>
        </div>
      )}
      <div className="space-y-0.5">
        {projects.map((project) => (
          <button
            key={project.id || project.name}
            type="button"
            onClick={() => project.onClick ? project.onClick() : onProjectSelect?.(project)}
            title={project.name}
            className={`w-full grid items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-surface-3 transition-colors ${collapsed ? 'grid-cols-1 justify-items-center' : 'grid-cols-[8px_minmax(0,1fr)_auto]'}`}
          >
            <span className={`w-2 h-2 rounded-full ${status === 'error' ? 'bg-danger' : 'bg-success shadow-[0_0_10px_rgba(74,222,128,0.4)]'}`} />
            {!collapsed && <span className="truncate text-xs font-medium text-ink-soft">{project.name}</span>}
            {!collapsed && <span className="text-[8px] font-mono uppercase text-ink-faint">{status === 'error' ? (project.exitCode != null ? `exit ${project.exitCode}` : 'error') : (project.type || 'app')}</span>}
          </button>
        ))}
      </div>
    </section>
  );
};

const Sidebar = ({
  collapsed,
  onToggleCollapse,
  activeView = 'dashboard',
  onViewChange,
  projects = [],
  runningProjects = [],
  onProjectSelect,
  onAddProject,
  defaultCollapsed = false
}) => {
  const [isCollapsed, setIsCollapsed] = React.useState(
    collapsed !== undefined ? collapsed : defaultCollapsed
  );

  const sourceProjects = projects.length > 0 ? projects : runningProjects;
  const running = sourceProjects.filter((project) => !project.status || project.status.toLowerCase() === 'running');
  const errors = projects.filter((project) => project.status?.toLowerCase() === 'error');

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    onToggleCollapse?.(newState);
  };

  return (
    <aside 
      className={`${isCollapsed ? 'w-[68px]' : 'w-[238px]'} shrink-0 bg-surface border-r border-border flex flex-col transition-[width] duration-200`}
      role="navigation"
      aria-label="Main navigation sidebar"
    >
      <div className="h-[66px] flex items-center gap-2.5 px-4 border-b border-border overflow-hidden">
        <div className="w-[34px] h-[34px] rounded-[10px] bg-accent flex items-center justify-center shadow-glow shrink-0" role="img" aria-label="Gatrion logo">
          <svg width="15" height="15" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9z" fill="white" /></svg>
        </div>
      {!collapsed && <div className="min-w-0"><strong className="block font-display font-extrabold text-sm">Gatrion</strong><span className="block text-[8px] font-mono uppercase tracking-[0.12em] text-ink-faint">Local workspace</span></div>}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3.5">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            const count = item.id === 'projects' ? projects.length : item.id === 'terminals' ? running.length : null;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onViewChange?.(item.id)}
                title={`${item.label}${count !== null ? ` (${count})` : ''}`}
                aria-label={item.label}
                className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${isCollapsed ? 'justify-center' : ''} ${isActive ? 'bg-accent/10 text-ink border border-accent/20' : 'text-ink-soft hover:bg-surface-3 hover:text-ink border border-transparent'}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">{item.icon}</svg>
                {!isCollapsed && <span>{item.label}</span>}
                {!isCollapsed && count !== null && <span className="ml-auto text-[9px] font-mono text-ink-faint">{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="h-px bg-border my-4" />
        <ProjectGroup title="Running now" projects={running} collapsed={isCollapsed} status="running" onProjectSelect={onProjectSelect} />
        <ProjectGroup title="Needs attention" projects={errors} collapsed={isCollapsed} status="error" onProjectSelect={onProjectSelect} />
      </div>

      <div className="border-t border-border p-3 space-y-2">
        <button type="button" onClick={onAddProject} aria-label="Add new project" className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 py-2 text-xs font-semibold text-ink-soft hover:text-ink hover:border-border-hover transition-colors">
          <span className="text-base leading-none">+</span>{!isCollapsed && 'Add project'}
        </button>
        {onToggleCollapse && (
          <button 
            type="button" 
            onClick={toggleCollapse}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="w-full text-[10px] text-ink-faint hover:text-ink transition-colors"
          >
            {isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          </button>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
