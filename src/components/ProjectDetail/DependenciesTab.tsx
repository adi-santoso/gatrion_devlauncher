import { useCallback, useEffect, useState } from 'react';
import Icon from '../Common/Icon';
import * as ipc from '../../utils/ipcRenderer';
import { ConfirmDialog } from '../Modals';
import type { ProjectRuntime } from '../../hooks/useProjects';
import type { SimpleResult } from '../../data/ipcCore';
import { composerOutdated, composerUpdate, goOutdated, goUpdate, pipOutdated, pipUpdate, cargoOutdated, cargoUpdate, OutdatedDependency } from '../../data/dependencies';

const btnBase = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap';
const btnSecondary = `${btnBase} bg-surface-3 hover:bg-surface-2 text-ink-soft hover:text-ink border border-border disabled:opacity-50 disabled:cursor-not-allowed`;
const btnPrimary = `${btnBase} px-3.5 bg-accent hover:bg-accent-hover text-white font-semibold shadow-glow disabled:opacity-50 disabled:cursor-not-allowed`;

interface Notice {
  type: 'info' | 'error' | 'success';
  message: string;
}

type ManagerKey = 'npm' | 'composer' | 'go' | 'pip' | 'cargo';

interface ManagerState {
  present: boolean;
  loading: boolean;
  outdated: OutdatedDependency[];
  error?: string;
  notice?: string;
}

interface ConfirmUpdateTarget {
  manager: ManagerKey;
  name: string | null;
  target: string;
}

interface ManagerUi {
  key: ManagerKey;
  label: string;
  sub: string;
  updateLabel: string;
  backupNote: string;
  nothingMsg: string;
  icon: string;
  supportsUpdateAll: boolean;
}

const MANAGER_UI: Record<ManagerKey, ManagerUi> = {
  npm: {
    key: 'npm', label: 'npm (Node.js)', sub: 'npm outdated', updateLabel: 'npm update',
    backupNote: 'package.json + lockfile',
    nothingMsg: 'No package.json found in this project.',
    icon: 'package', supportsUpdateAll: true,
  },
  composer: {
    key: 'composer', label: 'Composer (PHP)', sub: 'composer outdated --direct', updateLabel: 'composer update',
    backupNote: 'composer.json + composer.lock',
    nothingMsg: 'No composer.json found in this project.',
    icon: 'package', supportsUpdateAll: true,
  },
  go: {
    key: 'go', label: 'Go modules', sub: 'go list -m -u', updateLabel: 'go get @latest',
    backupNote: 'go.mod (no backup — module file is the source of truth)',
    nothingMsg: 'No go.mod found in this project.',
    icon: 'package', supportsUpdateAll: false,
  },
  pip: {
    key: 'pip', label: 'Python (pip)', sub: 'pip list --outdated', updateLabel: 'pip install --upgrade',
    backupNote: 'requirements.txt (when present)',
    nothingMsg: 'No requirements.txt or pyproject.toml found in this project.',
    icon: 'package', supportsUpdateAll: false,
  },
  cargo: {
    key: 'cargo', label: 'Rust (Cargo)', sub: 'cargo outdated', updateLabel: 'cargo update -p',
    backupNote: 'Cargo.toml + Cargo.lock',
    nothingMsg: 'No Cargo.toml found in this project.',
    icon: 'package', supportsUpdateAll: false,
  },
};

const INITIAL_MANAGER: Record<ManagerKey, ManagerState> = {
  npm: { present: false, loading: false, outdated: [] },
  composer: { present: false, loading: false, outdated: [] },
  go: { present: false, loading: false, outdated: [] },
  pip: { present: false, loading: false, outdated: [] },
  cargo: { present: false, loading: false, outdated: [] },
};

function ManagerSection({
  ui,
  state,
  busy,
  onRefresh,
  onUpdateAll,
  onInitUpdate,
}: {
  ui: ManagerUi;
  state: ManagerState;
  busy: string | null;
  onRefresh: () => void;
  onUpdateAll: () => void;
  onInitUpdate: (item: OutdatedDependency) => void;
}) {
  if (!state.present) return null;
  const isEmpty = state.outdated.length === 0;

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-surface-2 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-ink">{ui.label}</p>
          <p className="text-[10px] text-ink-faint mt-0.5">Runs <span className="font-mono">{ui.sub}</span></p>
        </div>
        <div className="flex items-center gap-2">
          {ui.supportsUpdateAll && state.outdated.length > 0 && (
            <button onClick={onUpdateAll} disabled={busy !== null} className={btnPrimary} title={ui.updateLabel}>
              <Icon name="download" size={13} />
              Update all
            </button>
          )}
          <button onClick={onRefresh} disabled={busy !== null} className={btnSecondary} title="Re-check">
            <Icon name="restart" size={13} />
            Re-check
          </button>
        </div>
      </div>

      {state.notice && (
        <p className="text-xs px-4 py-2.5 text-ink-soft bg-surface-2 border-b border-border">{state.notice}</p>
      )}

      {state.error && (
        <p className="text-xs px-4 py-2.5 text-danger">{state.error}</p>
      )}

      {state.loading && !state.error ? (
        <div className="p-4 space-y-3">
          <div className="skeleton h-9 w-full" />
          <div className="skeleton h-9 w-full" />
          <div className="skeleton h-9 w-full" />
        </div>
      ) : isEmpty ? (
        <div className="py-8 text-center">
          <div className="w-10 h-10 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto mb-2">
            <Icon name="check" size={18} />
          </div>
          <h3 className="font-display font-bold text-sm text-ink">Up to date</h3>
          <p className="text-xs text-ink-faint mt-1">No outdated {ui.key === 'go' ? 'modules' : 'packages'} found.</p>
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
                <th className="px-4 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {state.outdated.map((item) => (
                <tr key={item.name} className="hover:bg-surface-2/60 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-ink truncate max-w-[260px]" title={item.name}>{item.name}</td>
                  <td className="px-3 py-2.5 font-mono text-ink-faint">{item.current}</td>
                  <td className="px-3 py-2.5 font-mono text-warning">{item.wanted}</td>
                  <td className="px-3 py-2.5 font-mono text-success">{item.latest}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => onInitUpdate(item)}
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

      <p className="text-[10px] text-ink-faint px-4 py-2 border-t border-border/50">
        Backups: {ui.backupNote}. Updates run via <span className="font-mono">{ui.updateLabel}</span>.
      </p>
    </div>
  );
}

export default function DependenciesTab({ project }: { project: ProjectRuntime | null }) {
  const projectPath = project?.path;
  const [managers, setManagers] = useState<Record<ManagerKey, ManagerState>>(INITIAL_MANAGER);
  const [runningRefresh, setRunningRefresh] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState<ConfirmUpdateTarget | null>(null);

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    setRunningRefresh(true);
    setNotice(null);

    // Each adapter normalizes the manager's result to a common shape, so the
    // various domain wrappers (with different optional flags) can be unified.
    const adapters: Array<[ManagerKey, () => Promise<{ present: boolean; outdated: OutdatedDependency[]; error?: string; notice?: string }>]> = [
      ['npm', async () => {
        const res = await ipc.npmOutdated(projectPath);
        if (!res.success) return { present: false, outdated: [], error: res.error || 'Failed' };
        return { present: (res as { hasPackageJson?: boolean }).hasPackageJson === true, outdated: (res as { outdated?: OutdatedDependency[] }).outdated || [] };
      }],
      ['composer', async () => {
        const res = await composerOutdated(projectPath);
        if (!res.success) return { present: false, outdated: [], error: res.error || 'Failed' };
        return { present: res.hasComposerJson === true, outdated: res.outdated || [] };
      }],
      ['go', async () => {
        const res = await goOutdated(projectPath);
        if (!res.success) return { present: false, outdated: [], error: res.error || 'Failed' };
        return { present: res.hasGoMod === true, outdated: res.outdated || [] };
      }],
      ['pip', async () => {
        const res = await pipOutdated(projectPath);
        if (!res.success) return { present: false, outdated: [], error: res.error || 'Failed' };
        return { present: res.hasPipManifest === true, outdated: res.outdated || [] };
      }],
      ['cargo', async () => {
        const res = await cargoOutdated(projectPath);
        if (!res.success) return { present: false, outdated: [], error: res.error || 'Failed' };
        return {
          present: res.hasCargo === true,
          outdated: res.outdated || [],
          notice: res.pluginMissing ? 'The cargo-outdated plugin is not installed. Run `cargo install cargo-outdated` to enable dependency scanning.' : undefined,
        };
      }],
    ];

    const results = await Promise.all(adapters.map(async ([key, fn]) => {
      try {
        const r = await fn();
        return { key, ...r };
      } catch (e) {
        return { key, present: false, outdated: [], error: (e instanceof Error ? e.message : String(e)) };
      }
    }));

    const next: Record<ManagerKey, ManagerState> = { ...INITIAL_MANAGER };
    let presentCount = 0;
    for (const r of results) {
      next[r.key as ManagerKey] = {
        present: r.present,
        loading: false,
        outdated: r.outdated || [],
        error: r.error,
        notice: (r as { notice?: string }).notice,
      };
      if (r.present) presentCount += 1;
    }
    setManagers(next);

    if (presentCount === 0) {
      setNotice({ type: 'info', message: 'No supported dependency manifest found. Supported: package.json, composer.json, go.mod, requirements.txt/pyproject.toml, Cargo.toml.' });
    }
    setRunningRefresh(false);
  }, [projectPath]);

  useEffect(() => {
    // Show loading for known-present managers lazily (npm only if package.json).
    refresh();
  }, [refresh]);

  const handleUpdate = async (target: ConfirmUpdateTarget): Promise<void> => {
    setConfirmUpdate(null);
    setBusy(`${target.manager}:${target.name || 'all'}`);
    setNotice(null);
    try {
      let result: SimpleResult;
      switch (target.manager) {
        case 'npm': result = await ipc.npmUpdate(projectPath!, target.name); break;
        case 'composer': result = await composerUpdate(projectPath!, target.name); break;
        case 'go': {
          if (!target.name) { setNotice({ type: 'error', message: 'Go updates are applied one module at a time.' }); setBusy(null); return; }
          result = await goUpdate(projectPath!, target.name);
          break;
        }
        case 'pip': {
          if (!target.name) { setNotice({ type: 'error', message: 'pip updates are applied one package at a time.' }); setBusy(null); return; }
          result = await pipUpdate(projectPath!, target.name);
          break;
        }
        case 'cargo': {
          if (!target.name) { setNotice({ type: 'error', message: 'Cargo updates are applied one package at a time.' }); setBusy(null); return; }
          result = await cargoUpdate(projectPath!, target.name);
          break;
        }
      }
      if (result.success) {
        setNotice({ type: 'success', message: `${target.name ? `"${target.name}"` : 'All packages'} updated.` });
        await refresh();
      } else {
        setNotice({ type: 'error', message: result.error || 'Update failed.' });
      }
    } catch (error) {
      setNotice({ type: 'error', message: (error instanceof Error ? error.message : String(error)) || 'Update failed.' });
    } finally {
      setBusy(null);
    }
  };

  const presentManagers = Object.values(MANAGER_UI).filter((ui) => managers[ui.key].present);
  const totalOutdated = presentManagers.reduce((sum, ui) => sum + managers[ui.key].outdated.length, 0);

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

      {runningRefresh && presentManagers.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl shadow-card p-4 space-y-3">
          <div className="skeleton h-5 w-44" />
          <div className="skeleton h-9 w-full" />
          <div className="skeleton h-9 w-full" />
        </div>
      ) : (
        presentManagers.map((ui) => (
          <ManagerSection
            key={ui.key}
            ui={ui}
            state={managers[ui.key]}
            busy={busy}
            onRefresh={() => refresh()}
            onUpdateAll={() => setConfirmUpdate({ manager: ui.key, name: null, target: 'all' })}
            onInitUpdate={(item) => setConfirmUpdate({ manager: ui.key, name: item.name, target: `${item.name}@${item.latest}` })}
          />
        ))
      )}

      <ConfirmDialog
        isOpen={confirmUpdate !== null}
        title="Update Dependencies"
        message={confirmUpdate?.name === null
          ? `Update all outdated packages in ${MANAGER_UI[confirmUpdate!.manager]?.label || 'this project'} to their latest versions?`
          : `Update "${confirmUpdate?.name}" to ${confirmUpdate?.target}?`}
        confirmLabel="Update"
        onConfirm={() => handleUpdate(confirmUpdate!)}
        onCancel={() => setConfirmUpdate(null)}
      />
      <p className="text-[11px] text-ink-faint">Total: {totalOutdated} outdated across {presentManagers.length} manager(s).</p>
    </div>
  );
}