import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../Common/Icon';
import * as ipc from '../../utils/ipcRenderer';
import { ConfirmDialog } from '../Modals';
import type { ProjectRuntime } from '../../hooks/useProjects';
import type { SimpleResult } from '../../data/ipcCore';
import { composerOutdated, composerUpdate, goOutdated, goUpdate, pipOutdated, pipUpdate, cargoOutdated, cargoUpdate, OutdatedDependency } from '../../data/dependencies';
import { useDetailI18n } from './useDetailI18n';

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
    key: 'npm', label: 'Node.js package manager', sub: 'Detected manager outdated scan', updateLabel: 'detected manager compatible update',
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
    backupNote: 'go.mod + go.sum',
    nothingMsg: 'No go.mod found in this project.',
    icon: 'package', supportsUpdateAll: false,
  },
  pip: {
    key: 'pip', label: 'Python project virtual environment', sub: 'project Python -m pip list --outdated', updateLabel: 'project Python -m pip install --upgrade',
    backupNote: 'requirements.txt / pyproject.toml. Updates affect installed packages; pins are not rewritten',
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
  const t = useDetailI18n();
  if (!state.present && !state.error) return null;
  const isEmpty = state.outdated.length === 0;

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-surface-2 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-ink">{t(ui.label)}</p>
          <p className="text-[10px] text-ink-faint mt-0.5">{t('Runs')} <span className="font-mono">{t(ui.sub)}</span></p>
        </div>
        <div className="flex items-center gap-2">
          {ui.supportsUpdateAll && state.outdated.length > 0 && (
            <button onClick={onUpdateAll} disabled={busy !== null} className={btnPrimary} title={ui.updateLabel}>
              <Icon name="download" size={13} />
              {t('Update all')}
            </button>
          )}
          <button onClick={onRefresh} disabled={busy !== null} className={btnSecondary} title={t('Re-check')}>
            <Icon name="restart" size={13} />
            {t('Re-check')}
          </button>
        </div>
      </div>

      {state.notice && (
        <p className="text-xs px-4 py-2.5 text-ink-soft bg-surface-2 border-b border-border">{t(state.notice)}</p>
      )}

      {state.error && (
        <p role="alert" className="text-xs px-4 py-2.5 text-danger">{state.error}</p>
      )}

      {state.error || state.notice ? <p role="status" className="px-4 py-3 text-sm text-warning">{t('Dependency health is unavailable until a scan completes successfully.')}</p> : state.loading ? (
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
          <h3 className="font-display font-bold text-sm text-ink">{t('Up to date')}</h3>
          <p className="text-xs text-ink-faint mt-1">{t(ui.key === 'go' ? 'No outdated modules found.' : 'No outdated packages found.')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-ink-faint border-b border-border/50">
                <th className="px-4 py-2 font-medium">{t('Package')}</th>
                <th className="px-3 py-2 font-medium">{t('Current')}</th>
                <th className="px-3 py-2 font-medium">{t('Wanted')}</th>
                <th className="px-3 py-2 font-medium">{t('Latest')}</th>
                <th className="px-4 py-2 font-medium text-right">{t('Action')}</th>
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
                      title={t('Update {name} within manager constraints', { name: item.name })}
                    >
                      <Icon name="download" size={11} />
                      {t('Update')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-ink-faint px-4 py-2 border-t border-border/50">
        {t('Backups')}: {t(ui.backupNote)}. {t('Updates run via')} <span className="font-mono">{t(ui.updateLabel)}</span>.
      </p>
    </div>
  );
}

export default function DependenciesTab({ project }: { project: ProjectRuntime | null }) {
  return <ProjectDependencies key={project?.path} project={project} />;
}
function ProjectDependencies({ project }: { project: ProjectRuntime | null }) {
  const t = useDetailI18n();
  const projectPath = project?.path;
  const [managers, setManagers] = useState<Record<ManagerKey, ManagerState>>(INITIAL_MANAGER);
  const [runningRefresh, setRunningRefresh] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState<ConfirmUpdateTarget | null>(null);
  const requestRef = useRef(0);
  const actionRef = useRef(false);
  useEffect(() => () => { requestRef.current++; }, []);

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    const request = ++requestRef.current;
    setRunningRefresh(true);
    setNotice(previous => previous?.type === 'info' ? null : previous);

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
    if (request !== requestRef.current) return;

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

    if (presentCount === 0 && !results.some(result => result.error)) {
      setNotice({ type: 'info', message: t('No supported dependency manifest found. Supported: package.json, composer.json, go.mod, requirements.txt/pyproject.toml, Cargo.toml.') });
    }
    setRunningRefresh(false);
  }, [projectPath, t]);

  useEffect(() => {
    // Show loading for known-present managers lazily (npm only if package.json).
    refresh();
  }, [refresh]);

  const handleUpdate = async (target: ConfirmUpdateTarget): Promise<void> => {
    if (actionRef.current || runningRefresh) return;
    actionRef.current = true;
    setConfirmUpdate(null);
    setBusy(`${target.manager}:${target.name || 'all'}`);
    setNotice(null);
    try {
      let result: SimpleResult;
      switch (target.manager) {
        case 'npm': result = await ipc.npmUpdate(projectPath!, target.name); break;
        case 'composer': result = await composerUpdate(projectPath!, target.name); break;
        case 'go': {
          if (!target.name) { setNotice({ type: 'error', message: t('Go updates are applied one module at a time.') }); setBusy(null); return; }
          result = await goUpdate(projectPath!, target.name);
          break;
        }
        case 'pip': {
          if (!target.name) { setNotice({ type: 'error', message: t('pip updates are applied one package at a time.') }); setBusy(null); return; }
          result = await pipUpdate(projectPath!, target.name);
          break;
        }
        case 'cargo': {
          if (!target.name) { setNotice({ type: 'error', message: t('Cargo updates are applied one package at a time.') }); setBusy(null); return; }
          result = await cargoUpdate(projectPath!, target.name);
          break;
        }
      }
      if (result.success) {
        await refresh();
        const backups = (result as SimpleResult & { backups?: string[] }).backups || [];
        setNotice({ type: 'success', message: t('Update completed. Backups: {files}', { files: backups.join(', ') || t('None') }) });
      } else {
        setNotice({ type: 'error', message: result.error || t('Update failed.') });
      }
    } catch (error) {
      setNotice({ type: 'error', message: (error instanceof Error ? error.message : String(error)) || 'Update failed.' });
    } finally {
      actionRef.current = false;
      setBusy(null);
    }
  };

  const presentManagers = Object.values(MANAGER_UI).filter((ui) => managers[ui.key].present || managers[ui.key].error);
  const totalOutdated = presentManagers.reduce((sum, ui) => sum + managers[ui.key].outdated.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p role="status" className="text-sm">{busy ? t('Updating {task}… This can take several minutes.', { task: busy }) : t(runningRefresh ? 'Checking dependencies…' : 'Dependency scan')}</p><button disabled={Boolean(busy) || runningRefresh} onClick={() => refresh()} className={btnSecondary}>{t('Re-check all')}</button></div>
      {notice && (
        <p role={notice.type === 'error' ? 'alert' : 'status'} className={`text-xs px-3 py-2 rounded-lg border ${
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
            busy={busy || (runningRefresh ? 'Scanning' : null)}
            onRefresh={() => refresh()}
            onUpdateAll={() => setConfirmUpdate({ manager: ui.key, name: null, target: 'all' })}
            onInitUpdate={(item) => setConfirmUpdate({ manager: ui.key, name: item.name, target: `${item.name}@${item.latest}` })}
          />
        ))
      )}

      <ConfirmDialog
        isOpen={confirmUpdate !== null}
        title={t('Update Dependencies')}
        message={confirmUpdate?.name === null
          ? t('Update packages in {manager} within existing version constraints?', { manager: t(MANAGER_UI[confirmUpdate!.manager]?.label || 'this project') })
          : t('Update "{name}" using {command}? Compatible managers respect manifest constraints; Go and pip request the latest available version.', { name: confirmUpdate?.name || '', command: confirmUpdate ? t(MANAGER_UI[confirmUpdate.manager].updateLabel) : '' })}
        confirmLabel={t('Update')}
        onConfirm={() => handleUpdate(confirmUpdate!)}
        onCancel={() => setConfirmUpdate(null)}
      />
      <p className="text-[11px] text-ink-faint">{t('Total: {count} outdated across {managers} manager(s).', { count: totalOutdated, managers: presentManagers.length })}</p>
    </div>
  );
}
