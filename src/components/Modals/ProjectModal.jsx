import React, { useState, useEffect } from 'react';

/**
 * ProjectModal - Add/edit project modal with form fields
 * Lines 920-970 from template
 */
const ProjectModal = ({ isOpen, onClose, onSave, project = null }) => {
  const [formData, setFormData] = useState({
    name: '',
    path: '',
    type: '⚛️ React (Vite)',
    port: '5173',
    startCommand: 'npm run dev',
    envVars: [{ key: 'NODE_ENV', value: 'development' }],
    autoStart: false,
  });

  const [detectedType, setDetectedType] = useState(null);

  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name || '',
        path: project.path || '',
        type: project.type || '⚛️ React (Vite)',
        port: project.port || '5173',
        startCommand: project.startCommand || 'npm run dev',
        envVars: project.envVars || [{ key: 'NODE_ENV', value: 'development' }],
        autoStart: project.autoStart || false,
      });
    } else {
      setFormData({
        name: '',
        path: '',
        type: '⚛️ React (Vite)',
        port: '5173',
        startCommand: 'npm run dev',
        envVars: [{ key: 'NODE_ENV', value: 'development' }],
        autoStart: false,
      });
    }
  }, [project, isOpen]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEnvVarChange = (index, field, value) => {
    const newEnvVars = [...formData.envVars];
    newEnvVars[index][field] = value;
    setFormData((prev) => ({ ...prev, envVars: newEnvVars }));
  };

  const addEnvVar = () => {
    setFormData((prev) => ({
      ...prev,
      envVars: [...prev.envVars, { key: '', value: '' }],
    }));
  };

  const removeEnvVar = (index) => {
    const newEnvVars = formData.envVars.filter((_, i) => i !== index);
    setFormData((prev) => ({ ...prev, envVars: newEnvVars }));
  };

  const handleBrowse = () => {
    // In real app, this would open a file dialog
    // For now, simulate detection
    setDetectedType('React (Vite)');
  };

  const handleSubmit = () => {
    onSave(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div id="projectModal" className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div className="relative h-full flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-surface border border-border rounded-xl shadow-card max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <div>
              <h3 className="font-display font-bold text-sm">
                {project ? 'Edit Project' : 'Add Project'}
              </h3>
              <p className="text-xs text-ink-faint mt-0.5">
                Register a project folder to launch and monitor.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-ink-faint hover:text-ink hover:bg-surface-3 transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="px-5 py-4 space-y-4 overflow-y-auto">
            <div>
              <label className="text-xs text-ink-soft mb-1.5 block">Project name</label>
              <input
                type="text"
                placeholder="e.g. storefront-web"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="text-xs text-ink-soft mb-1.5 block">Project path</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="C:/projects/storefront-web"
                  value={formData.path}
                  onChange={(e) => handleChange('path', e.target.value)}
                  className="flex-1 bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm font-mono text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <button
                  onClick={handleBrowse}
                  className="px-3 py-2 rounded-lg bg-surface-3 border border-border text-xs font-medium text-ink-soft hover:text-ink hover:bg-surface-2 transition-colors shrink-0"
                >
                  Browse…
                </button>
              </div>
              {detectedType && (
                <p className="text-[11px] text-success mt-1.5">✓ Detected: {detectedType} project</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-soft mb-1.5 block">Project type</label>
                <select
                  value={formData.type}
                  onChange={(e) => handleChange('type', e.target.value)}
                  className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  <option>⚛️ React (Vite)</option>
                  <option>⚡ Next.js</option>
                  <option>🟢 Vue.js</option>
                  <option>🔴 Laravel</option>
                  <option>🐹 Go</option>
                  <option>🟩 Node.js</option>
                  <option>⚙️ Custom</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-ink-soft mb-1.5 block">Port</label>
                <input
                  type="text"
                  placeholder="5173"
                  value={formData.port}
                  onChange={(e) => handleChange('port', e.target.value)}
                  className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm font-mono text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-ink-soft mb-1.5 block">Start command</label>
              <input
                type="text"
                value={formData.startCommand}
                onChange={(e) => handleChange('startCommand', e.target.value)}
                className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm font-mono text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-ink-soft">Environment variables</label>
                <button
                  onClick={addEnvVar}
                  type="button"
                  className="text-[11px] font-medium text-accent hover:text-accent-hover flex items-center gap-1"
                >
                  + Add variable
                </button>
              </div>
              <div className="space-y-2">
                {formData.envVars.map((envVar, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={envVar.key}
                      onChange={(e) => handleEnvVarChange(index, 'key', e.target.value)}
                      placeholder="KEY"
                      className="w-1/3 bg-surface-3 border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                    <input
                      type="text"
                      value={envVar.value}
                      onChange={(e) => handleEnvVarChange(index, 'value', e.target.value)}
                      placeholder="value"
                      className="flex-1 bg-surface-3 border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                    <button
                      onClick={() => removeEnvVar(index)}
                      type="button"
                      className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-ink-faint hover:text-danger hover:bg-danger/10"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-xs text-ink">Start on app launch</p>
                <p className="text-[11px] text-ink-faint">
                  Auto-run this project when DevLauncher opens.
                </p>
              </div>
              <button
                onClick={() => handleChange('autoStart', !formData.autoStart)}
                className={`w-9 h-5 rounded-full relative shrink-0 ${
                  formData.autoStart ? 'bg-accent' : 'bg-surface-3 border border-border'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    formData.autoStart ? 'right-0.5' : 'left-0.5'
                  }`}
                ></span>
              </button>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-3 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors"
            >
              Save Project
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectModal;
