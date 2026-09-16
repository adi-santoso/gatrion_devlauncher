import * as ipc from '../../utils/ipcRenderer';
import type { ProjectRuntime } from '../../hooks/useProjects';
import { useProjectTasks } from './useProjectTasks';
import { useDetailI18n } from './useDetailI18n';

export default function CustomCommands({ project }: { project: ProjectRuntime | null }) {
  return project ? <Commands key={project.id} project={project} /> : null;
}
function Commands({ project }: { project: ProjectRuntime }) {
  const t = useDetailI18n();
  const { tasks, run, stop, busy, error } = useProjectTasks(project.id);
  const commands = project.customCommands || [];
  if (!commands.length) return null;
  return <section className="rounded-xl border border-border bg-surface p-3 space-y-2">
    <h3 className="text-sm font-semibold">{t('Custom commands')}</h3>
    {error && <p role="alert" className="text-danger text-sm">{error}</p>}
    <div className="flex flex-wrap gap-3">{commands.map(command => {
      const task = tasks[`custom:${command.id}`];
      return <div key={command.id} className="flex items-center gap-2">
        <button disabled={Boolean(busy) || task?.status === 'running'} title={command.command} onClick={() => run(`custom:${command.id}`, () => ipc.runCustomCommand(project.id, command.id))} className="px-3 py-2 rounded-lg bg-surface-3 text-sm disabled:opacity-40">{command.label}</button>
        {task?.status === 'running' ? <button disabled={Boolean(busy)} onClick={() => stop(`custom:${command.id}`)} className="text-danger text-sm">{t('Stop')}</button> : task && <span role="status" className="text-xs text-ink-soft">{t(task.status)}{task.code != null ? ` · exit ${task.code}` : ''}</span>}
      </div>;
    })}</div>
  </section>;
}
