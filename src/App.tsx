import { useState, useCallback, useRef, lazy, Suspense } from 'react'
import { MainLayout } from './components/Layout'
import { LoadingSkeleton } from './components/States'
import { I18nProvider } from './i18n/I18nContext'
import AppModals from './AppModals'
import AppProjectDetail from './AppProjectDetail'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { useAppEffects } from './useAppEffects'
import { useProjects, useProcesses, useElectronConfig, useToasts, useActivities, usePresets } from './hooks'
import { useAppDrop } from './useAppDrop'
import { useAppProjectActions } from './useAppProjectActions'
import { useAppCommands } from './useAppCommands'
import type { AppConfig, Project } from './types/shared'
import type { ProjectRuntime } from './hooks/useProjects'
import type { ProjectRuntimeUpdate } from './hooks/useProcesses'
import type { PortConflictTarget } from './AppTypes'

// Views are code-split per route so the initial renderer bundle stays small.
// Each chunk loads on first navigation and is cached by the browser afterwards.
const DashboardView = lazy(() => import('./components/Dashboard').then((m) => ({ default: m.DashboardView })))
const ProjectsView = lazy(() => import('./components/Projects').then((m) => ({ default: m.ProjectsView })))
const SettingsView = lazy(() => import('./components/Settings').then((m) => ({ default: m.SettingsView })))
const TerminalWorkspace = lazy(() => import('./components/TerminalWorkspace'))
const AgentView = lazy(() => import('./components/Agent/AgentView'))

function App() {
  // ---- Data hooks ----
  const {
    projects,
    loading: projectsLoading,
    addProject: addProjectToStore,
    updateProject: updateProjectInStore,
    updateProjectLocal,
    deleteProject: deleteProjectFromStore,
    detectProjectType,
  } = useProjects()
  const { config, updateConfig: updateElectronConfig } = useElectronConfig()
  const { toasts, dismissToast, showToast } = useToasts()
  const { activities, addActivity } = useActivities()

  // ---- View state ----
  const [currentView, setCurrentView] = useState('dashboard')
  const [agentProjectId, setAgentProjectId] = useState<string | null>(null)
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<ProjectRuntime | null>(null)

  // ---- UI state ----
  const [openModal, setOpenModal] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<Project | Project[] | null>(null)
  const [editingProject, setEditingProject] = useState<ProjectRuntime | null>(null)
  const [portConflictTarget, setPortConflictTarget] = useState<PortConflictTarget | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [lastFullscreenProjectId, setLastFullscreenProjectId] = useState<string | null>(null)
  const fullscreenProjectRef = useRef<ProjectRuntime | null>(null)

  // ---- Process manager + presets ----
  const handleProjectUpdate = useCallback((projectId: string, update: ProjectRuntimeUpdate) => {
    updateProjectLocal(projectId, { ...update })
  }, [updateProjectLocal])

  const {
    startProject: startProjectProcess,
    stopProject: stopProjectProcess,
    restartProject: restartProjectProcess,
    startAll,
    stopAll,
    getLogs,
    clearLogs,
    getMetricHistory,
  } = useProcesses(projects, handleProjectUpdate, { maxLines: config.terminal?.maxLines })

  const {
    presets,
    presetModalOpen,
    presetModalInitial,
    presetModalPreselect,
    presetToDelete,
    openPresetModal,
    handleStartPreset,
    handleStopPreset,
    handleRestartPreset,
    handleDeletePreset,
    clearPresetDelete,
    confirmDeletePreset,
    handleCreatePreset,
    handleUpdatePreset,
    handleDuplicatePreset,
    handleSaveSelectionAsPreset,
    handleMovePreset,
    closePresetModal,
  } = usePresets({ projects, startAll, stopProjectProcess, showToast, addActivity })

  // ---- Navigation + modal plumbing (plain functions; effects re-bind on state change) ----
  const showView = (viewName: string, data: unknown = null): void => {
    setCurrentView(viewName)

    if (viewName === 'project-detail' && data) {
      setSelectedProject(data as ProjectRuntime)
      // If we were fullscreen and clicking same/different project, go fullscreen again
      if (isFullscreen || lastFullscreenProjectId) {
        setIsFullscreen(true)
        setLastFullscreenProjectId((data as ProjectRuntime).id)
      }
    }
    if (viewName === 'agent' && data) {
      const payload = data as { projectId?: string; sessionId?: string }
      setAgentProjectId(typeof data === 'string' ? data : (payload.projectId || null))
      setAgentSessionId(typeof data === 'object' && !Array.isArray(data) ? (payload.sessionId || null) : null)
    } else if (viewName === 'agent') {
      setAgentSessionId(null)
    }
  }

  const openModalHandler = (modalName: string, data: unknown = null): void => {
    setOpenModal(modalName)
    if (modalName === 'project') {
      setEditingProject(data as ProjectRuntime | null)
    }
    if (modalName === 'confirm' && data) {
      setConfirmTarget(data as Project | Project[])
    }
  }

  const closeModalHandler = (): void => {
    setOpenModal(null)
    setConfirmTarget(null)
    setEditingProject(null)
    setDroppedProject(null)
  }

  const setThemeHandler = async (newTheme: string): Promise<void> => {
    // Briefly enable color transitions so the theme switch cross-fades
    document.documentElement.classList.add('theme-transition')
    setTimeout(() => document.documentElement.classList.remove('theme-transition'), 300)
    const result = await updateElectronConfig({ theme: newTheme as AppConfig['theme'] })
    if (result.success) {
      showToast('success', `Theme changed to ${newTheme}`)
    } else {
      showToast('error', result.error || 'Failed to update theme')
    }
  }

  const handleDetailFullscreenChange = useCallback((isFull: boolean) => {
    setIsFullscreen((prev) => (prev === isFull ? prev : isFull))
    const liveProject = fullscreenProjectRef.current
    if (isFull && liveProject) {
      setLastFullscreenProjectId(liveProject.id)
    } else if (!isFull) {
      setLastFullscreenProjectId(null)
    }
  }, [])

  // Preview navigation: move to the previous / next project in the registry
  // (used by the fullscreen preview chrome and Ctrl+←/→ shortcuts).
  const navigateRelativeProject = useCallback((direction: number) => {
    setSelectedProject((current) => {
      if (!current || projects.length === 0) return current
      const index = projects.findIndex((p) => p.id === current.id)
      if (index === -1) return current
      const nextIndex = (index + direction + projects.length) % projects.length
      return projects[nextIndex]
    })
  }, [projects])

  // ---- Drag & drop + duplication prefill ----
  const { droppedProject, setDroppedProject, handleDropFolder, handleDuplicateProject } = useAppDrop({
    openModal: openModalHandler,
    setEditingProject,
    detectProjectType,
    showToast,
  })

  // ---- Project lifecycle + bulk actions ----
  const {
    handleStartProject,
    handleStopProject,
    handleBulkStopProjects,
    handleBulkRestartProjects,
    handleBulkTagEdit,
    handleBulkStartProjects,
    handleRestartProject,
    handleStartAll,
    handleWorkspaceActionComplete,
    handleStopAll,
    handleDeleteProject,
    handleBulkDeleteProjects,
    confirmDelete,
    handleCreateProject,
  } = useAppProjectActions({
    projects,
    confirmTarget,
    currentView,
    selectedProject,
    editingProject,
    showView,
    openModal: openModalHandler,
    closeModal: closeModalHandler,
    startProjectProcess,
    stopProjectProcess,
    restartProjectProcess,
    startAll,
    stopAll,
    deleteProjectFromStore,
    updateProjectInStore,
    addProjectToStore,
    showToast,
    addActivity,
    setPortConflictTarget,
  })

  // ---- Command palette + transfers ----
  const { handleCommandSelect, handleExportProjects, handleImportProjects, handleExportDiagnostics } = useAppCommands({
    projects,
    presets,
    config,
    showToast,
    addActivity,
    closeModal: closeModalHandler,
    openModal: openModalHandler,
    showView,
    setThemeHandler,
    handleStartAll,
    handleStopAll,
    handleStartPreset,
  })

  // ---- Effects ----
  useAppEffects({ projects, config, showToast, addActivity, showView })

  // Keyboard shortcuts
  useKeyboardShortcuts({
    openModal,
    onOpenModal: openModalHandler,
    onCloseModal: closeModalHandler,
    onStartAll: handleStartAll,
    onStopAll: handleStopAll,
    setOpenModal,
  })

  return (
    <I18nProvider language={config.language}>
      {projectsLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <MainLayout
            currentView={currentView}
            onViewChange={showView}
            onOpenModal={openModalHandler}
            projects={projects}
            hideTopBar={isFullscreen && currentView === 'project-detail'}
            onProjectSelect={(project) => showView('project-detail', project as ProjectRuntime)}
            onDropFolder={handleDropFolder}
            runningProjects={projects
              .filter((p) => p.status?.toLowerCase() === 'running')
              .map((p) => ({
                name: p.name,
                color: p.color,
                onClick: () => showView('project-detail', p),
              }))}
          >
            <Suspense fallback={<LoadingSkeleton />}>
              {/* Dashboard View */}
              {currentView === 'dashboard' && (
                <DashboardView
                  projects={projects}
                  recentActivity={activities}
                  latestOutput={projects.flatMap((project) => getLogs(project.id).map((log) => ({
                    ...log,
                    projectName: project.name,
                  })))}
                  onStart={handleStartProject}
                  onStop={handleStopProject}
                  onRestart={handleRestartProject}
                  onNavigate={(projectOrView) => {
                    if (typeof projectOrView === 'string') {
                      showView(projectOrView)
                    } else {
                      showView('project-detail', projectOrView)
                    }
                  }}
                  onOpenModal={openModalHandler}
                  onStartAll={handleStartAll}
                  onStopAll={handleStopAll}
                  onWorkspaceActionComplete={handleWorkspaceActionComplete}
                  presets={presets}
                  onStartPreset={handleStartPreset}
                  onStopPreset={handleStopPreset}
                  onRestartPreset={handleRestartPreset}
                  onEditPreset={openPresetModal}
                  onDuplicatePreset={handleDuplicatePreset}
                  onDeletePreset={handleDeletePreset}
                  onMovePreset={handleMovePreset}
                  onCreatePreset={() => openPresetModal()}
                  getMetricHistory={getMetricHistory}
                />
              )}

              {currentView === 'terminals' && (
                <TerminalWorkspace
                  projects={projects}
                  getLogs={getLogs}
                  onClearLogs={clearLogs}
                  fontSize={config.terminal?.fontSize}
                  autoScroll={config.terminal?.autoScroll !== false}
                  onAutoScrollChange={(value) => updateElectronConfig({ terminal: { autoScroll: value } })}
                />
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
                  onBulkStop={handleBulkStopProjects}
                  onBulkRestart={handleBulkRestartProjects}
                  onBulkDelete={handleBulkDeleteProjects}
                  onBulkSavePreset={handleSaveSelectionAsPreset}
                  onBulkTagEdit={handleBulkTagEdit}
                  onDuplicate={handleDuplicateProject}
                  onEdit={(project) => openModalHandler('project', project)}
                  onNavigate={(project) => showView('project-detail', project)}
                  onOpenModal={() => openModalHandler('project')}
                />
              )}

              {/* Project Detail View — kept alive (hidden) while browsing other views */}
              {selectedProject && (
                <AppProjectDetail
                  project={selectedProject}
                  projects={projects}
                  currentView={currentView}
                  modalOpen={Boolean(openModal || portConflictTarget || presetModalOpen || presetToDelete)}
                  keepAlive={config.preview?.keepAlive !== false}
                  fullscreenRef={fullscreenProjectRef}
                  getLogs={getLogs}
                  onBack={() => {
                    setLastFullscreenProjectId(null)
                    showView('projects')
                  }}
                  onStart={handleStartProject}
                  onStop={handleStopProject}
                  onRestart={handleRestartProject}
                  onRemove={handleDeleteProject}
                  onEdit={(project) => openModalHandler('project', project)}
                  onDuplicate={handleDuplicateProject}
                  onClearLogs={clearLogs}
                  onOpenAgent={(project) => showView('agent', { projectId: project.id })}
                  terminalConfig={config.terminal}
                  onAutoScrollChange={(value) => updateElectronConfig({ terminal: { autoScroll: value } })}
                  onFullscreenChange={handleDetailFullscreenChange}
                  onPrevProject={() => navigateRelativeProject(-1)}
                  onNextProject={() => navigateRelativeProject(1)}
                  isFullscreen={isFullscreen}
                />
              )}

              {/* Agent View — kept mounted (hidden) while browsing other views so an
                  in-flight conversation, streaming response, and selected session
                  survive navigation, exactly like the preview keep-alive. */}
              <div className={currentView !== 'agent' ? 'hidden' : ''}>
                <AgentView
                  projects={projects}
                  initialProjectId={agentProjectId}
                  initialSessionId={agentSessionId}
                  visible={currentView === 'agent'}
                  onOpenProject={(project) => showView('project-detail', project)}
                  onOpenSettings={() => showView('settings')}
                />
              </div>

              {/* Settings View */}
              {currentView === 'settings' && (
                <SettingsView
                  config={config}
                  updateConfig={(updates) => { void updateElectronConfig(updates) }}
                  onExportProjects={handleExportProjects}
                  onImportProjects={handleImportProjects}
                  onExportDiagnostics={handleExportDiagnostics}
                />
              )}
            </Suspense>
          </MainLayout>

          <AppModals
            openModal={openModal}
            onCloseAll={closeModalHandler}
            onSaveProject={handleCreateProject}
            editingProject={editingProject}
            droppedProject={droppedProject}
            projects={projects}
            confirmTarget={confirmTarget}
            onConfirmDelete={confirmDelete}
            presetToDelete={presetToDelete}
            onConfirmDeletePreset={confirmDeletePreset}
            onCancelPresetDelete={clearPresetDelete}
            presets={presets}
            onSelectCommand={handleCommandSelect}
            portConflictTarget={portConflictTarget}
            onClosePortConflict={() => setPortConflictTarget(null)}
            onEditPort={() => {
              if (!portConflictTarget) return
              const prj = portConflictTarget.project
              setPortConflictTarget(null)
              openModalHandler('project', prj)
            }}
            presetModalOpen={presetModalOpen}
            presetModalInitial={presetModalInitial}
            presetModalPreselect={presetModalPreselect}
            onClosePresetModal={closePresetModal}
            onSubmitPreset={presetModalInitial ? (data) => handleUpdatePreset(presetModalInitial.id, data) : handleCreatePreset}
            toasts={toasts}
            onDismissToast={dismissToast}
          />
        </>
      )}
    </I18nProvider>
  )
}

export default App
