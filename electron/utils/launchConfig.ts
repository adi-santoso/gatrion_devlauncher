import type { Project, ProjectCommand } from '../../src/types/shared'

const portArguments = /(?:^|\s)(?:--port(?:=|\s+)|-p\s+)\d+\b/i
const artisanServe = /(?:^|[\\/])artisan\s+serve\b/i
const phpArtisanServe = /\bphp(?:\.exe)?\s+(?:-[a-zA-Z]\S*\s+)*artisan\s+serve\b/i
const composerRunScript = /^composer(?:\.phar)?\s+run(?:-script)?\s+([A-Za-z0-9:_-]+)\s*$/i

export function withRequestedPort(command: unknown, port: number | null): unknown {
  if (typeof command !== 'string' || !Number.isInteger(port) || portArguments.test(command)) return command
  const trimmed = command.trim()
  // Composite Composer scripts and generic package scripts may not accept flags.
  if (composerRunScript.test(trimmed)) return command
  if (phpArtisanServe.test(trimmed) || artisanServe.test(trimmed)) return `${trimmed} --port=${port}`
  return command
}

export function resolveLaunchConfig(project: Project): { command: string | ProjectCommand[]; port: number | null } {
  const requestedPort: number | null = typeof project?.port === 'number' ? project.port : null
  const source = project?.commands || project?.startCommand
  if (!Array.isArray(source)) return { command: typeof source === 'string' ? withRequestedPort(source, requestedPort) as string : '', port: requestedPort }
  const commands = source.map(item => ({ ...item, port: typeof item?.port === 'number' ? item.port : null }))
  const primary = commands.find(item => item.primary) || commands[0]
  if (primary) primary.port = requestedPort ?? primary.port ?? null
  for (const item of commands) item.command = withRequestedPort(item.command, item.port) as string
  return { command: commands, port: primary?.port ?? requestedPort }
}
