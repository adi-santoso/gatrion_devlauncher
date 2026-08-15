import { useEffect, useRef, useState } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import DropdownMenu, { DropdownItem, DropdownSeparator } from '../Common/DropdownMenu';
import StackLogo from '../Common/StackLogo';
import Tooltip from '../Common/Tooltip';
import type { ViewProject } from '../Dashboard/ProjectCard';

const statusClasses: Record<string, string> = {
  running: 'bg-success/10 text-success border-success/20', starting: 'bg-warning/10 text-warning border-warning/20',
  stopping: 'bg-warning/10 text-warning border-warning/20', error: 'bg-danger/10 text-danger border-danger/20',
  stopped: 'bg-surface-3 text-ink-faint border-border'
};

const FORCE_STOP_DELAY_MS = 10000;

const PlayIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 5.14v13.72c0 .8.87 1.3 1.56.88l11-6.86a1.03 1.03 0 000-1.76l-11-6.86A1.03 1.03 0 007 5.14z" />
  </svg>
);

const StopIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

const RestartIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 11-2.64-6.36" /><path d="M21 3v6h-6" />
  </svg>
);

const ForceIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
  </svg>
);

const SpinnerIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin" aria-hidden="true">
    <path d="M21 12a9 9 0 11-6.219-8.56" />
  </svg>
);

const MoreIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
  </svg>
);

const GlobeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
  </svg>
);

const DetailsIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" />
  </svg>
);

const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const DuplicateIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const FolderIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
  </svg>
);

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
  </svg>
);

const iconButtonClass = 'w-8 h-8 inline-flex items-center justify-center p-0 shrink-0 rounded-lg border border-border bg-surface-3 transition-colors';

interface ProjectListRowProps {
  project: ViewProject;
  isSelected?: boolean;
  onSelectChange?: (checked: boolean) => void;
  onStart?: () => void;
  onStop?: () => void;
  onForceStop?: () => void;
  onRestart?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onShowDetail?: () => void;
  typeLabel?: (type: string | null | undefined) => string;
}

export default function ProjectListRow({
  project,
  isSelected = false,
  onSelectChange,
  onStart,
  onStop,
  onForceStop,
  onRestart,
  onEdit,
  onDelete,
  onDuplicate,
  onShowDetail,
  typeLabel,
}: ProjectListRowProps) {
  const status = (project.status || 'stopped').toLowerCase();
  const busy = status === 'starting' || status === 'stopping';
  const [showForceStop, setShowForceStop] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

  useEffect(() => {
    if (status !== 'stopping') {
      setShowForceStop(false);
      return undefined;
    }
    const timer = setTimeout(() => setShowForceStop(true), FORCE_STOP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const handleOpenBrowser = (): void => {
    if (project?.port) ipc.openExternalUrl(`http://localhost:${project.port}`);
  };

  const handleRevealExplorer = (): void => {
    if (project?.path) ipc.revealInExplorer(project.path);
  };

  const handleCopyUrl = async (): Promise<void> => {
    if (!project?.port) return;
    const url = `http://localhost:${project.port}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedUrl(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedUrl(false), 1500);
  };

  const renderLifecycleAction = () => {
    if (status === 'running') {
      return (
        <>
          <Tooltip content="Restart">
            <button onClick={onRestart} aria-label={`Restart ${project.name}`} className={`${iconButtonClass} text-ink-soft hover:text-accent hover:border-accent/40`}>
              <RestartIcon />
            </button>
          </Tooltip>
          <Tooltip content="Stop">
            <button onClick={onStop} aria-label={`Stop ${project.name}`} className={`${iconButtonClass} text-ink-soft hover:text-danger hover:border-danger/40`}>
              <StopIcon />
            </button>
          </Tooltip>
        </>
      );
    }
    if (status === 'starting') {
      return (
        <span className={`${iconButtonClass} text-warning cursor-wait`} title="Starting...">
          <SpinnerIcon />
        </span>
      );
    }
    if (status === 'stopping') {
      if (showForceStop) {
        return (
          <Tooltip content="Force Stop">
            <button onClick={onForceStop} aria-label={`Force stop ${project.name}`} className={`${iconButtonClass} text-danger border-danger/40 hover:bg-danger/10`}>
              <ForceIcon />
            </button>
          </Tooltip>
        );
      }
      return (
        <span className={`${iconButtonClass} text-warning cursor-wait`} title="Stopping...">
          <SpinnerIcon />
        </span>
      );
    }
    if (status === 'error') {
      return (
        <Tooltip content="Restart">
          <button onClick={onRestart} aria-label={`Restart ${project.name}`} className={`${iconButtonClass} text-accent border-accent/40 hover:bg-accent/10`}>
            <RestartIcon />
          </button>
        </Tooltip>
      );
    }
    return (
      <Tooltip content="Start">
        <button onClick={onStart} aria-label={`Start ${project.name}`} className={`${iconButtonClass} text-success border-success/30 hover:bg-success/10`}>
          <PlayIcon />
        </button>
      </Tooltip>
    );
  };

  return (
    <tr className={`hover:bg-surface-3/60 transition-colors ${isSelected ? 'bg-accent/5' : ''}`}>
      <td className="pl-4 pr-2 py-3 w-10 align-top">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelectChange?.(e.target.checked)}
          aria-label={`Select ${project.name || 'project'}`}
          className="w-4 h-4 accent-accent rounded border-border cursor-pointer mt-1"
        />
      </td>
      <td className="px-3 py-3">
        <button onClick={onShowDetail} className="flex items-center gap-3 text-left group">
          <span className="w-9 h-9 rounded-lg bg-surface-3 flex items-center justify-center shrink-0 text-ink-soft">
            <StackLogo type={project.type} size={18} />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="block font-medium text-ink group-hover:text-accent transition-colors truncate">
                {project.name}
              </span>
              {Array.isArray(project.tags) && project.tags.map((tag) => (
                <span key={tag} className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md bg-surface-3 border border-border text-[9px] text-ink-faint">{tag}</span>
              ))}
            </span>
            <span className="block text-[11px] font-mono text-ink-faint max-w-72 truncate">
              {project.path}
            </span>
          </span>
        </button>
      </td>
      <td className="px-3 py-3">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${statusClasses[status] || statusClasses.stopped}`}>
          {busy && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"/>}
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
        {status === 'error' && project.errorMessage && (
          <p className="mt-1.5 text-[11px] text-danger max-w-52 truncate" title={project.errorMessage}>
            {project.errorMessage}
          </p>
        )}
      </td>
      <td className="px-3 py-3 text-xs font-mono text-ink-soft uppercase">{typeLabel ? typeLabel(project.type) : (project.type || 'CUSTOM')}</td>
      <td className="px-3 py-3">
        {project.port == null ? (
          <span className="text-xs font-mono text-ink-faint">-</span>
        ) : status === 'running' ? (
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={handleOpenBrowser}
              title={`Open http://localhost:${project.port}`}
              className="text-xs font-mono text-accent hover:text-accent-hover underline decoration-dotted underline-offset-2"
            >
              :{project.port}
            </button>
            <button
              type="button"
              onClick={handleCopyUrl}
              title={copiedUrl ? 'Copied!' : 'Copy URL'}
              aria-label={`Copy URL for ${project.name}`}
              className="p-0.5 rounded text-ink-faint hover:text-ink hover:bg-surface-3 transition-colors"
            >
              {copiedUrl ? (
                <span className="text-success text-[10px]">✓</span>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
          </span>
        ) : (
          <span className="text-xs font-mono text-ink-soft">:{project.port}</span>
        )}
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-1.5">
          {renderLifecycleAction()}
          <DropdownMenu
            trigger={(
              <button aria-label={`More actions for ${project.name}`} className={`${iconButtonClass} text-ink-faint hover:text-ink`}>
                <MoreIcon />
              </button>
            )}
          >
            {status === 'running' && project.port != null && (
              <>
                <DropdownItem onClick={handleOpenBrowser}><GlobeIcon /> Open in Browser</DropdownItem>
                <DropdownItem onClick={handleCopyUrl}><DuplicateIcon /> Copy URL</DropdownItem>
              </>
            )}
            <DropdownItem onClick={onShowDetail}><DetailsIcon /> Details</DropdownItem>
            <DropdownItem onClick={onEdit}><EditIcon /> Edit Project</DropdownItem>
            {onDuplicate && <DropdownItem onClick={onDuplicate}><DuplicateIcon /> Duplicate</DropdownItem>}
            <DropdownItem onClick={handleRevealExplorer}><FolderIcon /> Reveal in Explorer</DropdownItem>
            <DropdownSeparator />
            <DropdownItem danger onClick={onDelete}><TrashIcon /> Delete</DropdownItem>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}
