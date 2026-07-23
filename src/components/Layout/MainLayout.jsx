import React, { useState } from 'react';
import UpdateBanner from './UpdateBanner';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

const MainLayout = ({
  children,
  currentView = 'dashboard',
  showUpdateBanner = false,
  updateVersion = 'v1.1.0',
  onUpdateRestart,
  onUpdateDismiss,
  onViewChange,
  onOpenModal,
  onStartAll,
  onStopAll,
  projects = [],
  runningProjects = [],
  onProjectSelect,
  sidebarExpanded = true
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(!sidebarExpanded);

  const handleToggleCollapse = () => {
    setSidebarCollapsed(!sidebarCollapsed);
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
      {showUpdateBanner && (
        <UpdateBanner
          version={updateVersion}
          onRestart={onUpdateRestart}
          onDismiss={onUpdateDismiss}
        />
      )}

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

        <div className="flex-1 flex flex-col min-w-0">
          <TopBar
            title={getTitle()}
            subtitle="DevLauncher"
            onCommandPalette={handleCommandPalette}
          />

          <main className={`flex-1 overflow-y-auto bg-[radial-gradient(circle_at_80%_-20%,rgba(124,109,242,0.08),transparent_36%)] ${currentView === 'project-detail' ? 'px-4 py-5 sm:px-6' : 'px-4 py-5 sm:px-7 sm:py-7'}`}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
