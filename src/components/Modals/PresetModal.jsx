import { useEffect, useState } from 'react';

export default function PresetModal({ isOpen, onClose, projects = [], onCreate, initialSelected = null }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState([]);

  // Prefill from an existing selection (e.g. bulk "Save as preset") whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (Array.isArray(initialSelected)) {
      const available = new Set(projects.map((project) => project.id));
      setSelected(initialSelected.filter((id) => available.has(id)));
    } else {
      setSelected([]);
    }
    setName('');
  }, [isOpen, initialSelected, projects]);

  if (!isOpen) return null;

  const toggle = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const handleSubmit = () => {
    if (!name.trim() || selected.length === 0) return;
    onCreate(name, selected);
    setName('');
    setSelected([]);
  };

  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div className="relative h-full flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-surface border border-border rounded-xl shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-sm">Create Preset</h3>
            <button onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Close">✕</button>
          </div>
          <div className="space-y-3">
            <div>
              <label htmlFor="preset-name" className="text-xs text-ink-soft mb-1 block">Preset name</label>
              <input
                id="preset-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Full Stack"
                className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="text-xs text-ink-soft mb-1 block">Projects</label>
              <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border bg-surface-2 p-2">
                {projects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-surface-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={() => toggle(p.id)}
                      className="w-3.5 h-3.5 accent-accent"
                    />
                    <span className="text-xs text-ink">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-3 text-sm">Cancel</button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!name.trim() || selected.length === 0}
                className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
