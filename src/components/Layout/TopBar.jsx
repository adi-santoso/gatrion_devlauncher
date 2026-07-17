import React from 'react'
import useAppStore from '../../store/appStore'
import Button from '../Common/Button'

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

  const getPageDescription = () => {
    switch (currentPage) {
      case 'dashboard':
        return 'Overview of your development projects'
      case 'projects':
        return 'Manage and monitor your projects'
      case 'settings':
        return 'Configure your preferences'
      default:
        return ''
    }
  }

  return (
    <div className="h-20 bg-gray-900/50 backdrop-blur-xl border-b border-gray-800/50 flex items-center justify-between px-6 shadow-lg">
      {/* Left: Page Title & Breadcrumb */}
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-100 to-gray-300 bg-clip-text text-transparent">
            {getPageTitle()}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{getPageDescription()}</p>
        </div>
      </div>

      {/* Right: Action Buttons */}
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          icon="➕"
          onClick={() => setAddProjectModalOpen(true)}
        >
          Add Project
        </Button>
        <Button
          variant="success"
          icon="▶"
        >
          Start All
        </Button>
        <Button
          variant="danger"
          icon="■"
        >
          Stop All
        </Button>
      </div>
    </div>
  )
}

export default TopBar
