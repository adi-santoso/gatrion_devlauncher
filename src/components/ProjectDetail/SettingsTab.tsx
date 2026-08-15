import type { ReactNode } from 'react';
import Icon from '../Common/Icon';
import type { ProjectRuntime } from '../../hooks/useProjects';

interface SettingProps {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

const Setting = ({ label, value, mono = false }: SettingProps) => <div><dt className="text-xs text-ink-soft">{label}</dt><dd className={`mt-1 text-sm break-all ${mono ? 'font-mono' : ''}`}>{value}</dd></div>;

interface SettingsTabProps {
  project: ProjectRuntime | null;
  onEdit?: () => void;
  onRemove?: () => void;
}

export default function SettingsTab({ project, onEdit, onRemove }: SettingsTabProps) {
  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl shadow-card p-5">
        <div className="flex items-center justify-between mb-5"><div><p className="text-sm font-medium">Project Settings</p><p className="text-[11px] text-ink-faint mt-1">Read-only project configuration.</p></div>
          <button onClick={onEdit} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors"><Icon name="gear" size={14} /> Edit Project</button></div>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Setting label="Project name" value={project?.name || '-'}/><Setting label="Type" value={project?.type || 'CUSTOM'}/>
          <Setting label="Path" value={project?.path || '-'} mono/><Setting label="Port" value={project?.port == null ? 'Not configured' : String(project.port)} mono/>
          <Setting label="Start command" value={project?.startCommand || '-'} mono/><Setting label="Start on app launch" value={project?.autoStart ? 'Enabled' : 'Disabled'}/>
        </dl>
      </div>
      <div className="bg-danger/5 border border-danger/20 rounded-xl p-5">
        <p className="text-sm font-medium text-danger">Danger Zone</p><p className="text-xs text-ink-faint mt-1 mb-3">Removing this project unregisters it. Files on disk stay untouched.</p>
        <button onClick={onRemove} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger text-sm font-medium border border-danger/20 transition-colors"><Icon name="trash" size={14} /> Remove Project</button>
      </div>
    </div>
  );
}
