import React, { useState, useEffect } from 'react';
import { useElectronConfig } from '../../hooks/useElectronConfig';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

const MainLayout = ({
  children,
  currentView = 'dashboard',
  onViewChange,
  onOpenModal,
  onStartAll,
  onStopAll,
  projects = [],
  runningProjects = [],
  onProjectSelect,
  hideTopBar = false
}) => {
  const { config, loading, updateSingle } = useElectronConfig();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(!config?.sidebarExpanded);

  useEffect(() => {
    if (!loading && config?.sidebarExpanded !== undefined) {
      setSidebarCollapsed(!config.sidebarExpanded);
    }
  }, [config?.sidebarExpanded, loading]);

  const handleToggleCollapse = () => {
    const newCollapsed = !sidebarCollapsed;
    setSidebarCollapsed(newCollapsed);
    updateSingle('sidebarExpanded', !newCollapsed);
  };

  const handleCommandPalette = () => {
    onOpenModal?.('command');
  };

  const handleAddProject = () => {
    onOpenModal?.('project');
  };

  const getTitle = () => {
    switch (currentView) {
      case 'dashboard':
        return 'Workspace';
      case 'terminals':
        return 'Terminals';
      case 'projects':
        return 'Projects';
      case 'settings':
        return 'Settings';
      case 'project-detail':
        return 'Project Detail';
      default:
        return 'Workspace';
    }
  };

  return (
    <div className="h-screen flex flex-col bg-base text-ink font-sans antialiased">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
          activeView={currentView}
          onViewChange={onViewChange}
          projects={projects}
          runningProjects={runningProjects}
          onProjectSelect={onProjectSelect || ((project) => onViewChange?.('project-detail', project))}
          onAddProject={handleAddProject}
        />

        <div className="flex-1 flex flex-col min-w-0 h-full">
          {!hideTopBar && (
            <TopBar
              title={getTitle()}
              subtitle="Gatrion"
              onCommandPalette={handleCommandPalette}
            />
          )}

          <main className={`flex-1 ${hideTopBar ? 'p-0 overflow-hidden flex flex-col' : 'overflow-y-auto bg-[radial-gradient(circle_at_80%_-20%,rgba(124,109,242,0.08),transparent_36%)] ' + (currentView === 'project-detail' ? 'px-4 py-5 sm:px-6' : 'px-4 py-5 sm:px-7 sm:py-7')}`}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
