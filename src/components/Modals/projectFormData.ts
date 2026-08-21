export interface ProjectFormData {
  name: string;
  path: string;
  type: string;
  port: string;
  startCommand: string;
  commands: Array<{ id: string; name: string; command: string; port: number | string | null; primary?: boolean }>;
  envVars: Array<{ key: string; value: string; secret?: boolean; unchanged?: boolean }>;
  autoStart: boolean;
  emoji: string;
  color: string;
  tags: string[];
  customCommands: Array<{ id: string; label: string; command: string }>;
  dependsOn: string[];
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
  const commandPorts: number[] = [];
  for (const command of formData.commands) {
    if (!command.command.trim()) nextErrors.commands = `${command.name || 'Command'} command is required`;
    if (command.port !== null && command.port !== '') {
      const commandPort = Number(command.port);
      if (!Number.isInteger(commandPort) || commandPort < 1 || commandPort > 65535) {
        nextErrors.commands = `${command.name} port must be between 1-65535`;
      } else {
        commandPorts.push(commandPort);
      }
    }
  }
  if (new Set(commandPorts).size !== commandPorts.length) {
    nextErrors.commands = 'Each command must use a different port';
  }
  return nextErrors;
};
