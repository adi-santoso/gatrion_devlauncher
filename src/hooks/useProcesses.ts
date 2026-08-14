import { useState, useEffect, useCallback, useRef } from 'react'
import * as ipc from '../utils/ipcRenderer'
import type { Project } from '../types/shared'
import type { ProcessStatusResult, ProcessLogLine, MetricsResult, StartAllResult } from '../data/processes'

export interface ProjectRuntimeUpdate {
  status?: string
  pid?: number | null
  startedAt?: number | null
  uptime?: string | null
  errorMessage?: string | null
  cpu?: number | null
  memory?: number | null
  metrics?: MetricsResult
  processCommands?: unknown[]
}

export interface UseProcessesOptions {
  maxLines?: number
}

/** Project list as consumed here — persisted fields plus runtime status/metrics. */
export interface ProcessProject extends Project {
  status?: string
  uptime?: string | null
  cpu?: number | null
  memory?: number | null
  metrics?: MetricsResult
}

const formatUptime = (startedAt: number | string | null | undefined): string | null => {
  if (!startedAt) return null
  const totalSeconds = Math.max(0, Math.floor((Date.now() - Number(startedAt)) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m`
  return `${totalSeconds}s`
}

const runtimeUpdate = (status: ProcessStatusResult | string): ProjectRuntimeUpdate & { status: string } => {
  const details: ProcessStatusResult = typeof status === 'string' ? { status } : status || {}
  const normalizedStatus = (details.status || 'stopped').toLowerCase()
  const active = normalizedStatus === 'running' || normalizedStatus === 'starting'
  return {
    status: normalizedStatus,
    pid: details.pid ?? null,
    startedAt: details.startedAt ?? null,
    uptime: active ? formatUptime(details.startedAt) : null,
    errorMessage: details.error || null,
    processCommands: details.commands || [],
  }
}

/**
 * useProcesses Hook
 * Manages process lifecycle and subscribes to process events
 */
export const useProcesses = (
  projects: ProcessProject[] = [],
  onProjectUpdate?: (projectId: string, update: ProjectRuntimeUpdate) => void,
  options: UseProcessesOptions = {}
) => {
  const [processStatuses, setProcessStatuses] = useState<Record<string, string>>({})
  const [processLogs, setProcessLogs] = useState<Record<string, ProcessLogLine[]>>({})
  const statusRevisions = useRef<Record<string, number>>({})
  const metricsHistory = useRef<Record<string, Array<{ t: number; cpu: number | null; memory: number | null }>>>({}) // projectId -> [{ t, cpu, memory }] capped at METRIC_SAMPLES
  const maxLines = Number.isInteger(options.maxLines) && options.maxLines! > 0 ? options.maxLines! : 1000
  const maxLinesRef = useRef(maxLines)
  maxLinesRef.current = maxLines

  // Start a project
  const startProject = useCallback(async (projectId: string) => {
    try {
      const project = projects.find(p => p.id === projectId)
      if (!project) {
        return { success: false, error: 'Project not found' }
      }

      // Update local status immediately BEFORE IPC call for responsive UI
      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: 'starting',
      }))

      // Notify parent component to update project status
      if (onProjectUpdate) {
        onProjectUpdate(projectId, { status: 'starting' })
      }

      const response = await ipc.startProject(projectId)

      if (response.success) {
        setProcessStatuses(prev => {
          const current = prev[projectId]
          if (current === 'running' || current === 'error') {
            return prev
          }
          const normalizedStatus = (response.status || 'running').toLowerCase()
          return {
            ...prev,
            [projectId]: normalizedStatus,
          }
        })

        if (onProjectUpdate) {
          onProjectUpdate(projectId, {
            pid: response.pid,
          })
        }

        return { success: true }
      } else {
        // Revert status on failure
        setProcessStatuses(prev => ({
          ...prev,
          [projectId]: 'stopped',
        }))

        if (onProjectUpdate) {
          onProjectUpdate(projectId, { status: 'stopped' })
        }

        return { success: false, error: response.error || 'Failed to start project' }
      }
    } catch (err) {
      console.error('Error starting project:', err)
      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: 'stopped',
      }))
      if (onProjectUpdate) {
        onProjectUpdate(projectId, { status: 'stopped' })
      }
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }, [projects, onProjectUpdate])

  // Stop a project
  const stopProject = useCallback(async (projectId: string, force = false) => {
    setProcessStatuses(prev => ({
      ...prev,
      [projectId]: 'stopping',
    }))
    if (onProjectUpdate) {
      onProjectUpdate(projectId, { status: 'stopping' })
    }

    try {
      const response = await ipc.stopProject(projectId, force)

      if (response.success) {
        setProcessStatuses(prev => ({
          ...prev,
          [projectId]: 'stopped',
        }))

        if (onProjectUpdate) {
          onProjectUpdate(projectId, { status: 'stopped', pid: null, uptime: null })
        }

        return { success: true }
      } else {
        setProcessStatuses(prev => ({
          ...prev,
          [projectId]: 'running',
        }))
        if (onProjectUpdate) {
          onProjectUpdate(projectId, { status: 'running' })
        }
        return { success: false, error: response.error || 'Failed to stop project' }
      }
    } catch (err) {
      console.error('Error stopping project:', err)
      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: 'running',
      }))
      if (onProjectUpdate) {
        onProjectUpdate(projectId, { status: 'running' })
      }
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }, [onProjectUpdate])

  // Restart a project
  const restartProject = useCallback(async (projectId: string) => {
    try {
      const project = projects.find(p => p.id === projectId)
      if (!project) {
        return { success: false, error: 'Project not found' }
      }

      // Update local status immediately BEFORE IPC call for responsive UI
      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: 'starting',
      }))

      if (onProjectUpdate) {
        onProjectUpdate(projectId, { status: 'starting' })
      }

      const response = await ipc.restartProject(projectId)

      if (response.success) {
        return { success: true }
      } else {
        // Revert status on failure
        setProcessStatuses(prev => ({
          ...prev,
          [projectId]: 'stopped',
        }))

        if (onProjectUpdate) {
          onProjectUpdate(projectId, { status: 'stopped' })
        }

        return { success: false, error: response.error || 'Failed to restart project' }
      }
    } catch (err) {
      console.error('Error restarting project:', err)
      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: 'stopped',
      }))
      if (onProjectUpdate) {
        onProjectUpdate(projectId, { status: 'stopped' })
      }
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }, [projects, onProjectUpdate])

  // Start all projects
  const startAll = useCallback(async (projectIds: string[] | undefined, delayMs?: number): Promise<StartAllResult> => {
    try {
      const response = await ipc.startAllProjects(projectIds, delayMs)
      if (Array.isArray(response)) {
        for (const result of response) {
          if (!result.projectId) continue
          const status = result.success ? (result.status || 'starting').toLowerCase() : 'error'
          setProcessStatuses(prev => ({ ...prev, [result.projectId]: status }))
          onProjectUpdate?.(result.projectId, {
            status,
            ...(result.pid != null && { pid: result.pid }),
            ...(!result.success && { errorMessage: result.error || 'Failed to start project' }),
          })
        }
      }
      return response
    } catch (err) {
      console.error('Error starting all projects:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }, [onProjectUpdate])

  // Stop all projects
  const stopAll = useCallback(async () => {
    try {
      const response = await ipc.stopAllProjects()
      return response
    } catch (err) {
      console.error('Error stopping all projects:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }, [])

  // Get logs for a specific project
  const getLogs = useCallback((projectId: string): ProcessLogLine[] => {
    return processLogs[projectId] || []
  }, [processLogs])

  // Clear logs for a specific project
  const clearLogs = useCallback(async (projectId: string) => {
    try {
      const response = await ipc.clearLogs(projectId)
      if (!response.success) return response
      setProcessLogs(prev => ({ ...prev, [projectId]: [] }))
      return { success: true }
    } catch (err) {
      console.error('Error clearing process logs:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }, [])

  // Subscribe to process status updates
  useEffect(() => {
    const cleanup = ipc.onProcessStatus((projectId, status) => {
      statusRevisions.current[projectId] = (statusRevisions.current[projectId] || 0) + 1

      const update = runtimeUpdate(status)

      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: update.status,
      }))

      if (onProjectUpdate) {
        onProjectUpdate(projectId, update)
      }
    })

    return cleanup
  }, [onProjectUpdate])

  // Subscribe to process logs
  useEffect(() => {
    const cleanup = ipc.onProcessLog((projectId, logLine) => {
      setProcessLogs(prev => {
        const logs = prev[projectId] || []
        return {
          ...prev,
          [projectId]: [...logs, logLine as ProcessLogLine].slice(-maxLinesRef.current),
        }
      })
    })

    return cleanup
  }, [])

  // Subscribe to process errors
  useEffect(() => {
    const cleanup = ipc.onProcessError((projectId, error) => {
      console.error(`[Process Error] Project ${projectId}:`, error)

      setProcessStatuses(prev => ({
        ...prev,
        [projectId]: 'error',
      }))

      if (onProjectUpdate) {
        onProjectUpdate(projectId, {
          status: 'error',
          errorMessage: error,
        })
      }
    })

    return cleanup
  }, [onProjectUpdate])

  // Subscribe to CPU/Memory resource updates
  useEffect(() => {
    const cleanup = ipc.onResourceUpdate(({ projectId, cpu, memory }) => {
      // Update the project's CPU and memory in parent component via callback
      if (onProjectUpdate) {
        onProjectUpdate(projectId, {
          cpu: cpu ?? null,
          memory: memory ?? null,
        })
      }
    })

    return cleanup
  }, [onProjectUpdate])

  // Read through a ref so the hydration effect can depend on the stable
  // stringified id list without re-running on every array identity change.
  const projectsRef = useRef(projects)
  projectsRef.current = projects

  const projectIds = JSON.stringify(projectsRef.current.map(project => project.id))

  // Hydrate after listeners are attached so reloads keep backend runtime state and output.
  useEffect(() => {
    let cancelled = false

    const hydrate = async () => {
      const snapshots = await Promise.all(projectsRef.current.map(async (project) => {
        const statusRevision = statusRevisions.current[project.id] || 0
        const [statusResult, logsResult] = await Promise.allSettled([
          ipc.getProcessStatus(project.id),
          ipc.getLogs(project.id),
        ])
        return { project, statusRevision, statusResult, logsResult }
      }))

      if (cancelled) return

      for (const { project, statusRevision, statusResult, logsResult } of snapshots) {
        if (statusResult.status === 'fulfilled' && statusRevision === (statusRevisions.current[project.id] || 0)) {
          const update = runtimeUpdate(statusResult.value)
          setProcessStatuses(prev => ({ ...prev, [project.id]: update.status }))
          onProjectUpdate?.(project.id, update)
        } else {
          console.error(`Error hydrating status for project ${project.id}:`, statusResult.status === 'rejected' ? statusResult.reason : 'status revision changed')
        }

        if (logsResult.status === 'fulfilled') {
          setProcessLogs(prev => {
            const logs = [...logsResult.value, ...(prev[project.id] || [])]
            const seen = new Set<string>()
            const merged = logs.filter(log => {
              const key = log.id ?? JSON.stringify([log.timestamp, log.type, log.message])
              if (seen.has(key)) return false
              seen.add(key)
              return true
            }).sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp))).slice(-maxLinesRef.current)
            return { ...prev, [project.id]: merged }
          })
        } else {
          console.error(`Error hydrating logs for project ${project.id}:`, logsResult.reason)
        }
      }
    }

    hydrate()
    return () => { cancelled = true }
  }, [projectIds, onProjectUpdate])

  // Subscribe to process exits
  useEffect(() => {
    const cleanup = ipc.onProcessExit(async (projectId) => {
      const snapshot = await ipc.getProcessStatus(projectId)
      const update = runtimeUpdate(snapshot)
      setProcessStatuses(prev => ({ ...prev, [projectId]: update.status }))
      onProjectUpdate?.(projectId, update)
    })

    return cleanup
  }, [onProjectUpdate])

  const processStatusesRef = useRef(processStatuses)
  processStatusesRef.current = processStatuses

  const onProjectUpdateRef = useRef(onProjectUpdate)
  onProjectUpdateRef.current = onProjectUpdate

  // Smart polling for resource metrics (runs once on mount, 4s interval, throttled backend)
  useEffect(() => {
    const pollMetrics = async () => {
      if (document.hidden) return
      const currentProjects = projectsRef.current || []
      const currentStatuses = processStatusesRef.current || {}
      const runningProjects = currentProjects.filter(
        p => (currentStatuses[p.id] || p.status || '').toLowerCase() === 'running'
      )

      for (const p of runningProjects) {
        try {
          const metrics = await ipc.getProcessMetrics(p.id)
          if (metrics && metrics.pid) {
            // Keep a bounded history for sparkline rendering
            const history = metricsHistory.current[p.id] || []
            const sample = {
              t: Date.now(),
              cpu: metrics.cpuPercent != null ? Number(metrics.cpuPercent) : null,
              memory: metrics.memoryMb != null ? Number(metrics.memoryMb) : null,
            }
            if (sample.cpu != null || sample.memory != null) {
              const last = history[history.length - 1]
              if (!last || last.cpu !== sample.cpu || last.memory !== sample.memory) {
                metricsHistory.current[p.id] = [...history, sample].slice(-30)
              }
            }
            // Only notify if metrics or uptime actually changed
            if (
              p.uptime !== metrics.uptime ||
              p.metrics?.memoryMb !== metrics.memoryMb ||
              p.metrics?.cpuPercent !== metrics.cpuPercent
            ) {
              onProjectUpdateRef.current?.(p.id, {
                uptime: metrics.uptime,
                metrics,
                cpu: metrics.cpuPercent ?? p.cpu ?? null,
                memory: metrics.memoryMb ?? p.memory ?? null,
              })
            }
          }
        } catch {
          // Ignore
        }
      }
    }

    const intervalId = setInterval(pollMetrics, 4000)
    return () => clearInterval(intervalId)
  }, [])

  const getMetricHistory = useCallback((projectId: string) => metricsHistory.current[projectId] || [], [])

  return {
    processStatuses,
    processLogs,
    startProject,
    stopProject,
    restartProject,
    startAll,
    stopAll,
    getLogs,
    clearLogs,
    getMetricHistory,
  }
}
