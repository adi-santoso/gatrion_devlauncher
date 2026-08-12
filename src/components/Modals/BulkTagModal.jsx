import { useEffect, useMemo, useState } from 'react';

export default function BulkTagModal({ isOpen, onClose, projects = [], onApply }) {
  const [addText, setAddText] = useState('');
  const [removeText, setRemoveText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAddText('');
      setRemoveText('');
    }
  }, [isOpen]);

  // Union of existing tags across the selection, with per-tag counts
  const existingTags = useMemo(() => {
    const counts = new Map();
    for (const project of projects) {
      for (const tag of Array.isArray(project.tags) ? project.tags : []) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }, [projects]);

  if (!isOpen) return null;

  const parseTags = (value) => value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  const handleApply = () => {
    const add = parseTags(addText);
    const remove = parseTags(removeText);
    if (add.length === 0 && remove.length === 0) return;
    onApply(add, remove);
  };

  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"></div>
      <div className="relative h-full flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface border border-border rounded-xl shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-sm">Edit Tags</h3>
            <button onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Close">✕</button>
          </div>

          <p className="mb-3 text-xs text-ink-soft">
            Applying to <strong className="text-ink">{projects.length}</strong> selected project(s).
          </p>

          <div className="space-y-3">
            <div>
              <label htmlFor="bulk-tags-add" className="text-xs text-ink-soft mb-1 block">Add tags</label>
              <input
                id="bulk-tags-add"
                type="text"
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleApply(); }}
                placeholder="e.g. frontend, api (comma separated)"
                className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label htmlFor="bulk-tags-remove" className="text-xs text-ink-soft mb-1 block">Remove tags</label>
              <input
                id="bulk-tags-remove"
                type="text"
                value={removeText}
                onChange={(e) => setRemoveText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleApply(); }}
                placeholder="e.g. legacy, temp"
                className="w-full bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>

            {existingTags.length > 0 && (
              <div>
                <span className="text-xs text-ink-soft mb-1 block">Existing tags in selection</span>
                <div className="flex flex-wrap gap-1.5">
                  {existingTags.map(([tag, count]) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setRemoveText((prev) => (prev ? `${prev}, ${tag}` : tag))}
                      title="Click to remove this tag from selection"
                      className="inline-flex items-center gap-1 rounded-md bg-surface-3 border border-border px-2 py-0.5 text-[10px] text-ink-faint hover:border-danger/40 hover:text-danger transition-colors"
                    >
                      {tag}
                      <span className="font-mono text-[8px]">{count}</span>
                      <span aria-hidden="true">✕</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-3 text-sm">Cancel</button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!addText.trim() && !removeText.trim()}
                className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold disabled:opacity-50"
              >
                Apply Tags
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
