import React, { useCallback, useEffect, useState } from 'react';
import Icon from '../Common/Icon';
import * as ipc from '../../utils/ipcRenderer';
import { ConfirmDialog } from '../Modals';

// Module-level store so running scripts survive unmounting the component
// (switching tabs and coming back).
const runStore = new Map();
const getRunId = (projectId, scriptName) => runStore.get(`${projectId}:${scriptName}`) ?? null;
const setRunId = (projectId, scriptName, runId) => {
  if (runId == null) runStore.delete(`${projectId}:${scriptName}`);
  else runStore.set(`${projectId}:${scriptName}`, runId);
};

const btnBase = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap';
const btnSecondary = `${btnBase} bg-surface-3 hover:bg-surface-2 text-ink-soft hover:text-ink border border-border disabled:opacity-50 disabled:cursor-not-allowed`;
const btnPrimary = `${btnBase} px-3.5 bg-accent hover:bg-accent-hover text-white font-semibold shadow-glow disabled:opacity-50 disabled:cursor-not-allowed`;

export default function ScriptsTab({ project }) {
  const [scripts, setScripts] = useState([]);
  const [deps, setDeps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
  const [running, setRunning] = useState({});
  const [confirmInstall, setConfirmInstall] = useState(false);

  const refresh = useCallback(async () => {
    if (!project?.path) return;
    setLoading(true);
    const [scriptsResult, depsResult] = await Promise.all([
      ipc.readPackageScripts(project.path),
      ipc.checkDependencies(project.path),
    ]);
    setLoading(false);
    if (scriptsResult.success) setScripts(scriptsResult.scripts || []);
    else setNotice({ type: 'error', message: scriptsResult.error || 'Failed to read package.json' });
    if (depsResult.success) setDeps(depsResult);
    else setNotice({ type: 'error', message: depsResult.error || 'Failed to check dependencies' });
  }, [project?.path]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRun = async (script) => {
    setBusy(script.name);
    setNotice(null);
    try {
      const result = await ipc.runProjectScript(project.id, script.name);
      if (result.success) {
        setRunId(project.id, script.name, result.runId);
        setRunning((prev) => ({ ...prev, [script.name]: result.runId }));
        setNotice({ type: 'success', message: `Started "${script.name}". Output appears in the Terminal tab.` });
      } else {
        setNotice({ type: 'error', message: result.error || `Failed to run "${script.name}"` });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleStop = async (scriptName, runId) => {
    setBusy(scriptName);
    const result = await ipc.stopCustomCommand(runId);
    setBusy(null);
    if (result.success) {
      setRunId(project.id, scriptName, null);
      setRunning((prev) => ({ ...prev, [scriptName]: null }));
    } else {
      setNotice({ type: 'error', message: result.error || 'Failed to stop' });
    }
  };

  const handleInstall = async () => {
    setConfirmInstall(false);
    setBusy('install');
    setNotice(null);
    try {
      const result = await ipc.installDependencies(project.id);
      if (result.success) {
        const label = `${result.packageManager || 'npm'} install`;
        setRunId(project.id, label, result.runId);
        setRunning((prev) => ({ ...prev, [label]: result.runId }));
        setNotice({ type: 'success', message: `Started ${label}. Output appears in the Terminal tab.` });
      } else {
        setNotice({ type: 'error', message: result.error || 'Failed to install dependencies' });
      }
    } finally {
      setBusy(null);
    }
  };

  if (loading && !deps && !notice) {
    return (
      <div className="bg-surface border border-border rounded-xl shadow-card p-8 text-center">
        <Icon name="spinner" size={18} className="animate-spin text-accent mx-auto" />
        <p className="text-xs text-ink-faint mt-3">Reading project tooling...</p>
      </div>
    );
  }

  if (!deps?.hasPackageJson) {
    return (
      <div className="bg-surface border border-border rounded-xl shadow-card p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center text-ink-soft mx-auto mb-3">
          <Icon name="terminal" size={20} />
        </div>
        <h3 className="font-display font-bold text-base text-ink">No package.json Found</h3>
        <p className="text-xs text-ink-faint mt-1.5 leading-relaxed max-w-md mx-auto">
          Script runner and dependency health are available for Node.js projects. Add a package.json to this project to use them.
        </p>
      </div>
    );
  }

  const installRunId = running[`${deps.packageManager || 'npm'} install`];

  return (
    <div className="space-y-4">
      {notice && (
        <p className={`text-xs px-3 py-2 rounded-lg border ${notice.type === 'success' ? 'text-success border-success/20 bg-success/10' : 'text-danger border-danger/20 bg-danger/10'}`}>
          {notice.message}
        </p>
      )}

      {/* Dependency health */}
      <div className="bg-surface border border-border rounded-xl shadow-card p-4">
        <p className="text-sm font-semibold text-ink">Dependencies</p>
        <div className="flex items-center gap-3 flex-wrap mt-3">
          <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border ${
            deps.hasNodeModules ? 'text-success border-success/25 bg-success/10' : 'text-danger border-danger/25 bg-danger/10'
          }`}>
            <Icon name={deps.hasNodeModules ? 'check' : 'warn'} size={13} />
            node_modules {deps.hasNodeModules ? 'installed' : 'missing'}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-surface-3 border border-border text-ink-soft">
            <Icon name="commit" size={13} />
            {deps.packageManager || 'npm'}
            {deps.lockfile ? ` · ${deps.lockfile}` : ' · no lockfile'}
          </span>
          <span className="text-xs text-ink-faint">{deps.depCount} package(s) · {deps.scriptCount} script(s)</span>
          <div className="flex-1" />
          {installRunId != null ? (
            <button onClick={() => handleStop(`${deps.packageManager || 'npm'} install`, installRunId)} className={btnSecondary} title="Stop install">
              <Icon name="stop" size={12} />
              Stop install
            </button>
          ) : deps.hasNodeModules ? (
            <button onClick={refresh} className={btnSecondary} title="Re-check">
              <Icon name="restart" size={13} />
              Re-check
            </button>
          ) : (
            <button onClick={() => setConfirmInstall(true)} disabled={busy !== null} className={btnPrimary} title="Runs the detected package manager install; output in Terminal tab">
              <Icon name="download" size={13} />
              Install dependencies
            </button>
          )}
        </div>
      </div>

      {/* Scripts */}
      <div className="bg-surface border border-border rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-surface-2 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-ink">package.json scripts</p>
            <p className="text-[10px] text-ink-faint mt-0.5">Runs through the process manager — output lands in the Terminal tab.</p>
          </div>
          <button onClick={refresh} className={btnSecondary} title="Reload scripts">
            <Icon name="restart" size={13} />
            Reload
          </button>
        </div>
        {scripts.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">No scripts defined in package.json.</p>
        ) : (
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {scripts.map((script) => {
              const runId = running[script.name];
              return (
                <div key={script.name} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-ink font-mono">{script.name}</p>
                    <p className="text-[10px] text-ink-faint font-mono truncate" title={script.command}>{script.command}</p>
                  </div>
                  {runId != null ? (
                    <button onClick={() => handleStop(script.name, runId)} disabled={busy !== null} className={btnSecondary} title="Stop script">
                      <Icon name="stop" size={12} />
                      Stop
                    </button>
                  ) : (
                    <button onClick={() => handleRun(script)} disabled={busy !== null} className={btnPrimary} title={`npm run ${script.name}`}>
                      <Icon name="play" size={12} />
                      Run
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
        title="Install Dependencies"
        message={`Run "${deps.packageManager || 'npm'} install" in this project? This can take a while and modifies node_modules and the lockfile.`}
        confirmLabel="Install"
        onConfirm={handleInstall}
        onCancel={() => setConfirmInstall(false)}
      />
    </div>
  );
}
