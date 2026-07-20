import React from 'react';

const Sidebar = ({
  collapsed,
  onToggleCollapse,
  activeView,
  onViewChange,
  runningProjects = []
}) => {
  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      )
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      )
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.32.4.6.73.79.24.14.5.21.78.21H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      )
    }
  ];

  return (
    <aside
      className={`${collapsed ? 'w-[68px]' : 'w-[220px]'} shrink-0 bg-surface border-r border-border flex flex-col transition-all duration-200 ease-out`}
    >
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-border overflow-hidden">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-glow shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M5 3l14 9-14 9V3z" fill="white" />
          </svg>
        </div>
        {!collapsed && (
          <span className="sidebar-label font-display font-extrabold text-[15px] tracking-tight whitespace-nowrap">
            DevLauncher
          </span>
        )}
      </div>

      <nav className="px-3 pt-4 space-y-0.5">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <a
              key={item.id}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onViewChange(item.id);
              }}
              title={item.label}
              className={`nav-item flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'text-ink-soft hover:text-ink hover:bg-surface-3'
              }`}
            >
              {item.icon}
              {!collapsed && (
                <span className="sidebar-label whitespace-nowrap">{item.label}</span>
              )}
            </a>
          );
        })}
      </nav>

      <div className="h-px bg-border mx-4 my-4"></div>

      {!collapsed && (
        <div className="sidebar-label px-4 flex items-center justify-between whitespace-nowrap">
          <span className="text-[11px] font-semibold tracking-wider text-ink-faint uppercase">
            Running
          </span>
          <span className="text-[11px] font-mono text-ink-faint">
            {runningProjects.length}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 mt-2 space-y-0.5 pb-3">
        {runningProjects.map((project, index) => (
          <a
            key={index}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              if (project.onClick) project.onClick();
            }}
            title={project.name}
            className={`running-row flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-3 group transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <span className="relative flex items-center justify-center w-2 h-2 shrink-0" style={{ color: project.color }}>
              <span className="pulse-dot"></span>
              <span className="relative w-2 h-2 rounded-full" style={{ backgroundColor: project.color }}></span>
            </span>
            {!collapsed && (
              <span className="sidebar-label text-sm text-ink-soft group-hover:text-ink truncate whitespace-nowrap">
                {project.name}
              </span>
            )}
          </a>
        ))}
      </div>

      <button
        onClick={onToggleCollapse}
        className={`m-3 flex items-center gap-2 py-2 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-3 text-xs font-medium transition-colors border border-border ${
          collapsed ? 'justify-center px-0' : ''
        }`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
        >
          <path d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
        </svg>
        {!collapsed && (
          <span className="sidebar-label whitespace-nowrap">Collapse</span>
        )}
      </button>
    </aside>
  );
};

export default Sidebar;
