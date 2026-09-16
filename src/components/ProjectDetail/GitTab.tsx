import { useCallback, useEffect, useRef, useState } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import { ConfirmDialog } from '../Modals';
import type { ProjectRuntime } from '../../hooks/useProjects';
import type { SimpleResult } from '../../data/ipcCore';
import {
  EMPTY_STATUS,
  BranchBar,
  ChangesSection,
  type BlameLine,
  type DiffState,
  type GitCommitView,
  type GitStashView,
  type GitStatusEntry,
  type GitStatusView,
} from './gitTabSections';
import { StashSection, CommitsSection, NotARepoView } from './gitTabExtras';
import { useDetailI18n } from './useDetailI18n';

interface Notice {
  type: 'error' | 'success';
  message: string;
}

interface GitTabProps {
  project: ProjectRuntime | null;
  active?: boolean;
}

export default function GitTab(props: GitTabProps) {
  return <GitProjectTab key={props.project?.path} {...props} />;
}

function GitProjectTab({ project, active = true }: GitTabProps) {
  const t = useDetailI18n();
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
  const actionRef = useRef(false);
  const requestRef = useRef(0);
  const diffRequest = useRef(0);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  useEffect(() => () => { requestRef.current++; diffRequest.current++; }, []);

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    const request = ++requestRef.current;
    diffRequest.current++;
    setLoading(true);
    try {
    const [statusResult, logResult, stashResult] = await Promise.all([
      ipc.gitStatus(projectPath),
      ipc.gitLog(projectPath),
      ipc.gitStashList(projectPath),
    ]);
    if (request !== requestRef.current) return;
    setLoading(false);
    if (statusResult.success) {
      setStatus({ ...EMPTY_STATUS, ...statusResult } as GitStatusView);
    } else {
      setNotice({ type: 'error', message: statusResult.error || t('Failed to read git status') });
    }
    if (logResult.success) setCommits((logResult.commits as unknown as GitCommitView[]) || []);
    if (stashResult.success) setStashes((stashResult.stashes as GitStashView[]) || []);
    setDiff(null);
    setBlame(null);
    } catch (error) {
      if (request === requestRef.current) setNotice({ type: 'error', message: String(error) });
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [projectPath, t]);

  useEffect(() => {
    if (active && !actionRef.current) void refresh();
  }, [refresh, active]);

  const runAction = async (action: () => Promise<SimpleResult | undefined>, label: string): Promise<boolean> => {
    if (actionRef.current || loading) return false;
    actionRef.current = true;
    setBusy(label);
    setNotice(null);
    try {
      const result = await action();
      if (!result?.success) {
        setNotice({ type: 'error', message: result?.error || t('{label} failed', { label: t(label) }) });
        return false;
      }
      return true;
    } catch (error) {
      setNotice({ type: 'error', message: (error instanceof Error ? error.message : String(error)) || `${label} failed` });
      return false;
    } finally {
      await refresh();
      actionRef.current = false;
      setBusy(null);
    }
  };

  const handleToggle = async (entry: GitStatusEntry, section: string): Promise<void> => {
    const pathToMove = entry.path;
    await runAction(
      () => (section === 'staged' ? ipc.gitUnstage(projectPath!, [pathToMove]) : ipc.gitStage(projectPath!, [pathToMove])),
      section === 'staged' ? 'Unstaging' : 'Staging'
    );
  };

  const handleStageAll = async (): Promise<void> => {
    await runAction(() => ipc.gitStage(projectPath!, []), 'Staging all');
  };

  const handleUnstageAll = async (): Promise<void> => {
    await runAction(() => ipc.gitUnstage(projectPath!, []), 'Unstaging all');
  };

  const handleCommit = async (): Promise<void> => {
    const message = commitMessage.trim();
    if (!message) return;
    if (await runAction(() => ipc.gitCommit(projectPath!, message), 'Committing')) {
      setCommitMessage('');
      setNotice({ type: 'success', message: t('Committed: {message}', { message: message.slice(0, 60) }) });
    }
  };

  const handlePull = async (): Promise<void> => {
    const ok = await runAction(() => ipc.gitPull(projectPath!), 'Pulling');
    if (ok) {
      setNotice({ type: 'success', message: t('Pull completed') });
    }
  };

  const handlePush = async (): Promise<void> => {
    setConfirmPush(false);
    const ok = await runAction(() => ipc.gitPush(projectPath!), 'Pushing');
    if (ok) {
      setNotice({ type: 'success', message: t('Push completed') });
    }
  };

  const handleCheckout = async (): Promise<void> => {
    const name = branchInput.trim();
    if (!name) return;
    if (await runAction(() => ipc.gitCheckout(projectPath!, name, createBranch), 'Switching branch')) {
      setBranchInput('');
      setCreateBranch(false);
      setNotice({ type: 'success', message: t('Switched to {branch}', { branch: name }) });
    }
  };

  const handleInit = async (): Promise<void> => {
    setConfirmInit(false);
    if (await runAction(() => ipc.gitInit(projectPath!), 'Initializing')) {
      setNotice({ type: 'success', message: t('Git repository initialized') });
    }
  };

  const handleShowDiff = async (entry: GitStatusEntry, section: string): Promise<void> => {
    const request = ++diffRequest.current;
    const staged = section === 'staged';
    const isOpen = diff?.path === entry.path && diff?.staged === staged;
    if (isOpen) {
      setDiff(null);
      setBlame(null);
      return;
    }
    setBlame(null);
    const result = await ipc.gitDiff(projectPath!, entry.path, staged).catch(error => ({ success: false, error: String(error), diff: '' }));
    if (request !== diffRequest.current) return;
    setDiff({ path: entry.path, staged, text: result.success ? result.diff || '' : result.error || t('Failed to load diff') });
  };

  const handleDiscard = async (): Promise<void> => {
    const filePath = confirmDiscard?.path;
    setConfirmDiscard(null);
    if (!filePath) return;
    if (await runAction(() => ipc.gitDiscard(projectPath!, filePath), 'Discarding')) {
      setDiff(null);
      setNotice({ type: 'success', message: t('Discarded changes to {file}', { file: filePath }) });
    }
  };

  const handleStashSave = async (): Promise<void> => {
    const ok = await runAction(() => ipc.gitStashPush(projectPath!, stashMessage), 'Stashing');
    if (ok) {
      setStashMessage('');
      setNotice({ type: 'success', message: t('Working tree stashed') });
    }
  };

  const handleStashAction = async (action: string, index: number): Promise<void> => {
    const ok = await runAction(
      () => (action === 'pop' ? ipc.gitStashPop(projectPath!, index) : action === 'apply' ? ipc.gitStashApply(projectPath!, index) : ipc.gitStashDrop(projectPath!, index)),
      `Stash ${action}`
    );
    if (ok) {
      setNotice({ type: 'success', message: t(`Stash ${action === 'pop' ? 'popped' : action === 'apply' ? 'applied' : 'dropped'}`) });
    }
  };

  const handleShowBlame = async (): Promise<void> => {
    if (!diff) return;
    if (blame?.path === diff.path) {
      setBlame(null);
      return;
    }
    const request = ++diffRequest.current;
    const result = await ipc.gitBlame(projectPath!, diff.path).catch(error => ({ success: false, error: String(error) }));
    if (request !== diffRequest.current) return;
    if (result.success) setBlame({ path: diff.path, lines: (result as { lines?: BlameLine[] }).lines || [] });
    else setNotice({ type: 'error', message: result.error || t('Failed to load blame') });
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
      <>
        {notice && <p role="alert">{notice.message}</p>}
        <NotARepoView onInitialize={() => setConfirmInit(true)} />
        <ConfirmDialog
          isOpen={confirmInit}
          title={t('Initialize Git Repository')}
          message={t('Create a new git repository (.git) inside {path}?', { path: projectPath })}
          confirmLabel={t('Initialize')}
          onConfirm={handleInit}
          onCancel={() => setConfirmInit(false)}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {notice && (
        <p role={notice.type === 'error' ? 'alert' : 'status'} className={`text-xs px-3 py-2 rounded-lg border ${notice.type === 'success' ? 'text-success border-success/20 bg-success/10' : 'text-danger border-danger/20 bg-danger/10'}`}>
          {notice.message}
        </p>
      )}

      {(busy || loading) && <p role="status" className="text-sm text-accent">{t(busy || 'Refreshing repository')}…</p>}
      <fieldset disabled={Boolean(busy) || loading} className="space-y-4 min-w-0">
      <BranchBar
        status={status}
        branchInput={branchInput}
        setBranchInput={setBranchInput}
        createBranch={createBranch}
        setCreateBranch={setCreateBranch}
        busy={busy}
        onCheckout={handleCheckout}
        onPull={handlePull}
        onRequestPush={() => setConfirmPush(true)}
        onRefresh={() => { setNotice(null); refresh(); }}
      />

      <ChangesSection
        status={status}
        stagedCount={stagedCount}
        workingCount={workingCount}
        dirty={dirty}
        diff={diff}
        blame={blame}
        busy={busy}
        commitMessage={commitMessage}
        setCommitMessage={setCommitMessage}
        onToggle={handleToggle}
        onStageAll={handleStageAll}
        onUnstageAll={handleUnstageAll}
        onCommit={handleCommit}
        onShowDiff={handleShowDiff}
        onShowBlame={handleShowBlame}
        onCloseDiff={() => { diffRequest.current++; setDiff(null); setBlame(null); }}
        onDiscard={(row) => setConfirmDiscard(row)}
      />

      <StashSection
        stashes={stashes}
        stashMessage={stashMessage}
        setStashMessage={setStashMessage}
        busy={busy}
        dirty={dirty}
        onSave={handleStashSave}
        onAction={(action, index) => action === 'drop' ? setDropIndex(index) : void handleStashAction(action, index)}
      />

      <CommitsSection commits={commits} />
      </fieldset>
      <ConfirmDialog isOpen={dropIndex !== null} title={t('Drop stash')} message={t('Remove stash@{{index}}? This removes the saved work from the stash list.', { index: dropIndex ?? '' })} confirmLabel={t('Drop')} confirmVariant="danger" onCancel={() => setDropIndex(null)} onConfirm={() => { const index = dropIndex; setDropIndex(null); if (index !== null) void handleStashAction('drop', index); }} />

      <ConfirmDialog
        isOpen={confirmPush}
        title={t('Push to Remote')}
        message={status.upstream ? t('Push {count} commit(s) on "{branch}" to {upstream}?', { count: status.ahead, branch: status.branch || '', upstream: status.upstream }) : t('Publish "{branch}" to origin and set its upstream?', { branch: status.branch || '' })}
        confirmLabel={t('Push')}
        confirmVariant="danger"
        onConfirm={handlePush}
        onCancel={() => setConfirmPush(false)}
      />

      <ConfirmDialog
        isOpen={confirmDiscard !== null}
        title={t('Discard Changes')}
        message={t(status.untracked.includes(confirmDiscard?.path || '') ? 'Move untracked file "{file}" to the recycle bin?' : 'Discard working-tree changes to "{file}"? This cannot be undone.', { file: confirmDiscard?.path })}
        confirmLabel={t('Discard')}
        confirmVariant="danger"
        onConfirm={handleDiscard}
        onCancel={() => setConfirmDiscard(null)}
      />
    </div>
  );
}
