import { useEffect, useState } from 'react';
import GitTab from './GitTab';
import ScriptsTab from './ScriptsTab';
import DependenciesTab from './DependenciesTab';
import EnvironmentTab from './EnvironmentTab';
import AnalyticsTab from './AnalyticsTab';
import LaravelLogsTab from './LaravelLogsTab';
import SettingsTab from './SettingsTab';
import type { ViewProject } from '../Dashboard/ProjectCard';

/** Lazily opened panels retain drafts per project, including through fullscreen. */
export default function DetailPanels({ project, tab, visible, onEdit, onRemove, onOutput }: {
  project: ViewProject; tab: string; visible: boolean;
  onEdit?: () => void; onRemove?: () => void; onOutput: () => void;
}) {
  const [visited, setVisited] = useState<string[]>([]);
  useEffect(() => {
    if (visible) setVisited(previous => previous.includes(tab) ? previous : [...previous, tab]);
  }, [tab, visible]);
  const opened = new Set(visited);
  if (visible) opened.add(tab);
  const active = (id: string) => visible && tab === id;
  return <>{[...opened].filter(id => !['app', 'terminal'].includes(id)).map(id => (
    <section key={id} id={`project-panel-${project.id}-${id}`} role="tabpanel" aria-labelledby={`project-tab-${id}`} hidden={!active(id)} tabIndex={0}>
      {id === 'git' && <GitTab project={project} active={active(id)} />}
      {id === 'scripts' && <ScriptsTab project={project} active={active(id)} onOutput={onOutput} />}
      {id === 'dependencies' && <DependenciesTab project={project} />}
      {id === 'environment' && <EnvironmentTab project={project} envVars={project.envVars} onEdit={onEdit} />}
      {id === 'analytics' && <AnalyticsTab project={project} active={active(id)} />}
      {id === 'logs' && project.type === 'LARAVEL' && <LaravelLogsTab projectPath={project.path} active={active(id)} />}
      {id === 'settings' && <SettingsTab project={project} onEdit={onEdit} onRemove={onRemove} />}
    </section>
  ))}</>;
}
