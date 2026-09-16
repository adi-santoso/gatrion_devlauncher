export interface ProjectFormData {
  name: string;
  path: string;
  type: string;
  port: string;
  startCommand: string;
  commands: Array<{ id: string; name: string; command: string; port: number | string | null; primary?: boolean }>;
  envVars: Array<{ key: string; value: string; secret?: boolean; unchanged?: boolean; needsValue?: boolean }>;
  autoStart: boolean;
  emoji: string;
  color: string;
  tags: string[];
  customCommands: Array<{ id: string; label: string; command: string }>;
  dependsOn: string[];
  previewHost: 'localhost' | '127.0.0.1';
}

export const EMPTY_PROJECT: ProjectFormData = {
  name: '',
  path: '',
  type: 'CUSTOM',
  port: '',
  startCommand: '',
  commands: [],
  envVars: [],
  autoStart: false,
  emoji: '⚙️',
  color: '#6B7280',
  tags: [],
  customCommands: [],
  dependsOn: [],
  previewHost: 'localhost',
};

export const TYPE_METADATA: Record<string, { emoji: string; color: string }> = {
  REACT_VITE: { emoji: '⚛️', color: '#61DAFB' },
  REACT: { emoji: '⚛️', color: '#61DAFB' },
  NEXTJS: { emoji: '⚡', color: '#000000' },
  VUE: { emoji: '🟢', color: '#42B883' },
  LARAVEL: { emoji: '🔴', color: '#FF2D20' },
  GOLANG: { emoji: '🐹', color: '#00ADD8' },
  PYTHON: { emoji: '🐍', color: '#3776AB' },
  NODEJS: { emoji: '🟩', color: '#339933' },
  CUSTOM: { emoji: '⚙️', color: '#6B7280' },
};

/** Pure field validation for the project form; returns a field → message map. */
export const validateProjectForm = (formData: ProjectFormData): Record<string, string> => {
  const nextErrors: Record<string, string> = {};
  if (!formData.name.trim()) nextErrors.name = 'Project name is required';
  if (!formData.path.trim()) nextErrors.path = 'Project path is required';
  if (formData.port.trim()) {
    const port = Number(formData.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      nextErrors.port = 'Port must be between 1-65535';
    }
  }
  if (!formData.startCommand.trim()) nextErrors.startCommand = 'Start command is required';
  const commandPorts = new Map<number, string>();
  for (const command of formData.commands) {
    const commandField = command.primary ? 'startCommand' : `command.${command.id}`;
    const portField = command.primary ? 'port' : `port.${command.id}`;
    if (!command.command.trim()) nextErrors[commandField] = 'Start command is required';
    if (command.port !== null && command.port !== '') {
      const commandPort = Number(command.port);
      if (!Number.isInteger(commandPort) || commandPort < 1 || commandPort > 65535) {
        nextErrors[portField] = 'Port must be between 1-65535';
      } else {
        const previous = commandPorts.get(commandPort);
        if (previous) {
          nextErrors[portField] = 'Each command must use a different port';
          nextErrors[previous] = 'Each command must use a different port';
        }
        commandPorts.set(commandPort, portField);
      }
    }
  }
  Object.assign(nextErrors, environmentErrors(formData.envVars));
  formData.envVars.forEach((item, index) => { if (item.needsValue && !item.value) nextErrors[`env.${index}`] = 'Enter the secret value for this copy'; });
  formData.customCommands.forEach((item, index) => { if (!item.label.trim() || !item.command.trim()) nextErrors[`custom.${index}`] = 'Command label and command are required'; });
  return nextErrors;
};
import { environmentErrors } from '../../utils/projectValidation';
