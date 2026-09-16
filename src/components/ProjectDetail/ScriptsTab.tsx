import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../Common/Icon';
import * as ipc from '../../utils/ipcRenderer';
import { ConfirmDialog } from '../Modals';
import type { ProjectRuntime } from '../../hooks/useProjects';
import { useProjectTasks } from './useProjectTasks';
import { useDetailI18n } from './useDetailI18n';

const btnBase = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap';
const btnSecondary = `${btnBase} bg-surface-3 hover:bg-surface-2 text-ink-soft hover:text-ink border border-border disabled:opacity-50 disabled:cursor-not-allowed`;
const btnPrimary = `${btnBase} px-3.5 bg-accent hover:bg-accent-hover text-white font-semibold shadow-glow disabled:opacity-50 disabled:cursor-not-allowed`;

interface Notice {
  type: 'error' | 'info' | 'success';
  message: string;
}

interface PackageScript {
  name: string;
  command: string;
}

/** Envelope from `read-package-scripts` — scripts are objects { name, command }. */
interface ScriptsView {
  success: boolean;
  error?: string;
  scripts?: PackageScript[];
}

/** Envelope from `check-dependencies` — runtime fields beyond the base envelope. */
interface DepsView {
  success: boolean;
  error?: string;
  hasPackageJson?: boolean;
  hasNodeModules?: boolean;
  packageManager?: string;
  lockfile?: string;
  depCount?: number;
  scriptCount?: number;
  [key: string]: unknown;
}

interface ScriptsTabProps {
  project: ProjectRuntime | null;
  active?: boolean;
  onOutput?: () => void;
}

export default function ScriptsTab(props: ScriptsTabProps) {
  return <ProjectScripts key={`${props.project?.id}:${props.project?.path}`} {...props} />;
}

function ProjectScripts({ project, active = true, onOutput }: ScriptsTabProps) {
  const t = useDetailI18n();
  const [scripts, setScripts] = useState<PackageScript[]>([]);
  const [deps, setDeps] = useState<DepsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const { tasks, busy, error, run, stop } = useProjectTasks(project?.id || '');
  const [confirmInstall, setConfirmInstall] = useState(false);
  const requestRef = useRef(0);
  useEffect(() => () => { requestRef.current++; }, []);

  const refresh = useCallback(async () => {
    if (!project?.path) return;
    const request = ++requestRef.current;
    setLoading(true);
    setNotice(previous => previous?.type === 'error' ? null : previous);
    try {
    const [scriptsResult, depsResult] = await Promise.all([
      ipc.readPackageScripts(project.path),
      ipc.checkDependencies(project.path),
    ]);
    if (request !== requestRef.current) return;
    setLoading(false);
    if (scriptsResult.success) setScripts((scriptsResult as ScriptsView).scripts || []);
    else setNotice({ type: 'error', message: scriptsResult.error || t('Failed to read package.json') });
    if (depsResult.success) setDeps(depsResult as DepsView);
    else setNotice({ type: 'error', message: depsResult.error || t('Failed to check dependencies') });
    } catch (cause) { if (request === requestRef.current) setNotice({ type: 'error', message: String(cause) }); }
    finally { if (request === requestRef.current) setLoading(false); }
  }, [project?.path, t]);

  useEffect(() => {
    if (active) void refresh();
  }, [refresh, active]);
  const installTask = tasks[`${deps?.packageManager || 'npm'} install`];
  const installStatus = installTask?.status;
  useEffect(() => {
    if (active && installStatus === 'succeeded') void refresh();
  }, [active, installStatus, refresh]);

  const handleRun = async (script: PackageScript): Promise<void> => {
    if (!project) return;
    if (await run(script.name, () => ipc.runProjectScript(project.id, script.name))) setNotice({ type: 'success', message: t('Started "{name}". Output appears in the Terminal tab.', { name: script.name }) });
  };

  const handleStop = (scriptName: string): Promise<void> => stop(scriptName);

  const handleInstall = async (): Promise<void> => {
    if (!project) return;
    setConfirmInstall(false);
    const label = `${deps?.packageManager || 'npm'} install`;
    if (await run(label, () => ipc.installDependencies(project.id))) setNotice({ type: 'success', message: t('Started "{name}". Output appears in the Terminal tab.', { name: label }) });
  };

  if (loading && !deps && !notice) {
    return (
      <div className="bg-surface border border-border rounded-xl shadow-card p-4 space-y-3">
        <div className="skeleton h-5 w-40" />
        <div className="flex gap-2">
          <div className="skeleton h-8 w-44" />
          <div className="skeleton h-8 w-32" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
        </div>
      </div>
    );
  }

  if (!deps?.hasPackageJson) {
    return (
      <div className="bg-surface border border-border rounded-xl shadow-card p-8 text-center">
        {notice?.type === 'error' && <p role="alert">{notice.message}</p>}
        <button onClick={refresh} className={btnSecondary}>{t('Retry / reload')}</button>
        <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center text-ink-soft mx-auto mb-3">
          <Icon name="terminal" size={20} />
        </div>
        <h3 className="font-display font-bold text-base text-ink">{t('No package.json Found')}</h3>
        <p className="text-xs text-ink-faint mt-1.5 leading-relaxed max-w-md mx-auto">
          {t('Script runner and dependency health are available for Node.js projects. Add a package.json to this project to use them.')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-danger text-sm">{error}</p>}
      {onOutput && <button onClick={onOutput} className={btnSecondary}>{t('Open output')}</button>}
      {notice && (
        <p role={notice.type === 'error' ? 'alert' : 'status'} className={`text-xs px-3 py-2 rounded-lg border ${notice.type === 'success' ? 'text-success border-success/20 bg-success/10' : 'text-danger border-danger/20 bg-danger/10'}`}>
          {notice.message}
        </p>
      )}

      {/* Dependency health */}
      <div className="bg-surface border border-border rounded-xl shadow-card p-4">
        <p className="text-sm font-semibold text-ink">{t('Dependencies')}</p>
        {installTask && <p role="status" className="text-xs text-ink-soft">{t(installTask.status)}{installTask.code != null ? ` · exit ${installTask.code}` : ''}</p>}
        <div className="flex items-center gap-3 flex-wrap mt-3">
          <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border ${
            deps.hasNodeModules ? 'text-success border-success/25 bg-success/10' : 'text-danger border-danger/25 bg-danger/10'
          }`}>
            <Icon name={deps.hasNodeModules ? 'check' : 'warn'} size={13} />
            node_modules {t(deps.hasNodeModules ? 'installed' : 'missing')}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-surface-3 border border-border text-ink-soft">
            <Icon name="commit" size={13} />
            {deps.packageManager || 'npm'}
            {deps.lockfile ? ` · ${deps.lockfile}` : t(' · no lockfile')}
          </span>
          <span className="text-xs text-ink-faint">{t('{packages} package(s) · {scripts} script(s)', { packages: deps.depCount, scripts: deps.scriptCount })}</span>
          <div className="flex-1" />
          {installTask?.status === 'running' ? (
            <button onClick={() => handleStop(`${deps.packageManager || 'npm'} install`)} disabled={Boolean(busy)} className={btnSecondary} title={t('Stop install')}>
              <Icon name="stop" size={12} />
              {t('Stop install')}
            </button>
          ) : deps.hasNodeModules ? (
            <button onClick={refresh} className={btnSecondary} title={t('Re-check')}>
              <Icon name="restart" size={13} />
              {t('Re-check')}
            </button>
          ) : (
            <button onClick={() => setConfirmInstall(true)} disabled={busy !== null} className={btnPrimary} title={t('Runs the detected package manager install; output in Terminal tab')}>
              <Icon name="download" size={13} />
              {t('Install dependencies')}
            </button>
          )}
        </div>
      </div>

      {/* Scripts */}
      <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-surface-2 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-ink">{t('package.json scripts')}</p>
            <p className="text-[10px] text-ink-faint mt-0.5">{t('Runs through the process manager — output lands in the Terminal tab.')}</p>
          </div>
          <button onClick={refresh} className={btnSecondary} title={t('Reload scripts')}>
            <Icon name="restart" size={13} />
            {t('Reload')}
          </button>
        </div>
        {scripts.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">{t('No scripts defined in package.json.')}</p>
        ) : (
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {scripts.map((script) => {
              const task = tasks[script.name];
              return (
                <div key={script.name} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                     <p className="text-xs font-semibold text-ink font-mono">{script.name}</p>
                     {task && <p role="status" className="text-xs text-ink-soft">{t(task.status)}{task.code != null ? ` · exit ${task.code}` : ''}</p>}
                    <p className="text-[10px] text-ink-faint font-mono truncate" title={script.command}>{script.command}</p>
                  </div>
                  {task?.status === 'running' ? (
                    <button onClick={() => handleStop(script.name)} disabled={busy !== null} className={btnSecondary} title={t('Stop script')}>
                      <Icon name="stop" size={12} />
                      {t('Stop')}
                    </button>
                  ) : (
                    <button onClick={() => handleRun(script)} disabled={busy !== null} className={btnPrimary} title={`${deps.packageManager || 'npm'} run ${script.name}`}>
                      <Icon name="play" size={12} />
                      {t('Run')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmInstall}
        title={t('Install Dependencies')}
        message={t('Run "{manager} install" in this project? This can take a while and modifies node_modules and the lockfile.', { manager: deps.packageManager || 'npm' })}
        confirmLabel={t('Install')}
        onConfirm={handleInstall}
        onCancel={() => setConfirmInstall(false)}
      />
    </div>
  );
}
