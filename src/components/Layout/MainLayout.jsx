import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useElectronConfig } from '../../hooks/useElectronConfig';
import usePrayerTimes, { playPrayerChime } from '../../hooks/usePrayerTimes';
import { showNotification } from '../../utils/ipcRenderer';
import { PrayerPanel } from './PrayerWidget';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

const MainLayout = ({
  children,
  currentView = 'dashboard',
  onViewChange,
  onOpenModal,
  projects = [],
  runningProjects = [],
  onProjectSelect,
  hideTopBar = false,
  onDropFolder
}) => {
  const { config, loading, updateSingle } = useElectronConfig();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(!config?.sidebarExpanded);

  // ---- Prayer reminder widget ----
  const prayerConfig = config?.prayer;
  const prayerEnabled = !!(prayerConfig && prayerConfig.showIn !== 'off');
  const prayerConfigRef = useRef(prayerConfig);
  prayerConfigRef.current = prayerConfig;
  const [prayerPanelOpen, setPrayerPanelOpen] = useState(false);

  const handlePrayerTime = useCallback((prayer) => {
    const cfg = prayerConfigRef.current;
    if (!cfg) return;
    if (cfg.notify) {
      showNotification({
        title: `Waktu ${prayer.label}`,
        body: `Sudah masuk waktu ${prayer.label} (${prayer.formatted}) — ${cfg.city || 'Jakarta'}.`,
        silent: !cfg.sound,
      });
    }
    if (cfg.sound) playPrayerChime();
  }, []);

  const prayerData = usePrayerTimes(prayerEnabled ? prayerConfig : null, handlePrayerTime);

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

  useEffect(() => {
    if (!onDropFolder) return
    const handleDragOver = (e) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }
    }
    const handleDrop = (e) => {
      if (!e.dataTransfer?.files?.length) return
      const file = e.dataTransfer.files[0]
      const folderPath = file?.path
      if (folderPath) {
        e.preventDefault()
        onDropFolder(folderPath)
      }
    }
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [onDropFolder])

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
          prayer={prayerEnabled ? prayerConfig : null}
          prayerData={prayerData}
          onPrayerExpand={() => setPrayerPanelOpen(true)}
        />

        <div className="flex-1 flex flex-col min-w-0 h-full">
          {!hideTopBar && (
            <TopBar
              title={getTitle()}
              subtitle="Gatrion"
              onCommandPalette={handleCommandPalette}
              prayer={prayerEnabled ? prayerConfig : null}
              prayerData={prayerData}
              onPrayerExpand={() => setPrayerPanelOpen(true)}
            />
          )}

          <main className={`flex-1 ${hideTopBar ? 'p-0 overflow-hidden flex flex-col' : 'overflow-y-auto bg-[radial-gradient(circle_at_80%_-20%,rgba(124,109,242,0.08),transparent_36%)] ' + (currentView === 'project-detail' ? 'px-4 py-5 sm:px-6' : 'px-4 py-5 sm:px-7 sm:py-7')}`}>
            {children}
          </main>

          {prayerData && (
            <PrayerPanel
              open={prayerPanelOpen}
              data={prayerData}
              config={prayerConfig}
              onClose={() => setPrayerPanelOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
