import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from './components/Layout';
import { DashboardView } from './components/Dashboard';
import { ProjectsView } from './components/Projects';
import { ProjectDetailView } from './components/ProjectDetail';
import { SettingsView } from './components/Settings';
import { EmptyState, LoadingSkeleton } from './components/States';
import {
  ProjectModal,
  ConfirmDialog,
  CommandPalette,
  ShortcutsModal,
  PortConflictModal,
  ToastContainer
} from './components/Modals';
import { TrayIcon, TrayPopup, DemoPanel } from './components/Demo';
import { useProjects, useProcesses, useElectronConfig } from './hooks';
import { isElectronAvailable } from './utils/ipcRenderer';

// Mock data for activities and logs (will be replaced with real data later)
const MOCK_ACTIVITIES = [
  { type: 'success', project: 'gateway-service', message: 'started', time: '2 min ago · port 8080' },
  { type: 'danger', project: 'admin-dashboard', message: 'crashed', time: '14 min ago · exit code 1' },
  { type: 'faint', project: 'payment-api', message: 'stopped', time: '32 min ago' },
  { type: 'accent', project: 'storefront-web', message: 'added', time: '1 hour ago · Next.js' }
];

const MOCK_LOGS = [
  { id: 1, type: 'info', message: 'Server starting on port 3000...', timestamp: '14:23:01' },
  { id: 2, type: 'success', message: 'Webpack compiled successfully in 1.2s', timestamp: '14:23:03' },
  { id: 3, type: 'info', message: 'Hot Module Replacement enabled', timestamp: '14:23:03' },
  { id: 4, type: 'warning', message: 'Deprecated API usage in @legacy/utils', timestamp: '14:23:05' },
  { id: 5, type: 'info', message: 'GET /api/users 200 45ms', timestamp: '14:23:12' },
  { id: 6, type: 'info', message: 'POST /api/auth/login 200 123ms', timestamp: '14:23:18' },
  { id: 7, type: 'error', message: 'Failed to fetch: TypeError: Cannot read property "data"', timestamp: '14:23:25' },
  { id: 8, type: 'info', message: 'WebSocket connected', timestamp: '14:23:30' }
];

function App() {
  // Initialize hooks
  const { projects, loading: projectsLoading, addProject: addProjectToStore, updateProject: updateProjectInStore, updateProjectLocal, deleteProject: deleteProjectFromStore } = useProjects();
  const { config, updateConfig: updateElectronConfig } = useElectronConfig();

  // View state
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedProject, setSelectedProject] = useState(null);

  // UI state
  const [showUpdateBanner, setShowUpdateBanner] = useState(true);
  const [openModal, setOpenModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [showTray, setShowTray] = useState(false);

  // Debug: Log toasts changes
  useEffect(() => {
    console.log('[Toast] Current toasts:', toasts);
  }, [toasts]);

  // Activities state
  const [activities, setActivities] = useState(MOCK_ACTIVITIES);

  const addActivity = (type, project, message, detail = '') => {
    setActivities(prev => [
      {
        type,
        project,
        message,
        time: `Just now${detail ? ' · ' + detail : ''}`
      },
      ...prev.slice(0, 19)
    ]);
  };

  // Handle project updates from process events (runtime state only — no IPC persist)
  const handleProjectUpdate = useCallback((projectId, updates) => {
    updateProjectLocal(projectId, updates);
  }, [updateProjectLocal]);

  // Initialize process manager with project update callback
  const {
    startProject: startProjectProcess,
    stopProject: stopProjectProcess,
    restartProject: restartProjectProcess,
    startAll,
    stopAll,
    getLogs,
    clearLogs
  } = useProcesses(projects, handleProjectUpdate);

  // Check Electron availability on mount
  useEffect(() => {
    if (!isElectronAvailable()) {
      console.warn('⚠️ Running in browser mode - Electron APIs not available');
      showToast('warning', 'Running in browser mode with mock data');
    }
  }, []);

  // Initialize theme from config
  useEffect(() => {
    if (config.theme) {
      document.documentElement.setAttribute('data-theme', config.theme);
    }
  }, [config.theme]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+K or Cmd+K - Open command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpenModal('command');
      }

      // Escape - Close modals
      if (e.key === 'Escape' && openModal) {
        e.preventDefault();
        closeModalHandler();
      }

      // ? - Open shortcuts modal
      if (e.key === '?' && !openModal) {
        e.preventDefault();
        setOpenModal('shortcuts');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openModal]);

  // View navigation
  const showView = (viewName, data = null) => {
    setCurrentView(viewName);
    if (viewName === 'project-detail' && data) {
      setSelectedProject(data);
    }
  };

  // Modal handlers
  const openModalHandler = (modalName, data = null) => {
    setOpenModal(modalName);
    if (modalName === 'confirm' && data) {
      setConfirmTarget(data);
    }
  };

  const closeModalHandler = () => {
    setOpenModal(null);
    setConfirmTarget(null);
  };

  // Toast notifications
  const showToast = (type, message) => {
    const id = Date.now();
    console.log('[Toast] Showing toast:', { id, type, message });
    setToasts(prev => [...prev, { id, type, message }]);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      dismissToast(id);
    }, 5000);
  };

  const dismissToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Project actions
  const handleStartProject = async (project) => {
    const result = await startProjectProcess(project.id);
    if (result.success) {
      showToast('success', `${project.name} started successfully`);
      addActivity('success', project.name, 'started', project.port ? `port ${project.port}` : '');
    } else {
      showToast('error', result.error || `Failed to start ${project.name}`);
      addActivity('danger', project.name, 'failed to start');
    }
  };

  const handleStopProject = async (project) => {
    const result = await stopProjectProcess(project.id);
    if (result.success) {
      showToast('info', `${project.name} stopped`);
      addActivity('faint', project.name, 'stopped');
    } else {
      showToast('error', result.error || `Failed to stop ${project.name}`);
    }
  };

  const handleRestartProject = async (project) => {
    showToast('info', `Restarting ${project.name}...`);
    const result = await restartProjectProcess(project.id);
    if (result.success) {
      showToast('success', `${project.name} restarted successfully`);
      addActivity('success', project.name, 'restarted');
    } else {
      showToast('error', result.error || `Failed to restart ${project.name}`);
      addActivity('danger', project.name, 'restart failed');
    }
  };

  const handleStartAll = async () => {
    showToast('info', 'Starting all projects...');
    const result = await startAll();
    const failures = Array.isArray(result) ? result.filter(item => !item.success) : [];
    if (result?.error) {
      showToast('error', result.error);
    } else if (failures.length > 0) {
      showToast('error', `${failures.length} project(s) failed to start`);
    } else {
      showToast('success', 'Issued start command for all projects');
      addActivity('success', 'All projects', 'started');
    }
  };

  const handleStopAll = async () => {
    showToast('info', 'Stopping all projects...');
    const result = await stopAll();
    if (result && result.error) {
      showToast('error', result.error);
    } else {
      showToast('info', 'All projects stopped');
      addActivity('faint', 'All projects', 'stopped');
    }
  };

  const handleDeleteProject = (project) => {
    // Store project ID instead of name for reliable deletion
    openModalHandler('confirm', project);
  };

  const confirmDelete = async () => {
    if (confirmTarget) {
      const result = await deleteProjectFromStore(confirmTarget.id);
      if (result.success) {
        showToast('success', `${confirmTarget.name || 'Project'} removed from projects`);
        addActivity('faint', confirmTarget.name || 'Project', 'removed');
        closeModalHandler();
        if (currentView === 'project-detail' && selectedProject?.id === confirmTarget.id) {
          showView('projects');
        }
      } else {
        showToast('error', result.error || 'Failed to delete project');
      }
    }
  };

  const handleOpenInEditor = (project) => {
    showToast('info', `Opening ${project.name} in VS Code...`);
  };

  const handleOpenInFinder = (project) => {
    showToast('info', `Revealing ${project.name} in Finder...`);
  };

  const handleOpenBrowser = (project) => {
    if (project.port) {
      showToast('info', `Opening http://localhost:${project.port}`);
    }
  };

  const handleInstallDeps = (project) => {
    showToast('info', `Installing dependencies for ${project.name}...`);
    setTimeout(() => {
      showToast('success', `Dependencies installed for ${project.name}`);
    }, 2000);
  };

  const handleCreateProject = async (projectData) => {
    console.log('[App] Creating project:', projectData);
    const result = await addProjectToStore(projectData);
    console.log('[App] Add project result:', result);

    if (result.success) {
      showToast('success', `Project ${projectData.name} created successfully`);
      addActivity('accent', projectData.name, 'added', projectData.type || '');
      closeModalHandler();
    } else {
      showToast('error', result.error || 'Failed to create project');
    }
  };

  // Theme handler
  const setThemeHandler = async (newTheme) => {
    const result = await updateElectronConfig({ theme: newTheme });
    if (result.success) {
      showToast('success', `Theme changed to ${newTheme}`);
    } else {
      showToast('error', result.error || 'Failed to update theme');
    }
  };

  // Settings handlers
  const handleSettingsChange = (newSettings) => {
    // Update local state immediately for responsive UI
    // The hook will sync to Electron
  };

  const handleSaveSettings = async () => {
    showToast('success', 'Settings saved');
  };

  // Tray handler
  const toggleTray = () => {
    setShowTray(prev => !prev);
  };

  // Command palette actions
  const handleCommandSelect = (command) => {
    closeModalHandler();

    switch (command.id) {
      case 'new-project':
        openModalHandler('project');
        break;
      case 'view-dashboard':
        showView('dashboard');
        break;
      case 'view-projects':
        showView('projects');
        break;
      case 'view-settings':
        showView('settings');
        break;
      case 'toggle-theme':
        setThemeHandler(config.theme === 'dark' ? 'light' : 'dark');
        break;
      case 'shortcuts':
        openModalHandler('shortcuts');
        break;
      case 'start-all':
        handleStartAll();
        break;
      case 'stop-all':
        handleStopAll();
        break;
      default:
        // Handle project-specific commands
        if (command.id.startsWith('start-')) {
          const projectName = command.id.replace('start-', '');
          const project = projects.find(p => p.name === projectName);
          if (project) handleStartProject(project);
        } else if (command.id.startsWith('stop-')) {
          const projectName = command.id.replace('stop-', '');
          const project = projects.find(p => p.name === projectName);
          if (project) handleStopProject(project);
        }
    }
  };

  return (
    <>
      {projectsLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <MainLayout
            currentView={currentView}
            showUpdateBanner={showUpdateBanner}
            onUpdateDismiss={() => setShowUpdateBanner(false)}
            onViewChange={showView}
            onOpenModal={openModalHandler}
            onStartAll={handleStartAll}
            onStopAll={handleStopAll}
            runningProjects={projects
              .filter(p => p.status?.toLowerCase() === 'running')
              .map(p => ({
                name: p.name,
                color: p.color,
                onClick: () => showView('project-detail', p)
              }))}
            theme={config.theme}
          >
        {/* Dashboard View */}
        {currentView === 'dashboard' && (
          <DashboardView
            projects={projects}
            activities={activities}
            onStart={handleStartProject}
            onStop={handleStopProject}
            onRestart={handleRestartProject}
            onDelete={handleDeleteProject}
            onNavigate={(projectOrView) => {
              if (typeof projectOrView === 'string') {
                showView(projectOrView);
              } else {
                showView('project-detail', projectOrView);
              }
            }}
            onShowToast={showToast}
            onOpenModal={openModalHandler}
          />
        )}

        {/* Projects View */}
        {currentView === 'projects' && (
          <ProjectsView
            projects={projects}
            onStart={handleStartProject}
            onStop={handleStopProject}
            onRestart={handleRestartProject}
            onDelete={handleDeleteProject}
            onNavigate={(project) => showView('project-detail', project)}
            onOpenModal={() => openModalHandler('project')}
            onConfirmDelete={(projectName) => {
              const project = projects.find(p => p.name === projectName);
              if (project) handleDeleteProject(project);
            }}
            onShowToast={showToast}
          />
        )}

        {/* Project Detail View */}
        {currentView === 'project-detail' && selectedProject && (() => {
          // Always use the latest project data from the projects array
          // so status/log changes are reflected in real-time
          const liveProject = projects.find(p => p.id === selectedProject.id) || selectedProject;
          return (
            <ProjectDetailView
              project={liveProject}
              logs={getLogs(liveProject.id)}
              onBack={() => showView('projects')}
              onStart={() => handleStartProject(liveProject)}
              onStop={() => handleStopProject(liveProject)}
              onRestart={() => handleRestartProject(liveProject)}
              onRemove={() => handleDeleteProject(liveProject)}
              onOpenInEditor={() => handleOpenInEditor(liveProject)}
              onOpenInFinder={() => handleOpenInFinder(liveProject)}
              onOpenBrowser={() => handleOpenBrowser(liveProject)}
              onInstallDeps={() => handleInstallDeps(liveProject)}
            />
          );
        })()}

        {/* Settings View */}
        {currentView === 'settings' && (
          <SettingsView onSave={handleSaveSettings} />
        )}

        {/* Empty State */}
        {currentView === 'empty' && (
          <EmptyState
            title="No Projects Yet"
            description="Get started by creating your first project or importing an existing one."
            actionLabel="Create Project"
            onAction={() => openModalHandler('project')}
          />
        )}
      </MainLayout>

      {/* Project Modal */}
      <ProjectModal
        isOpen={openModal === 'project'}
        onClose={closeModalHandler}
        onSave={handleCreateProject}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={openModal === 'confirm'}
        title="Delete Project"
        message={`Are you sure you want to remove "${confirmTarget?.name || 'this project'}" from your projects? This will not delete the files.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onCancel={closeModalHandler}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={openModal === 'command'}
        onClose={closeModalHandler}
        projects={projects}
        onSelectCommand={handleCommandSelect}
      />

      {/* Shortcuts Modal */}
      <ShortcutsModal
        isOpen={openModal === 'shortcuts'}
        onClose={closeModalHandler}
      />

      {/* Port Conflict Modal */}
      <PortConflictModal
        isOpen={openModal === 'portConflict'}
        port={3000}
        projectName="storefront-web"
        conflictingProcess="node (PID 1234)"
        onKillAndRestart={() => {
          showToast('success', 'Process killed and project restarted');
          closeModalHandler();
        }}
        onChangePort={() => {
          showToast('info', 'Port changed to 3001');
          closeModalHandler();
        }}
        onCancel={closeModalHandler}
      />

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Tray Icon */}
      <TrayIcon
        onClick={toggleTray}
        runningCount={projects.filter(p => p.status?.toLowerCase() === 'running').length}
      />

      {/* Tray Popup */}
      <TrayPopup
        isOpen={showTray}
        projects={projects.filter(p => p.status?.toLowerCase() === 'running').map(p => ({
          name: p.name,
          type: p.type,
          port: p.port,
          color: p.color
        }))}
        onClose={() => setShowTray(false)}
        onOpenProject={(projectName) => {
          const project = projects.find(p => p.name === projectName);
          if (project) {
            showView('project-detail', project);
            setShowTray(false);
          }
        }}
        onStopProject={(projectName) => {
          const project = projects.find(p => p.name === projectName);
          if (project) handleStopProject(project);
        }}
      />

      {/* Demo Panel */}
      <DemoPanel
        onNavigate={showView}
        onOpenModal={openModalHandler}
        onShowToast={showToast}
        currentView={currentView}
        currentTheme={config.theme}
      />
    </>
      )}
    </>
  );
}

export default App;
