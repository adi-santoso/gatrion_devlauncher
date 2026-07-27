import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from './components/Layout';
import { DashboardView } from './components/Dashboard';
import { ProjectsView } from './components/Projects';
import { ProjectDetailView } from './components/ProjectDetail';
import { SettingsView } from './components/Settings';
import { EmptyState, LoadingSkeleton } from './components/States';
import TerminalWorkspace from './components/TerminalWorkspace';
import {
  ProjectModal,
  ConfirmDialog,
  CommandPalette,
  ShortcutsModal,
  ToastContainer,
} from './components/Modals';
import PortConflictModal from './components/Modals/PortConflictModal';
import { useProjects, useProcesses, useElectronConfig } from './hooks';
import { isElectronAvailable } from './utils/ipcRenderer';

function App() {
  // Initialize hooks
  const { projects, loading: projectsLoading, addProject: addProjectToStore, updateProject: updateProjectInStore, updateProjectLocal, deleteProject: deleteProjectFromStore } = useProjects();
  const { config, updateConfig: updateElectronConfig } = useElectronConfig();

  // View state
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedProject, setSelectedProject] = useState(null);

  // UI state
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [openModal, setOpenModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [editingProject, setEditingProject] = useState(null);

  // Activities state
  const [activities, setActivities] = useState([]);

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
    clearLogs,
    processLogs
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

  const [isFullscreen, setIsFullscreen] = useState(false);

  // View navigation
  const showView = (viewName, data = null) => {
    setCurrentView(viewName);
    if (viewName !== 'project-detail') {
      setIsFullscreen(false);
    }
    if (viewName === 'project-detail' && data) {
      setSelectedProject(data);
    }
  };

  // Modal handlers
  const openModalHandler = (modalName, data = null) => {
    setOpenModal(modalName);
    if (modalName === 'project') {
      setEditingProject(data);
    }
    if (modalName === 'confirm' && data) {
      setConfirmTarget(data);
    }
  };

  const closeModalHandler = () => {
    setOpenModal(null);
    setConfirmTarget(null);
    setEditingProject(null);
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

  const [portConflictTarget, setPortConflictTarget] = useState(null);

  // Project actions
  const handleStartProject = async (project, force = false) => {
    if (!force && project?.port && isElectronAvailable()) {
      try {
        const conflict = await ipc.checkPortConflict(project.port);
        if (conflict && conflict.inUse && !conflict.isManaged) {
          setPortConflictTarget({ project, conflictData: { ...conflict, port: project.port } });
          return;
        }
      } catch {
        // Ignore check error and continue to start
      }
    }

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

  const handleCreateProject = async (projectData) => {
    const result = editingProject
      ? await updateProjectInStore(editingProject.id, projectData)
      : await addProjectToStore(projectData);

    if (result.success) {
      const action = editingProject ? 'updated' : 'created';
      showToast('success', `Project ${projectData.name} ${action} successfully`);
      addActivity('accent', projectData.name, action, projectData.type || '');
      closeModalHandler();
      return { success: true };
    } else {
      const error = result.error || `Failed to ${editingProject ? 'update' : 'create'} project`;
      showToast('error', error);
      return { success: false, error };
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
        // Handle project navigation and project-specific commands
        if (command.projectId || (command.id && command.id.startsWith('project-'))) {
          const targetId = command.projectId || command.id.replace('project-', '');
          setSelectedProjectId(targetId);
          showView('project-detail');
        } else if (command.id && command.id.startsWith('start-')) {
          const projectName = command.id.replace('start-', '');
          const project = projects.find(p => p.name === projectName);
          if (project) handleStartProject(project);
        } else if (command.id && command.id.startsWith('stop-')) {
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
            projects={projects}
            sidebarExpanded={config.sidebarExpanded}
            hideTopBar={isFullscreen}
            onProjectSelect={(project) => showView('project-detail', project)}
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
            recentActivity={activities}
            latestOutputProject={projects.find((project) => getLogs(project.id).length)?.name}
            latestOutput={getLogs(projects.find((project) => getLogs(project.id).length)?.id)}
            onStart={handleStartProject}
            onStop={handleStopProject}
            onRestart={handleRestartProject}
            onDelete={handleDeleteProject}
            onEdit={(project) => openModalHandler('project', project)}
            onNavigate={(projectOrView) => {
              if (typeof projectOrView === 'string') {
                showView(projectOrView);
              } else {
                showView('project-detail', projectOrView);
              }
            }}
            onShowToast={showToast}
            onOpenModal={openModalHandler}
            onStartAll={handleStartAll}
            onStopAll={handleStopAll}
          />
        )}

        {currentView === 'terminals' && (
          <TerminalWorkspace projects={projects} getLogs={getLogs} processLogs={processLogs} onClearLogs={clearLogs} />
        )}

        {/* Projects View */}
        {currentView === 'projects' && (
          <ProjectsView
            projects={projects}
            onStart={handleStartProject}
            onStop={handleStopProject}
            onRestart={handleRestartProject}
            onDelete={handleDeleteProject}
            onEdit={(project) => openModalHandler('project', project)}
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
              onEdit={() => openModalHandler('project', liveProject)}
              onClearLogs={() => clearLogs(liveProject.id)}
              onFullscreenChange={setIsFullscreen}
            />
          );
        })()}

        {/* Settings View */}
        {currentView === 'settings' && (
          <SettingsView config={config} updateConfig={updateElectronConfig} />
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
        project={editingProject}
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
      {portConflictTarget && (
        <PortConflictModal
          isOpen={!!portConflictTarget}
          conflictData={portConflictTarget.conflictData}
          onClose={() => setPortConflictTarget(null)}
          onProceed={() => {
            const prj = portConflictTarget.project;
            setPortConflictTarget(null);
            handleStartProject(prj, true);
          }}
          onEditPort={() => {
            const prj = portConflictTarget.project;
            setPortConflictTarget(null);
            openModalHandler('project', prj);
          }}
        />
      )}

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
      )}
    </>
  );
}

export default App;
