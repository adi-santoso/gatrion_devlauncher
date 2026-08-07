import { useState } from 'react';
import { LogsTab } from './ProjectDetail';
import InteractiveTerminal from './Terminal/InteractiveTerminal';
import { isElectronAvailable } from '../utils/ipcRenderer';

export default function TerminalWorkspace({ projects = [], getLogs, onClearLogs, fontSize }) {
  const activeProjects = projects.filter((project) => ['running', 'starting', 'error'].includes((project.status || '').toLowerCase()));
  const [selectedId, setSelectedId] = useState('all');
  const [shellOpen, setShellOpen] = useState(false);
  const [shellKey, setShellKey] = useState(0);
  const selectedProject = activeProjects.find((project) => project.id === selectedId);
  const logs = selectedProject
    ? getLogs(selectedProject.id)
    : activeProjects.flatMap((project) => getLogs(project.id).map((log) => ({
        ...(typeof log === 'object' && log ? log : { message: String(log) }),
        message: `[${project.name}] ${typeof log === 'object' && log ? log.message ?? log.text ?? '' : log}`,
      })) || []);

  return (
    <div className="view mx-auto max-w-[1400px]">
      <header className="mb-5 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-accent">Process output</p>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Terminals</h1>
          <p className="mt-1 text-xs text-ink-soft">Read-only output from active project processes, or open an interactive shell.</p>
        </div>
        {isElectronAvailable() && (
          <button
            type="button"
            onClick={() => (shellOpen ? setShellOpen(false) : (setShellKey((k) => k + 1), setShellOpen(true)))}
            className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium transition-colors"
          >
            {shellOpen ? 'Close shell' : 'Open shell'}
          </button>
        )}
      </header>

      {shellOpen && (
        <div className="mb-5 h-80 rounded-xl border border-border bg-surface shadow-card p-2">
          <InteractiveTerminal key={shellKey} fontSize={fontSize} onExit={() => {}} />
        </div>
      )}
      <div className="grid min-h-[520px] overflow-hidden rounded-xl border border-border bg-surface shadow-card md:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="border-b border-border p-2.5 md:border-b-0 md:border-r">
          <button type="button" onClick={() => setSelectedId('all')} className={`w-full rounded-lg px-3 py-2 text-left text-xs ${selectedId === 'all' ? 'bg-surface-3 text-ink' : 'text-ink-soft hover:bg-surface-2'}`}>
            All processes<span className="mt-0.5 block font-mono text-[8px] text-ink-faint">{activeProjects.length} active streams</span>
          </button>
          {activeProjects.map((project) => <button key={project.id} type="button" onClick={() => setSelectedId(project.id)} className={`mt-1 w-full rounded-lg px-3 py-2 text-left text-xs ${selectedId === project.id ? 'bg-surface-3 text-ink' : 'text-ink-soft hover:bg-surface-2'}`}>
            {project.name}<span className="mt-0.5 block font-mono text-[8px] text-ink-faint">{project.port ? `:${project.port}` : 'no port'} · {project.status}</span>
          </button>)}
        </aside>
        <div className="min-w-0 p-3">
          <LogsTab logs={logs} fontSize={fontSize} onClear={selectedProject ? () => onClearLogs(selectedProject.id) : undefined} />
        </div>
      </div>
    </div>
  );
}
