import type { ProjectFormData } from './projectFormData';
import { useDetailI18n } from '../ProjectDetail/useDetailI18n';

export default function CustomCommandFields({ values, onChange }: {
  values: ProjectFormData['customCommands']; onChange: (values: ProjectFormData['customCommands']) => void;
}) {
  const t = useDetailI18n();
  const update = (index: number, field: 'label' | 'command', value: string) => onChange(values.map((item, i) => i === index ? { ...item, [field]: value } : item));
  return <div>
    <div className="flex items-center justify-between mb-1.5">
      <p className="text-xs text-ink-soft">{t('Custom commands')}</p>
      <button type="button" onClick={() => onChange([...values, { id: crypto.randomUUID(), label: '', command: '' }])} className="text-xs font-medium text-accent">{t('+ Add command')}</button>
    </div>
    <div className="space-y-2">{values.map((item, index) => <div key={item.id} className="flex gap-2 items-center">
      <input value={item.label} onChange={event => update(index, 'label', event.target.value)} aria-label={t('Command {index} label', { index: index + 1 })} placeholder={t('Label')} className="w-1/3 bg-surface-3 border border-border rounded-lg px-2.5 py-1.5 text-xs text-ink focus:ring-2 focus:ring-accent/40" />
      <input value={item.command} onChange={event => update(index, 'command', event.target.value)} aria-label={t('Command {index}', { index: index + 1 })} placeholder="npm run build" className="flex-1 min-w-0 bg-surface-3 border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-ink focus:ring-2 focus:ring-accent/40" />
      <button type="button" aria-label={t('Remove command {index}', { index: index + 1 })} onClick={() => onChange(values.filter((_, i) => i !== index))} className="w-7 h-7 shrink-0 rounded-lg text-ink-faint hover:text-danger">✕</button>
    </div>)}</div>
  </div>;
}
