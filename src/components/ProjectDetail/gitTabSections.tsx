import Icon from '../Common/Icon';

export interface GitStatusEntry {
  path: string;
  staged?: string;
  unstaged?: string;
}

export interface GitStatusView {
  isRepo: boolean;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitStatusEntry[];
  unstaged: GitStatusEntry[];
  untracked: string[];
}

export interface GitCommitView {
  hash: string;
  subject: string;
  author: string;
  date: string;
  [key: string]: unknown;
}

export interface GitStashView {
  ref: string;
  index: number;
  message?: string;
  [key: string]: unknown;
}

export interface BlameLine {
  hash: string;
  date: string;
  author: string;
  text: string;
  [key: string]: unknown;
}

export const EMPTY_STATUS: GitStatusView = { isRepo: true, branch: null, upstream: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] };

const CODE_STYLE: Record<string, string> = {
  A: 'text-success bg-success/10 border-success/20',
  M: 'text-warning bg-warning/10 border-warning/20',
  D: 'text-danger bg-danger/10 border-danger/20',
  R: 'text-accent bg-accent/10 border-accent/20',
  C: 'text-accent bg-accent/10 border-accent/20',
  U: 'text-danger bg-danger/10 border-danger/20',
  T: 'text-warning bg-warning/10 border-warning/20',
  '?': 'text-ink-faint bg-surface-3 border-border',
};

// git status codes come from the parser as words (e.g. "modified") for the
// letters M/A/D/... — map both forms to the short badge letter + a full label
// (tooltip) so the badge shows "M", not "modified".
const STATUS_META: Record<string, { code: string; label: string }> = {
  A: { code: 'A', label: 'Added' },
  M: { code: 'M', label: 'Modified' },
  D: { code: 'D', label: 'Deleted' },
  R: { code: 'R', label: 'Renamed' },
  C: { code: 'C', label: 'Copied' },
  U: { code: 'U', label: 'Unmerged' },
  T: { code: 'T', label: 'Type change' },
  '?': { code: '?', label: 'Untracked' },
  added: { code: 'A', label: 'Added' },
  modified: { code: 'M', label: 'Modified' },
  deleted: { code: 'D', label: 'Deleted' },
  renamed: { code: 'R', label: 'Renamed' },
  copied: { code: 'C', label: 'Copied' },
  unmerged: { code: 'U', label: 'Unmerged' },
  'type change': { code: 'T', label: 'Type change' },
  untracked: { code: '?', label: 'Untracked' },
};

const btnBase = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap';
export const btnSecondary = `${btnBase} bg-surface-3 hover:bg-surface-2 text-ink-soft hover:text-ink border border-border`;
export const btnPrimary = `${btnBase} px-3.5 bg-accent hover:bg-accent-hover text-white font-semibold shadow-glow disabled:opacity-50 disabled:cursor-not-allowed`;

export function DiffView({ diff }: { diff: string }) {
  if (!diff) return null;
  return (
    <pre className="w-full max-h-80 overflow-auto bg-base border border-border rounded-lg p-3 text-[11px] font-mono leading-relaxed">
      {diff.split('\n').map((line, index) => {
        let cls = 'text-ink-faint';
        if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-success';
        else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-danger';
        else if (line.startsWith('@@')) cls = 'text-accent';
        else if (line.startsWith('diff --git') || line.startsWith('index ')) cls = 'text-ink-faint';
        return <div key={index} className={cls}>{line || ' '}</div>;
      })}
    </pre>
  );
}

interface FileRowProps {
  entry: GitStatusEntry;
  section: 'staged' | 'unstaged' | 'untracked';
  onToggle: (entry: GitStatusEntry, section: string) => void;
  onShowDiff: (entry: GitStatusEntry, section: string) => void;
  onDiscard?: (entry: GitStatusEntry) => void;
  diffOpen: boolean;
}

function FileRow({ entry, section, onToggle, onShowDiff, onDiscard, diffOpen }: FileRowProps) {
  const rawCode = (section === 'staged' ? entry.staged : entry.unstaged) || '?';
  const meta = STATUS_META[rawCode] || { code: rawCode, label: rawCode };
  const checked = section === 'staged';
  const canDiscard = section === 'unstaged' || section === 'untracked';
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 text-xs border-b border-border/50 last:border-0 ${diffOpen ? 'bg-surface-2/60' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(entry, section)}
        className="w-3.5 h-3.5 accent-accent cursor-pointer shrink-0"
        aria-label={`${checked ? 'Unstage' : 'Stage'} ${entry.path}`}
      />
      <span
        title={meta.label}
        className={`inline-flex items-center justify-center w-5 h-5 rounded border text-[10px] font-bold shrink-0 ${CODE_STYLE[meta.code] || CODE_STYLE['?']}`}
      >
        {meta.code}
      </span>
      <span className="flex-1 min-w-0 font-mono text-ink truncate" title={entry.path}>{entry.path}</span>
      {canDiscard && onDiscard && (
        <button
          type="button"
          onClick={() => onDiscard(entry)}
          className="shrink-0 inline-flex items-center gap-1 text-[10px] text-ink-faint hover:text-danger transition-colors"
          title="Discard working-tree changes"
        >
          <Icon name="trash" size={11} />
        </button>
      )}
      <button
        type="button"
        onClick={() => onShowDiff(entry, section)}
        className="shrink-0 inline-flex items-center gap-1 text-[10px] text-ink-faint hover:text-accent transition-colors"
      >
        <Icon name={diffOpen ? 'minus' : 'fileText'} size={11} />
        {diffOpen ? 'Close' : 'Diff'}
      </button>
    </div>
  );
}

export interface DiffState {
  path: string;
  staged: boolean;
  text: string;
}

interface BranchBarProps {
  status: GitStatusView;
  branchInput: string;
  setBranchInput: (value: string) => void;
  createBranch: boolean;
  setCreateBranch: (value: boolean) => void;
  busy: string | null;
  onCheckout: () => void;
  onPull: () => void;
  onRequestPush: () => void;
  onRefresh: () => void;
}

export function BranchBar({ status, branchInput, setBranchInput, createBranch, setCreateBranch, busy, onCheckout, onPull, onRequestPush, onRefresh }: BranchBarProps) {
  return (
    <div className="bg-surface border border-border rounded-xl shadow-card p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-surface-3 border border-border flex items-center justify-center text-ink-soft shrink-0">
            <Icon name="gitBranch" size={15} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink font-mono truncate">{status.branch || '(detached)'}</p>
            <div className="flex items-center gap-2 text-[11px] text-ink-faint">
              {status.upstream ? (
                <>
                  <span className="truncate">tracks {status.upstream}</span>
                  {status.ahead > 0 && <span className="text-success font-mono">↑{status.ahead}</span>}
                  {status.behind > 0 && <span className="text-warning font-mono">↓{status.behind}</span>}
                </>
              ) : (
                <span>no upstream</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onPull} disabled={busy !== null} className={btnSecondary} title="git pull">
            <Icon name="download" size={13} />
            Pull
          </button>
          <button onClick={onRequestPush} disabled={busy !== null || status.ahead === 0} className={btnSecondary} title={status.ahead === 0 ? 'Nothing to push' : 'git push'}>
            <Icon name="upload" size={13} />
            Push
          </button>
          <button onClick={onRefresh} disabled={busy !== null} className={btnSecondary} title="Refresh status">
            <Icon name="restart" size={13} />
            Refresh
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40 flex-wrap">
        <input
          type="text"
          value={branchInput}
          onChange={(e) => setBranchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onCheckout(); }}
          placeholder={createBranch ? 'New branch name' : 'Branch name to switch to'}
          className="flex-1 min-w-[180px] max-w-xs bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-xs font-mono text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <label className="flex items-center gap-1.5 text-[11px] text-ink-faint cursor-pointer">
          <input type="checkbox" checked={createBranch} onChange={(e) => setCreateBranch(e.target.checked)} className="w-3 h-3 accent-accent" />
          New branch
        </label>
        <button onClick={onCheckout} disabled={busy !== null || !branchInput.trim()} className={btnPrimary}>
          <Icon name={createBranch ? 'plus' : 'gitBranch'} size={13} />
          {createBranch ? 'Create' : 'Checkout'}
        </button>
      </div>
    </div>
  );
}

interface ChangesSectionProps {
  status: GitStatusView;
  stagedCount: number;
  workingCount: number;
  dirty: boolean;
  diff: DiffState | null;
  blame: { path: string; lines: BlameLine[] } | null;
  busy: string | null;
  commitMessage: string;
  setCommitMessage: (value: string) => void;
  onToggle: (entry: GitStatusEntry, section: string) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onCommit: () => void;
  onShowDiff: (entry: GitStatusEntry, section: string) => void;
  onShowBlame: () => void;
  onCloseDiff: () => void;
  onDiscard: (entry: GitStatusEntry) => void;
}

export function ChangesSection({
  status, stagedCount, workingCount, dirty, diff, blame, busy, commitMessage, setCommitMessage,
  onToggle, onStageAll, onUnstageAll, onCommit, onShowDiff, onShowBlame, onCloseDiff, onDiscard,
}: ChangesSectionProps) {
  return (
    <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-surface-2 flex-wrap">
        <p className="text-xs font-semibold text-ink">
          Changes
          <span className="text-ink-faint font-normal ml-2">{stagedCount} staged · {workingCount} modified</span>
        </p>
        <div className="flex items-center gap-2">
          {stagedCount > 0 && (
            <button onClick={onUnstageAll} disabled={busy !== null} className={btnSecondary}>
              <Icon name="minus" size={13} />
              Unstage all
            </button>
          )}
          {workingCount > 0 && (
            <button onClick={onStageAll} disabled={busy !== null} className={btnSecondary}>
              <Icon name="plus" size={13} />
              Stage all
            </button>
          )}
        </div>
      </div>

      {!dirty ? (
        <p className="py-6 text-center text-sm text-ink-faint">Working tree is clean. Nothing to commit.</p>
      ) : (
        <>
          {status.staged.length > 0 && (
            <div>
              <p className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-success">Staged</p>
              {status.staged.map((entry) => (
                <FileRow
                  key={`s-${entry.path}`}
                  entry={entry}
                  section="staged"
                  onToggle={onToggle}
                  onShowDiff={onShowDiff}
                  diffOpen={Boolean(diff?.path === entry.path && diff?.staged)}
                />
              ))}
            </div>
          )}
          {status.unstaged.length > 0 && (
            <div>
              <p className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-ink-faint">Modified (not staged)</p>
              {status.unstaged.map((entry) => (
                <FileRow
                  key={`u-${entry.path}`}
                  entry={entry}
                  section="unstaged"
                  onToggle={onToggle}
                  onShowDiff={onShowDiff}
                  onDiscard={onDiscard}
                  diffOpen={Boolean(diff?.path === entry.path && !diff?.staged)}
                />
              ))}
            </div>
          )}
          {status.untracked.length > 0 && (
            <div>
              <p className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-ink-faint">Untracked</p>
              {status.untracked.map((path) => (
                <FileRow
                  key={`t-${path}`}
                  entry={{ path, unstaged: '?' }}
                  section="untracked"
                  onToggle={onToggle}
                  onShowDiff={onShowDiff}
                  onDiscard={onDiscard}
                  diffOpen={Boolean(diff?.path === path && !diff?.staged)}
                />
              ))}
            </div>
          )}
          {diff && (
            <div className="border-t border-border p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[11px] font-mono text-ink-soft truncate">
                  {diff.staged ? 'Index' : 'Working tree'} diff · {diff.path}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={onShowBlame}
                    className={`text-[10px] inline-flex items-center gap-1 transition-colors ${blame?.path === diff.path ? 'text-accent' : 'text-ink-faint hover:text-ink'}`}
                    title="Toggle git blame"
                  >
                    <Icon name="gitBranch" size={11} />
                    {blame?.path === diff.path ? 'Hide blame' : 'Blame'}
                  </button>
                  <button onClick={onCloseDiff} className="text-[10px] text-ink-faint hover:text-ink flex items-center gap-1">
                    <Icon name="x" size={11} />
                    Close
                  </button>
                </div>
              </div>
              {blame?.path === diff.path ? (
                <div className="max-h-80 overflow-auto bg-base border border-border rounded-lg">
                  <table className="w-full text-[11px] font-mono">
                    <tbody>
                      {blame.lines.map((line, index) => (
                        <tr key={index} className="border-b border-border/40 last:border-0">
                          <td className="px-2 py-0.5 text-ink-faint whitespace-nowrap align-top">{line.hash}</td>
                          <td className="px-2 py-0.5 text-ink-faint whitespace-nowrap align-top">{line.date}</td>
                          <td className="px-2 py-0.5 text-ink-faint whitespace-nowrap align-top max-w-[120px] truncate" title={line.author}>{line.author}</td>
                          <td className="px-2 py-0.5 text-ink whitespace-pre-wrap break-all align-top">{line.text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <DiffView diff={diff.text} />
              )}
            </div>
          )}
          <div className="border-t border-border p-3 bg-surface-2/50">
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && commitMessage.trim() && stagedCount > 0) onCommit();
              }}
              placeholder={stagedCount === 0 ? 'Stage changes to enable commit...' : 'Commit message (Ctrl+Enter)'}
              rows={2}
              disabled={stagedCount === 0}
              className="w-full bg-base border border-border rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y disabled:opacity-50"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-[11px] text-ink-faint">{stagedCount === 0 ? 'Nothing staged — stage files above to commit.' : `${stagedCount} file(s) will be committed.`}</p>
              <button onClick={onCommit} disabled={!commitMessage.trim() || stagedCount === 0 || busy !== null} className={btnPrimary}>
                <Icon name="commit" size={13} />
                Commit
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


