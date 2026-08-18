import { forwardRef, useImperativeHandle, useState } from 'react';

export interface TagsFieldHandle {
  /** Tags including any typed-but-uncommitted input; also commits them via onChange. */
  flush: () => string[];
}

interface TagsFieldProps {
  tags: string[];
  existingTags: string[];
  onChange: (tags: string[]) => void;
}

const INPUT_CLASS = 'flex-1 bg-surface-3 border border-border rounded-lg px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent/40';

/**
 * Tag input: commits on Enter/blur, offers existing tags as selectable chips,
 * and exposes a synchronous flush() so the parent can persist a typed-but-
 * uncommitted tag when the modal is saved (clicking Add Project blurs nothing
 * in jsdom/quick clicks — the pending value must not be silently dropped).
 */
const TagsField = forwardRef<TagsFieldHandle, TagsFieldProps>(({ tags, existingTags, onChange }, ref) => {
  const [input, setInput] = useState('');

  const commit = (): void => {
    const value = input.trim();
    if (!value) return;
    if (!tags.includes(value)) onChange([...tags, value]);
    setInput('');
  };

  useImperativeHandle(ref, () => ({
    flush: (): string[] => {
      const value = input.trim();
      if (value) {
        if (!tags.includes(value)) onChange([...tags, value]);
        setInput('');
        return tags.includes(value) ? tags : [...tags, value];
      }
      return tags;
    },
  }));

  const toggle = (tag: string): void => {
    onChange(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);
  };

  return (
    <div>
      <label className="text-xs text-ink-soft mb-1.5 block">Tags</label>
      <input
        type="text"
        placeholder="Add tag, press Enter"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        onBlur={commit}
        className={INPUT_CLASS}
      />
      {existingTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {existingTags.map((tag) => {
            const selected = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggle(tag)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] transition-colors ${selected ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-surface-3 border-border text-ink-soft hover:text-ink'}`}
              >
                {selected ? '✓ ' : ''}{tag}
              </button>
            );
          })}
        </div>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-3 border border-border text-[10px] text-ink-soft">
              {tag}
              <button type="button" onClick={() => onChange(tags.filter((t) => t !== tag))} className="text-ink-faint hover:text-danger">✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
});

TagsField.displayName = 'TagsField';

export default TagsField;
