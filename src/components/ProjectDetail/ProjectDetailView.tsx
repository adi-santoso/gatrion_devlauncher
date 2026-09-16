import { useState, useEffect } from 'react';
import type { JSX } from 'react';
import ProjectDetailHeader from './ProjectDetailHeader';
import TabNavigation from './TabNavigation';
import LogsTab from './LogsTab';
import DetailPanels from './DetailPanels';
import AppPreviewTab, { type PreviewProject } from './AppPreviewTab';
import CustomCommands from './CustomCommands';
import CrashBanner from './CrashBanner';
import InteractiveTerminal from '../Terminal/InteractiveTerminal';
import Icon from '../Common/Icon';
import type { ViewProject } from '../Dashboard/ProjectCard';
import type { ProcessLogLine } from '../../data/processes';
import type { AppConfig } from '../../types/shared';
import { useDetailI18n } from './useDetailI18n';

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
  const t = useDetailI18n();
  const [tabs, setTabs] = useState<Record<string, string>>({});
  const selectedTab = tabs[project?.id || ''] || 'app';
  const activeTab = selectedTab === 'logs' && project?.type !== 'LARAVEL' ? 'app' : selectedTab;
  const setActiveTab = (tab: string) => setTabs(previous => ({ ...previous, [project?.id || '']: tab }));
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
    <div className={fullscreen ? 'h-full min-h-0 flex-1 flex flex-col p-0 overflow-hidden' : 'view min-w-0 space-y-3'}>
      {!fullscreen && (
        <>
          <button onClick={onBack} className="text-xs text-ink-faint hover:text-ink flex items-center gap-1 transition-colors">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>{t('Back to Projects')}
          </button>
          <ProjectDetailHeader project={project} onStart={onStart} onStop={onStop} onRestart={onRestart} onEdit={onEdit} onDuplicate={onDuplicate} onOpenAgent={onOpenAgent}/>
          {project?.status === 'error' && (
            <CrashBanner
              message={t('Project "{name}" could not start or exited unexpectedly.', { name: project.name })}
              timestamp={project.errorMessage ? t('Details: {error}', { error: project.errorMessage }) : null}
              onRestart={onRestart}
              onViewLogs={() => setActiveTab('terminal')}
              onOpenAgent={onOpenAgent}
            />
          )}
          <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} projectId={project?.id} showLogsTab={project?.type === 'LARAVEL'}/>
        </>
      )}

      <div role="tabpanel" id={`project-panel-${project?.id}-app`} aria-labelledby="project-tab-app" aria-hidden={activeTab !== 'app'} className={keepPreviewAlive || activeTab === 'app' ? (fullscreen ? 'h-full flex-1 flex flex-col' : 'block') : 'hidden'}>
        {keepPreviewAlive ? previewProjects.map(renderPreview) : (visible && activeTab === 'app' && project ? renderPreview(project) : null)}
      </div>

      {/* Keep PTYs mounted even while the app preview is fullscreen. Hiding the
          container preserves the real shell process, history and screen state. */}
      <div role="tabpanel" id={`project-panel-${project?.id}-terminal`} aria-labelledby="project-tab-terminal" className={!fullscreen && activeTab === 'terminal' ? 'block space-y-3' : 'hidden'}>
        {project?.path ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center gap-2 min-w-0">
              <Icon name="terminal" size={16} className="text-accent" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{t('Interactive shell')}</p>
                <p className="text-xs text-ink-faint truncate">{project.path}</p>
              </div>
            </div>
            {openTerminals.includes(project.id) ? (
              <button
                type="button"
                onClick={() => closeTerminal(project.id)}
                title={t('Close shell for this project')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border transition-colors"
              >
                <Icon name="x" size={13} />
                {t('Close shell')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startTerminal(project.id)}
                title={t('Open a shell in the project folder')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-glow transition-colors"
              >
                <Icon name="play" size={13} />
                {t('Start shell')}
              </button>
            )}
          </div>
        ) : null}
        {openTerminals.map((id) => {
          const tProject = projects.find((p) => p.id === id);
          const active = id === project?.id;
          if (!tProject?.path) return null;
          return (
            <div key={id} style={active ? { resize: 'vertical', overflow: 'auto', minHeight: 160 } : undefined} className={active ? 'block h-64 rounded-xl border border-border bg-surface shadow-card p-2' : 'hidden'}>
              <InteractiveTerminal cwd={tProject.path} fontSize={terminalConfig?.fontSize} />
            </div>
          );
        })}
        <CustomCommands key={project?.id} project={project}/>
        <LogsTab key={project?.id} logs={combinedLogs} autoScroll={autoScroll} onAutoScrollChange={onAutoScrollChange} onClear={onClearLogs} fontSize={terminalConfig?.fontSize}/>
      </div>

      {[...new Set([...visitedIds, ...Object.keys(tabs), project?.id])].map(id => {
        const target = projects.find(p => p.id === id) || (project?.id === id ? project : null);
        return target ? <DetailPanels key={`${target.id}:${target.path}`} project={target} tab={target.id === project?.id ? activeTab : tabs[target.id] || 'app'} visible={visible && !fullscreen && target.id === project?.id} onEdit={onEdit} onRemove={onRemove} onOutput={() => setActiveTab('terminal')} /> : null;
      })}
    </div>
  );
}
