import { useCallback, useEffect, useState } from 'react';
import Icon from '../Common/Icon';
import * as ipc from '../../utils/ipcRenderer';
import { ConfirmDialog } from '../Modals';
import type { ProjectRuntime } from '../../hooks/useProjects';
import type { SimpleResult } from '../../data/ipcCore';

interface GitStatusEntry {
  path: string;
  staged?: string;
  unstaged?: string;
}

interface GitStatusView {
  isRepo: boolean;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitStatusEntry[];
  unstaged: GitStatusEntry[];
  untracked: string[];
}

interface GitCommitView {
  hash: string;
  subject: string;
  author: string;
  date: string;
  [key: string]: unknown;
}

interface GitStashView {
  ref: string;
  index: number;
  message?: string;
  [key: string]: unknown;
}

interface BlameLine {
  hash: string;
  date: string;
  author: string;
  text: string;
  [key: string]: unknown;
}

const EMPTY_STATUS: GitStatusView = { isRepo: true, branch: null, upstream: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] };

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

const CODE_LABEL: Record<string, string> = { A: 'A', M: 'M', D: 'D', R: 'R', C: 'C', U: 'U', T: 'T', '?': '?' };

const btnBase = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap';
const btnSecondary = `${btnBase} bg-surface-3 hover:bg-surface-2 text-ink-soft hover:text-ink border border-border`;
const btnPrimary = `${btnBase} px-3.5 bg-accent hover:bg-accent-hover text-white font-semibold shadow-glow disabled:opacity-50 disabled:cursor-not-allowed`;

function DiffView({ diff }: { diff: string }) {
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
  const code = section === 'staged' ? entry.staged : entry.unstaged || '?';
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
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded border text-[10px] font-bold shrink-0 ${CODE_STYLE[code || '?'] || CODE_STYLE['?']}`}>
        {CODE_LABEL[code || '?'] || code || '?'}
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

interface Notice {
  type: 'error' | 'success';
  message: string;
}

interface DiffState {
  path: string;
  staged: boolean;
  text: string;
}

interface GitTabProps {
  project: ProjectRuntime | null;
}

export default function GitTab({ project }: GitTabProps) {
  const projectPath = project?.path;
  const [status, setStatus] = useState<GitStatusView>(EMPTY_STATUS);
  const [commits, setCommits] = useState<GitCommitView[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [branchInput, setBranchInput] = useState('');
  const [createBranch, setCreateBranch] = useState(false);
  const [diff, setDiff] = useState<DiffState | null>(null); // { path, staged, text }
  const [confirmPush, setConfirmPush] = useState(false);
  const [confirmInit, setConfirmInit] = useState(false);
  const [stashes, setStashes] = useState<GitStashView[]>([]);
  const [stashMessage, setStashMessage] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState<GitStatusEntry | null>(null);
  const [blame, setBlame] = useState<{ path: string; lines: BlameLine[] } | null>(null); // { path, lines }

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    const [statusResult, logResult, stashResult] = await Promise.all([
      ipc.gitStatus(projectPath),
      ipc.gitLog(projectPath),
      ipc.gitStashList(projectPath),
    ]);
    setLoading(false);
    if (statusResult.success) {
      setStatus({ ...EMPTY_STATUS, ...statusResult } as GitStatusView);
    } else {
      setNotice({ type: 'error', message: statusResult.error || 'Failed to read git status' });
    }
    if (logResult.success) setCommits((logResult.commits as unknown as GitCommitView[]) || []);
    if (stashResult.success) setStashes((stashResult.stashes as GitStashView[]) || []);
    setDiff(null);
    setBlame(null);
  }, [projectPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runAction = async (action: () => Promise<SimpleResult | undefined>, label: string): Promise<boolean> => {
    setBusy(label);
    setNotice(null);
    try {
      const result = await action();
      if (!result?.success) {
        setNotice({ type: 'error', message: result?.error || `${label} failed` });
        return false;
      }
      return true;
    } catch (error) {
      setNotice({ type: 'error', message: (error instanceof Error ? error.message : String(error)) || `${label} failed` });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const handleToggle = async (entry: GitStatusEntry, section: string): Promise<void> => {
    const pathToMove = entry.path;
    const ok = await runAction(
      () => (section === 'staged' ? ipc.gitUnstage(projectPath!, [pathToMove]) : ipc.gitStage(projectPath!, [pathToMove])),
      section === 'staged' ? 'Unstaging' : 'Staging'
    );
    if (ok) refresh();
  };

  const handleStageAll = async (): Promise<void> => {
    if (await runAction(() => ipc.gitStage(projectPath!, []), 'Staging all')) refresh();
  };

  const handleUnstageAll = async (): Promise<void> => {
    if (await runAction(() => ipc.gitUnstage(projectPath!, []), 'Unstaging all')) refresh();
  };

  const handleCommit = async (): Promise<void> => {
    const message = commitMessage.trim();
    if (!message) return;
    if (await runAction(() => ipc.gitCommit(projectPath!, message), 'Committing')) {
      setCommitMessage('');
      await refresh();
      setNotice({ type: 'success', message: `Committed: ${message.slice(0, 60)}` });
    }
  };

  const handlePull = async (): Promise<void> => {
    const ok = await runAction(() => ipc.gitPull(projectPath!), 'Pulling');
    if (ok) {
      await refresh();
      setNotice({ type: 'success', message: 'Pull completed' });
    }
  };

  const handlePush = async (): Promise<void> => {
    setConfirmPush(false);
    const ok = await runAction(() => ipc.gitPush(projectPath!), 'Pushing');
    if (ok) {
      await refresh();
      setNotice({ type: 'success', message: 'Push completed' });
    }
  };

  const handleCheckout = async (): Promise<void> => {
    const name = branchInput.trim();
    if (!name) return;
    if (await runAction(() => ipc.gitCheckout(projectPath!, name, createBranch), 'Switching branch')) {
      setBranchInput('');
      setCreateBranch(false);
      await refresh();
      setNotice({ type: 'success', message: `Switched to ${name}` });
    }
  };

  const handleInit = async (): Promise<void> => {
    setConfirmInit(false);
    if (await runAction(() => ipc.gitInit(projectPath!), 'Initializing')) {
      await refresh();
      setNotice({ type: 'success', message: 'Git repository initialized' });
    }
  };

  const handleShowDiff = async (entry: GitStatusEntry, section: string): Promise<void> => {
    const staged = section === 'staged';
    const isOpen = diff?.path === entry.path && diff?.staged === staged;
    if (isOpen) {
      setDiff(null);
      setBlame(null);
      return;
    }
    setBlame(null);
    const result = await ipc.gitDiff(projectPath!, entry.path, staged);
    setDiff({ path: entry.path, staged, text: result.success ? result.diff || '' : result.error || 'Failed to load diff' });
  };

  const handleDiscard = async (): Promise<void> => {
    const filePath = confirmDiscard?.path;
    setConfirmDiscard(null);
    if (!filePath) return;
    if (await runAction(() => ipc.gitDiscard(projectPath!, filePath), 'Discarding')) {
      setDiff(null);
      await refresh();
      setNotice({ type: 'success', message: `Discarded changes to ${filePath}` });
    }
  };

  const handleStashSave = async (): Promise<void> => {
    const ok = await runAction(() => ipc.gitStashPush(projectPath!, stashMessage), 'Stashing');
    if (ok) {
      setStashMessage('');
      await refresh();
      setNotice({ type: 'success', message: 'Working tree stashed' });
    }
  };

  const handleStashAction = async (action: string, index: number): Promise<void> => {
    const ok = await runAction(
      () => (action === 'pop' ? ipc.gitStashPop(projectPath!, index) : action === 'apply' ? ipc.gitStashApply(projectPath!, index) : ipc.gitStashDrop(projectPath!, index)),
      `Stash ${action}`
    );
    if (ok) {
      await refresh();
      setNotice({ type: 'success', message: `Stash ${action === 'pop' ? 'popped' : action === 'apply' ? 'applied' : 'dropped'}` });
    }
  };

  const handleShowBlame = async (): Promise<void> => {
    if (!diff) return;
    if (blame?.path === diff.path) {
      setBlame(null);
      return;
    }
    const result = await ipc.gitBlame(projectPath!, diff.path);
    if (result.success) setBlame({ path: diff.path, lines: (result as { lines?: BlameLine[] }).lines || [] });
    else setNotice({ type: 'error', message: result.error || 'Failed to load blame' });
  };

  const stagedCount = status.staged.length;
  const workingCount = status.unstaged.length + status.untracked.length;
  const dirty = stagedCount > 0 || workingCount > 0;

  if (loading && status.branch === null && !notice) {
    return (
      <div className="bg-surface border border-border rounded-xl shadow-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="skeleton w-8 h-8" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-32" />
            <div className="skeleton h-2.5 w-48" />
          </div>
        </div>
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-10 w-full" />
      </div>
    );
  }

  if (status.isRepo === false) {
    return (
      <div className="bg-surface border border-border rounded-xl shadow-card p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center text-ink-soft mx-auto mb-3">
          <Icon name="gitBranch" size={22} />
        </div>
        <h3 className="font-display font-bold text-base text-ink">Not a Git Repository</h3>
        <p className="text-xs text-ink-faint mt-1.5 leading-relaxed max-w-md mx-auto">
          This project folder is not under version control yet. Initialize a repository to track changes, commit, and sync with a remote.
        </p>
        <button onClick={() => setConfirmInit(true)} className={`${btnPrimary} mt-4`}>
          <Icon name="plus" size={13} />
          Initialize Repository
        </button>
        <ConfirmDialog
          isOpen={confirmInit}
          title="Initialize Git Repository"
          message={`Create a new git repository (.git) inside ${projectPath}?`}
          confirmLabel="Initialize"
          onConfirm={handleInit}
          onCancel={() => setConfirmInit(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notice && (
        <p className={`text-xs px-3 py-2 rounded-lg border ${notice.type === 'success' ? 'text-success border-success/20 bg-success/10' : 'text-danger border-danger/20 bg-danger/10'}`}>
          {notice.message}
        </p>
      )}

      {/* Branch bar */}
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
            <button onClick={handlePull} disabled={busy !== null} className={btnSecondary} title="git pull">
              <Icon name="download" size={13} />
              Pull
            </button>
            <button onClick={() => setConfirmPush(true)} disabled={busy !== null || status.ahead === 0} className={btnSecondary} title={status.ahead === 0 ? 'Nothing to push' : 'git push'}>
              <Icon name="upload" size={13} />
              Push
            </button>
            <button onClick={() => { setNotice(null); refresh(); }} disabled={busy !== null} className={btnSecondary} title="Refresh status">
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
            onKeyDown={(e) => { if (e.key === 'Enter') handleCheckout(); }}
            placeholder={createBranch ? 'New branch name' : 'Branch name to switch to'}
            className="flex-1 min-w-[180px] max-w-xs bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-xs font-mono text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-ink-faint cursor-pointer">
            <input type="checkbox" checked={createBranch} onChange={(e) => setCreateBranch(e.target.checked)} className="w-3 h-3 accent-accent" />
            New branch
          </label>
          <button onClick={handleCheckout} disabled={busy !== null || !branchInput.trim()} className={btnPrimary}>
            <Icon name={createBranch ? 'plus' : 'gitBranch'} size={13} />
            {createBranch ? 'Create' : 'Checkout'}
          </button>
        </div>
      </div>

      {/* Changes + commit */}
      <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-surface-2 flex-wrap">
          <p className="text-xs font-semibold text-ink">
            Changes
            <span className="text-ink-faint font-normal ml-2">{stagedCount} staged · {workingCount} modified</span>
          </p>
          <div className="flex items-center gap-2">
            {stagedCount > 0 && (
              <button onClick={handleUnstageAll} disabled={busy !== null} className={btnSecondary}>
                <Icon name="minus" size={13} />
                Unstage all
              </button>
            )}
            {workingCount > 0 && (
              <button onClick={handleStageAll} disabled={busy !== null} className={btnSecondary}>
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
                    onToggle={handleToggle}
                    onShowDiff={handleShowDiff}
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
                    onToggle={handleToggle}
                    onShowDiff={handleShowDiff}
                    onDiscard={(row) => setConfirmDiscard(row)}
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
                    onToggle={handleToggle}
                    onShowDiff={handleShowDiff}
                    onDiscard={(row) => setConfirmDiscard(row)}
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
                      onClick={handleShowBlame}
                      className={`text-[10px] inline-flex items-center gap-1 transition-colors ${blame?.path === diff.path ? 'text-accent' : 'text-ink-faint hover:text-ink'}`}
                      title="Toggle git blame"
                    >
                      <Icon name="gitBranch" size={11} />
                      {blame?.path === diff.path ? 'Hide blame' : 'Blame'}
                    </button>
                    <button onClick={() => { setDiff(null); setBlame(null); }} className="text-[10px] text-ink-faint hover:text-ink flex items-center gap-1">
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
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && commitMessage.trim() && stagedCount > 0) handleCommit();
                }}
                placeholder={stagedCount === 0 ? 'Stage changes to enable commit...' : 'Commit message (Ctrl+Enter)'}
                rows={2}
                disabled={stagedCount === 0}
                className="w-full bg-base border border-border rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y disabled:opacity-50"
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-[11px] text-ink-faint">{stagedCount === 0 ? 'Nothing staged — stage files above to commit.' : `${stagedCount} file(s) will be committed.`}</p>
                <button onClick={handleCommit} disabled={!commitMessage.trim() || stagedCount === 0 || busy !== null} className={btnPrimary}>
                  <Icon name="commit" size={13} />
                  Commit
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Stash */}
      <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-surface-2 flex-wrap">
          <p className="text-xs font-semibold text-ink">Stash</p>
          <span className="text-[11px] text-ink-faint">{stashes.length} saved</span>
        </div>
        <div className="p-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={stashMessage}
              onChange={(e) => setStashMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleStashSave(); }}
              placeholder="Stash message (optional)"
              className="flex-1 min-w-[160px] bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <button onClick={handleStashSave} disabled={busy !== null || !dirty} className={btnSecondary} title="Save working tree to stash">
              <Icon name="download" size={13} />
              Stash
            </button>
          </div>
        </div>
        {stashes.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">No stashes yet. Save your WIP changes before switching branches.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {stashes.map((stash) => (
              <li key={stash.ref} className="flex items-center gap-2 px-4 py-2 text-xs">
                <span className="font-mono text-ink-faint shrink-0">{stash.ref}</span>
                <span className="flex-1 min-w-0 text-ink truncate" title={stash.message}>{stash.message}</span>
                <button onClick={() => handleStashAction('pop', stash.index)} disabled={busy !== null} className="text-[10px] text-ink-faint hover:text-accent transition-colors" title="Pop (restore & remove)">Pop</button>
                <button onClick={() => handleStashAction('apply', stash.index)} disabled={busy !== null} className="text-[10px] text-ink-faint hover:text-accent transition-colors" title="Apply (restore & keep)">Apply</button>
                <button onClick={() => handleStashAction('drop', stash.index)} disabled={busy !== null} className="text-[10px] text-ink-faint hover:text-danger transition-colors" title="Drop stash">Drop</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent commits */}
      <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-surface-2">
          <p className="text-xs font-semibold text-ink">Recent commits</p>
        </div>
        {commits.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">No commits yet in this branch.</p>
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

      <ConfirmDialog
        isOpen={confirmPush}
        title="Push to Remote"
        message={`Push ${status.ahead} commit(s) on "${status.branch}" to ${status.upstream || 'its remote'}?`}
        confirmLabel="Push"
        confirmVariant="danger"
        onConfirm={handlePush}
        onCancel={() => setConfirmPush(false)}
      />

      <ConfirmDialog
        isOpen={confirmDiscard !== null}
        title="Discard Changes"
        message={`Discard all working-tree changes to "${confirmDiscard?.path}"? This cannot be undone.`}
        confirmLabel="Discard"
        confirmVariant="danger"
        onConfirm={handleDiscard}
        onCancel={() => setConfirmDiscard(null)}
      />
    </div>
  );
}
