import React, { useState } from 'react'
import Button from '../Common/Button'
import Badge from '../Common/Badge'

function AddProjectModal({ isOpen, onClose, onAdd }) {
  const [formData, setFormData] = useState({
    name: '',
    path: '',
    type: 'NODEJS',
    command: 'npm start',
    port: 3000,
    env: {},
  })

  const [loading, setLoading] = useState(false)

  const projectTypes = [
    { value: 'NEXTJS', label: 'Next.js', icon: '⚡', color: 'hover:border-gray-500' },
    { value: 'REACT_VITE', label: 'React (Vite)', icon: '⚛️', color: 'hover:border-blue-500' },
    { value: 'VUE', label: 'Vue.js', icon: '🟢', color: 'hover:border-green-500' },
    { value: 'LARAVEL', label: 'Laravel', icon: '🔴', color: 'hover:border-red-500' },
    { value: 'GOLANG', label: 'Go', icon: '🐹', color: 'hover:border-cyan-500' },
    { value: 'NODEJS', label: 'Node.js', icon: '🟩', color: 'hover:border-green-500' },
    { value: 'CUSTOM', label: 'Custom', icon: '⚙️', color: 'hover:border-gray-500' },
  ]

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleBrowse = async () => {
    try {
      const result = await window.electron.browseFolder()
      if (result.success && !result.canceled) {
        handleChange('path', result.path)

        // Auto-detect project type
        detectProjectType(result.path)
      }
    } catch (error) {
      console.error('Error browsing folder:', error)
    }
  }

  const detectProjectType = async (projectPath) => {
    try {
      const result = await window.electron.detectProjectType(projectPath)
      if (result.success) {
        // Update form with detected values
        if (result.type) handleChange('type', result.type)
        if (result.defaultCommand) handleChange('command', result.defaultCommand)
        if (result.defaultPort) handleChange('port', result.defaultPort)

        // Auto-fill project name from folder name if empty
        if (!formData.name) {
          const folderName = projectPath.split(/[/\\]/).pop()
          handleChange('name', folderName)
        }
      }
    } catch (error) {
      console.error('Error detecting project type:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      await onAdd(formData)
      // Reset form
      setFormData({
        name: '',
        path: '',
        type: 'NODEJS',
        command: 'npm start',
        port: 3000,
        env: {},
      })
      onClose()
    } catch (error) {
      console.error('Error adding project:', error)
      alert('Failed to add project: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-gradient-to-br from-gray-900 to-gray-950 rounded-2xl border border-gray-800 shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
              <span className="text-xl">➕</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-100 to-gray-300 bg-clip-text text-transparent">
                Add New Project
              </h2>
              <p className="text-sm text-gray-500">Configure your development project</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-3xl leading-none hover:bg-gray-800 rounded-lg w-10 h-10 flex items-center justify-center transition-all hover:rotate-90 duration-200"
          >
            ×
          </button>
        </div>

        {/* Form Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-180px)] p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Project Name */}
            <div>
              <label className="block text-sm font-bold mb-2 text-gray-300">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all text-gray-100 placeholder-gray-600"
                placeholder="My Awesome Project"
              />
            </div>

            {/* Project Path */}
            <div>
              <label className="block text-sm font-bold mb-2 text-gray-300">
                Project Path <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.path}
                  onChange={(e) => handleChange('path', e.target.value)}
                  required
                  className="flex-1 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all text-gray-100 placeholder-gray-600 font-mono text-sm"
                  placeholder="C:\projects\my-app"
                />
                <Button type="button" variant="secondary" onClick={handleBrowse}>
                  📁 Browse
                </Button>
              </div>
            </div>

            {/* Project Type */}
            <div>
              <label className="block text-sm font-bold mb-3 text-gray-300">
                Project Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {projectTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => handleChange('type', type.value)}
                    className={`px-4 py-3 rounded-xl transition-all duration-200 flex flex-col items-center gap-2 border-2 ${
                      formData.type === type.value
                        ? 'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-500 text-white shadow-lg shadow-blue-900/50 scale-105'
                        : `bg-gray-800/30 border-gray-700 text-gray-400 hover:text-white hover:scale-105 ${type.color}`
                    }`}
                  >
                    <span className="text-2xl">{type.icon}</span>
                    <span className="text-xs font-semibold">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Command and Port - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Command */}
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-300">
                  Start Command <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.command}
                  onChange={(e) => handleChange('command', e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all font-mono text-sm text-gray-100 placeholder-gray-600"
                  placeholder="npm run dev"
                />
              </div>

              {/* Port */}
              <div>
                <label className="block text-sm font-bold mb-2 text-gray-300">
                  Port <span className="text-gray-500 text-xs font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={(e) => handleChange('port', parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all text-gray-100 placeholder-gray-600"
                  placeholder="3000"
                />
              </div>
            </div>

            {/* Info Badge */}
            <div className="bg-blue-900/20 border border-blue-800/30 rounded-xl p-4 flex items-start gap-3">
              <span className="text-2xl">💡</span>
              <div className="flex-1 text-sm text-gray-400">
                <p className="font-semibold text-gray-300 mb-1">Pro Tip</p>
                <p>Select a folder and we'll automatically detect the project type, command, and port for you!</p>
              </div>
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-900/50 border-t border-gray-800 px-6 py-4 flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            onClick={handleSubmit}
            icon={loading ? null : '✨'}
          >
            {loading ? 'Adding...' : 'Add Project'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default AddProjectModal
