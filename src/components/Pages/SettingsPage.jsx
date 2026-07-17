import React, { useState } from 'react'
import Button from '../Common/Button'
import Badge from '../Common/Badge'

function SettingsPage() {
  const [settings, setSettings] = useState({
    autoStart: false,
    notifications: true,
    darkMode: true,
    compactView: false,
  })

  const handleToggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* General Settings */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-gray-700 shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg">
              <span className="text-xl">⚙️</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-100">General Settings</h3>
              <p className="text-sm text-gray-500">Configure application preferences</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Auto-start on boot */}
          <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-xl border border-gray-700 hover:border-gray-600 transition-all group">
            <div className="flex items-start gap-4">
              <div className="text-2xl mt-1">🚀</div>
              <div>
                <h4 className="font-semibold text-gray-200 mb-1">Auto-start on System Boot</h4>
                <p className="text-sm text-gray-500">Launch DevLauncher automatically when Windows starts</p>
              </div>
            </div>
            <button
              onClick={() => handleToggle('autoStart')}
              className={`relative w-14 h-7 rounded-full transition-all duration-200 ${
                settings.autoStart ? 'bg-gradient-to-r from-blue-600 to-blue-700' : 'bg-gray-700'
              }`}
            >
              <div
                className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-lg transition-all duration-200 ${
                  settings.autoStart ? 'left-8' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* Notifications */}
          <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-xl border border-gray-700 hover:border-gray-600 transition-all group">
            <div className="flex items-start gap-4">
              <div className="text-2xl mt-1">🔔</div>
              <div>
                <h4 className="font-semibold text-gray-200 mb-1">Desktop Notifications</h4>
                <p className="text-sm text-gray-500">Show system notifications for project events</p>
              </div>
            </div>
            <button
              onClick={() => handleToggle('notifications')}
              className={`relative w-14 h-7 rounded-full transition-all duration-200 ${
                settings.notifications ? 'bg-gradient-to-r from-blue-600 to-blue-700' : 'bg-gray-700'
              }`}
            >
              <div
                className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-lg transition-all duration-200 ${
                  settings.notifications ? 'left-8' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* Dark Mode */}
          <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-xl border border-gray-700 hover:border-gray-600 transition-all group">
            <div className="flex items-start gap-4">
              <div className="text-2xl mt-1">🌙</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-gray-200">Dark Mode</h4>
                  <Badge variant="primary" size="sm">Enabled</Badge>
                </div>
                <p className="text-sm text-gray-500">Use dark color scheme (currently active)</p>
              </div>
            </div>
            <button
              onClick={() => handleToggle('darkMode')}
              className={`relative w-14 h-7 rounded-full transition-all duration-200 ${
                settings.darkMode ? 'bg-gradient-to-r from-blue-600 to-blue-700' : 'bg-gray-700'
              }`}
              disabled
            >
              <div
                className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-lg transition-all duration-200 ${
                  settings.darkMode ? 'left-8' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* Compact View */}
          <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-xl border border-gray-700 hover:border-gray-600 transition-all group">
            <div className="flex items-start gap-4">
              <div className="text-2xl mt-1">📊</div>
              <div>
                <h4 className="font-semibold text-gray-200 mb-1">Compact View</h4>
                <p className="text-sm text-gray-500">Use smaller cards to fit more projects on screen</p>
              </div>
            </div>
            <button
              onClick={() => handleToggle('compactView')}
              className={`relative w-14 h-7 rounded-full transition-all duration-200 ${
                settings.compactView ? 'bg-gradient-to-r from-blue-600 to-blue-700' : 'bg-gray-700'
              }`}
            >
              <div
                className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-lg transition-all duration-200 ${
                  settings.compactView ? 'left-8' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-gray-700 shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg">
              <span className="text-xl">ℹ️</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-100">About DevLauncher</h3>
              <p className="text-sm text-gray-500">Application information</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-blue-900/50 flex-shrink-0">
              <span className="text-4xl">🚀</span>
            </div>
            <div className="flex-1">
              <h4 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-2">
                DevLauncher
              </h4>
              <div className="space-y-2 text-gray-400">
                <div className="flex items-center gap-2">
                  <Badge variant="info" size="sm">Version 1.0.0</Badge>
                  <Badge variant="default" size="sm">Electron + React</Badge>
                </div>
                <p className="text-sm">
                  A modern development project manager built with Electron and React.
                  Manage, monitor, and launch your development projects with ease.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-700 flex gap-3">
            <Button variant="ghost" size="sm" icon="📖">
              Documentation
            </Button>
            <Button variant="ghost" size="sm" icon="🐛">
              Report Issue
            </Button>
            <Button variant="ghost" size="sm" icon="⭐">
              Star on GitHub
            </Button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-gradient-to-br from-red-900/20 to-rose-900/20 rounded-2xl border border-red-800/50 shadow-xl overflow-hidden">
        <div className="bg-red-900/30 border-b border-red-800/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg">
              <span className="text-xl">⚠️</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-red-400">Danger Zone</h3>
              <p className="text-sm text-gray-500">Irreversible actions</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between p-4 bg-gray-900/50 rounded-xl border border-red-800/30">
            <div>
              <h4 className="font-semibold text-gray-200 mb-1">Clear All Projects</h4>
              <p className="text-sm text-gray-500">Remove all projects from DevLauncher. This action cannot be undone.</p>
            </div>
            <Button variant="danger" size="sm" className="flex-shrink-0">
              Clear All
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
