import { useEffect, useRef, useState } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import StackLogo from '../Common/StackLogo';
import Icon from '../Common/Icon';
import type { ViewProject } from '../Dashboard/ProjectCard';

const statusClasses: Record<string, string> = {
  running: 'bg-success/10 text-success border-success/20', starting: 'bg-warning/10 text-warning border-warning/20',
  stopping: 'bg-warning/10 text-warning border-warning/20', error: 'bg-danger/10 text-danger border-danger/20',
  stopped: 'bg-surface-3 text-ink-faint border-border'
};

const btnBase = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap';
const btnPrimary = `${btnBase} px-3.5 bg-accent hover:bg-accent-hover text-white font-semibold shadow-glow`;
const btnDanger = `${btnBase} px-3.5 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/25 font-semibold`;
const btnAccent = `${btnBase} bg-surface-3 hover:bg-surface-2 text-accent border border-accent/30`;
// Icon-only variant for quick actions: same hit area, no label, tooltip only.
const btnIcon = `${btnBase} w-8 h-8 px-0 justify-center`;
const menuItem = 'w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-soft hover:text-ink hover:bg-surface-3 transition-colors text-left';

interface CommandStatus {
  id: string;
  name: string;
  command: string;
  status?: string;
  port?: number | string | null;
  pid?: number | string | null;
  [key: string]: unknown;
}

interface ProjectDetailHeaderProps {
  project: ViewProject | null;
  onStart?: () => void;
  onStop?: () => void;
  onRestart?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onOpenAgent?: () => void;
}

export default function ProjectDetailHeader({ project, onStart, onStop, onRestart, onEdit, onDuplicate, onOpenAgent }: ProjectDetailHeaderProps) {
  const status = (project?.status || 'stopped').toLowerCase();
  const busy = status === 'starting' || status === 'stopping';
  const port = project?.port;
  const appUrl = port != null && Number.isInteger(port) ? `http://localhost:${port}` : null;

  // Overflow menu (⋯) holds the rare actions (Explorer / Open in Editor /
  // Edit / Duplicate) so the primary row stays short: quick actions on the
  // left, lifecycle controls on the right, everything else behind a menu.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const handleOpenBrowser = (): void => {
    if (appUrl) {
      ipc.openExternalUrl(appUrl);
    }
  };

  const handleRevealInExplorer = (): void => {
    if (project?.path) {
      ipc.revealInExplorer(project.path);
    }
  };

  const handleOpenInEditor = (): void => {
    if (project?.path) {
      ipc.openInEditor(project.path);
    }
  };

  return (
    <header className="border-b border-border bg-surface/50 rounded-xl p-5 shadow-card space-y-3">
      {/* Top Header Row */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-surface-3 border border-border flex items-center justify-center text-ink-soft shrink-0 shadow-sm">
            <StackLogo type={project?.type || 'CUSTOM'} size={24} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-display font-extrabold text-2xl tracking-tight text-ink">{project?.name}</h1>
              <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusClasses[status] || statusClasses.stopped}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
            <p
              onClick={handleRevealInExplorer}
              title="Click to reveal in File Explorer"
              className="text-xs font-mono text-ink-faint mt-1 truncate hover:text-accent cursor-pointer transition-colors"
            >
              {project?.path || 'No path specified'}
            </p>
          </div>
        </div>

        {/* Action Group — grouped by frequency: quick actions (icon-only),
            overflow menu for rare actions, then the lifecycle controls. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Quick actions (icon-only, tooltip) */}
          {appUrl && (
            <button
              onClick={handleOpenBrowser}
              disabled={status !== 'running'}
              aria-label={status === 'running' ? `Open ${appUrl} in browser` : 'Start the project to open the app'}
              title={status === 'running' ? `Open ${appUrl} in browser` : 'Start the project to open the app'}
              className={`${btnIcon} ${
                status === 'running'
                  ? 'text-success border border-success/30 bg-success/10 hover:bg-success/20'
                  : 'bg-surface-3 opacity-50 cursor-not-allowed border border-border'
              }`}
            >
              <Icon name="globe" size={14} />
            </button>
          )}
          {onOpenAgent && (
            <button onClick={onOpenAgent} aria-label="Open the AI agent workspace for this project" title="Open the AI agent workspace for this project" className={`${btnIcon} bg-surface-3 hover:bg-surface-2 text-accent border border-accent/30`}>
              <Icon name="messageSquare" size={14} />
            </button>
          )}

          {/* Overflow menu — rare actions stay one click away, off the row */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="More actions"
              aria-expanded={menuOpen}
              title="More actions"
              className={`${btnIcon} ${menuOpen ? 'bg-surface-2 text-ink border border-accent/40' : 'bg-surface-3 hover:bg-surface-2 text-ink-soft border border-border'}`}
            >
              <Icon name="more" size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-40 min-w-[190px] rounded-lg border border-border bg-surface-2 shadow-card py-1">
                <button onClick={() => { handleRevealInExplorer(); setMenuOpen(false); }} className={menuItem}>
                  <Icon name="folder" size={13} />
                  Explorer
                </button>
                <button onClick={() => { handleOpenInEditor(); setMenuOpen(false); }} className={menuItem}>
                  <Icon name="code" size={13} />
                  Open in Editor
                </button>
                <div className="my-1 border-t border-border/60" />
                <button onClick={() => { onEdit?.(); setMenuOpen(false); }} className={menuItem}>
                  <Icon name="gear" size={13} />
                  Edit
                </button>
                {onDuplicate && (
                  <button onClick={() => { onDuplicate(); setMenuOpen(false); }} className={menuItem}>
                    <Icon name="duplicate" size={13} />
                    Duplicate
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Separator between secondary actions and the lifecycle controls */}
          <div className="w-px h-6 bg-border mx-1 hidden sm:block" />

          {/* Lifecycle Controls (primary action, always visible) */}
          {status === 'running' ? (
            <>
              <button onClick={onRestart} className={btnAccent}>
                <Icon name="restart" size={13} />
                Restart
              </button>
              <button onClick={onStop} className={btnDanger}>
                <Icon name="stop" size={12} />
                Stop
              </button>
            </>
          ) : busy ? (
            <button disabled className={`${btnBase} px-3.5 bg-warning/10 text-warning border border-warning/20 font-semibold cursor-wait`}>
              {status === 'starting' ? 'Starting...' : 'Stopping...'}
            </button>
          ) : status === 'error' ? (
            <button onClick={onRestart} className={btnDanger}>
              <Icon name="restart" size={13} />
              Restart
            </button>
          ) : (
            <button onClick={onStart} className={btnPrimary}>
              <Icon name="play" size={13} />
              Start Project
            </button>
          )}
        </div>
      </div>

      {/* Sub Metadata Line */}
      <div className="flex items-center gap-4 text-[11px] font-mono text-ink-faint pt-2 border-t border-border/40 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="text-ink-soft font-semibold">{project?.type || 'CUSTOM'}</span>
        </span>
        {appUrl && (
          <button onClick={handleOpenBrowser} className="hover:text-accent hover:underline flex items-center gap-1">
            <span>{appUrl}</span>
          </button>
        )}
        {project?.pid != null && (
          <span>PID <strong className="text-ink-soft">{project.pid}</strong></span>
        )}
        {(project?.uptime || project?.metrics?.uptime) && (
          <span>Uptime <strong className="text-ink-soft">{project?.metrics?.uptime || project.uptime}</strong></span>
        )}
        {project?.cpu != null && (
          <span>CPU <strong className={`font-semibold ${project.cpu > 80 ? 'text-danger' : project.cpu > 60 ? 'text-warning' : 'text-success'}`}>{Number(project.cpu).toFixed(1)}%</strong></span>
        )}
        {(project?.memory != null || project?.metrics?.memoryMb != null) && (
          <span>RAM <strong className="text-success font-semibold">{project?.metrics?.memoryMb != null ? project.metrics.memoryMb : Number(project.memory).toFixed(0)} MB</strong></span>
        )}
        {project?.startCommand && (
          <span className="truncate max-w-xs">Cmd: <code className="text-ink-soft">{project.startCommand}</code></span>
        )}
      </div>
      {Array.isArray(project?.processCommands) && (project?.processCommands?.length ?? 0) > 1 && (
        <div className="grid gap-2 sm:grid-cols-2 pt-1">
          {(project.processCommands as unknown[]).map((raw) => {
            const command = raw as CommandStatus;
            return (
              <div key={command.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px]">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{command.name}</p>
                  <p className="font-mono text-ink-faint truncate">{command.command}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={command.status === 'RUNNING' ? 'text-success' : command.status === 'ERROR' ? 'text-danger' : 'text-warning'}>{command.status}</p>
                  <p className="font-mono text-ink-faint">{command.port ? `:${command.port}` : ''}{command.pid ? ` PID ${command.pid}` : ''}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </header>
  );
}
