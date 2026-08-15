import type { RefObject } from 'react'
import ProjectDetailView from './components/ProjectDetail/ProjectDetailView'
import type { ProjectRuntime } from './hooks/useProjects'
import type { AppConfig } from './types/shared'
import type { ProcessLogLine } from './data/processes'

export interface AppProjectDetailProps {
  project: ProjectRuntime
  projects: ProjectRuntime[]
  currentView: string
  keepAlive: boolean
  fullscreenRef: RefObject<ProjectRuntime | null>
  getLogs: (projectId: string) => ProcessLogLine[]
  onBack: () => void
  onStart: (project: ProjectRuntime) => void
  onStop: (project: ProjectRuntime) => void
  onRestart: (project: ProjectRuntime) => void
  onRemove: (project: ProjectRuntime) => void
  onEdit: (project: ProjectRuntime) => void
  onDuplicate: (project: ProjectRuntime) => void
  onClearLogs: (projectId: string) => void
  onOpenAgent: (project: ProjectRuntime) => void
  terminalConfig?: AppConfig['terminal']
  onAutoScrollChange: (value: boolean) => void
  onFullscreenChange: (fullscreen: boolean) => void
  onPrevProject: () => void
  onNextProject: () => void
  isFullscreen: boolean
}

/**
 * Project detail view with keep-alive semantics: while the app shows another
 * view the component stays mounted (hidden) so the preview iframe keeps its
 * page state. When keep-alive is off it unmounts like the old behavior.
 */
export default function AppProjectDetail({
  project,
  projects,
  currentView,
  keepAlive,
  fullscreenRef,
  getLogs,
  onBack,
  onStart,
  onStop,
  onRestart,
  onRemove,
  onEdit,
  onDuplicate,
  onClearLogs,
  onOpenAgent,
  terminalConfig,
  onAutoScrollChange,
  onFullscreenChange,
  onPrevProject,
  onNextProject,
  isFullscreen,
}: AppProjectDetailProps) {
  // Always use the latest project data from the projects array so status/log
  // changes are reflected in real-time.
  const liveProject = projects.find((p) => p.id === project.id) || project
  fullscreenRef.current = liveProject

  if (!keepAlive && currentView !== 'project-detail') return null
  const hidden = currentView !== 'project-detail'

  return (
    <div className={hidden ? 'hidden' : ''}>
      <ProjectDetailView
        project={liveProject}
        projects={projects}
        keepPreviewAlive={keepAlive}
        logs={getLogs(liveProject.id)}
        onBack={onBack}
        onStart={() => onStart(liveProject)}
        onStop={() => onStop(liveProject)}
        onRestart={() => onRestart(liveProject)}
        onRemove={() => onRemove(liveProject)}
        onEdit={() => onEdit(liveProject)}
        onDuplicate={() => onDuplicate(liveProject)}
        onClearLogs={() => onClearLogs(liveProject.id)}
        onOpenAgent={() => onOpenAgent(liveProject)}
        terminalConfig={terminalConfig}
        onAutoScrollChange={onAutoScrollChange}
        onFullscreenChange={onFullscreenChange}
        onPrevProject={onPrevProject}
        onNextProject={onNextProject}
        isFullscreen={isFullscreen}
      />
    </div>
  )
}
