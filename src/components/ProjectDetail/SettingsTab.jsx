import React from 'react';

const Setting = ({ label, value, mono = false }) => <div><dt className="text-xs text-ink-soft">{label}</dt><dd className={`mt-1 text-sm break-all ${mono ? 'font-mono' : ''}`}>{value}</dd></div>;

export default function SettingsTab({ project, onEdit, onRemove }) {
  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl shadow-card p-5">
        <div className="flex items-center justify-between mb-5"><div><p className="text-sm font-medium">Project Settings</p><p className="text-[11px] text-ink-faint mt-1">Read-only project configuration.</p></div>
          <button onClick={onEdit} className="px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors">Edit Project</button></div>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Setting label="Project name" value={project?.name || '-'}/><Setting label="Type" value={project?.type || 'CUSTOM'}/>
          <Setting label="Path" value={project?.path || '-'} mono/><Setting label="Port" value={project?.port == null ? 'Not configured' : String(project.port)} mono/>
          <Setting label="Start command" value={project?.startCommand || '-'} mono/><Setting label="Start on app launch" value={project?.autoStart ? 'Enabled' : 'Disabled'}/>
        </dl>
      </div>
      <div className="bg-danger/5 border border-danger/20 rounded-xl p-5">
        <p className="text-sm font-medium text-danger">Danger Zone</p><p className="text-xs text-ink-faint mt-1 mb-3">Removing this project unregisters it. Files on disk stay untouched.</p>
        <button onClick={onRemove} className="px-3.5 py-2 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger text-sm font-medium border border-danger/20 transition-colors">Remove Project</button>
      </div>
    </div>
  );
}
