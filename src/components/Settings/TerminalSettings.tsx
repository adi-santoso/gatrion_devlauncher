import { useEffect, useState } from 'react';
import Icon from '../Common/Icon';
import { useI18n } from '../../i18n/I18nContext';

const MIN_MAX_LINES = 100;

interface TerminalSettingsProps {
  fontSize?: number;
  onFontSizeChange: (size: number) => void;
  maxLines?: number;
  onMaxLinesChange: (lines: number) => void;
  autoScroll?: boolean;
  onAutoScrollChange: () => void;
  embedded?: boolean;
}

/**
 * TerminalSettings - Terminal font size controls, max log lines input, auto-scroll toggle.
 * `embedded` renders without the card wrapper so the controls can live inside
 * another card (the merged General card in SettingsView).
 */
const TerminalSettings = ({
  fontSize = 14,
  onFontSizeChange,
  maxLines = 1000,
  onMaxLinesChange,
  autoScroll = true,
  onAutoScrollChange,
  embedded = false,
}: TerminalSettingsProps) => {
  const { t } = useI18n();

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

  const controls = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink">{t('settings.terminal.fontSize')}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={decreaseFontSize}
            aria-label={t('settings.terminal.decreaseFont')}
            className="w-6 h-6 rounded-md bg-surface-3 text-ink-soft hover:text-ink transition-colors"
          >
            <Icon name="minus" size={14} />
          </button>
          <span className="text-xs font-mono w-6 text-center">{fontSize}</span>
          <button
            onClick={increaseFontSize}
            aria-label={t('settings.terminal.increaseFont')}
            className="w-6 h-6 rounded-md bg-surface-3 text-ink-soft hover:text-ink transition-colors"
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink">{t('settings.terminal.maxLines')}</p>
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
            aria-label={t('settings.terminal.maxLines')}
            className="w-20 bg-surface-3 border border-border rounded-lg px-2 py-1 text-xs font-mono text-ink text-right focus:outline-none"
          />
          <span className="text-[10px] text-ink-faint">{t('settings.terminal.min', { count: MIN_MAX_LINES })}</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink">{t('settings.terminal.autoScroll')}</p>
        <button
          onClick={onAutoScrollChange}
          aria-label={t('settings.terminal.toggleAutoScroll')}
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
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{controls}</div>;
  }

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card p-5 space-y-4">
      <p className="font-display font-bold text-sm">{t('settings.terminal.title')}</p>
      {controls}
    </div>
  );
};

export default TerminalSettings;
