import { useCallback } from 'react'
import { checkPortConflict, isElectronAvailable } from './utils/ipcRenderer'
import { summarizeWorkspaceStart } from './utils/workspaceResults'
import type { Project } from './types/shared'
import type { ProjectRuntime, ProjectUpdateInput } from './hooks/useProjects'
import type { StartAllResult } from './data/processes'
import type { ModalName, PortConflictTarget, ProcessActionResult } from './AppTypes'

export interface ProjectActionsDeps {
  projects: ProjectRuntime[]
  confirmTarget: Project | Project[] | null
  currentView: string
  selectedProject: ProjectRuntime | null
  editingProject: ProjectRuntime | null
  showView: (viewName: string, data?: unknown) => void
  openModal: (modalName: ModalName, data?: unknown) => void
  closeModal: () => void
  startProjectProcess: (projectId: string) => Promise<ProcessActionResult>
  stopProjectProcess: (projectId: string, force?: boolean) => Promise<ProcessActionResult>
  restartProjectProcess: (projectId: string) => Promise<ProcessActionResult>
  startAll: (projectIds?: string[]) => Promise<StartAllResult>
  stopAll: () => Promise<unknown>
  deleteProjectFromStore: (projectId: string) => Promise<{ success: boolean; error?: string }>
  updateProjectInStore: (projectId: string, updates: ProjectUpdateInput) => Promise<{ success: boolean; error?: string }>
  addProjectToStore: (data: Project) => Promise<{ success: boolean; error?: string }>
  showToast: (type: string, message: string) => void
  addActivity: (type: string, project: string, message: string, detail?: string) => void
  setPortConflictTarget: React.Dispatch<React.SetStateAction<PortConflictTarget | null>>
}

/**
 * Project lifecycle + bulk actions for the App controller: port-conflict
 * preflight, start/stop/restart (single and bulk), tag editing, deletion,
 * and create/update orchestration.
 */
export function useAppProjectActions({
  projects,
  confirmTarget,
  currentView,
  selectedProject,
  editingProject,
  showView,
  openModal,
  closeModal,
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
}: ProjectActionsDeps) {
  // Returns conflict data when the project's port is occupied by an external process.
  const findPortConflict = useCallback(async (project: ProjectRuntime) => {
    if (!project?.port || !isElectronAvailable()) return null
    try {
      const conflict = await checkPortConflict(project.port)
      if (conflict && conflict.inUse && !conflict.isManaged) {
        return { ...conflict, port: project.port }
      }
    } catch {
      // Ignore check error and allow the start attempt to continue
    }
    return null
  }, [])

  const handleStartProject = useCallback(async (project: ProjectRuntime, { skipPortCheck = false } = {}): Promise<ProcessActionResult> => {
    if (!skipPortCheck) {
      const conflict = await findPortConflict(project)
      if (conflict) {
        setPortConflictTarget({ project, conflictData: conflict })
        return { success: false, conflict: true }
      }
    }

    const result = await startProjectProcess(project.id)
    if (result.success) {
      showToast('success', `${project.name} started successfully`)
      addActivity('success', project.name, 'started', project.port ? `port ${project.port}` : '')
    } else {
      showToast('error', result.error || `Failed to start ${project.name}`)
      addActivity('danger', project.name, 'failed to start')
    }
    return result
  }, [findPortConflict, setPortConflictTarget, startProjectProcess, showToast, addActivity])

  const handleStopProject = useCallback(async (project: ProjectRuntime, { force = false } = {}): Promise<ProcessActionResult> => {
    const result = await stopProjectProcess(project.id, force)
    if (result.success) {
      showToast('info', force ? `${project.name} force stopped` : `${project.name} stopped`)
      addActivity('faint', project.name, force ? 'force stopped' : 'stopped')
    } else {
      showToast('error', result.error || `Failed to stop ${project.name}`)
    }
    return result
  }, [stopProjectProcess, showToast, addActivity])

  // Bulk stop with an aggregated summary instead of N individual toasts
  const handleBulkStopProjects = useCallback(async (targetProjects: ProjectRuntime[]) => {
    const targets = targetProjects.filter((project) =>
      ['running', 'starting'].includes(project.status?.toLowerCase() || '')
    )
    if (targets.length === 0) {
      showToast('info', 'No running projects in selection')
      return
    }
    showToast('info', `Stopping ${targets.length} project(s)...`)
    const settled = await Promise.allSettled(targets.map((project) => handleStopProject(project)))
    const stopped = settled.filter((r) => r.status === 'fulfilled' && r.value?.success).length
    const failed = settled.length - stopped
    if (failed > 0) {
      showToast('warning', `Stopped ${stopped}, ${failed} failed to stop`)
    } else {
      showToast('info', `${stopped} project(s) stopped`)
    }
    addActivity('faint', 'Projects', 'bulk stopped', `${stopped} projects`)
  }, [handleStopProject, showToast, addActivity])

  // Bulk restart: backend restart handles stop+start atomically for running ones,
  // stopped ones are started directly.
  const handleBulkRestartProjects = useCallback(async (targetProjects: ProjectRuntime[]) => {
    const running = targetProjects.filter((project) =>
      ['running', 'starting'].includes(project.status?.toLowerCase() || '')
    )
    const idle = targetProjects.filter((project) =>
      !['running', 'starting', 'stopping'].includes(project.status?.toLowerCase() || '')
    )
    const targets = [...running, ...idle]
    if (targets.length === 0) {
      showToast('info', 'Nothing to restart in selection')
      return
    }
    showToast('info', `Restarting ${targets.length} project(s)...`)
    let restarted = 0
    let failed = 0
    for (const project of running) {
      const result = await restartProjectProcess(project.id)
      if (result?.success) restarted += 1
      else failed += 1
    }
    for (const project of idle) {
      const result = await handleStartProject(project)
      if (result?.success) restarted += 1
      else failed += 1
    }
    if (failed > 0) {
      showToast('warning', `Restarted ${restarted}, ${failed} failed`)
    } else {
      showToast('success', `${restarted} project(s) restarted`)
    }
    addActivity('accent', 'Projects', 'bulk restarted', `${restarted} projects`)
  }, [restartProjectProcess, handleStartProject, showToast, addActivity])

  // Add/remove tags on many projects at once
  const handleBulkTagEdit = useCallback(async (targetProjects: ProjectRuntime[], tagsToAdd?: string[], tagsToRemove?: string[]) => {
    const add = (Array.isArray(tagsToAdd) ? tagsToAdd : []).map((t) => t.trim()).filter(Boolean)
    const remove = new Set((Array.isArray(tagsToRemove) ? tagsToRemove : []).map((t) => t.trim()).filter(Boolean))
    if (add.length === 0 && remove.size === 0) return

    let updated = 0
    for (const project of targetProjects) {
      const current = Array.isArray(project.tags) ? project.tags : []
      const next = [...new Set([...current.filter((t) => !remove.has(t)), ...add])]
      if (next.length === current.length && next.every((t, i) => t === current[i])) continue
      const result = await updateProjectInStore(project.id, { tags: next })
      if (result.success) updated += 1
    }
    if (updated > 0) {
      showToast('success', `Updated tags on ${updated} project(s)`)
      addActivity('accent', 'Projects', 'bulk tags updated', `${updated} projects`)
    } else {
      showToast('info', 'No tag changes needed')
    }
  }, [updateProjectInStore, showToast, addActivity])

  // Bulk start with one preflight pass: show a single conflict modal for the first
  // conflicting project and start the rest. Conflicting projects are skipped so
  // they do not fail with a bind error.
  const handleBulkStartProjects = useCallback(async (targetProjects: ProjectRuntime[]) => {
    const startable: ProjectRuntime[] = []
    const skipped: Array<{ project: ProjectRuntime; conflict: Record<string, unknown> }> = []
    for (const project of targetProjects) {
      const status = (project.status || '').toLowerCase()
      if (['running', 'starting', 'stopping'].includes(status)) continue
      const conflict = await findPortConflict(project)
      if (conflict) skipped.push({ project, conflict })
      else startable.push(project)
    }

    if (skipped.length > 0) {
      const first = skipped[0]
      setPortConflictTarget({
        project: first.project,
        conflictData: first.conflict,
        skippedCount: skipped.length,
        skippedNames: skipped.map((item) => item.project.name),
      })
    }

    for (const project of startable) {
      await handleStartProject(project, { skipPortCheck: true })
    }

    if (startable.length === 0 && skipped.length === 0) {
      showToast('info', 'Selected projects are already active')
    }
  }, [findPortConflict, setPortConflictTarget, handleStartProject, showToast])

  const handleRestartProject = useCallback(async (project: ProjectRuntime): Promise<ProcessActionResult> => {
    showToast('info', `Restarting ${project.name}...`)
    const result = await restartProjectProcess(project.id)
    if (result.success) {
      showToast('success', `${project.name} restarted successfully`)
      addActivity('success', project.name, 'restarted')
    } else {
      showToast('error', result.error || `Failed to restart ${project.name}`)
      addActivity('danger', project.name, 'restart failed')
    }
    return result
  }, [restartProjectProcess, showToast, addActivity])

  const handleStartAll = useCallback(async (requestedProjects?: ProjectRuntime[]) => {
    const projectsToStart = requestedProjects || projects.filter(project =>
      !['running', 'starting', 'stopping'].includes(project.status?.toLowerCase() || '')
    )
    if (projectsToStart.length === 0) {
      showToast('info', 'All workspace projects are already active')
      return []
    }
    const result = await startAll(projectsToStart.map((project) => project.id))
    const summary = summarizeWorkspaceStart(result, projectsToStart)
    if (summary.type === 'error') showToast(summary.type, summary.message)
    if (!Array.isArray(result)) return result
    const targetIds = new Set(projectsToStart.map((project) => project.id))
    return result.filter((item) => targetIds.has(item.projectId))
  }, [projects, startAll, showToast])

  const handleWorkspaceActionComplete = useCallback(({ action, completed, failed }: { action: string; completed: number; failed: number }) => {
    if (action === 'starting') {
      if (failed > 0) {
        showToast('warning', `Workspace ready with issues: ${completed} running, ${failed} failed`)
        addActivity('warning', 'Workspace', 'started with issues', `${completed} running, ${failed} failed`)
      } else {
        showToast('success', `Workspace ready: ${completed} project(s) running`)
        addActivity('success', 'Workspace', 'ready', `${completed} project(s)`)
      }
    }
  }, [showToast, addActivity])

  const handleStopAll = useCallback(async () => {
    showToast('info', 'Stopping all projects...')
    const result = await stopAll()
    if (Array.isArray(result)) {
      const stopped = result.filter((r) => r.success).length
      const failed = result.filter((r) => !r.success).length
      if (failed > 0) {
        showToast('warning', `Stopped ${stopped}, ${failed} failed to stop`)
      } else if (stopped > 0) {
        showToast('info', `${stopped} project(s) stopped`)
      } else {
        showToast('info', 'No running projects to stop')
      }
      addActivity('faint', 'All projects', `stopped${stopped > 0 ? ` (${stopped})` : ''}`)
    } else if (result && (result as { error?: string }).error) {
      showToast('error', (result as { error: string }).error)
    } else {
      showToast('info', 'All projects stopped')
      addActivity('faint', 'All projects', 'stopped')
    }
  }, [stopAll, showToast, addActivity])

  const handleDeleteProject = useCallback((project: ProjectRuntime) => {
    // Store project ID instead of name for reliable deletion
    openModal('confirm', project)
  }, [openModal])

  const handleBulkDeleteProjects = useCallback((targetProjects: ProjectRuntime[]) => {
    if (!Array.isArray(targetProjects) || targetProjects.length === 0) return
    openModal('confirm', targetProjects)
  }, [openModal])

  const confirmDelete = useCallback(async () => {
    if (!confirmTarget) return
    const targets = Array.isArray(confirmTarget) ? confirmTarget : [confirmTarget]

    let deleted = 0
    let failed = 0
    for (const target of targets) {
      const result = await deleteProjectFromStore(target.id)
      if (result.success) {
        deleted += 1
        addActivity('faint', target.name || 'Project', 'removed')
        if (currentView === 'project-detail' && selectedProject?.id === target.id) {
          showView('projects')
        }
      } else {
        failed += 1
        showToast('error', result.error || `Failed to delete ${target.name || 'project'}`)
      }
    }

    if (deleted > 0) {
      showToast('success', targets.length > 1
        ? `${deleted} project(s) removed`
        : `${targets[0].name || 'Project'} removed from projects`)
    }
    if (failed === 0) closeModal()
  }, [confirmTarget, deleteProjectFromStore, addActivity, currentView, selectedProject, showView, showToast, closeModal])

  const handleCreateProject = useCallback(async (projectData: Record<string, unknown>) => {
    const result = editingProject
      ? await updateProjectInStore(editingProject.id, projectData as ProjectUpdateInput)
      : await addProjectToStore(projectData as unknown as Project)

    if (result.success) {
      const action = editingProject ? 'updated' : 'created'
      showToast('success', `Project ${String(projectData.name || '')} ${action} successfully`)
      addActivity('accent', String(projectData.name || ''), action, String(projectData.type || ''))
      closeModal()
      return { success: true }
    } else {
      const error = result.error || `Failed to ${editingProject ? 'update' : 'create'} project`
      showToast('error', error)
      return { success: false, error }
    }
  }, [editingProject, updateProjectInStore, addProjectToStore, showToast, addActivity, closeModal])

  return {
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
  }
}
