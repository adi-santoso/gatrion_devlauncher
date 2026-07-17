import React from 'react'

function StatusIndicator({ status = 'stopped', size = 'md', showLabel = false, className = '' }) {
  const statusConfig = {
    RUNNING: {
      color: 'bg-green-500',
      label: 'Running',
      ring: 'ring-green-500/50',
      animate: true,
    },
    STARTING: {
      color: 'bg-yellow-500',
      label: 'Starting...',
      ring: 'ring-yellow-500/50',
      animate: true,
    },
    STOPPING: {
      color: 'bg-orange-500',
      label: 'Stopping...',
      ring: 'ring-orange-500/50',
      animate: true,
    },
    STOPPED: {
      color: 'bg-gray-500',
      label: 'Stopped',
      ring: 'ring-gray-500/50',
      animate: false,
    },
    ERROR: {
      color: 'bg-red-500',
      label: 'Error',
      ring: 'ring-red-500/50',
      animate: true,
    },
  }

  const sizes = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  }

  const config = statusConfig[status] || statusConfig.STOPPED
  const sizeClass = sizes[size]

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative inline-flex items-center justify-center">
        <span className={`${sizeClass} ${config.color} rounded-full ${config.animate ? 'animate-pulse' : ''}`} />
        {config.animate && (
          <>
            <span className={`absolute inline-flex h-full w-full rounded-full ${config.color} opacity-75 animate-ping`} />
            <span className={`absolute inline-flex rounded-full ring-2 ${config.ring} ${sizeClass}`} />
          </>
        )}
      </span>
      {showLabel && (
        <span className="text-sm font-medium text-gray-300">
          {config.label}
        </span>
      )}
    </div>
  )
}

export default StatusIndicator
