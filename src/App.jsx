import React, { useState } from 'react'
import MainLayout from './components/Layout/MainLayout'
import DashboardPage from './components/Pages/DashboardPage'
import ProjectsPage from './components/Pages/ProjectsPage'
import SettingsPage from './components/Pages/SettingsPage'
import useAppStore from './store/appStore'

function App() {
  const [currentPage, setCurrentPage] = useState('projects')
  const { projects, processStatuses } = useAppStore()

  // Get running projects for sidebar
  const runningProjects = projects.filter(project => {
    const status = processStatuses[project.id]?.status
    return status === 'RUNNING' || status === 'STARTING'
  })

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage />
      case 'projects':
        return <ProjectsPage />
      case 'settings':
        return <SettingsPage />
      default:
        return <ProjectsPage />
    }
  }

  return (
    <MainLayout
      currentPage={currentPage}
      setCurrentPage={setCurrentPage}
      runningProjects={runningProjects}
    >
      {renderPage()}
    </MainLayout>
  )
}

export default App
