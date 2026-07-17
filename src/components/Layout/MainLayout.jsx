import React, { useState } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

function MainLayout({ children, currentPage, setCurrentPage, runningProjects = [] }) {
  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        runningProjects={runningProjects}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <TopBar currentPage={currentPage} />

        {/* Content */}
        <main className="flex-1 overflow-auto p-8 bg-gradient-to-br from-gray-900/50 to-gray-950/50">
          {children}
        </main>
      </div>
    </div>
  )
}

export default MainLayout
