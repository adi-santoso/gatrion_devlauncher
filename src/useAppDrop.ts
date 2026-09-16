import { useState, useCallback } from 'react'
import type { ProjectRuntime } from './hooks/useProjects'

export interface AppDropDeps {
  openModal: (modalName: 'project', data?: unknown) => void
  setEditingProject: (project: ProjectRuntime | null) => void
  detectProjectType?: unknown
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
export function useAppDrop({ openModal, setEditingProject }: AppDropDeps) {
  const [droppedProject, setDroppedProject] = useState<DroppedProjectData | null>(null)

  const handleDropFolder = useCallback((folderPath: string) => {
    setDroppedProject({ path: folderPath, analyze: true, requestId: crypto.randomUUID() })
    openModal('project')
    setEditingProject(null)
  }, [openModal, setEditingProject])

  const handleDuplicateProject = useCallback((project: ProjectRuntime) => {
    if (!project) return
    // Strip runtime-only fields (kept live on the source project) from the copy.
    const config: Record<string, unknown> = { ...project }
    for (const key of ['status', 'pid', 'uptime', 'errorMessage', 'processCommands', 'cpu', 'memory', 'logs']) {
      delete config[key]
    }
    setDroppedProject({
      ...config,
      path: '',
      duplicate: true,
      id: undefined,
      name: `${project.name} (copy)`,
      createdAt: new Date().toISOString(),
      lastRun: null,
      tags: Array.isArray(project.tags) ? [...project.tags] : [],
      customCommands: Array.isArray(project.customCommands) ? project.customCommands.map((item) => ({ ...item })) : [],
      dependsOn: Array.isArray(project.dependsOn) ? [...project.dependsOn] : [],
      envVars: Array.isArray(project.envVars) ? project.envVars.map((item) => ({ key: item.key, value: item.value ?? '', secret: item.secret, needsValue: item.unchanged === true })) : [],
    })
    setEditingProject(null)
    openModal('project')
  }, [setDroppedProject, setEditingProject, openModal])

  return { droppedProject, setDroppedProject, handleDropFolder, handleDuplicateProject }
}
