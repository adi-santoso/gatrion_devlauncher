import React from 'react'
import useAppStore from '../../store/appStore'
import Badge from '../Common/Badge'
import StatusIndicator from '../Common/StatusIndicator'

function DashboardPage() {
  const { projects, processStatuses } = useAppStore()

  // Calculate stats
  const totalProjects = projects.length
  const runningProjects = projects.filter(p => processStatuses[p.id]?.status === 'RUNNING').length
  const stoppedProjects = projects.filter(p => !processStatuses[p.id] || processStatuses[p.id]?.status === 'STOPPED').length
  const errorProjects = projects.filter(p => processStatuses[p.id]?.status === 'ERROR').length

  return (
    <div className="space-y-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 border border-gray-700 shadow-xl hover:shadow-2xl transition-all hover:scale-105 group overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="text-gray-400 text-sm font-semibold uppercase tracking-wider">Total Projects</div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg">
                <span className="text-2xl">📁</span>
              </div>
            </div>
            <div className="text-4xl font-bold bg-gradient-to-r from-gray-100 to-gray-300 bg-clip-text text-transparent">
              {totalProjects}
            </div>
          </div>
        </div>

        <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 border border-green-800/50 shadow-xl hover:shadow-2xl transition-all hover:scale-105 group overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="text-gray-400 text-sm font-semibold uppercase tracking-wider">Running</div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center shadow-lg">
                <span className="text-2xl">▶️</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-4xl font-bold text-green-400">
                {runningProjects}
              </div>
              {runningProjects > 0 && <StatusIndicator status="RUNNING" size="md" />}
            </div>
          </div>
        </div>

        <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 border border-gray-700 shadow-xl hover:shadow-2xl transition-all hover:scale-105 group overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-500/5 to-gray-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="text-gray-400 text-sm font-semibold uppercase tracking-wider">Stopped</div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center shadow-lg">
                <span className="text-2xl">⏸️</span>
              </div>
            </div>
            <div className="text-4xl font-bold text-gray-400">
              {stoppedProjects}
            </div>
          </div>
        </div>

        <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 border border-red-800/50 shadow-xl hover:shadow-2xl transition-all hover:scale-105 group overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-rose-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="text-gray-400 text-sm font-semibold uppercase tracking-wider">Errors</div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg">
                <span className="text-2xl">⚠️</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-4xl font-bold text-red-400">
                {errorProjects}
              </div>
              {errorProjects > 0 && <StatusIndicator status="ERROR" size="md" />}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity / Quick Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Running Projects List */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 border border-gray-700 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-100">Active Projects</h3>
            {runningProjects > 0 && (
              <Badge variant="success" size="md">
                {runningProjects} Running
              </Badge>
            )}
          </div>
          <div className="space-y-3">
            {runningProjects === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">💤</div>
                <p>No projects running</p>
              </div>
            ) : (
              projects
                .filter(p => processStatuses[p.id]?.status === 'RUNNING')
                .map(project => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between p-3 bg-gray-900/50 rounded-xl border border-gray-700 hover:border-gray-600 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <StatusIndicator status="RUNNING" size="md" />
                      <div>
                        <div className="font-semibold text-gray-200 group-hover:text-blue-400 transition-colors">
                          {project.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {project.type} • Port {project.port}
                        </div>
                      </div>
                    </div>
                    <Badge variant="info" size="sm">
                      :{project.port}
                    </Badge>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* System Info / Quick Actions */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 border border-gray-700 shadow-xl">
          <h3 className="text-xl font-bold text-gray-100 mb-4">Quick Info</h3>
          <div className="space-y-4">
            <div className="p-4 bg-gray-900/50 rounded-xl border border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">🚀</span>
                <span className="text-sm font-semibold text-gray-400">Quick Tip</span>
              </div>
              <p className="text-sm text-gray-300">
                Use the "Start All" button to launch all your projects at once
              </p>
            </div>

            <div className="p-4 bg-gradient-to-br from-blue-900/20 to-purple-900/20 rounded-xl border border-blue-800/30">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">💡</span>
                <span className="text-sm font-semibold text-blue-400">Pro Tip</span>
              </div>
              <p className="text-sm text-gray-300">
                Running projects appear in the sidebar for quick access
              </p>
            </div>

            <div className="p-4 bg-gray-900/50 rounded-xl border border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">⚡</span>
                <span className="text-sm font-semibold text-gray-400">Performance</span>
              </div>
              <p className="text-sm text-gray-300">
                Monitor your projects in real-time with live terminal output
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
