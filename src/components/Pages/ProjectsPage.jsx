import React from 'react'

function ProjectsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Projects</h2>

      {/* Empty State */}
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="text-6xl mb-4">📁</div>
          <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
          <p className="text-gray-400 mb-4">
            Click "Add Project" to get started
          </p>
        </div>
      </div>
    </div>
  )
}

export default ProjectsPage
