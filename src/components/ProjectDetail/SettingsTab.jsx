import React from 'react';

export default function SettingsTab({
  project,
  onSave,
  onRemove
}) {
  const [formData, setFormData] = React.useState({
    name: project?.name || '',
    startCommand: project?.startCommand || '',
    autoStart: project?.autoStart || false
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave?.(formData);
  };

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
        <div>
          <label className="text-xs text-ink-soft mb-1.5 block">Project name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div>
          <label className="text-xs text-ink-soft mb-1.5 block">Start command</label>
          <input
            type="text"
            value={formData.startCommand}
            onChange={(e) => setFormData({ ...formData, startCommand: e.target.value })}
            className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm font-mono text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-ink">Start on app launch</p>
            <p className="text-[11px] text-ink-faint">Auto-run when DevLauncher opens.</p>
          </div>
          <button
            onClick={() => setFormData({ ...formData, autoStart: !formData.autoStart })}
            className={`w-9 h-5 rounded-full border border-border relative shrink-0 ${formData.autoStart ? 'bg-accent' : 'bg-surface-3'}`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${formData.autoStart ? 'right-0.5' : 'left-0.5'}`}
            />
          </button>
        </div>
        <div className="flex justify-end pt-1">
          <button
            onClick={handleSubmit}
            className="px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>

      <div className="bg-danger/5 border border-danger/20 rounded-xl p-5">
        <p className="text-sm font-medium text-danger">Danger Zone</p>
        <p className="text-xs text-ink-faint mt-1 mb-3">
          Removing this project only unregisters it from DevLauncher — files on disk are untouched.
        </p>
        <button
          onClick={onRemove}
          className="px-3.5 py-2 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger text-sm font-medium border border-danger/20 transition-colors"
        >
          Remove Project
        </button>
      </div>
    </div>
  );
}
