import { useState, useCallback } from 'react'
import type { DetectTypeResult } from './data/projects'
import type { ProjectRuntime } from './hooks/useProjects'

export interface AppDropDeps {
  openModal: (modalName: 'project', data?: unknown) => void
  setEditingProject: (project: ProjectRuntime | null) => void
  detectProjectType: (projectPath: string) => Promise<DetectTypeResult>
  showToast: (type: string, message: string) => void
}

/** Dropped / duplicated project prefill — plain key/value bag consumed by ProjectModal. */
export interface DroppedProjectData {
  path?: string
  name?: string
  type?: string
  port?: string
  startCommand?: string
  commands?: unknown[]
  emoji?: string
  color?: string
  tags?: string[]
  customCommands?: unknown[]
  dependsOn?: string[]
  envVars?: unknown[]
  [key: string]: unknown
}

/**
 * Drag & drop folder detection + project duplication. Both flows prefill the
 * create-project modal through the same `droppedProject` state bag.
 */
export function useAppDrop({ openModal, setEditingProject, detectProjectType, showToast }: AppDropDeps) {
  const [droppedProject, setDroppedProject] = useState<DroppedProjectData | null>(null)

  const handleDropFolder = useCallback(async (folderPath: string) => {
    openModal('project')
    setEditingProject(null)
    const result = await detectProjectType(folderPath)
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
      })
    } else {
      setDroppedProject({ path: folderPath })
      showToast('warning', 'Could not auto-detect project type. Please configure manually.')
    }
  }, [openModal, setEditingProject, detectProjectType, showToast])

  const handleDuplicateProject = useCallback((project: ProjectRuntime) => {
    if (!project) return
    // Strip runtime-only fields (kept live on the source project) from the copy.
    const config: Record<string, unknown> = { ...project }
    for (const key of ['status', 'pid', 'uptime', 'errorMessage', 'processCommands', 'cpu', 'memory', 'logs']) {
      delete config[key]
    }
    setDroppedProject({
      ...config,
      id: undefined,
      name: `${project.name} (copy)`,
      createdAt: new Date().toISOString(),
      lastRun: null,
      tags: Array.isArray(project.tags) ? [...project.tags] : [],
      customCommands: Array.isArray(project.customCommands) ? project.customCommands.map((item) => ({ ...item })) : [],
      dependsOn: Array.isArray(project.dependsOn) ? [...project.dependsOn] : [],
      envVars: Array.isArray(project.envVars) ? project.envVars.map((item) => ({ key: item.key, value: item.value ?? '' })) : [],
    })
    setEditingProject(null)
    openModal('project')
  }, [setDroppedProject, setEditingProject, openModal])

  return { droppedProject, setDroppedProject, handleDropFolder, handleDuplicateProject }
}
