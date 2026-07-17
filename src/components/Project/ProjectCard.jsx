import React from 'react'

function ProjectCard({ project, processStatus, onStart, onStop, onRemove }) {
  const status = processStatus?.status || 'STOPPED'
  const isRunning = status === 'RUNNING'
  const isStarting = status === 'STARTING'
  const isStopping = status === 'STOPPING'

  const getStatusColor = () => {
    switch (status) {
      case 'RUNNING':
        return 'bg-green-500'
      case 'STARTING':
        return 'bg-yellow-500 animate-pulse'
      case 'STOPPING':
        return 'bg-orange-500 animate-pulse'
      case 'ERROR':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'RUNNING':
        return 'Running'
      case 'STARTING':
        return 'Starting...'
      case 'STOPPING':
        return 'Stopping...'
      case 'ERROR':
        return 'Error'
      default:
        return 'Stopped'
    }
  }

  const getTypeIcon = () => {
    const icons = {
      NEXTJS: '⚡',
      REACT_VITE: '⚛️',
      VUE: '🟢',
      LARAVEL: '🔴',
      GOLANG: '🐹',
      NODEJS: '🟩',
      CUSTOM: '⚙️',
    }
    return icons[project.type] || '📁'
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{getTypeIcon()}</span>
          <div>
            <h3 className="text-lg font-semibold">{project.name}</h3>
            <p className="text-sm text-gray-400">{project.type}</p>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
          <span className="text-sm font-medium">{getStatusText()}</span>
        </div>
      </div>

      {/* Project Info */}
      <div className="space-y-2 mb-4">
        <div className="text-sm">
          <span className="text-gray-400">Path:</span>
          <span className="ml-2 font-mono text-xs">{project.path}</span>
        </div>
        <div className="text-sm">
          <span className="text-gray-400">Command:</span>
          <span className="ml-2 font-mono text-xs">{project.command}</span>
        </div>
        {project.port && (
          <div className="text-sm">
            <span className="text-gray-400">Port:</span>
            <span className="ml-2">{project.port}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {!isRunning && !isStarting && !isStopping && (
          <button
            onClick={() => onStart(project)}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition-colors text-sm font-medium"
          >
            ▶ Start
          </button>
        )}

        {(isRunning || isStarting) && (
          <button
            onClick={() => onStop(project)}
            disabled={isStopping}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors text-sm font-medium disabled:opacity-50"
          >
            ■ Stop
          </button>
        )}

        <button
          onClick={() => onRemove(project)}
          disabled={isRunning || isStarting || isStopping}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-sm disabled:opacity-50"
          title="Remove Project"
        >
          🗑️
        </button>
      </div>
    </div>
  )
}

export default ProjectCard
