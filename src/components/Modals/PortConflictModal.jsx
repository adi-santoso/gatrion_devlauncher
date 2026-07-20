import React, { useState } from 'react';

/**
 * PortConflictModal - Port conflict resolver with radio options
 * Lines 1045-1070 from template
 */
const PortConflictModal = ({ isOpen, onClose, port = 3000, onResolve }) => {
  const [selectedOption, setSelectedOption] = useState('kill');
  const [alternatePort, setAlternatePort] = useState(port + 1);

  if (!isOpen) return null;

  const handleResolve = () => {
    if (selectedOption === 'kill') {
      onResolve({ action: 'kill', port });
    } else {
      onResolve({ action: 'alternate', port: alternatePort });
    }
    onClose();
  };

  return (
    <div id="portConflictModal" className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div className="relative h-full flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-surface border border-border rounded-xl shadow-card p-5">
          <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center mb-3">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-warning"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <h3 className="font-display font-bold text-sm">Port {port} is already in use</h3>
          <p className="text-xs text-ink-faint mt-1.5 leading-relaxed">
            Another process on your machine is already listening on this port. Choose how to
            resolve it.
          </p>
          <div className="space-y-2 mt-4">
            <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border hover:border-accent/50 cursor-pointer">
              <input
                type="radio"
                name="portFix"
                checked={selectedOption === 'kill'}
                onChange={() => setSelectedOption('kill')}
                className="accent-accent"
              />
              <span className="text-xs text-ink">
                Kill the process using <span className="font-mono">:{port}</span>, then start
              </span>
            </label>
            <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border hover:border-accent/50 cursor-pointer">
              <input
                type="radio"
                name="portFix"
                checked={selectedOption === 'alternate'}
                onChange={() => setSelectedOption('alternate')}
                className="accent-accent"
              />
              <span className="text-xs text-ink flex items-center gap-2">
                Use a different port{' '}
                <input
                  type="text"
                  value={alternatePort}
                  onChange={(e) => setAlternatePort(parseInt(e.target.value) || port + 1)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-16 bg-surface-3 border border-border rounded px-1.5 py-0.5 font-mono text-xs"
                />
              </span>
            </label>
          </div>
          <div className="flex items-center justify-end gap-2 mt-5">
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-3 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleResolve}
              className="px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-glow transition-colors"
            >
              Resolve &amp; Start
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortConflictModal;
