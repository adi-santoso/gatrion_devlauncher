interface ToggleSwitchProps {
  enabled: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}

/**
 * ToggleSwitch - Reusable toggle switch component
 */
const ToggleSwitch = ({ enabled, onChange, label, description }: ToggleSwitchProps) => {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-ink">{label}</p>
        {description && <p className="text-[11px] text-ink-faint">{description}</p>}
      </div>
      <button
        onClick={onChange}
        aria-pressed={enabled}
        className={`w-9 h-5 rounded-full relative shrink-0 ${
          enabled ? 'bg-accent' : 'bg-surface-3 border border-border'
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            enabled ? 'right-0.5' : 'left-0.5'
          }`}
        ></span>
      </button>
    </div>
  );
};

export default ToggleSwitch;
