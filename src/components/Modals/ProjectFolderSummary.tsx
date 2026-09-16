import type { DetectTypeResult } from '../../data/projects'
import { useDetailI18n } from '../ProjectDetail/useDetailI18n'
import { typeLabel } from '../../utils/typeLabels'

export default function ProjectFolderSummary({ detection, type, compact }: { detection: DetectTypeResult | null; type: string; compact: boolean }) {
  const t = useDetailI18n()
  if (!detection) return <p className="text-xs text-ink-faint">{t('Configured as {type}', { type: typeLabel(type) })} · {t('Manual configuration. Analyze the current folder for suggestions.')}</p>
  return <section aria-label={t('Detected configuration')} className="rounded-lg border border-border bg-surface-2 p-3 space-y-1 text-xs">
    <p>{detection.type === type ? t('Detected as {type}', { type: detection.name }) : t('Configured as {type}', { type: typeLabel(type) })}</p>
    <p>{t('Package manager')}: {detection.packageManager || t('Not detected')} · {t('Port')}: {detection.defaultPort ?? t('Not monitored')}</p>
    {!compact && <><p className="break-all font-mono">{detection.defaultCommand || t('Needs configuration')}</p><p className="text-ink-faint break-words">{t('Source')}: {t(detection.sources?.command || 'Framework convention')} · {t(detection.sources?.port || 'No port monitoring')}</p></>}
    {detection.warnings?.map(warning => <p key={warning} className="text-warning break-words">{t(warning)}</p>)}
  </section>
}
