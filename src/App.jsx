import { useState, useEffect } from 'react';
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

// Mock data
const MOCK_PROJECTS = [
  {
    id: 1,
    name: 'storefront-web',
    path: 'C:/projects/storefront-web',
    status: 'running',
    port: 5173,
    framework: 'React',
    type: 'React',
    stack: 'React (Vite)',
    emoji: '⚛️',
    color: '#61DAFB',
    cpu: '3.1%',
    memory: '182MB',
    uptime: '2h 14m',
    pid: '18420',
    sparklinePoints: '0,18 14,14 28,16 42,8 56,11 70,4 84,7 100,2',
    lastRun: '2 minutes ago',
    health: 'healthy',
    buildTime: '1.2s',
    memoryUsage: '145 MB',
    dependencies: 42,
    issues: 0
  },
  {
    id: 2,
    name: 'payment-api',
    path: 'C:/projects/payment-api',
    status: 'running',
    port: 3000,
    framework: 'Express',
    type: 'Node.js',
    stack: 'Node.js',
    emoji: '🟩',
    color: '#339933',
    cpu: '1.8%',
    memory: '140MB',
    uptime: '41m',
    pid: '18391',
    sparklinePoints: '0,10 14,13 28,9 42,15 56,10 70,12 84,6 100,9',
    lastRun: '5 minutes ago',
    health: 'healthy',
    buildTime: '0.8s',
    memoryUsage: '89 MB',
    dependencies: 28,
    issues: 1
  },
  {
    id: 3,
    name: 'analytics-dashboard',
    path: 'C:/projects/analytics-dashboard',
    status: 'stopped',
    port: 8080,
    framework: 'Vue',
    type: 'Vue.js',
    stack: 'Vue.js',
    emoji: '🟢',
    color: '#42B883',
    uptime: '2d',
    idleTime: '2d',
    lastRun: '2 hours ago',
    health: 'unknown',
    buildTime: '2.1s',
    memoryUsage: null,
    dependencies: 56,
    issues: 3
  },
  {
    id: 4,
    name: 'mobile-app',
    path: 'C:/projects/mobile-app',
    status: 'stopped',
    port: 8081,
    framework: 'React Native',
    type: 'React Native',
    stack: 'React Native',
    emoji: '📱',
    color: '#61DAFB',
    uptime: '1d',
    idleTime: '1d',
    lastRun: '1 day ago',
    health: 'unknown',
    buildTime: '3.4s',
    memoryUsage: null,
    dependencies: 67,
    issues: 0
  },
  {
    id: 5,
    name: 'legacy-monolith',
    path: 'C:/projects/legacy-monolith',
    status: 'error',
    port: 4200,
    framework: 'Angular',
    type: 'Angular',
    stack: 'Angular',
    emoji: '🅰️',
    color: '#DD0031',
    errorMessage: 'exit code 1 · 14 min ago',
    lastRun: '10 minutes ago',
    health: 'error',
    buildTime: null,
    memoryUsage: null,
    dependencies: 134,
    issues: 12
  }
];

const MOCK_ACTIVITIES = [
  {
    id: 1,
    type: 'start',
    project: 'storefront-web',
    message: 'Started successfully on port 3000',
    timestamp: '2 minutes ago'
  },
  {
    id: 2,
    type: 'build',
    project: 'payment-api',
    message: 'Build completed in 0.8s',
    timestamp: '5 minutes ago'
  },
  {
    id: 3,
    type: 'error',
    project: 'legacy-monolith',
    message: 'Failed to start: Module not found',
    timestamp: '10 minutes ago'
  },
  {
    id: 4,
    type: 'stop',
    project: 'analytics-dashboard',
    message: 'Stopped gracefully',
    timestamp: '2 hours ago'
  },
  {
    id: 5,
    type: 'install',
    project: 'storefront-web',
    message: 'Installed 3 dependencies',
    timestamp: '3 hours ago'
  }
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

const MOCK_TRAY_PROJECTS = [
  { name: 'storefront-web', port: 3000, status: 'running', health: 'healthy' },
  { name: 'payment-api', port: 8080, status: 'running', health: 'healthy' },
  { name: 'analytics-dashboard', port: 5173, status: 'running', health: 'warning' }
];

function App() {
  // View state
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedProject, setSelectedProject] = useState(null);

  // UI state
  const [showUpdateBanner, setShowUpdateBanner] = useState(true);
  const [openModal, setOpenModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [showTray, setShowTray] = useState(false);

  // Settings state
  const [settings, setSettings] = useState({
    theme: 'dark',
    sidebarExpanded: true,
    startOnBoot: false,
    minimizeToTray: true,
    notifyOnStart: false,
    notifyOnCrash: true,
    notificationSound: false,
    terminalFontSize: 14,
    terminalMaxLines: 1000,
    terminalAutoScroll: true
  });

  // Project state
  const [projects, setProjects] = useState(MOCK_PROJECTS);
  const [activities] = useState(MOCK_ACTIVITIES);

  // Initialize theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

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
  const handleStartProject = (project) => {
    setProjects(prev => prev.map(p =>
      p.id === project.id
        ? { ...p, status: 'running', health: 'healthy', port: 3000 + p.id }
        : p
    ));
    showToast('success', `${project.name} started successfully`);
  };

  const handleStopProject = (project) => {
    setProjects(prev => prev.map(p =>
      p.id === project.id
        ? { ...p, status: 'stopped', health: 'unknown', port: null }
        : p
    ));
    showToast('info', `${project.name} stopped`);
  };

  const handleRestartProject = (project) => {
    showToast('info', `Restarting ${project.name}...`);
    setTimeout(() => {
      setProjects(prev => prev.map(p =>
        p.id === project.id
          ? { ...p, status: 'running', health: 'healthy' }
          : p
      ));
      showToast('success', `${project.name} restarted successfully`);
    }, 1500);
  };

  const handleDeleteProject = (project) => {
    openModalHandler('confirm', project.name);
  };

  const confirmDelete = () => {
    setProjects(prev => prev.filter(p => p.name !== confirmTarget));
    showToast('success', `${confirmTarget} removed from projects`);
    closeModalHandler();
    if (currentView === 'project-detail' && selectedProject?.name === confirmTarget) {
      showView('projects');
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

  const handleCreateProject = (projectData) => {
    const newProject = {
      id: projects.length + 1,
      name: projectData.name,
      path: projectData.path,
      status: 'stopped',
      port: null,
      framework: projectData.template || 'React',
      lastRun: 'Never',
      health: 'unknown',
      buildTime: null,
      memoryUsage: null,
      dependencies: 0,
      issues: 0
    };

    setProjects(prev => [...prev, newProject]);
    showToast('success', `Project ${projectData.name} created successfully`);
    closeModalHandler();
  };

  // Theme handler
  const setThemeHandler = (newTheme) => {
    setSettings(prev => ({ ...prev, theme: newTheme }));
    document.documentElement.setAttribute('data-theme', newTheme);
    showToast('success', `Theme changed to ${newTheme}`);
  };

  // Settings handlers
  const handleSettingsChange = (newSettings) => {
    setSettings(newSettings);
  };

  const handleSaveSettings = () => {
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
        setThemeHandler(settings.theme === 'dark' ? 'light' : 'dark');
        break;
      case 'shortcuts':
        openModalHandler('shortcuts');
        break;
      case 'start-all':
        showToast('info', 'Starting all projects...');
        break;
      case 'stop-all':
        showToast('info', 'Stopping all projects...');
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
      <MainLayout
        currentView={currentView}
        showUpdateBanner={showUpdateBanner}
        onUpdateDismiss={() => setShowUpdateBanner(false)}
        onViewChange={showView}
        runningProjects={projects
          .filter(p => p.status === 'running')
          .map(p => ({
            name: p.name,
            color: p.color,
            onClick: () => showView('project-detail', p)
          }))}
        theme={settings.theme}
      >
        {/* Dashboard View */}
        {currentView === 'dashboard' && (
          <DashboardView
            projects={projects}
            activities={activities}
            onStart={handleStartProject}
            onStop={handleStopProject}
            onRestart={handleRestartProject}
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
            onNavigate={(project) => showView('project-detail', project)}
            onOpenModal={() => openModalHandler('project')}
            onConfirmDelete={(projectName) => {
              // TODO: implement delete confirmation
              showToast('error', `Delete ${projectName}?`);
            }}
            onShowToast={showToast}
          />
        )}

        {/* Project Detail View */}
        {currentView === 'project-detail' && selectedProject && (
          <ProjectDetailView
            project={selectedProject}
            logs={MOCK_LOGS}
            onBack={() => showView('projects')}
            onStart={() => handleStartProject(selectedProject)}
            onStop={() => handleStopProject(selectedProject)}
            onRestart={() => handleRestartProject(selectedProject)}
            onDelete={() => handleDeleteProject(selectedProject)}
            onOpenInEditor={() => handleOpenInEditor(selectedProject)}
            onOpenInFinder={() => handleOpenInFinder(selectedProject)}
            onOpenBrowser={() => handleOpenBrowser(selectedProject)}
            onInstallDeps={() => handleInstallDeps(selectedProject)}
          />
        )}

        {/* Settings View */}
        {currentView === 'settings' && (
          <SettingsView
            settings={settings}
            onSave={handleSaveSettings}
            onSettingsChange={handleSettingsChange}
          />
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

        {/* Loading State */}
        {currentView === 'loading' && <LoadingSkeleton />}
      </MainLayout>

      {/* Project Modal */}
      <ProjectModal
        isOpen={openModal === 'project'}
        onClose={closeModalHandler}
        onSubmit={handleCreateProject}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={openModal === 'confirm'}
        title="Delete Project"
        message={`Are you sure you want to remove "${confirmTarget}" from your projects? This will not delete the files.`}
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
        runningCount={projects.filter(p => p.status === 'running').length}
      />

      {/* Tray Popup */}
      <TrayPopup
        isOpen={showTray}
        projects={MOCK_TRAY_PROJECTS}
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
        currentTheme={settings.theme}
      />
    </>
  );
}

export default App;
