import type { EnvVar } from '../../types/shared';
import { useRef } from 'react';
import { useDetailI18n } from '../ProjectDetail/useDetailI18n';

/** Row IDs belong to the editor, never to the mutable variable name. */
export default function EnvironmentFields({ values, onChange }: { values: EnvVar[]; onChange: (values: EnvVar[]) => void }) {
  const t = useDetailI18n();
  const ids = useRef<string[]>([]);
  while (ids.current.length < values.length) ids.current.push(crypto.randomUUID());
  const update = (index: number, field: string, value: string) => onChange(values.map((item, i) => i === index ? { ...item, [field]: value, unchanged: false } : item));
  return <div>
    <div className="flex items-center justify-between mb-1.5">
      <p className="text-xs text-ink-soft">{t('Environment variables')}</p>
      <button type="button" onClick={() => onChange([...values, { key: '', value: '' }])} className="text-xs font-medium text-accent">{t('+ Add variable')}</button>
    </div>
    <div className="space-y-2">{values.map((item, index) => <div key={ids.current[index]} className="flex gap-2 items-center">
      <input aria-label={t('Variable {index} name', { index: index + 1 })} value={item.key} onChange={event => update(index, 'key', event.target.value)} placeholder="KEY" className="w-1/3 bg-surface-3 border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-ink focus:ring-2 focus:ring-accent/40" />
      <input aria-label={t('Variable {index} value', { index: index + 1 })} type={item.secret ? 'password' : 'text'} value={item.value} onChange={event => update(index, 'value', event.target.value)} placeholder={t(item.unchanged ? 'Stored value unchanged' : 'value')} className="flex-1 min-w-0 bg-surface-3 border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-ink focus:ring-2 focus:ring-accent/40" />
      <button type="button" aria-label={t('Remove variable {index}', { index: index + 1 })} onClick={() => { ids.current.splice(index, 1); onChange(values.filter((_, i) => i !== index)); }} className="w-7 h-7 shrink-0 rounded-lg text-ink-faint hover:text-danger">✕</button>
    </div>)}</div>
  </div>;
}
