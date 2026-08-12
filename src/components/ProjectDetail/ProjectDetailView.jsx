import React, { useState, useEffect } from 'react';
import ProjectDetailHeader from './ProjectDetailHeader';
import TabNavigation from './TabNavigation';
import LogsTab from './LogsTab';
import EnvironmentTab from './EnvironmentTab';
import SettingsTab from './SettingsTab';
import AppPreviewTab from './AppPreviewTab';
import CustomCommands from './CustomCommands';
import CrashBanner from './CrashBanner';
import GitTab from './GitTab';
import ScriptsTab from './ScriptsTab';

export default function ProjectDetailView({
  project,
  projects = [],
  keepPreviewAlive = true,
  logs = [],
  onBack,
  onRemove,
  onEdit,
  onDuplicate,
  onStart,
  onStop,
  onRestart,
  onClearLogs,
  onFullscreenChange,
  onPrevProject,
  onNextProject,
  isFullscreen = false,
  terminalConfig
}) {
  const [activeTab, setActiveTab] = useState('app');
  const [autoScroll, setAutoScroll] = useState(terminalConfig?.autoScroll !== false);
  // Use prop instead of local state to sync with parent
  const [fullscreen, setFullscreen] = useState(isFullscreen);
  const combinedLogs = Array.isArray(logs) && logs.length > 0 ? logs : (Array.isArray(project?.logs) ? project.logs : []);

  // With keep-alive, remember every project whose preview we mounted so its
  // iframe stays alive (hidden) and returns with the same page state.
  const [visitedIds, setVisitedIds] = useState(() => (project?.id ? [project.id] : []));
  useEffect(() => {
    if (keepPreviewAlive && project?.id) {
      setVisitedIds((prev) => (prev.includes(project.id) ? prev : [...prev, project.id]));
    }
  }, [keepPreviewAlive, project?.id]);

  // Sync local fullscreen state when prop changes
  useEffect(() => {
    if (fullscreen !== isFullscreen) {
      setFullscreen(isFullscreen);
    }
  }, [isFullscreen]);

  // Notify parent component (App.jsx) when fullscreen status changes
  useEffect(() => {
    onFullscreenChange?.(fullscreen);
  }, [fullscreen, onFullscreenChange]);

  // ESC key listener to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
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
  const previewProjects = keepPreviewAlive && visitedIds.length > 0
    ? visitedIds.map((id) => projects.find((p) => p.id === id) || { id })
    : [project];

  const renderPreview = (previewProject) => {
    const isActive = previewProject.id === project?.id;
    const visible = isActive && activeTab === 'app';
    return (
      <div key={previewProject.id} className={visible ? (fullscreen ? 'h-full flex-1 flex flex-col' : 'block') : 'hidden'}>
        <AppPreviewTab
          project={previewProject}
          onStart={isActive ? onStart : undefined}
          onEdit={isActive ? onEdit : undefined}
          onBack={onBack}
          fullscreen={fullscreen && isActive}
          active={visible}
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
          <ProjectDetailHeader project={project} onStart={onStart} onStop={onStop} onRestart={onRestart} onEdit={onEdit} onDuplicate={onDuplicate}/>
          {project?.status === 'error' && (
            <CrashBanner
              message={`Project "${project.name}" could not start or exited unexpectedly.`}
              timestamp={project.errorMessage ? `Details: ${project.errorMessage}` : null}
              onRestart={onRestart}
            />
          )}
          <TabNavigation activeTab={activeTab} onTabChange={setActiveTab}/>
        </>
      )}

      <div className={keepPreviewAlive || activeTab === 'app' ? (fullscreen ? 'h-full flex-1 flex flex-col' : 'block') : 'hidden'}>
        {keepPreviewAlive ? previewProjects.map(renderPreview) : (activeTab === 'app' ? renderPreview(project) : null)}
      </div>

      {!fullscreen && (
        <>
          <div className={activeTab === 'terminal' ? 'block' : 'hidden'}>
            <CustomCommands project={project}/>
            <LogsTab logs={combinedLogs} autoScroll={autoScroll} onAutoScrollChange={setAutoScroll} onClear={onClearLogs} fontSize={terminalConfig?.fontSize}/>
          </div>
          <div className={activeTab === 'git' ? 'block' : 'hidden'}>
            <GitTab project={project}/>
          </div>
          <div className={activeTab === 'scripts' ? 'block' : 'hidden'}>
            <ScriptsTab project={project}/>
          </div>
          <div className={activeTab === 'environment' ? 'block' : 'hidden'}>
            <EnvironmentTab project={project} envVars={project?.envVars} onEdit={onEdit}/>
          </div>
          <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
            <SettingsTab project={project} onEdit={onEdit} onRemove={onRemove}/>
          </div>
        </>
      )}
    </div>
  );
}
