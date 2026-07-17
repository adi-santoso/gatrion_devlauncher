import React, { useState } from 'react'
import Tooltip from '../Common/Tooltip'
import Badge from '../Common/Badge'
import StatusIndicator from '../Common/StatusIndicator'

function Sidebar({ currentPage, setCurrentPage, runningProjects = [] }) {
  const [expanded, setExpanded] = useState(true)

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', path: '/dashboard' },
    { id: 'projects', label: 'Projects', icon: '📁', path: '/projects' },
    { id: 'settings', label: 'Settings', icon: '⚙️', path: '/settings' },
  ]

  return (
    <div
      className={`${
        expanded ? 'w-[240px]' : 'w-[72px]'
      } bg-gradient-to-b from-gray-900 via-gray-900 to-gray-950 border-r border-gray-800/50 flex flex-col transition-all duration-300 shadow-xl backdrop-blur-xl`}
    >
      {/* Logo/Brand Section */}
      <div className="p-4 border-b border-gray-800/50">
        <div className="flex items-center justify-between">
          {expanded ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-900/50">
                <span className="text-lg">🚀</span>
              </div>
              <div>
                <h1 className="text-sm font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                  DevLauncher
                </h1>
                <p className="text-xs text-gray-500">v1.0.0</p>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-900/50 mx-auto">
              <span className="text-lg">🚀</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Menu */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <div className="space-y-1 px-3">
          {menuItems.map((item) => {
            const isActive = currentPage === item.id
            const button = (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-900/50 scale-105'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50 hover:scale-105'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-blue-400 to-purple-500 rounded-r-full" />
                )}
                <span className={`text-xl transition-transform duration-200 ${isActive ? '' : 'group-hover:scale-110'}`}>
                  {item.icon}
                </span>
                {expanded && (
                  <span className="text-sm font-semibold flex-1 text-left">{item.label}</span>
                )}
              </button>
            )

            return expanded ? (
              <div key={item.id}>{button}</div>
            ) : (
              <Tooltip key={item.id} content={item.label} position="right">
                {button}
              </Tooltip>
            )
          })}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-800/50 my-4 mx-5" />

        {/* Running Projects Section */}
        <div className="px-3">
          {expanded && (
            <div className="flex items-center justify-between px-4 py-2 mb-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Running Projects
              </span>
              {runningProjects.length > 0 && (
                <Badge variant="count" size="sm">
                  {runningProjects.length}
                </Badge>
              )}
            </div>
          )}
          <div className="space-y-1">
            {runningProjects.length === 0 ? (
              expanded && (
                <div className="px-4 py-3 text-xs text-gray-600 italic bg-gray-800/30 rounded-lg border border-gray-800/50">
                  No running projects
                </div>
              )
            ) : (
              runningProjects.map((project) => {
                const projectCard = (
                  <button
                    key={project.id}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all duration-200 hover:scale-105 group bg-gray-800/20 border border-gray-800/50"
                  >
                    <StatusIndicator status="RUNNING" size="sm" />
                    {expanded && (
                      <div className="flex-1 text-left overflow-hidden">
                        <span className="text-sm font-medium truncate block group-hover:text-blue-400 transition-colors">
                          {project.name}
                        </span>
                        {project.port && (
                          <span className="text-xs text-gray-500">:{project.port}</span>
                        )}
                      </div>
                    )}
                  </button>
                )

                return expanded ? (
                  <div key={project.id}>{projectCard}</div>
                ) : (
                  <Tooltip key={project.id} content={project.name} position="right">
                    {projectCard}
                  </Tooltip>
                )
              })
            )}
          </div>
        </div>
      </nav>

      {/* Toggle Button at Bottom */}
      <div className="p-3 border-t border-gray-800/50">
        <Tooltip content={expanded ? 'Collapse sidebar' : 'Expand sidebar'} position="right">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center hover:bg-gray-800/50 rounded-lg p-3 transition-all duration-200 text-gray-400 hover:text-white hover:scale-105 group"
          >
            <span className="text-lg group-hover:scale-110 transition-transform">
              {expanded ? '◀' : '▶'}
            </span>
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

export default Sidebar
