import type { ProcessLogLine } from '../../data/processes';
import type { Preset } from '../../types/shared';
import type { ViewProject } from './ProjectCard';

export interface FormattedLog {
  message: string;
  time: string;
  type: string;
  projectName?: string;
}

export const stripAnsi = (value: unknown): string => typeof value === 'string'
  ? value.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
  : '';

export const asString = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));

export const formatLog = (log: ProcessLogLine | string): FormattedLog => {
  if (typeof log === 'string') return { message: stripAnsi(log), time: '', type: '' };
  if (!log) return { message: '', time: '', type: '' };
  const text = log.message ?? log.text;
  return {
    message: stripAnsi(asString(text) || String(log)),
    time: log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : asString(log.time),
    type: asString(log.type || log.level).toLowerCase(),
    projectName: asString(log.projectName),
  };
};

export const logTimestamp = (log: ProcessLogLine): number => {
  const timestamp = log?.timestamp ? Date.parse(String(log.timestamp)) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const errorSignature = (project: ViewProject): string => `${project.startedAt || 'unknown'}:${project.errorMessage || 'unknown-error'}`;

export const countPresetTerminal = (projects: ViewProject[], preset: Preset): number => {
  const ids = preset.projectIds || [];
  return projects.filter((p) => ids.includes(p.id) && ['running', 'error', 'stopped'].includes((p.status || '').toLowerCase())).length;
};
