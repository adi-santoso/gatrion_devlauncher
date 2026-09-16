import Icon from '../Common/Icon';
import { btnSecondary, btnPrimary } from './gitTabSections';
import type { GitCommitView, GitStashView } from './gitTabSections';
import { useDetailI18n } from './useDetailI18n';

interface StashSectionProps {
  stashes: GitStashView[];
  stashMessage: string;
  setStashMessage: (value: string) => void;
  busy: string | null;
  dirty: boolean;
  onSave: () => void;
  onAction: (action: string, index: number) => void;
}

export function StashSection({ stashes, stashMessage, setStashMessage, busy, dirty, onSave, onAction }: StashSectionProps) {
  const t = useDetailI18n();
  return (
    <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-surface-2 flex-wrap">
        <p className="text-xs font-semibold text-ink">Stash</p>
        <span className="text-[11px] text-ink-faint">{t('{count} saved', { count: stashes.length })}</span>
      </div>
      <div className="p-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <input
            type="text"
            aria-label={t('Stash message')}
            maxLength={200}
            value={stashMessage}
            onChange={(e) => setStashMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); }}
            placeholder={t('Stash message (optional)')}
            className="flex-1 min-w-[160px] bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button onClick={onSave} disabled={busy !== null || !dirty} className={btnSecondary} title={t('Save tracked and untracked files to stash')}>
            <Icon name="download" size={13} />
            Stash
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-faint">{t('Includes untracked files. Ignored files are excluded.')}</p>
      </div>
      {stashes.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-faint">{t('No stashes yet. Save your WIP changes before switching branches.')}</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {stashes.map((stash) => (
            <li key={stash.ref} className="flex items-center gap-2 px-4 py-2 text-xs">
              <span className="font-mono text-ink-faint shrink-0">{stash.ref}</span>
              <span className="flex-1 min-w-0 text-ink truncate" title={stash.message}>{stash.message}</span>
              <button onClick={() => onAction('pop', stash.index)} disabled={busy !== null} className="text-[10px] text-ink-faint hover:text-accent transition-colors" title={t('Pop (restore & remove)')}>{t('Pop')}</button>
              <button onClick={() => onAction('apply', stash.index)} disabled={busy !== null} className="text-[10px] text-ink-faint hover:text-accent transition-colors" title={t('Apply (restore & keep)')}>{t('Apply')}</button>
              <button onClick={() => onAction('drop', stash.index)} disabled={busy !== null} className="text-[10px] text-ink-faint hover:text-danger transition-colors" title={t('Drop stash')}>{t('Drop')}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CommitsSection({ commits }: { commits: GitCommitView[] }) {
  const t = useDetailI18n();
  return (
    <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-surface-2">
        <p className="text-xs font-semibold text-ink">{t('Recent commits')}</p>
      </div>
      {commits.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-faint">{t('No commits yet in this branch.')}</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {commits.map((commit) => (
            <li key={commit.hash} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-7 h-7 rounded-md bg-surface-3 border border-border flex items-center justify-center text-ink-soft shrink-0">
                <Icon name="commit" size={13} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs text-ink truncate">{commit.subject}</span>
                <span className="block text-[10px] text-ink-faint mt-0.5">{commit.author} · {commit.date}</span>
              </span>
              <span className="font-mono text-[10px] text-ink-faint shrink-0">{commit.hash}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NotARepoView({ onInitialize }: { onInitialize: () => void }) {
  const t = useDetailI18n();
  return (
    <div className="bg-surface border border-border rounded-xl shadow-card p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center text-ink-soft mx-auto mb-3">
        <Icon name="gitBranch" size={22} />
      </div>
      <h3 className="font-display font-bold text-base text-ink">{t('Not a Git Repository')}</h3>
      <p className="text-xs text-ink-faint mt-1.5 leading-relaxed max-w-md mx-auto">
        {t('This project folder is not under version control yet. Initialize a repository to track changes, commit, and sync with a remote.')}
      </p>
      <button onClick={onInitialize} className={`${btnPrimary} mt-4`}>
        <Icon name="plus" size={13} />
        {t('Initialize Repository')}
      </button>
    </div>
  );
}
