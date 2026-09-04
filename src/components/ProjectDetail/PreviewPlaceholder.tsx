/**
 * Empty-state cards for the preview area: either no app port is configured or
 * the project is not running yet. Presentational.
 */
import Icon from '../Common/Icon'

interface PreviewPlaceholderProps {
  variant: 'no-port' | 'not-running'
  appUrl?: string | null
  onEdit?: () => void
  onStart?: () => void
}

export default function PreviewPlaceholder({ variant, appUrl, onEdit, onStart }: PreviewPlaceholderProps) {
  const noPort = variant === 'no-port'
  return (
    <div className="max-w-md text-center py-12 px-6 bg-surface border border-border rounded-xl shadow-sm my-auto">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${noPort ? 'bg-surface-3 text-ink-soft' : 'bg-accent/10 text-accent'}`}>
        <Icon name={noPort ? 'gear' : 'globe'} size={22} />
      </div>
      <h3 className="font-display font-bold text-base text-ink">{noPort ? 'No App Port Configured' : 'Project is Not Running'}</h3>
      <p className="text-xs text-ink-faint mt-1.5 leading-relaxed">
        {noPort ? (
          <>To enable embedded app preview, specify the local development port (e.g., 5173 for Vite, 3000 for Next.js) in your project settings.</>
        ) : (
          <>Local app preview at <code className="text-accent font-mono">{appUrl}</code> will display here automatically once you start the project.</>
        )}
      </p>
      {noPort ? (
        <button
          type="button"
          onClick={onEdit}
          className="mt-4 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-glow transition-colors"
        >
          Configure Port
        </button>
      ) : (
        <button
          type="button"
          onClick={onStart}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-success/20 text-success border border-success/30 hover:bg-success/30 text-xs font-semibold transition-colors"
        >
          <Icon name="play" size={13} />
          Start Project
        </button>
      )}
    </div>
  )
}