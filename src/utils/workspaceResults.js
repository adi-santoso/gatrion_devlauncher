export function summarizeWorkspaceStart(result, projectsToStart) {
  if (!Array.isArray(result)) {
    return result?.error
      ? { type: 'error', message: `Workspace failed to start: ${result.error}`, started: 0, failed: 0 }
      : { type: 'error', message: 'Workspace returned an invalid start result', started: 0, failed: 0 }
  }

  const targetIds = new Set(projectsToStart.map((project) => project.id))
  const targetResults = result.filter((item) => targetIds.has(item.projectId))
  const started = targetResults.filter((item) => item.success).length
  const failed = targetResults.filter((item) => !item.success).length

  if (started === 0 && failed > 0) {
    return { type: 'error', message: `Workspace could not start: ${failed} project(s) failed`, started, failed }
  }
  if (failed > 0) {
    return { type: 'warning', message: `Workspace partially started: ${started} started, ${failed} failed`, started, failed }
  }
  if (started > 0) {
    return { type: 'success', message: `Workspace started: ${started} project(s) running`, started, failed }
  }
  return { type: 'info', message: 'All workspace projects are already running', started, failed }
}

export function getWorkspaceControlMode(projects, workspaceAction = 'idle') {
  if (workspaceAction === 'starting' || workspaceAction === 'stopping') return workspaceAction
  if (projects.length === 0) return 'empty'

  const statuses = projects.map((project) => project.status?.toLowerCase())
  const activeCount = statuses.filter((status) => status === 'running' || status === 'starting' || status === 'stopping').length
  if (activeCount === projects.length) return 'all-active'
  if (activeCount > 0) return 'partial'
  return 'stopped'
}
