import { Fragment } from 'react';
import AnimatedModal from '../Common/AnimatedModal';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * ShortcutsModal - Keyboard shortcuts cheat sheet
 * Lines 1022-1040 from template
 */
const ShortcutsModal = ({ isOpen, onClose }: ShortcutsModalProps) => {
  const shortcuts = [
    { label: 'Open command palette', keys: ['Ctrl', 'K'] },
    { label: 'Add new project', keys: ['Ctrl', 'N'] },
    { label: 'Start all projects', keys: ['Ctrl', 'Shift', 'S'] },
    { label: 'Stop all projects', keys: ['Ctrl', 'Shift', 'X'] },
    { label: 'Show this cheat sheet', keys: ['?'] },
    { label: 'Close dialog', keys: ['Esc'] },
  ];

  return (
    <AnimatedModal id="shortcutsModal" isOpen={isOpen} onClose={onClose}>
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
                    <Fragment key={keyIndex}>
                      <kbd className="border border-border rounded px-1.5 py-0.5 font-mono text-ink-faint">
                        {key}
                      </kbd>
                      {keyIndex < shortcut.keys.length - 1 && (
                        <span className="text-ink-faint">+</span>
                      )}
                    </Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
    </AnimatedModal>
  );
};

export default ShortcutsModal;
