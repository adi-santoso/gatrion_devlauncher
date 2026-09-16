import { useDetailI18n } from './useDetailI18n';

export default function PreviewZoom({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
  const t = useDetailI18n();
  return <div className="flex items-center gap-1 bg-surface-3 border border-border rounded-md px-1.5 py-0.5 text-xs text-ink-soft font-mono">
    <span className="text-[10px] text-ink-faint">Zoom:</span>
    <select value={value} disabled={disabled} aria-label="Zoom" title={disabled ? t('Zoom is fixed while a device is selected') : undefined}
      onChange={event => onChange(Number(event.target.value))} className="bg-transparent text-xs text-ink font-semibold focus:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
      {[50, 75, 100, 125, 150].map(level => <option key={level} value={level}>{level}%</option>)}
    </select>
  </div>;
}
