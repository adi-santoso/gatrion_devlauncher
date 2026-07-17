import React, { useState, useEffect } from 'react'
import Button from '../Common/Button'
import Badge from '../Common/Badge'
import StatusIndicator from '../Common/StatusIndicator'
import Tooltip from '../Common/Tooltip'

function ProjectCard({ project, processStatus, onStart, onStop, onRemove }) {
  const status = processStatus?.status || 'STOPPED'
  const isRunning = status === 'RUNNING'
  const isStarting = status === 'STARTING'
  const isStopping = status === 'STOPPING'

  const [uptime, setUptime] = useState(0)

  // Calculate uptime
  useEffect(() => {
    if (isRunning && processStatus?.startedAt) {
      const interval = setInterval(() => {
        const elapsed = Date.now() - processStatus.startedAt
        setUptime(elapsed)
      }, 1000)
      return () => clearInterval(interval)
    } else {
      setUptime(0)
    }
  }, [isRunning, processStatus?.startedAt])

  const formatUptime = (ms) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
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

  const getTypeLabel = () => {
    const labels = {
      NEXTJS: 'Next.js',
      REACT_VITE: 'React + Vite',
      VUE: 'Vue.js',
      LARAVEL: 'Laravel',
      GOLANG: 'Go',
      NODEJS: 'Node.js',
      CUSTOM: 'Custom',
    }
    return labels[project.type] || project.type
  }

  const getTypeColor = () => {
    const colors = {
      NEXTJS: 'from-gray-700 to-gray-800 border-gray-600',
      REACT_VITE: 'from-blue-900/30 to-cyan-900/30 border-blue-800/50',
      VUE: 'from-green-900/30 to-emerald-900/30 border-green-800/50',
      LARAVEL: 'from-red-900/30 to-rose-900/30 border-red-800/50',
      GOLANG: 'from-cyan-900/30 to-blue-900/30 border-cyan-800/50',
      NODEJS: 'from-green-900/30 to-lime-900/30 border-green-800/50',
      CUSTOM: 'from-gray-800 to-gray-900 border-gray-700',
    }
    return colors[project.type] || colors.CUSTOM
  }

  return (
    <div className={`relative bg-gradient-to-br ${getTypeColor()} rounded-2xl p-6 border shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 hover:border-gray-500 group overflow-hidden`}>
      {/* Glow effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            {/* Project Icon */}
            <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 flex items-center justify-center text-3xl shadow-lg group-hover:scale-110 transition-transform duration-300">
              {getTypeIcon()}
            </div>

            {/* Project Info */}
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-gray-100 mb-1 truncate group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-blue-400 group-hover:to-purple-400 group-hover:bg-clip-text transition-all">
                {project.name}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="default" size="sm">
                  {getTypeLabel()}
                </Badge>
                {project.port && (
                  <Badge variant="info" size="sm">
                    :{project.port}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex-shrink-0 ml-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900/50 backdrop-blur-sm rounded-full border border-gray-700">
              <StatusIndicator status={status} size="sm" showLabel={false} />
              <span className="text-xs font-semibold text-gray-300">
                {status === 'RUNNING' ? 'Running' :
                 status === 'STARTING' ? 'Starting...' :
                 status === 'STOPPING' ? 'Stopping...' :
                 status === 'ERROR' ? 'Error' : 'Stopped'}
              </span>
            </div>
          </div>
        </div>

        {/* Project Details */}
        <div className="space-y-2 mb-4 bg-gray-900/30 rounded-xl p-4 border border-gray-800/50">
          <div className="flex items-start gap-2 text-sm">
            <span className="text-gray-500 flex-shrink-0 font-medium">Path:</span>
            <Tooltip content={project.path}>
              <span className="font-mono text-xs text-gray-400 truncate flex-1">{project.path}</span>
            </Tooltip>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <span className="text-gray-500 flex-shrink-0 font-medium">Cmd:</span>
            <span className="font-mono text-xs text-gray-400 truncate flex-1">{project.command}</span>
          </div>
          {isRunning && uptime > 0 && (
            <div className="flex items-center gap-2 text-sm pt-2 border-t border-gray-800/50">
              <span className="text-gray-500 flex-shrink-0 font-medium">Uptime:</span>
              <span className="text-xs text-green-400 font-semibold">⏱ {formatUptime(uptime)}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {!isRunning && !isStarting && !isStopping && (
            <>
              <Button
                variant="success"
                icon="▶"
                onClick={() => onStart(project)}
                className="flex-1"
              >
                Start
              </Button>
              <Tooltip content="View Logs">
                <Button variant="icon" icon="👁" />
              </Tooltip>
              <Tooltip content="Settings">
                <Button variant="icon" icon="⚙️" />
              </Tooltip>
              <Tooltip content="Remove Project">
                <Button
                  variant="icon"
                  icon="🗑️"
                  onClick={() => onRemove(project)}
                />
              </Tooltip>
            </>
          )}

          {(isRunning || isStarting) && (
            <>
              <Button
                variant="danger"
                icon="■"
                onClick={() => onStop(project)}
                disabled={isStopping}
                className="flex-1"
              >
                Stop
              </Button>
              <Tooltip content="View Logs">
                <Button variant="icon" icon="👁" />
              </Tooltip>
              <Tooltip content="Restart">
                <Button variant="icon" icon="🔄" />
              </Tooltip>
              <Tooltip content={project.port ? `Open http://localhost:${project.port}` : 'No port configured'}>
                <Button
                  variant="icon"
                  icon="🌐"
                  disabled={!project.port}
                />
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProjectCard
