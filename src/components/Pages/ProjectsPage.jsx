import React, { useEffect, useState } from 'react'
import useAppStore from '../../store/appStore'
import AddProjectModal from '../Project/AddProjectModal'
import ProjectCard from '../Project/ProjectCard'
import TerminalViewer from '../Terminal/TerminalViewer'

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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Projects</h2>
        <button
          onClick={() => setAddProjectModalOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
        >
          ➕ Add Project
        </button>
      </div>

      {projects.length === 0 ? (
        /* Empty State */
        <div className="flex items-center justify-center flex-1">
          <div className="text-center">
            <div className="text-6xl mb-4">📁</div>
            <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
            <p className="text-gray-400 mb-4">
              Click "Add Project" to get started
            </p>
            <button
              onClick={() => setAddProjectModalOpen(true)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
            >
              ➕ Add Your First Project
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex gap-6 overflow-hidden">
          {/* Project Grid */}
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
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
            <div className="w-1/3 min-w-[400px] border-l border-gray-700">
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
