import React from 'react';

/**
 * ToggleSwitch - Reusable toggle switch component
 * Lines 843-852 from template
 */
const ToggleSwitch = ({ enabled, onChange, label, description }) => {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-ink">{label}</p>
        {description && <p className="text-[11px] text-ink-faint">{description}</p>}
      </div>
      <button
        onClick={onChange}
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
