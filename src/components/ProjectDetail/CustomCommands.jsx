import { useState } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import Icon from '../Common/Icon';

// Module-level store so running custom commands survive unmounting the
// component (e.g. switching tabs or navigating away and back).
const runStore = new Map();
const getRunId = (projectId, commandId) => runStore.get(`${projectId}:${commandId}`) ?? null;
const setRunId = (projectId, commandId, runId) => {
  if (runId == null) runStore.delete(`${projectId}:${commandId}`);
  else runStore.set(`${projectId}:${commandId}`, runId);
};

export default function CustomCommands({ project }) {
  const commands = Array.isArray(project?.customCommands) ? project.customCommands : [];
  const [runs, setRuns] = useState(() =>
    Object.fromEntries(commands.map((cmd) => [cmd.id, getRunId(project.id, cmd.id)]))
  );
  const [busy, setBusy] = useState(null);

  if (commands.length === 0) return null;

  const handleRun = async (cmd) => {
    setBusy(cmd.id);
    try {
      const result = await ipc.runCustomCommand(project.id, cmd.id);
      if (result.success) {
        setRunId(project.id, cmd.id, result.runId);
        setRuns((prev) => ({ ...prev, [cmd.id]: result.runId }));
      }
    } finally {
      setBusy(null);
    }
  };

  const handleStop = async (runId) => {
    const result = await ipc.stopCustomCommand(runId);
    if (result.success) {
      const cmd = commands.find((c) => runs[c.id] === runId);
      if (cmd) {
        setRunId(project.id, cmd.id, null);
        setRuns((prev) => ({ ...prev, [cmd.id]: null }));
      }
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl shadow-card px-4 py-3 mb-4">
      <p className="mb-2.5 text-[11px] font-mono uppercase tracking-wider text-ink-faint">Custom commands</p>
      <div className="flex flex-wrap gap-2">
        {commands.map((cmd) => {
          const runId = runs[cmd.id];
          return (
            <span key={cmd.id} className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleRun(cmd)}
                disabled={busy !== null}
                className="px-2.5 py-1 rounded-lg bg-surface-3 border border-border text-xs text-ink-soft hover:text-accent hover:border-accent/40 transition-colors disabled:opacity-50"
                title={cmd.command}
              >
                {cmd.label}
              </button>
              {runId != null && (
                <button
                  type="button"
                  onClick={() => handleStop(runId)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-danger border border-danger/30 hover:bg-danger/10 transition-colors"
                  title="Stop (SIGKILL)"
                >
                  <Icon name="stop" size={10} />
                  Stop
                </button>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}