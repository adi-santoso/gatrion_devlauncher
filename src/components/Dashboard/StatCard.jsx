export default function StatCard({ title, value, unit, subtitle, subtitleColor, icon, color, showPulseDot }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          {title}
        </span>
        {showPulseDot ? (
          <span className="relative flex w-2 h-2">
            <span className="pulse-dot text-success"></span>
            <span className="relative w-2 h-2 rounded-full bg-success"></span>
          </span>
        ) : (
          icon && (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-faint">
              {icon}
            </svg>
          )
        )}
      </div>
      <p className={`font-mono text-2xl font-semibold ${color || ''}`}>
        {value}
        {unit && <span className="text-sm text-ink-faint">{unit}</span>}
      </p>
      {subtitle && <p className={`text-xs mt-1 ${subtitleColor || 'text-ink-faint'}`}>{subtitle}</p>}
    </div>
  );
}
