import React, { useState } from 'react'
import MainLayout from './components/Layout/MainLayout'
import DashboardPage from './components/Pages/DashboardPage'
import ProjectsPage from './components/Pages/ProjectsPage'
import SettingsPage from './components/Pages/SettingsPage'

function App() {
  const [currentPage, setCurrentPage] = useState('projects')

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
    <MainLayout currentPage={currentPage} setCurrentPage={setCurrentPage}>
      {renderPage()}
    </MainLayout>
  )
}

export default App
