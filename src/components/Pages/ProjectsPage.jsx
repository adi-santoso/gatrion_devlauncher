import React, { useEffect, useState } from 'react'
import useAppStore from '../../store/appStore'
import AddProjectModal from '../Project/AddProjectModal'
import ProjectCard from '../Project/ProjectCard'
import TerminalViewer from '../Terminal/TerminalViewer'
import Button from '../Common/Button'

function ProjectsPage() {
  const {
    projects,
    setProjects,
    addProject,
    removeProject,
    processStatuses,
    setProcessStatus,
    addProcessLog,
    addProjectModalOpen,
    setAddProjectModalOpen,
  } = useAppStore()

  const [selectedProject, setSelectedProject] = useState(null)

  // Load projects on mount
  useEffect(() => {
    loadProjects()
    setupProcessListeners()

    return () => {
      // Cleanup listeners
      window.electron.removeAllListeners('process-status')
      window.electron.removeAllListeners('process-log')
      window.electron.removeAllListeners('process-error')
      window.electron.removeAllListeners('process-exit')
      window.electron.removeAllListeners('projects-updated')
    }
  }, [])

  const loadProjects = async () => {
    try {
      const result = await window.electron.getProjects()
      if (result.success) {
        setProjects(result.projects)
      }
    } catch (error) {
      console.error('Error loading projects:', error)
    }
  }

  const setupProcessListeners = () => {
    // Listen for process status updates
    window.electron.onProcessStatus((projectId, status) => {
      setProcessStatus(projectId, status)
    })

    // Listen for process logs
    window.electron.onProcessLog((projectId, log) => {
      addProcessLog(projectId, log)
    })

    // Listen for process errors
    window.electron.onProcessError((projectId, error) => {
      addProcessLog(projectId, {
        timestamp: new Date().toISOString(),
        type: 'error',
        message: error,
      })
    })

    // Listen for process exits
    window.electron.onProcessExit((projectId, code, signal) => {
      addProcessLog(projectId, {
        timestamp: new Date().toISOString(),
        type: 'system',
        message: `Process exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`,
      })
    })

    // Listen for project updates
    window.electron.onProjectsUpdated((updatedProjects) => {
      setProjects(updatedProjects)
    })
  }

  const handleAddProject = async (projectData) => {
    try {
      const result = await window.electron.addProject(projectData)
      if (result.success) {
        addProject(result.project)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Error adding project:', error)
      throw error
    }
  }

  const handleStartProject = async (project) => {
    try {
      const result = await window.electron.startProject(
        project.id,
        project.path,
        project.command,
        project.env || {}
      )
      if (!result.success) {
        alert('Failed to start project: ' + result.error)
      }
    } catch (error) {
      console.error('Error starting project:', error)
      alert('Error starting project: ' + error.message)
    }
  }

  const handleStopProject = async (project) => {
    try {
      const result = await window.electron.stopProject(project.id)
      if (!result.success) {
        alert('Failed to stop project: ' + result.error)
      }
    } catch (error) {
      console.error('Error stopping project:', error)
      alert('Error stopping project: ' + error.message)
    }
  }

  const handleRemoveProject = async (project) => {
    if (!confirm(`Are you sure you want to remove "${project.name}"?`)) {
      return
    }

    try {
      const result = await window.electron.deleteProject(project.id)
      if (result.success) {
        removeProject(project.id)
        if (selectedProject?.id === project.id) {
          setSelectedProject(null)
        }
      } else {
        alert('Failed to remove project: ' + result.error)
      }
    } catch (error) {
      console.error('Error removing project:', error)
      alert('Error removing project: ' + error.message)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {projects.length === 0 ? (
        /* Empty State */
        <div className="flex items-center justify-center flex-1">
          <div className="text-center max-w-md">
            <div className="relative mb-8">
              <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-blue-600/20 to-purple-600/20 flex items-center justify-center border-4 border-gray-800 shadow-2xl">
                <span className="text-6xl">📁</span>
              </div>
              <div className="absolute -bottom-2 -right-2 w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-xl">
                <span className="text-2xl">➕</span>
              </div>
            </div>
            <h3 className="text-3xl font-bold mb-3 bg-gradient-to-r from-gray-100 to-gray-300 bg-clip-text text-transparent">
              No Projects Yet
            </h3>
            <p className="text-gray-400 mb-8 text-lg">
              Start by adding your first development project to manage and monitor it from here
            </p>
            <Button
              variant="primary"
              size="lg"
              icon="✨"
              onClick={() => setAddProjectModalOpen(true)}
              className="shadow-2xl"
            >
              Add Your First Project
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex gap-6 overflow-hidden">
          {/* Project Grid */}
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6 pb-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  processStatus={processStatuses[project.id]}
                  onStart={handleStartProject}
                  onStop={handleStopProject}
                  onRemove={handleRemoveProject}
                />
              ))}
            </div>
          </div>

          {/* Terminal Viewer (if project selected) */}
          {selectedProject && (
            <div className="w-1/3 min-w-[400px] border-l border-gray-800">
              <TerminalViewer
                logs={processStatuses[selectedProject.id]?.logs || []}
                projectName={selectedProject.name}
              />
            </div>
          )}
        </div>
      )}

      {/* Add Project Modal */}
      <AddProjectModal
        isOpen={addProjectModalOpen}
        onClose={() => setAddProjectModalOpen(false)}
        onAdd={handleAddProject}
      />
    </div>
  )
}

export default ProjectsPage
