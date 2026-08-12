import { useEffect, useMemo, useState } from 'react';

export const PRESET_COLORS = ['#6D5EF5', '#38BDF8', '#22C55E', '#F5A623', '#EF4444', '#EC4899'];

export default function PresetModal({
  isOpen,
  onClose,
  projects = [],
  initialPreset = null,
  initialSelected = null,
  onSubmit,
}) {
  const isEdit = Boolean(initialPreset);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [selected, setSelected] = useState([]);
  const [delaySeconds, setDelaySeconds] = useState(0);
  const [autoStart, setAutoStart] = useState(false);

  // Prefill from an existing preset (edit) or a selection (bulk "Save as preset") whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (initialPreset) {
      setName(initialPreset.name || '');
      setDescription(initialPreset.description || '');
      setColor(initialPreset.color || PRESET_COLORS[0]);
      setSelected(Array.isArray(initialPreset.projectIds) ? initialPreset.projectIds : []);
      setDelaySeconds(Math.round((Number(initialPreset.startDelayMs) || 0) / 100) / 10);
      setAutoStart(initialPreset.autoStart === true);
    } else {
      setName('');
      setDescription('');
      setColor(PRESET_COLORS[0]);
      setDelaySeconds(0);
      setAutoStart(false);
      if (Array.isArray(initialSelected)) {
        const available = new Set(projects.map((project) => project.id));
        setSelected(initialSelected.filter((id) => available.has(id)));
      } else {
        setSelected([]);
      }
    }
  }, [isOpen, initialPreset, initialSelected, projects]);

  const toggle = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const moveSelected = (id, direction) => {
    setSelected((prev) => {
      const index = prev.indexOf(id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // Selected projects keep the user's chosen order; the rest follow alphabetically
  const orderedProjects = useMemo(() => {
    const selectedSet = new Set(selected);
    const selectedProjects = selected
      .map((id) => projects.find((project) => project.id === id))
      .filter(Boolean);
    const unselected = projects
      .filter((project) => !selectedSet.has(project.id))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return [...selectedProjects, ...unselected];
  }, [projects, selected]);

  const handleSubmit = () => {
    if (!name.trim() || selected.length === 0) return;
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      color,
      projectIds: selected,
      startDelayMs: Math.max(0, Math.round((Number(delaySeconds) || 0) * 1000)),
      autoStart,
    });
  };

  const valid = name.trim().length > 0 && selected.length > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"></div>
      <div className="relative h-full flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface border border-border rounded-xl shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-sm">{isEdit ? 'Edit Preset' : 'Create Preset'}</h3>
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
                autoFocus
                className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label htmlFor="preset-description" className="text-xs text-ink-soft mb-1 block">Description (optional)</label>
              <input
                id="preset-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Daily dev stack: API + web"
                className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <span className="text-xs text-ink-soft mb-1 block">Color</span>
              <div className="flex items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Use color ${c}`}
                    className={`h-6 w-6 rounded-full transition-transform ${color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface scale-110' : 'hover:scale-110'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="preset-delay" className="text-xs text-ink-soft mb-1 block">Stagger delay (seconds)</label>
                <input
                  id="preset-delay"
                  type="number"
                  min="0"
                  max="60"
                  step="0.5"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(e.target.value)}
                  className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <p className="mt-0.5 text-[9px] text-ink-faint">Gap between each project start</p>
              </div>
              <div>
                <span className="text-xs text-ink-soft mb-1 block">Auto-start on launch</span>
                <button
                  type="button"
                  onClick={() => setAutoStart((value) => !value)}
                  aria-pressed={autoStart}
                  className={`flex items-center justify-between w-full rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${autoStart ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border bg-surface-3 text-ink-soft hover:text-ink'}`}
                >
                  {autoStart ? 'Enabled' : 'Disabled'}
                  <span className={`h-4 w-7 rounded-full relative ${autoStart ? 'bg-accent' : 'bg-surface-2 border border-border'}`}>
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${autoStart ? 'right-0.5' : 'left-0.5'}`}></span>
                  </span>
                </button>
                <p className="mt-0.5 text-[9px] text-ink-faint">Needs "Auto-start projects" enabled in Settings</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-ink-soft mb-1 block">
                Projects <span className="text-ink-faint">({selected.length} selected — order = start order)</span>
              </label>
              <div className="max-h-52 overflow-y-auto space-y-1 rounded-lg border border-border bg-surface-2 p-2">
                {orderedProjects.length === 0 && (
                  <p className="px-2 py-3 text-center text-[11px] text-ink-faint">No projects yet — add some first.</p>
                )}
                {orderedProjects.map((p) => {
                  const checked = selected.includes(p.id);
                  const index = selected.indexOf(p.id);
                  return (
                    <div key={p.id} className={`flex items-center gap-2 px-2 py-1 rounded-md hover:bg-surface-3 ${checked ? 'bg-surface-3/70' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(p.id)}
                        className="w-3.5 h-3.5 accent-accent shrink-0"
                      />
                      <span className="truncate text-xs text-ink flex-1">{p.name}</span>
                      {checked && (
                        <span className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveSelected(p.id, -1)}
                            disabled={index === 0}
                            aria-label={`Move ${p.name} up`}
                            className="px-1 text-ink-faint hover:text-ink disabled:opacity-30"
                          >↑</button>
                          <span className="font-mono text-[9px] text-ink-faint">{index + 1}</span>
                          <button
                            type="button"
                            onClick={() => moveSelected(p.id, 1)}
                            disabled={index === selected.length - 1}
                            aria-label={`Move ${p.name} down`}
                            className="px-1 text-ink-faint hover:text-ink disabled:opacity-30"
                          >↓</button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-3 text-sm">Cancel</button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!valid}
                className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold disabled:opacity-50"
              >
                {isEdit ? 'Save Changes' : 'Create Preset'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
