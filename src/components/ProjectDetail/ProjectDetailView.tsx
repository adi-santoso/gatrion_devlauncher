import { useState, useEffect } from 'react';
import type { JSX } from 'react';
import ProjectDetailHeader from './ProjectDetailHeader';
import TabNavigation from './TabNavigation';
import LogsTab from './LogsTab';
import LaravelLogsTab from './LaravelLogsTab';
import EnvironmentTab from './EnvironmentTab';
import SettingsTab from './SettingsTab';
import AppPreviewTab, { type PreviewProject } from './AppPreviewTab';
import CustomCommands from './CustomCommands';
import CrashBanner from './CrashBanner';
import GitTab from './GitTab';
import ScriptsTab from './ScriptsTab';
import DependenciesTab from './DependenciesTab';
import AnalyticsTab from './AnalyticsTab';
import InteractiveTerminal from '../Terminal/InteractiveTerminal';
import Icon from '../Common/Icon';
import type { ViewProject } from '../Dashboard/ProjectCard';
import type { ProcessLogLine } from '../../data/processes';
import type { AppConfig } from '../../types/shared';

interface ProjectDetailViewProps {
  project: ViewProject | null;
  projects?: ViewProject[];
  keepPreviewAlive?: boolean;
  visible?: boolean;
  logs?: ProcessLogLine[];
  onBack?: () => void;
  onRemove?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onStart?: () => void;
  onStop?: () => void;
  onRestart?: () => void;
  onClearLogs?: () => void;
  onOpenAgent?: () => void;
  onFullscreenChange?: (fullscreen: boolean) => void;
  onPrevProject?: () => void;
  onNextProject?: () => void;
  isFullscreen?: boolean;
  terminalConfig?: AppConfig['terminal'];
  onAutoScrollChange?: (value: boolean) => void;
}

export default function ProjectDetailView({
  project,
  projects = [],
  keepPreviewAlive = true,
  visible = true,
  logs = [],
  onBack,
  onRemove,
  onEdit,
  onDuplicate,
  onStart,
  onStop,
  onRestart,
  onClearLogs,
  onOpenAgent,
  onFullscreenChange,
  onPrevProject,
  onNextProject,
  isFullscreen = false,
  terminalConfig,
  onAutoScrollChange,
}: ProjectDetailViewProps) {
  const [activeTab, setActiveTab] = useState('app');
  // Derived from config so the Settings toggle and the in-page checkbox stay in sync
  const autoScroll = terminalConfig?.autoScroll !== false;
  // Use prop instead of local state to sync with parent
  const [fullscreen, setFullscreen] = useState(isFullscreen);
  const combinedLogs = Array.isArray(logs) && logs.length > 0 ? logs : (Array.isArray(project?.logs) ? (project.logs as ProcessLogLine[]) : []);

  // With keep-alive, remember every project whose preview we mounted so its
  // iframe stays alive (hidden) and returns with the same page state.
  const [visitedIds, setVisitedIds] = useState<string[]>(() => (project?.id ? [project.id] : []));
  useEffect(() => {
    if (keepPreviewAlive && project?.id) {
      setVisitedIds((prev) => (prev.includes(project.id) ? prev : [...prev, project.id]));
    }
  }, [keepPreviewAlive, project?.id]);

  // Persistent per-project shells: the user explicitly starts/stop a shell per
  // project. Once started, its InteractiveTerminal stays mounted (hidden for
  // other projects) so the underlying PTY keeps running across navigation.
  const [openTerminals, setOpenTerminals] = useState<string[]>([]);
  const startTerminal = (id: string): void => {
    setOpenTerminals((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };
  const closeTerminal = (id: string): void => {
    setOpenTerminals((prev) => prev.filter((p) => p !== id));
  };

  // Sync local fullscreen state when prop changes (functional updater keeps
  // the effect free of a `fullscreen` reference so it only runs on prop change).
  useEffect(() => {
    setFullscreen((prev) => (prev === isFullscreen ? prev : isFullscreen));
  }, [isFullscreen]);

  // Notify parent component (App.jsx) when fullscreen status changes
  useEffect(() => {
    onFullscreenChange?.(fullscreen);
  }, [fullscreen, onFullscreenChange]);

  // ESC key listener to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && fullscreen) {
        setFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreen]);

  // Which previews to keep mounted: with keep-alive, all visited projects
  // (hidden unless active); otherwise just the current one, only while the
  // App tab is selected (lazy mount).
  const previewProjects: PreviewProject[] = keepPreviewAlive && visitedIds.length > 0
    ? visitedIds.map((id) => projects.find((p) => p.id === id) || { id })
    : (project ? [project] : []);

  const renderPreview = (previewProject: PreviewProject): JSX.Element => {
    const isActive = previewProject.id === project?.id;
    const previewVisible = visible && isActive && activeTab === 'app';
    return (
      <div key={previewProject.id} className={previewVisible ? (fullscreen ? 'h-full flex-1 flex flex-col' : 'block') : 'hidden'}>
        <AppPreviewTab
          project={previewProject}
          onStart={isActive ? onStart : undefined}
          onEdit={isActive ? onEdit : undefined}
          onBack={onBack}
          fullscreen={fullscreen && isActive}
          active={previewVisible}
          keepAlive={keepPreviewAlive}
          onPrevProject={isActive && fullscreen ? onPrevProject : undefined}
          onNextProject={isActive && fullscreen ? onNextProject : undefined}
          onToggleFullscreen={isActive ? () => setFullscreen((prev) => !prev) : undefined}
        />
      </div>
    );
  };

  return (
    <div className={fullscreen ? 'h-full flex-1 flex flex-col p-0 overflow-hidden' : 'view space-y-5'}>
      {!fullscreen && (
        <>
          <button onClick={onBack} className="text-xs text-ink-faint hover:text-ink flex items-center gap-1 transition-colors">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>Back to Projects
          </button>
          <ProjectDetailHeader project={project} onStart={onStart} onStop={onStop} onRestart={onRestart} onEdit={onEdit} onDuplicate={onDuplicate} onOpenAgent={onOpenAgent}/>
          {project?.status === 'error' && (
            <CrashBanner
              message={`Project "${project.name}" could not start or exited unexpectedly.`}
              timestamp={project.errorMessage ? `Details: ${project.errorMessage}` : null}
              onRestart={onRestart}
            />
          )}
          <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} showLogsTab={project?.type === 'LARAVEL'}/>
        </>
      )}

      <div className={keepPreviewAlive || activeTab === 'app' ? (fullscreen ? 'h-full flex-1 flex flex-col' : 'block') : 'hidden'}>
        {keepPreviewAlive ? previewProjects.map(renderPreview) : (visible && activeTab === 'app' && project ? renderPreview(project) : null)}
      </div>

      {/* Keep PTYs mounted even while the app preview is fullscreen. Hiding the
          container preserves the real shell process, history and screen state. */}
      <div className={!fullscreen && activeTab === 'terminal' ? 'block space-y-5' : 'hidden'}>
        {project?.path ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center gap-2 min-w-0">
              <Icon name="terminal" size={16} className="text-accent" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Interactive shell</p>
                <p className="text-xs text-ink-faint truncate">{project.path}</p>
              </div>
            </div>
            {openTerminals.includes(project.id) ? (
              <button
                type="button"
                onClick={() => closeTerminal(project.id)}
                title="Close shell for this project"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors"
              >
                <Icon name="x" size={13} />
                Close shell
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startTerminal(project.id)}
                title="Open a shell in the project folder"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-glow transition-colors"
              >
                <Icon name="play" size={13} />
                Start shell
              </button>
            )}
          </div>
        ) : null}
        {openTerminals.map((id) => {
          const tProject = projects.find((p) => p.id === id);
          const active = id === project?.id;
          if (!tProject?.path) return null;
          return (
            <div key={id} className={active ? 'block h-80 rounded-xl border border-border bg-surface shadow-card p-2' : 'hidden'}>
              <InteractiveTerminal cwd={tProject.path} fontSize={terminalConfig?.fontSize} />
            </div>
          );
        })}
        <CustomCommands project={project}/>
        <LogsTab logs={combinedLogs} autoScroll={autoScroll} onAutoScrollChange={onAutoScrollChange} onClear={onClearLogs} fontSize={terminalConfig?.fontSize}/>
      </div>

      {!fullscreen && (
        <>
          <div className={activeTab === 'logs' ? 'block' : 'hidden'}>
            {project?.path ? <LaravelLogsTab projectPath={project.path}/> : null}
          </div>
          <div className={activeTab === 'git' ? 'block' : 'hidden'}>
            <GitTab project={project}/>
          </div>
          <div className={activeTab === 'scripts' ? 'block' : 'hidden'}>
            <ScriptsTab project={project}/>
          </div>
          <div className={activeTab === 'dependencies' ? 'block' : 'hidden'}>
            <DependenciesTab project={project}/>
          </div>
          <div className={activeTab === 'environment' ? 'block' : 'hidden'}>
            <EnvironmentTab project={project} envVars={project?.envVars} onEdit={onEdit}/>
          </div>
          <div className={activeTab === 'analytics' ? 'block' : 'hidden'}>
            <AnalyticsTab project={project}/>
          </div>
          <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
            <SettingsTab project={project} onEdit={onEdit} onRemove={onRemove}/>
          </div>
        </>
      )}
    </div>
  );
}
