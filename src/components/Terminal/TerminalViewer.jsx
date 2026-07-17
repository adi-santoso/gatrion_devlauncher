import React, { useEffect, useRef } from 'react'

function TerminalViewer({ logs = [], projectName }) {
  const terminalRef = useRef(null)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  const getLogColor = (type) => {
    switch (type) {
      case 'stderr':
        return 'text-red-400'
      case 'error':
        return 'text-red-500 font-semibold'
      case 'system':
        return 'text-blue-400'
      default:
        return 'text-gray-300'
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Terminal</span>
          {projectName && (
            <>
              <span className="text-gray-500">—</span>
              <span className="text-sm text-gray-400">{projectName}</span>
            </>
          )}
        </div>
        <span className="text-xs text-gray-500">
          {logs.length} {logs.length === 1 ? 'line' : 'lines'}
        </span>
      </div>

      {/* Terminal Output */}
      <div
        ref={terminalRef}
        className="flex-1 bg-black p-4 overflow-auto font-mono text-sm"
      >
        {logs.length === 0 ? (
          <div className="text-gray-500 italic">No logs yet. Start the project to see output...</div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, index) => (
              <div key={index} className="flex gap-3">
                <span className="text-gray-600 text-xs select-none flex-shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`flex-1 ${getLogColor(log.type)} whitespace-pre-wrap break-words`}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TerminalViewer
