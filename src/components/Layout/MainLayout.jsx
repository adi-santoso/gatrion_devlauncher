import React, { useState } from 'react';
import UpdateBanner from './UpdateBanner';
import TitleBar from './TitleBar';
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
  runningProjects = []
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleToggleCollapse = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleCommandPalette = () => {
    onOpenModal?.('command');
  };

  const handleAddProject = () => {
    onOpenModal?.('project');
  };

  const handleSettings = () => {
    onViewChange?.('settings');
  };

  // Get title based on active view
  const getTitle = () => {
    switch (currentView) {
      case 'dashboard':
        return 'Dashboard';
      case 'projects':
        return 'Projects';
      case 'settings':
        return 'Settings';
      case 'project-detail':
        return 'Project Detail';
      default:
        return 'Dashboard';
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

      <TitleBar version="v1.0.0" />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
          activeView={currentView}
          onViewChange={onViewChange}
          runningProjects={runningProjects}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <TopBar
            title={getTitle()}
            subtitle="DevLauncher"
            onCommandPalette={handleCommandPalette}
            onAddProject={handleAddProject}
            onSettings={handleSettings}
          />

          <main className="flex-1 overflow-y-auto px-6 py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
