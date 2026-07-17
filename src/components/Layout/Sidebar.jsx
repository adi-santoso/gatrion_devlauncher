import React, { useState } from 'react'

function Sidebar({ currentPage, setCurrentPage }) {
  const [expanded, setExpanded] = useState(true)

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', path: '/dashboard' },
    { id: 'projects', label: 'Projects', icon: '📁', path: '/projects' },
    { id: 'settings', label: 'Settings', icon: '⚙️', path: '/settings' },
  ]

  const runningProjects = []

  return (
    <div
      className={`${
        expanded ? 'w-[220px]' : 'w-[60px]'
      } bg-gray-800 border-r border-gray-700 flex flex-col transition-all duration-300`}
    >
      {/* Toggle Button */}
      <div className="p-4 border-b border-gray-700">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center hover:bg-gray-700 rounded p-2 transition-colors"
          title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <span className="text-xl">{expanded ? '◀' : '▶'}</span>
        </button>
      </div>

      {/* Main Menu */}
      <nav className="flex-1 py-4">
        <div className="space-y-1 px-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded transition-colors ${
                currentPage === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
              title={item.label}
            >
              <span className="text-xl">{item.icon}</span>
              {expanded && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-700 my-4 mx-2" />

        {/* Running Projects Section */}
        <div className="px-2">
          {expanded && (
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Running Projects
            </div>
          )}
          <div className="space-y-1">
            {runningProjects.length === 0 ? (
              expanded && (
                <div className="px-3 py-2 text-xs text-gray-500 italic">
                  No running projects
                </div>
              )
            ) : (
              runningProjects.map((project) => (
                <button
                  key={project.id}
                  className="w-full flex items-center gap-2 px-3 py-2 text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors"
                  title={project.name}
                >
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  {expanded && (
                    <span className="text-sm truncate">{project.name}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </nav>
    </div>
  )
}

export default Sidebar
