import React, { useState } from 'react'

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
    { value: 'NEXTJS', label: 'Next.js', icon: '⚡' },
    { value: 'REACT_VITE', label: 'React (Vite)', icon: '⚛️' },
    { value: 'VUE', label: 'Vue.js', icon: '🟢' },
    { value: 'LARAVEL', label: 'Laravel', icon: '🔴' },
    { value: 'GOLANG', label: 'Go', icon: '🐹' },
    { value: 'NODEJS', label: 'Node.js', icon: '🟩' },
    { value: 'CUSTOM', label: 'Custom', icon: '⚙️' },
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Add Project</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Project Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Project Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:border-blue-500 focus:outline-none"
              placeholder="My Awesome Project"
            />
          </div>

          {/* Project Path */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Project Path *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.path}
                onChange={(e) => handleChange('path', e.target.value)}
                required
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:border-blue-500 focus:outline-none"
                placeholder="C:\projects\my-app"
              />
              <button
                type="button"
                onClick={handleBrowse}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded transition-colors"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Project Type */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Project Type *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {projectTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => handleChange('type', type.value)}
                  className={`px-4 py-2 rounded transition-colors flex items-center gap-2 ${
                    formData.type === type.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <span>{type.icon}</span>
                  <span className="text-sm">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Command */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Start Command *
            </label>
            <input
              type="text"
              value={formData.command}
              onChange={(e) => handleChange('command', e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:border-blue-500 focus:outline-none font-mono"
              placeholder="npm run dev"
            />
          </div>

          {/* Port */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Port (optional)
            </label>
            <input
              type="number"
              value={formData.port}
              onChange={(e) => handleChange('port', parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:border-blue-500 focus:outline-none"
              placeholder="3000"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddProjectModal
