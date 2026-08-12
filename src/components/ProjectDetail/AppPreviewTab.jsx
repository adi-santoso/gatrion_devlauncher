import React, { useState } from 'react';
import * as ipc from '../../utils/ipcRenderer';
import StackLogo from '../Common/StackLogo';

const statusClasses = {
  running: 'text-success bg-success/10 border-success/20',
  starting: 'text-warning bg-warning/10 border-warning/20',
  stopping: 'text-warning bg-warning/10 border-warning/20',
  error: 'text-danger bg-danger/10 border-danger/20',
  stopped: 'text-ink-faint bg-surface-3 border-border'
};

export default function AppPreviewTab({
  project,
  onStart,
  onEdit,
  onBack,
  fullscreen = false,
  onToggleFullscreen
}) {
  const [iframeKey, setIframeKey] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(100);
  const status = (project?.status || 'stopped').toLowerCase();
  const isRunning = status === 'running';
  const appUrl = Number.isInteger(project?.port) ? `http://localhost:${project.port}` : null;

  const handleReload = () => {
    setIframeKey((prev) => prev + 1);
  };

  const handleOpenExternally = () => {
    if (appUrl) {
      ipc.openExternalUrl(appUrl);
    }
  };

  return (
    <div
      className={
        fullscreen
          ? 'flex flex-col h-full w-full bg-base overflow-hidden border-0 rounded-none'
          : 'flex flex-col h-full min-h-[520px] bg-surface border border-border rounded-xl shadow-card overflow-hidden'
      }
    >
      {/* Mode Fullscreen Floating Info Bar */}
      {fullscreen ? (
        <div className="sticky top-0 z-30 flex items-center justify-between gap-3 px-3 py-1.5 bg-surface/95 backdrop-blur border-b border-border text-[11px] font-mono select-none">
          {/* Left Metadata */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBack}
              title="Back to projects"
              className="w-6 h-6 rounded flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-3 transition-colors text-sm font-bold shrink-0"
            >
              ‹
            </button>
            <div className="w-5 h-5 rounded bg-surface-3 border border-border flex items-center justify-center text-ink-soft shrink-0">
              <StackLogo type={project?.type} size={12} />
            </div>
            <span className="font-bold text-ink truncate max-w-[150px] sm:max-w-xs">{project?.name}</span>
            <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusClasses[status] || statusClasses.stopped}`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
            <span className="text-ink-faint hidden sm:inline">·</span>
            <span className="text-ink-faint truncate hidden sm:inline">
              {project?.type || 'CUSTOM'} {project?.port != null ? `· :${project.port}` : ''} {project?.pid != null ? `· PID ${project.pid}` : ''}
            </span>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleReload}
              disabled={!isRunning || !appUrl}
              title="Reload preview"
              className="px-2 py-1 rounded bg-surface-3 hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed text-ink-soft hover:text-ink border border-border transition-colors text-xs"
            >
              ↻
            </button>
            <button
              type="button"
              onClick={handleOpenExternally}
              disabled={!appUrl}
              title="Open in external browser"
              className="px-2 py-1 rounded bg-surface-3 hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed text-ink-soft hover:text-ink border border-border transition-colors text-xs"
            >
              ↗
            </button>
            <button
              type="button"
              onClick={onToggleFullscreen}
              title="Exit fullscreen (ESC)"
              className="px-2.5 py-1 rounded bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 font-semibold transition-colors text-xs flex items-center gap-1"
            >
              <span>⛶</span>
              <span>Exit</span>
            </button>
          </div>
        </div>
      ) : (
        /* Normal Mode Mini Browser Bar */
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-surface-2 border-b border-border flex-wrap">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleReload}
              disabled={!isRunning || !appUrl}
              title="Reload preview"
              className="w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
            >
              ↻
            </button>
          </div>

          {/* Address Bar */}
          <div className="flex-1 min-w-[200px] max-w-xl h-7 bg-base border border-border rounded-md px-3 flex items-center gap-2 text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-success' : 'bg-ink-faint'}`} />
            <span className="text-ink-soft truncate">{appUrl || 'No app port configured'}</span>
          </div>

          {/* Right Controls (Zoom + Open externally + Toggle Fullscreen) */}
          <div className="flex items-center gap-3">
            {/* Zoom Selector */}
            <div className="flex items-center gap-1 bg-surface-3 border border-border rounded-md px-1.5 py-0.5 text-xs text-ink-soft font-mono">
              <span className="text-[10px] text-ink-faint">Zoom:</span>
              <select
                value={zoomLevel}
                onChange={(e) => setZoomLevel(Number(e.target.value))}
                className="bg-transparent text-xs text-ink font-semibold focus:outline-none cursor-pointer"
              >
                <option value={50}>50%</option>
                <option value={75}>75%</option>
                <option value={100}>100%</option>
                <option value={125}>125%</option>
                <option value={150}>150%</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleOpenExternally}
              disabled={!appUrl}
              title="Open in external browser"
              className="text-xs font-medium text-ink-faint hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
            >
              <span>Open externally</span>
              <span>↗</span>
            </button>
            <button
              type="button"
              onClick={onToggleFullscreen}
              title="Toggle Fullscreen"
              className="px-2 py-1 rounded bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border flex items-center gap-1 transition-colors"
            >
              <span>⛶</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Preview Container */}
      <div
        className={
          fullscreen
            ? 'flex-1 relative bg-base flex flex-col w-full h-full p-0 overflow-hidden'
            : 'flex-1 relative bg-base flex flex-col items-center justify-center p-4'
        }
      >
        {!appUrl ? (
          <div className="max-w-md text-center py-12 px-6 bg-surface border border-border rounded-xl shadow-sm my-auto">
            <div className="w-12 h-12 rounded-full bg-surface-3 flex items-center justify-center text-2xl mx-auto mb-3">
              ⚙️
            </div>
            <h3 className="font-display font-bold text-base text-ink">No App Port Configured</h3>
            <p className="text-xs text-ink-faint mt-1.5 leading-relaxed">
              To enable embedded app preview, specify the local development port (e.g., 5173 for Vite, 3000 for Next.js) in your project settings.
            </p>
            <button
              onClick={onEdit}
              className="mt-4 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-glow transition-colors"
            >
              Configure Port
            </button>
          </div>
        ) : !isRunning ? (
          <div className="max-w-md text-center py-12 px-6 bg-surface border border-border rounded-xl shadow-sm my-auto">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-2xl mx-auto mb-3">
              🌐
            </div>
            <h3 className="font-display font-bold text-base text-ink">Project is Not Running</h3>
            <p className="text-xs text-ink-faint mt-1.5 leading-relaxed">
              Local app preview at <code className="text-accent font-mono">{appUrl}</code> will display here automatically once you start the project.
            </p>
            <button
              onClick={() => onStart?.(project)}
              className="mt-4 px-4 py-2 rounded-lg bg-success/20 text-success border border-success/30 hover:bg-success/30 text-xs font-semibold transition-colors"
            >
              ▶ Start Project
            </button>
          </div>
        ) : (
          <iframe
            key={iframeKey}
            src={appUrl}
            title={`${project.name} preview`}
            style={{ zoom: `${zoomLevel}%` }}
            className={
              fullscreen
                ? 'w-full h-full flex-1 border-0 rounded-none bg-white'
                : 'w-full h-full min-h-[500px] border-0 rounded-b-lg bg-white'
            }
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        )}
      </div>
    </div>
  );
}
