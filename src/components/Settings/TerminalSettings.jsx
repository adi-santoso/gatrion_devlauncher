import React from 'react';

/**
 * TerminalSettings - Terminal font size controls, max log lines input, auto-scroll toggle
 * Lines 855-870 from template
 */
const TerminalSettings = ({
  fontSize = 14,
  onFontSizeChange,
  maxLines = 1000,
  onMaxLinesChange,
  autoScroll = true,
  onAutoScrollChange,
}) => {
  const decreaseFontSize = () => {
    if (fontSize > 8) {
      onFontSizeChange(fontSize - 1);
    }
  };

  const increaseFontSize = () => {
    if (fontSize < 24) {
      onFontSizeChange(fontSize + 1);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
      <p className="font-display font-bold text-sm">Terminal</p>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink">Font size</p>
        <div className="flex items-center gap-2">
          <button
            onClick={decreaseFontSize}
            className="w-6 h-6 rounded-md bg-surface-3 text-ink-soft hover:text-ink"
          >
            −
          </button>
          <span className="text-xs font-mono w-6 text-center">{fontSize}</span>
          <button
            onClick={increaseFontSize}
            className="w-6 h-6 rounded-md bg-surface-3 text-ink-soft hover:text-ink"
          >
            +
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink">Max log lines</p>
        <input
          type="text"
          value={maxLines}
          onChange={(e) => {
            const value = parseInt(e.target.value) || 0;
            onMaxLinesChange(value);
          }}
          className="w-20 bg-surface-3 border border-border rounded-lg px-2 py-1 text-xs font-mono text-ink text-right focus:outline-none"
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink">Auto-scroll logs</p>
        <button
          onClick={onAutoScrollChange}
          className={`w-9 h-5 rounded-full relative shrink-0 ${
            autoScroll ? 'bg-accent' : 'bg-surface-3 border border-border'
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              autoScroll ? 'right-0.5' : 'left-0.5'
            }`}
          ></span>
        </button>
      </div>
    </div>
  );
};

export default TerminalSettings;
