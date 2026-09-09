import type { RefObject } from 'react'
import ProjectDetailView from './components/ProjectDetail/ProjectDetailView'
import type { ProjectRuntime } from './hooks/useProjects'
import type { AppConfig } from './types/shared'
import type { ProcessLogLine } from './data/processes'

export interface AppProjectDetailProps {
  project: ProjectRuntime
  projects: ProjectRuntime[]
  currentView: string
  modalOpen?: boolean
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
 * Project detail stays mounted while the app shows another view so interactive
 * shells keep their PTY state. Preview mounting is controlled independently by
 * `keepAlive` inside ProjectDetailView.
 */
export default function AppProjectDetail({
  project,
  projects,
  currentView,
  modalOpen = false,
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

  const hidden = currentView !== 'project-detail'

  return (
    // h-full is required for the fullscreen preview: without a definite
    // height on this wrapper, the h-full chain inside ProjectDetailView
    // collapses to the content height (~the floating bar), the preview
    // placeholder measures 0px, and the embedded WebContentsView gets hidden
    // (bounds height 0 -> 1px) leaving a blank/black screen. In normal mode
    // the page scrolls, so the extra height is harmless.
    <div className={hidden ? 'hidden' : 'h-full flex flex-col'}>
      <ProjectDetailView
        project={liveProject}
        projects={projects}
        keepPreviewAlive={keepAlive}
        visible={currentView === 'project-detail' && !modalOpen}
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
