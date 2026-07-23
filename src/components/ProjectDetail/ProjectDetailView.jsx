import React, { useState } from 'react';
import ProjectDetailHeader from './ProjectDetailHeader';
import TabNavigation from './TabNavigation';
import LogsTab from './LogsTab';
import EnvironmentTab from './EnvironmentTab';
import SettingsTab from './SettingsTab';

export default function ProjectDetailView({ project, logs = [], onBack, onRemove, onEdit, onStart, onStop, onRestart, onClearLogs }) {
  const [activeTab, setActiveTab] = useState('app');
  const [autoScroll, setAutoScroll] = useState(true);
  const appUrl = Number.isInteger(project?.port) ? `http://localhost:${project.port}` : null;
  const combinedLogs = Array.isArray(logs) && logs.length > 0 ? logs : (Array.isArray(project?.logs) ? project.logs : []);

  return (
    <div className="view space-y-5">
      <button onClick={onBack} className="text-xs text-ink-faint hover:text-ink flex items-center gap-1">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>Back to Projects
      </button>
      <ProjectDetailHeader project={project} onStart={onStart} onStop={onStop} onRestart={onRestart} onEdit={onEdit}/>
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab}/>
      {activeTab === 'app' && <div className="bg-surface border border-border rounded-xl shadow-card p-8 text-center">
        <p className="font-display font-bold text-lg">App preview unavailable</p>
        <p className="text-sm text-ink-faint mt-2">{appUrl ? `Expected local app URL: ${appUrl}. Embedded preview is unavailable because no browser backend is connected.` : 'This project has no app port configured.'}</p>
      </div>}
      {activeTab === 'terminal' && <LogsTab logs={combinedLogs} autoScroll={autoScroll} onAutoScrollChange={setAutoScroll} onClear={onClearLogs}/>}
      {activeTab === 'environment' && <EnvironmentTab envVars={project?.envVars} onEdit={onEdit}/>}
      {activeTab === 'settings' && <SettingsTab project={project} onEdit={onEdit} onRemove={onRemove}/>}
    </div>
  );
}
