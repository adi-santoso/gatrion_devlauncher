import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from './components/Layout';
import { DashboardView } from './components/Dashboard';
import { ProjectsView } from './components/Projects';
import { ProjectDetailView } from './components/ProjectDetail';
import { SettingsView } from './components/Settings';
import { LoadingSkeleton } from './components/States';
import TerminalWorkspace from './components/TerminalWorkspace';
import {
  ProjectModal,
  ConfirmDialog,
  CommandPalette,
  ShortcutsModal,
  ToastContainer,
  PresetModal,
} from './components/Modals';
import PortConflictModal from './components/Modals/PortConflictModal';
import { useProjects, useProcesses, useElectronConfig } from './hooks';
import { checkPortConflict, isElectronAvailable, onNavigateToProject, getActivities, appendActivities, getPresets, savePresets } from './utils/ipcRenderer';
import { summarizeWorkspaceStart } from './utils/workspaceResults';

function App() {
  // Initialize hooks
  const { projects, loading: projectsLoading, addProject: addProjectToStore, updateProject: updateProjectInStore, updateProjectLocal, deleteProject: deleteProjectFromStore } = useProjects();
  const { config, updateConfig: updateElectronConfig } = useElectronConfig();

  // View state
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedProject, setSelectedProject] = useState(null);

  // UI state
  const [openModal, setOpenModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [editingProject, setEditingProject] = useState(null);

  // Activities state
  const [activities, setActivities] = useState([]);

  // Workspace presets state
  const [presets, setPresets] = useState([]);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState(null);

  const formatActivityTime = (timestamp, detail = '') => {
    const date = new Date(timestamp);
    const base = Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
    return `${base}${detail ? ' · ' + detail : ''}`;
  };

  const addActivity = (type, project, message, detail = '') => {
    const timestamp = new Date().toISOString();
    setActivities(prev => [
      { type, project, message, time: formatActivityTime(timestamp, detail) },
      ...prev.slice(0, 19)
    ]);
    appendActivities([{ type, project, message, detail, timestamp }]).catch(() => {});
  };

  // Hydrate persisted activity feed once on mount
  useEffect(() => {
    let cancelled = false;
    getActivities().then((result) => {
      if (cancelled || !result?.success || !Array.isArray(result.activities)) return;
      setActivities(result.activities.slice(0, 20).map((entry) => ({
        type: entry.type,
        project: entry.project,
        message: entry.message,
        time: formatActivityTime(entry.timestamp, entry.detail)
      })));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
  } = useProcesses(projects, handleProjectUpdate, { maxLines: config.terminal?.maxLines });

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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpenModal('command');
        return;
      }

      // Ctrl+N - Add new project
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openModalHandler('project');
        return;
      }

      // Ctrl+Shift+S - Start all projects
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleStartAll();
        return;
      }

      // Ctrl+Shift+X - Stop all projects
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        handleStopAll();
        return;
      }

      // Escape - Close modals
      if (e.key === 'Escape' && openModal) {
        e.preventDefault();
        closeModalHandler();
        return;
      }

      // ? - Open shortcuts modal
      if (e.key === '?' && !openModal) {
        e.preventDefault();
        setOpenModal('shortcuts');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openModal, projects]);

  // Subscribe to tray menu navigation events
  useEffect(() => {
    const cleanup = onNavigateToProject((projectId) => {
      const target = projects.find(p => p.id === projectId);
      if (target) {
        showView('project-detail', target);
      }
    });
    return cleanup;
  }, [projects]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastFullscreenProjectId, setLastFullscreenProjectId] = useState(null);

  // View navigation
  const showView = (viewName, data = null) => {
    setCurrentView(viewName);

    if (viewName === 'project-detail' && data) {
      setSelectedProject(data);
      // If we were fullscreen and clicking same/different project, go fullscreen again
      if (isFullscreen || lastFullscreenProjectId) {
        setIsFullscreen(true);
        setLastFullscreenProjectId(data.id);
      }
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
    setDroppedProject(null);
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

  const [portConflictTarget, setPortConflictTarget] = useState(null);

  // Returns conflict data when the project's port is occupied by an external process.
  const findPortConflict = async (project) => {
    if (!project?.port || !isElectronAvailable()) return null;
    try {
      const conflict = await checkPortConflict(project.port);
      if (conflict && conflict.inUse && !conflict.isManaged) {
        return { ...conflict, port: project.port };
      }
    } catch {
      // Ignore check error and allow the start attempt to continue
    }
    return null;
  };

  // Project actions
  const handleStartProject = async (project, { skipPortCheck = false } = {}) => {
    if (!skipPortCheck) {
      const conflict = await findPortConflict(project);
      if (conflict) {
        setPortConflictTarget({ project, conflictData: conflict });
        return { success: false, conflict: true };
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
    return result;
  };

  const handleStopProject = async (project, { force = false } = {}) => {
    const result = await stopProjectProcess(project.id, force);

    if (result.success) {
      showToast('info', force ? `${project.name} force stopped` : `${project.name} stopped`);
      addActivity('faint', project.name, force ? 'force stopped' : 'stopped');
    } else {
      showToast('error', result.error || `Failed to stop ${project.name}`);
    }
  };

  // Bulk start with one preflight pass: show a single conflict modal for the first
  // conflicting project and start the rest. Conflicting projects are skipped so
  // they do not fail with a bind error.
  const handleBulkStartProjects = async (targetProjects) => {
    const startable = [];
    const skipped = [];
    for (const project of targetProjects) {
      const status = (project.status || '').toLowerCase();
      if (['running', 'starting', 'stopping'].includes(status)) continue;
      const conflict = await findPortConflict(project);
      if (conflict) skipped.push({ project, conflict });
      else startable.push(project);
    }

    if (skipped.length > 0) {
      const first = skipped[0];
      setPortConflictTarget({
        project: first.project,
        conflictData: first.conflict,
        skippedCount: skipped.length,
        skippedNames: skipped.map((item) => item.project.name),
      });
    }

    for (const project of startable) {
      await handleStartProject(project, { skipPortCheck: true });
    }

    if (startable.length === 0 && skipped.length === 0) {
      showToast('info', 'Selected projects are already active');
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

  const handleStartAll = async (requestedProjects) => {
    const projectsToStart = requestedProjects || projects.filter(project =>
      !['running', 'starting', 'stopping'].includes(project.status?.toLowerCase())
    );
    if (projectsToStart.length === 0) {
      showToast('info', 'All workspace projects are already active');
      return [];
    }
    const result = await startAll(projectsToStart.map((project) => project.id));
    const summary = summarizeWorkspaceStart(result, projectsToStart);
    if (summary.type === 'error') showToast(summary.type, summary.message);
    if (!Array.isArray(result)) return result;
    const targetIds = new Set(projectsToStart.map((project) => project.id));
    return result.filter((item) => targetIds.has(item.projectId));
  };

  const handleWorkspaceActionComplete = useCallback(({ action, completed, failed }) => {
    if (action === 'starting') {
      if (failed > 0) {
        showToast('warning', `Workspace ready with issues: ${completed} running, ${failed} failed`);
        addActivity('warning', 'Workspace', 'started with issues', `${completed} running, ${failed} failed`);
      } else {
        showToast('success', `Workspace ready: ${completed} project(s) running`);
        addActivity('success', 'Workspace', 'ready', `${completed} project(s)`);
      }
    }
  }, []);

  const handleStopAll = async () => {
    showToast('info', 'Stopping all projects...');
    const result = await stopAll();
    if (Array.isArray(result)) {
      const stopped = result.filter((r) => r.success).length;
      const failed = result.filter((r) => !r.success).length;
      if (failed > 0) {
        showToast('warning', `Stopped ${stopped}, ${failed} failed to stop`);
      } else if (stopped > 0) {
        showToast('info', `${stopped} project(s) stopped`);
      } else {
        showToast('info', 'No running projects to stop');
      }
      addActivity('faint', 'All projects', `stopped${stopped > 0 ? ` (${stopped})` : ''}`);
    } else if (result && result.error) {
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

  const handleBulkDeleteProjects = (targetProjects) => {
    if (!Array.isArray(targetProjects) || targetProjects.length === 0) return;
    openModalHandler('confirm', targetProjects);
  };

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    const targets = Array.isArray(confirmTarget) ? confirmTarget : [confirmTarget];

    let deleted = 0;
    let failed = 0;
    for (const target of targets) {
      const result = await deleteProjectFromStore(target.id);
      if (result.success) {
        deleted += 1;
        addActivity('faint', target.name || 'Project', 'removed');
        if (currentView === 'project-detail' && selectedProject?.id === target.id) {
          showView('projects');
        }
      } else {
        failed += 1;
        showToast('error', result.error || `Failed to delete ${target.name || 'project'}`);
      }
    }

    if (deleted > 0) {
      showToast('success', targets.length > 1
        ? `${deleted} project(s) removed`
        : `${targets[0].name || 'Project'} removed from projects`);
    }
    if (failed === 0) closeModalHandler();
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

  const [droppedProject, setDroppedProject] = useState(null);

  // Drag & drop folder handler — detect type and open ProjectModal
  const { detectProjectType } = useProjects();
  const handleDropFolder = async (folderPath) => {
    openModalHandler('project');
    setEditingProject(null);
    const result = await detectProjectType(folderPath);
    if (result.success) {
      setDroppedProject({
        path: folderPath,
        name: result.projectName || '',
        type: result.type || 'CUSTOM',
        port: result.defaultPort == null ? '' : String(result.defaultPort),
        startCommand: result.defaultCommand || '',
        commands: result.commands || [],
        emoji: result.icon || '⚙️',
        color: result.color || '#6B7280',
        tags: [],
        customCommands: [],
        dependsOn: [],
      });
    } else {
      setDroppedProject({ path: folderPath });
      showToast('warning', 'Could not auto-detect project type. Please configure manually.');
    }
  };

  // Workspace presets
  const handleStartPreset = async (preset) => {
    const presetProjects = (preset.projectIds || [])
      .map((id) => projects.find((p) => p.id === id))
      .filter(Boolean);
    if (presetProjects.length === 0) {
      showToast('info', `Preset "${preset.name}" has no projects`);
      return;
    }
    showToast('info', `Starting preset "${preset.name}"...`);
    const results = await handleStartAll(presetProjects);
    if (!Array.isArray(results)) return;
    const started = results.length;
    const alreadyActive = presetProjects.length - started;
    if (started > 0) {
      showToast('success', `Preset "${preset.name}": ${started} project(s) starting`);
      addActivity('accent', preset.name, 'preset started', `${started} projects`);
    } else if (alreadyActive > 0) {
      showToast('info', `Preset "${preset.name}": all ${alreadyActive} project(s) already active`);
    }
  };

  const handleDeletePreset = async (preset) => {
    setPresetToDelete(preset);
  };

  const confirmDeletePreset = async () => {
    if (!presetToDelete) return;
    const updated = presets.filter((p) => p.id !== presetToDelete.id);
    setPresets(updated);
    setPresetToDelete(null);
    const result = await savePresets(updated);
    if (result.success) {
      showToast('info', `Preset "${presetToDelete.name}" removed`);
      addActivity('faint', presetToDelete.name, 'preset removed');
    }
  };

  const handleCreatePreset = async (name, projectIds) => {
    const newPreset = {
      id: `preset-${Date.now()}`,
      name: name.trim(),
      projectIds,
      createdAt: new Date().toISOString(),
    };
    const updated = [...presets, newPreset];
    setPresets(updated);
    const result = await savePresets(updated);
    if (result.success) {
      showToast('success', `Preset "${name}" created`);
      addActivity('accent', name, 'preset created');
    } else {
      showToast('error', result.error || 'Failed to save preset');
    }
    setPresetModalOpen(false);
  };

  // Hydrate presets on mount
  useEffect(() => {
    getPresets().then((result) => {
      if (result?.success && Array.isArray(result.presets)) {
        setPresets(result.presets);
      }
    }).catch(() => {});
  }, []);

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
          const project = projects.find((item) => item.id === targetId);
          if (project) showView('project-detail', project);
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
            onViewChange={showView}
            onOpenModal={openModalHandler}
            onStartAll={handleStartAll}
            onStopAll={handleStopAll}
            projects={projects}
            sidebarExpanded={config.sidebarExpanded}
            hideTopBar={isFullscreen && currentView === 'project-detail'}
            onProjectSelect={(project) => showView('project-detail', project, isFullscreen)}
            onDropFolder={handleDropFolder}
            runningProjects={projects
              .filter(p => p.status?.toLowerCase() === 'running')
              .map(p => ({
                name: p.name,
                color: p.color,
                onClick: () => showView('project-detail', p, isFullscreen)
              }))}
            theme={config.theme}
          >
        {/* Dashboard View */}
        {currentView === 'dashboard' && (
          <DashboardView
            projects={projects}
            recentActivity={activities}
            latestOutput={projects.flatMap((project) => getLogs(project.id).map((log) => ({
              ...(typeof log === 'string' ? { message: log } : log),
              projectName: project.name,
            })))}
            onStart={handleStartProject}
            onStop={handleStopProject}
            onRestart={handleRestartProject}
            onNavigate={(projectOrView) => {
              if (typeof projectOrView === 'string') {
                showView(projectOrView);
              } else {
                showView('project-detail', projectOrView, isFullscreen);
              }
            }}
            onOpenModal={openModalHandler}
            onStartAll={handleStartAll}
            onStopAll={handleStopAll}
            onWorkspaceActionComplete={handleWorkspaceActionComplete}
            presets={presets}
            onStartPreset={handleStartPreset}
            onDeletePreset={handleDeletePreset}
            onCreatePreset={() => setPresetModalOpen(true)}
          />
        )}

        {currentView === 'terminals' && (
          <TerminalWorkspace projects={projects} getLogs={getLogs} onClearLogs={clearLogs} fontSize={config.terminal?.fontSize} />
        )}

        {/* Projects View */}
        {currentView === 'projects' && (
          <ProjectsView
            projects={projects}
            onStart={handleStartProject}
            onStop={handleStopProject}
            onForceStop={(project) => handleStopProject(project, { force: true })}
            onRestart={handleRestartProject}
            onDelete={handleDeleteProject}
            onBulkStart={handleBulkStartProjects}
            onBulkDelete={handleBulkDeleteProjects}
            onEdit={(project) => openModalHandler('project', project)}
            onNavigate={(project) => showView('project-detail', project, isFullscreen)}
            onOpenModal={() => openModalHandler('project')}
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
              onBack={() => {
                setLastFullscreenProjectId(null);
                showView('projects');
              }}
              onStart={() => handleStartProject(liveProject)}
              onStop={() => handleStopProject(liveProject)}
              onRestart={() => handleRestartProject(liveProject)}
              onRemove={() => handleDeleteProject(liveProject)}
              onEdit={() => openModalHandler('project', liveProject)}
              onClearLogs={() => clearLogs(liveProject.id)}
              terminalConfig={config.terminal}
              onFullscreenChange={(isFull) => {
                if (isFullscreen === isFull) return; // Only process actual changes
                setIsFullscreen(isFull);
                if (isFull && liveProject) {
                  setLastFullscreenProjectId(liveProject.id);
                } else if (!isFull) {
                  setLastFullscreenProjectId(null);
                }
              }}
              isFullscreen={isFullscreen}
            />
          );
        })()}

        {/* Settings View */}
        {currentView === 'settings' && (
          <SettingsView config={config} updateConfig={updateElectronConfig} />
        )}
      </MainLayout>

      {/* Project Modal */}
      <ProjectModal
        isOpen={openModal === 'project'}
        onClose={closeModalHandler}
        onSave={handleCreateProject}
        project={editingProject}
        droppedProject={droppedProject}
        allProjects={projects}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={openModal === 'confirm'}
        title="Delete Project"
        message={Array.isArray(confirmTarget)
          ? `Are you sure you want to remove ${confirmTarget.length} selected project(s)? This will not delete any files on disk.`
          : `Are you sure you want to remove "${confirmTarget?.name || 'this project'}" from your projects? This will not delete the files.`}
        confirmLabel={Array.isArray(confirmTarget) && confirmTarget.length > 1 ? `Delete ${confirmTarget.length} Projects` : 'Delete'}
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onCancel={closeModalHandler}
      />

      {/* Confirm Dialog for preset delete */}
      <ConfirmDialog
        isOpen={presetToDelete !== null}
        title="Delete Preset"
        message={`Are you sure you want to delete the preset "${presetToDelete?.name || 'this preset'}"?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={confirmDeletePreset}
        onCancel={() => setPresetToDelete(null)}
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
          conflictData={{
            ...portConflictTarget.conflictData,
            skippedCount: portConflictTarget.skippedCount || 0,
            skippedNames: portConflictTarget.skippedNames || [],
          }}
          onClose={() => setPortConflictTarget(null)}
          onEditPort={() => {
            const prj = portConflictTarget.project;
            setPortConflictTarget(null);
            openModalHandler('project', prj);
          }}
        />
      )}

      {/* Toast Container */}
      <PresetModal
        isOpen={presetModalOpen}
        onClose={() => setPresetModalOpen(false)}
        projects={projects}
        onCreate={handleCreatePreset}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
      )}
    </>
  );
}

export default App;
