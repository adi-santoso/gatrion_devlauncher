import React, { useEffect, useState } from 'react';
import Icon from '../Common/Icon';

const MIN_MAX_LINES = 100;

/**
 * TerminalSettings - Terminal font size controls, max log lines input, auto-scroll toggle
 */
const TerminalSettings = ({
  fontSize = 14,
  onFontSizeChange,
  maxLines = 1000,
  onMaxLinesChange,
  autoScroll = true,
  onAutoScrollChange,
}) => {
  // Keep a raw draft so typing is free; the value is clamped and committed on blur.
  const [maxLinesDraft, setMaxLinesDraft] = useState(String(maxLines ?? 1000));
  useEffect(() => setMaxLinesDraft(String(maxLines ?? 1000)), [maxLines]);

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

  const commitMaxLines = () => {
    const parsed = parseInt(maxLinesDraft, 10);
    const next = Number.isNaN(parsed) || parsed < MIN_MAX_LINES ? MIN_MAX_LINES : parsed;
    setMaxLinesDraft(String(next));
    onMaxLinesChange(next);
  };

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
      <p className="font-display font-bold text-sm">Terminal</p>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink">Font size</p>
        <div className="flex items-center gap-2">
          <button
            onClick={decreaseFontSize}
            aria-label="Decrease font size"
            className="w-6 h-6 rounded-md bg-surface-3 text-ink-soft hover:text-ink transition-colors"
          >
            <Icon name="minus" size={14} />
          </button>
          <span className="text-xs font-mono w-6 text-center">{fontSize}</span>
          <button
            onClick={increaseFontSize}
            aria-label="Increase font size"
            className="w-6 h-6 rounded-md bg-surface-3 text-ink-soft hover:text-ink transition-colors"
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink">Max log lines</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={maxLinesDraft}
            onChange={(e) => setMaxLinesDraft(e.target.value)}
            onBlur={commitMaxLines}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            aria-label="Max log lines"
            className="w-20 bg-surface-3 border border-border rounded-lg px-2 py-1 text-xs font-mono text-ink text-right focus:outline-none"
          />
          <span className="text-[10px] text-ink-faint">min {MIN_MAX_LINES}</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink">Auto-scroll logs</p>
        <button
          onClick={onAutoScrollChange}
          aria-label="Toggle auto-scroll logs"
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
