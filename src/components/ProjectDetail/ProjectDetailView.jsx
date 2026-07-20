import React, { useState } from 'react';
import ProjectDetailHeader from './ProjectDetailHeader';
import CrashBanner from './CrashBanner';
import TabNavigation from './TabNavigation';
import LogsTab from './LogsTab';
import EnvironmentTab from './EnvironmentTab';
import SettingsTab from './SettingsTab';

export default function ProjectDetailView({
  project,
  onBack,
  onSave,
  onRemove
}) {
  const [activeTab, setActiveTab] = useState('logs');
  const [showCrashBanner, setShowCrashBanner] = useState(project?.hasCrashed || false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logFilter, setLogFilter] = useState('');
  const [envVars, setEnvVars] = useState(project?.envVars || [
    { key: 'NODE_ENV', value: 'development' },
    { key: 'API_URL', value: 'http://localhost:8080' }
  ]);

  const handleAddEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const handleRemoveEnvVar = (index) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const handleChangeEnvVar = (index, field, value) => {
    const newEnvVars = [...envVars];
    newEnvVars[index][field] = value;
    setEnvVars(newEnvVars);
  };

  const handleRestartCrashed = () => {
    console.log('Restarting crashed project');
    setShowCrashBanner(false);
  };

  const handleDismissCrash = () => {
    setShowCrashBanner(false);
  };

  return (
    <div className="view space-y-5">
      <button
        onClick={onBack}
        className="text-xs text-ink-faint hover:text-ink flex items-center gap-1"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
        Back to Projects
      </button>

      <ProjectDetailHeader
        project={project}
        onStop={project.onStop}
        onRestart={project.onRestart}
        onOpenBrowser={project.onOpenBrowser}
        onShowMenu={project.onShowMenu}
      />

      {showCrashBanner && (
        <CrashBanner
          message="Process crashed unexpectedly (2 days ago)"
          timestamp="Exited with code 1 at 14:22:25. DevLauncher did not auto-restart this project."
          onRestart={handleRestartCrashed}
          onDismiss={handleDismissCrash}
        />
      )}

      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'logs' && (
        <LogsTab
          logs={project?.logs || []}
          onFilterChange={setLogFilter}
          autoScroll={autoScroll}
          onAutoScrollChange={setAutoScroll}
        />
      )}

      {activeTab === 'env' && (
        <EnvironmentTab
          envVars={envVars}
          onAdd={handleAddEnvVar}
          onRemove={handleRemoveEnvVar}
          onChange={handleChangeEnvVar}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsTab
          project={project}
          onSave={onSave}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}
