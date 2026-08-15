import { useCallback, useEffect, useState } from 'react';
import Icon from '../Common/Icon';
import * as ipc from '../../utils/ipcRenderer';
import { ConfirmDialog } from '../Modals';
import type { ProjectRuntime } from '../../hooks/useProjects';
import type { SimpleResult } from '../../data/ipcCore';

const btnBase = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap';
const btnSecondary = `${btnBase} bg-surface-3 hover:bg-surface-2 text-ink-soft hover:text-ink border border-border disabled:opacity-50 disabled:cursor-not-allowed`;
const btnPrimary = `${btnBase} px-3.5 bg-accent hover:bg-accent-hover text-white font-semibold shadow-glow disabled:opacity-50 disabled:cursor-not-allowed`;

interface OutdatedPackage {
  name: string;
  current: string;
  wanted: string;
  latest: string;
  type: string;
  [key: string]: unknown;
}

interface Notice {
  type: 'info' | 'error' | 'success';
  message: string;
}

interface OutdatedResult extends SimpleResult {
  outdated?: OutdatedPackage[];
  hasPackageJson?: boolean;
}

interface ConfirmUpdateTarget {
  name: string | null;
  target: string;
}

interface DependenciesTabProps {
  project: ProjectRuntime | null;
}

export default function DependenciesTab({ project }: DependenciesTabProps) {
  const projectPath = project?.path;
  const [outdated, setOutdated] = useState<OutdatedPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState<ConfirmUpdateTarget | null>(null); // { name, target }

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    const result = await ipc.npmOutdated(projectPath);
    setLoading(false);
    if (result.success) {
      const view = result as OutdatedResult;
      setOutdated(view.outdated || []);
      if (!view.hasPackageJson) setNotice({ type: 'info', message: 'No package.json found in this project.' });
    } else {
      setNotice({ type: 'error', message: result.error || 'Failed to check outdated packages' });
    }
  }, [projectPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleUpdate = async (name: string | null = null): Promise<void> => {
    setConfirmUpdate(null);
    setBusy(name || 'all');
    setNotice(null);
    try {
      const result = await ipc.npmUpdate(projectPath!, name);
      if (result.success) {
        setNotice({ type: 'success', message: `${name ? `"${name}"` : 'All packages'} updated. package.json was backed up before the change.` });
        await refresh();
      } else {
        setNotice({ type: 'error', message: result.error || 'Update failed. A backup of package.json was created — you can restore it manually.' });
      }
    } finally {
      setBusy(null);
    }
  };

  if (loading && outdated.length === 0 && !notice) {
    return (
      <div className="bg-surface border border-border rounded-xl shadow-card p-4 space-y-3">
        <div className="skeleton h-5 w-44" />
        <div className="skeleton h-9 w-full" />
        <div className="skeleton h-9 w-full" />
        <div className="skeleton h-9 w-full" />
      </div>
    );
  }

  const isEmpty = !notice && outdated.length === 0;

  return (
    <div className="space-y-4">
      {notice && (
        <p className={`text-xs px-3 py-2 rounded-lg border ${
          notice.type === 'success' ? 'text-success border-success/20 bg-success/10'
            : notice.type === 'error' ? 'text-danger border-danger/20 bg-danger/10'
              : 'text-ink-soft border-border bg-surface-2'
        }`}>
          {notice.message}
        </p>
      )}

      <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-surface-2 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-ink">Outdated packages</p>
            <p className="text-[10px] text-ink-faint mt-0.5">Runs <span className="font-mono">npm outdated</span> — updating backs up package.json & lockfile first.</p>
          </div>
          <div className="flex items-center gap-2">
            {outdated.length > 0 && (
              <button onClick={() => setConfirmUpdate({ name: null, target: 'all' })} disabled={busy !== null} className={btnPrimary} title="npm update">
                <Icon name="download" size={13} />
                Update all
              </button>
            )}
            <button onClick={refresh} disabled={busy !== null} className={btnSecondary} title="Re-check">
              <Icon name="restart" size={13} />
              Re-check
            </button>
          </div>
        </div>

        {isEmpty ? (
          <div className="py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto mb-3">
              <Icon name="check" size={20} />
            </div>
            <h3 className="font-display font-bold text-base text-ink">All packages up to date</h3>
            <p className="text-xs text-ink-faint mt-1.5">No outdated dependencies found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-ink-faint border-b border-border/50">
                  <th className="px-4 py-2 font-medium">Package</th>
                  <th className="px-3 py-2 font-medium">Current</th>
                  <th className="px-3 py-2 font-medium">Wanted</th>
                  <th className="px-3 py-2 font-medium">Latest</th>
                  <th className="px-3 py-2 font-medium hidden sm:table-cell">Type</th>
                  <th className="px-4 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {outdated.map((item) => (
                  <tr key={item.name} className="hover:bg-surface-2/60 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-ink truncate max-w-[240px]" title={item.name}>{item.name}</td>
                    <td className="px-3 py-2.5 font-mono text-ink-faint">{item.current}</td>
                    <td className="px-3 py-2.5 font-mono text-warning">{item.wanted}</td>
                    <td className="px-3 py-2.5 font-mono text-success">{item.latest}</td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        item.type === 'dependency' ? 'text-accent border-accent/25 bg-accent/10' : 'text-ink-soft border-border bg-surface-3'
                      }`}>
                        {item.type === 'dependency' ? 'dependency' : 'dev'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => setConfirmUpdate({ name: item.name, target: `${item.name}@${item.latest}` })}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1 text-[10px] text-ink-faint hover:text-accent transition-colors"
                        title={`Update ${item.name} to ${item.latest}`}
                      >
                        <Icon name="download" size={11} />
                        Update
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-ink-faint">
        Backups are written as <span className="font-mono">package.json.bak-&lt;timestamp&gt;</span> (and the lockfile, if present) in the project folder.
      </p>

      <ConfirmDialog
        isOpen={confirmUpdate !== null}
        title="Update Dependencies"
        message={confirmUpdate?.name === null
          ? 'Update all outdated packages to their latest versions? package.json and the lockfile will be backed up first.'
          : `Update "${confirmUpdate?.name}" to ${confirmUpdate?.target}? package.json and the lockfile will be backed up first.`}
        confirmLabel="Update"
        onConfirm={() => handleUpdate(confirmUpdate?.name)}
        onCancel={() => setConfirmUpdate(null)}
      />
    </div>
  );
}
