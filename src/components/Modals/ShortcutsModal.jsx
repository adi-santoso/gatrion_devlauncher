import React from 'react';

/**
 * ShortcutsModal - Keyboard shortcuts cheat sheet
 * Lines 1022-1040 from template
 */
const ShortcutsModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { label: 'Open command palette', keys: ['Ctrl', 'K'] },
    { label: 'Add new project', keys: ['Ctrl', 'N'] },
    { label: 'Start all projects', keys: ['Ctrl', 'Shift', 'S'] },
    { label: 'Stop all projects', keys: ['Ctrl', 'Shift', 'X'] },
    { label: 'Show this cheat sheet', keys: ['?'] },
    { label: 'Close dialog', keys: ['Esc'] },
  ];

  return (
    <div id="shortcutsModal" className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"></div>
      <div className="relative h-full flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-surface border border-border rounded-xl shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-sm">Keyboard Shortcuts</h3>
            <button onClick={onClose} className="text-ink-faint hover:text-ink">
              ✕
            </button>
          </div>
          <div className="space-y-2.5 text-xs">
            {shortcuts.map((shortcut, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-ink-soft">{shortcut.label}</span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, keyIndex) => (
                    <React.Fragment key={keyIndex}>
                      <kbd className="border border-border rounded px-1.5 py-0.5 font-mono text-ink-faint">
                        {key}
                      </kbd>
                      {keyIndex < shortcut.keys.length - 1 && (
                        <span className="text-ink-faint">+</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsModal;
