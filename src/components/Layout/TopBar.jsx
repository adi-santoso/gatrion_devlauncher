import React from 'react'
import useAppStore from '../../store/appStore'

function TopBar({ currentPage }) {
  const { setAddProjectModalOpen } = useAppStore()

  const getPageTitle = () => {
    switch (currentPage) {
      case 'dashboard':
        return 'Dashboard'
      case 'projects':
        return 'Projects'
      case 'settings':
        return 'Settings'
      default:
        return 'DevLauncher'
    }
  }

  return (
    <div className="h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6">
      {/* Left: Breadcrumb / Page Title */}
      <div>
        <h1 className="text-xl font-semibold text-white">{getPageTitle()}</h1>
      </div>

      {/* Right: Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setAddProjectModalOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2"
        >
          <span>➕</span>
          <span>Add Project</span>
        </button>
        <button className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2">
          <span>▶</span>
          <span>Start All</span>
        </button>
        <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2">
          <span>■</span>
          <span>Stop All</span>
        </button>
      </div>
    </div>
  )
}

export default TopBar
