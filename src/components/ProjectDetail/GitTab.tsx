import { useCallback, useEffect, useState } from 'react';
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

interface Notice {
  type: 'error' | 'success';
  message: string;
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
      <>
        <NotARepoView onInitialize={() => setConfirmInit(true)} />
        <ConfirmDialog
          isOpen={confirmInit}
          title="Initialize Git Repository"
          message={`Create a new git repository (.git) inside ${projectPath}?`}
          confirmLabel="Initialize"
          onConfirm={handleInit}
          onCancel={() => setConfirmInit(false)}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {notice && (
        <p className={`text-xs px-3 py-2 rounded-lg border ${notice.type === 'success' ? 'text-success border-success/20 bg-success/10' : 'text-danger border-danger/20 bg-danger/10'}`}>
          {notice.message}
        </p>
      )}

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
        onCloseDiff={() => { setDiff(null); setBlame(null); }}
        onDiscard={(row) => setConfirmDiscard(row)}
      />

      <StashSection
        stashes={stashes}
        stashMessage={stashMessage}
        setStashMessage={setStashMessage}
        busy={busy}
        dirty={dirty}
        onSave={handleStashSave}
        onAction={handleStashAction}
      />

      <CommitsSection commits={commits} />

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
