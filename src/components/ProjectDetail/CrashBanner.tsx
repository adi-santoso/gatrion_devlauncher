import Icon from '../Common/Icon';
import { useDetailI18n } from './useDetailI18n';

interface CrashBannerProps {
  message: string;
  timestamp?: string | null;
  onRestart?: () => void;
  onDismiss?: () => void;
  onViewLogs?: () => void;
  onOpenAgent?: () => void;
}

export default function CrashBanner({
  message,
  timestamp,
  onRestart,
  onDismiss,
  onViewLogs,
  onOpenAgent,
}: CrashBannerProps) {
  const t = useDetailI18n();
  return (
    <div role="alert" className="relative flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 pr-10 shadow-sm">
      <Icon name="warn" size={16} className="text-danger shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-danger">{message}</p>
        {timestamp && (
          <p className="text-xs text-ink-faint mt-0.5">{timestamp}</p>
        )}
      </div>
      {onViewLogs && <button onClick={onViewLogs} className="text-xs underline">{t('View logs')}</button>}
      {onOpenAgent && <button onClick={onOpenAgent} className="text-xs underline">{t('Ask Agent')}</button>}
      {onRestart && (
        <button
          type="button"
          onClick={onRestart}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white hover:brightness-110"
        >
          <Icon name="restart" size={12} />
          {t('Restart')}
        </button>
      )}
      {onDismiss && <button
        type="button"
        onClick={onDismiss}
        aria-label={t('Dismiss error')}
        className="absolute right-3 top-3 rounded p-1 text-ink-faint hover:bg-danger/10 hover:text-ink"
      >
        <Icon name="x" size={13} />
      </button>}
    </div>
  );
}
