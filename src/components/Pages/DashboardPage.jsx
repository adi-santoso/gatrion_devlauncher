import React from 'react'

function DashboardPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Stats Cards */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-2">Total Projects</div>
          <div className="text-3xl font-bold">0</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-2">Running Projects</div>
          <div className="text-3xl font-bold text-green-500">0</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-2">Stopped Projects</div>
          <div className="text-3xl font-bold text-gray-500">0</div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
