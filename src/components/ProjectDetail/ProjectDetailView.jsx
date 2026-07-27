import React, { useState, useEffect } from 'react';
import ProjectDetailHeader from './ProjectDetailHeader';
import TabNavigation from './TabNavigation';
import LogsTab from './LogsTab';
import EnvironmentTab from './EnvironmentTab';
import SettingsTab from './SettingsTab';
import AppPreviewTab from './AppPreviewTab';

export default function ProjectDetailView({
  project,
  logs = [],
  onBack,
  onRemove,
  onEdit,
  onStart,
  onStop,
  onRestart,
  onClearLogs,
  onFullscreenChange
}) {
  const [activeTab, setActiveTab] = useState('app');
  const [autoScroll, setAutoScroll] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const combinedLogs = Array.isArray(logs) && logs.length > 0 ? logs : (Array.isArray(project?.logs) ? project.logs : []);

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

  return (
    <div className={fullscreen ? 'h-full flex-1 flex flex-col p-0 overflow-hidden' : 'view space-y-5'}>
      {!fullscreen && (
        <>
          <button onClick={onBack} className="text-xs text-ink-faint hover:text-ink flex items-center gap-1 transition-colors">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>Back to Projects
          </button>
          <ProjectDetailHeader project={project} onStart={onStart} onStop={onStop} onRestart={onRestart} onEdit={onEdit}/>
          <TabNavigation activeTab={activeTab} onTabChange={setActiveTab}/>
        </>
      )}

      <div className={activeTab === 'app' ? (fullscreen ? 'h-full flex-1 flex flex-col' : 'block') : 'hidden'}>
        <AppPreviewTab
          project={project}
          onStart={onStart}
          onEdit={onEdit}
          onBack={onBack}
          fullscreen={fullscreen}
          onToggleFullscreen={() => setFullscreen(prev => !prev)}
        />
      </div>

      {!fullscreen && (
        <>
          <div className={activeTab === 'terminal' ? 'block' : 'hidden'}>
            <LogsTab logs={combinedLogs} autoScroll={autoScroll} onAutoScrollChange={setAutoScroll} onClear={onClearLogs}/>
          </div>
          <div className={activeTab === 'environment' ? 'block' : 'hidden'}>
            <EnvironmentTab envVars={project?.envVars} onEdit={onEdit}/>
          </div>
          <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
            <SettingsTab project={project} onEdit={onEdit} onRemove={onRemove}/>
          </div>
        </>
      )}
    </div>
  );
}
