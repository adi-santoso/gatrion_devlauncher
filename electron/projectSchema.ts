import type { CustomCommand, EnvVar, Project, ProjectCommand, ProjectType } from '../src/types/shared'

interface ProjectTypeMeta {
  labels: string[]
  emoji: string
  color: string
}

const PROJECT_TYPES: Record<ProjectType, ProjectTypeMeta> = {
  LARAVEL: { labels: ['Laravel', '🔴 Laravel'], emoji: '🔴', color: '#FF2D20' },
  NEXTJS: { labels: ['Next.js', '⚡ Next.js'], emoji: '⚡', color: '#000000' },
  REACT_VITE: { labels: ['React', 'React (Vite)', '⚛️ React (Vite)'], emoji: '⚛️', color: '#61DAFB' },
  REACT: { labels: ['React', '⚛️ React'], emoji: '⚛️', color: '#61DAFB' },
  VUE: { labels: ['Vue', 'Vue.js', '🟢 Vue.js'], emoji: '🟢', color: '#42B883' },
  GOLANG: { labels: ['Go', 'Golang', '🐹 Go'], emoji: '🐹', color: '#00ADD8' },
  NODEJS: { labels: ['Node', 'Node.js', '🟩 Node.js'], emoji: '🟩', color: '#339933' },
  CUSTOM: { labels: ['Custom', '⚙️ Custom'], emoji: '⚙️', color: '#6B7280' },
}

const PROJECT_FIELDS = new Set([
  'name', 'path', 'type', 'port', 'startCommand', 'commands', 'envVars', 'emoji', 'color', 'autoStart', 'schemaVersion',
  'tags', 'customCommands', 'dependsOn',
])

const PROJECT_SCHEMA_VERSION = 3

function migrateProjects(projects: unknown, fromVersion?: number): Project[] {
  if (!Array.isArray(projects)) return []

  const migrated = projects.map((project) => {
    // TODO(ts): raw/legacy project payload — shape normalized field-by-field below
    const raw = (project ?? {}) as Record<string, unknown>
    const migratedProject: Record<string, unknown> = { ...raw }

    if (fromVersion === undefined || fromVersion === 0) {
      if (raw.env && !raw.envVars) {
        migratedProject.envVars = Array.isArray(raw.env)
          ? raw.env
          : Object.entries(raw.env as Record<string, unknown>).map(([key, value]) => ({ key, value }))
      }

      if (!raw.createdAt) {
        migratedProject.createdAt = new Date().toISOString()
      }

      if (!raw.id) {
        migratedProject.schemaVersion = PROJECT_SCHEMA_VERSION
      }
    }

    if (!migratedProject.schemaVersion) {
      migratedProject.schemaVersion = PROJECT_SCHEMA_VERSION
    }

    return migratedProject
  })

  return migrated as unknown as Project[]
}

function normalizeType(value: unknown): ProjectType {
  if (typeof value !== 'string') return 'CUSTOM'
  const normalized = value.trim()
  if ((PROJECT_TYPES as Record<string, ProjectTypeMeta>)[normalized]) return normalized as ProjectType

  const match = Object.entries(PROJECT_TYPES).find(([, metadata]) =>
    metadata.labels.some((label) => label.toLowerCase() === normalized.toLowerCase())
  )
  return (match?.[0] as ProjectType) || 'CUSTOM'
}

function normalizeEnvVars(envVars: unknown, legacyEnv?: unknown): EnvVar[] {
  const source: Array<{ key?: unknown; value?: unknown }> = Array.isArray(envVars)
    ? envVars
    : legacyEnv && typeof legacyEnv === 'object' && !Array.isArray(legacyEnv)
      ? Object.entries(legacyEnv).map(([key, value]) => ({ key, value }))
      : []

  return source
    .filter((item) => item && typeof item === 'object' && typeof item.key === 'string' && item.key.trim())
    .map((item) => ({
      key: item.key as string,
      value: item.value == null ? '' : String(item.value),
    }))
}

function envVarsToObject(envVars: unknown): Record<string, string> {
  return normalizeEnvVars(envVars).reduce<Record<string, string>>((result, item) => {
    result[item.key] = item.value
    return result
  }, {})
}

function normalizeProject(project: unknown, createId?: () => string): Project {
  // TODO(ts): raw/legacy project payload from disk or IPC — validated field-by-field below
  const raw = (project ?? {}) as Record<string, unknown>
  const type = normalizeType(raw.type)
  const metadata = PROJECT_TYPES[type]
  const parsedPort = raw.port == null || raw.port === '' ? null : Number(raw.port)
  const legacyCommand = typeof raw.startCommand === 'string' && raw.startCommand.trim()
    ? raw.startCommand.trim()
    : typeof raw.command === 'string' ? raw.command.trim() : ''
  const commands = normalizeCommands(raw.commands, legacyCommand, parsedPort)
  const primaryCommand = commands.find((item) => item.primary) || commands[0]
  if (primaryCommand) {
    primaryCommand.command = legacyCommand || primaryCommand.command
    primaryCommand.port = parsedPort === null || Number.isInteger(parsedPort) ? parsedPort : primaryCommand.port
  }
  const id = typeof raw.id === 'string' && raw.id.trim()
    ? raw.id.trim()
    : (createId?.() ?? '')

  const normalizedVersion = typeof raw.schemaVersion === 'number'
    ? raw.schemaVersion
    : PROJECT_SCHEMA_VERSION

  return {
    id: id as string,
    name: typeof raw.name === 'string' ? raw.name.trim() : '',
    path: typeof raw.path === 'string' ? raw.path.trim() : '',
    type,
    port: primaryCommand?.port === null || Number.isInteger(primaryCommand?.port) ? primaryCommand.port : null,
    startCommand: primaryCommand?.command || legacyCommand,
    commands,
    envVars: normalizeEnvVars(raw.envVars, raw.env),
    emoji: typeof raw.emoji === 'string' && raw.emoji.trim()
      ? raw.emoji.trim()
      : typeof raw.icon === 'string' && raw.icon.trim() ? raw.icon.trim() : metadata.emoji,
    color: typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color)
      ? raw.color
      : metadata.color,
    autoStart: raw.autoStart === true,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    lastRun: typeof raw.lastRun === 'string' ? raw.lastRun : null,
    tags: normalizeTags(raw.tags),
    customCommands: normalizeCustomCommands(raw.customCommands),
    dependsOn: normalizeDependsOn(raw.dependsOn),
    schemaVersion: Math.max(normalizedVersion, PROJECT_SCHEMA_VERSION),
  }
}

// TODO(ts): input is dynamic IPC payload — sanitized field-by-field at runtime.
function sanitizeProjectChanges(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Project data must be an object')
  }

  const unknown = Object.keys(input).filter((key) => !PROJECT_FIELDS.has(key))
  if (unknown.length > 0) {
    throw new Error(`Unsupported project field: ${unknown[0]}`)
  }

  const changes: Record<string, unknown> = {}
  for (const field of PROJECT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) changes[field] = (input as Record<string, unknown>)[field]
  }

  for (const field of ['name', 'path', 'startCommand', 'emoji', 'color']) {
    if (changes[field] !== undefined && typeof changes[field] !== 'string') {
      throw new Error(`${field} must be a string`)
    }
  }
  if (changes.type !== undefined && !(PROJECT_TYPES as Record<string, ProjectTypeMeta>)[changes.type as string]) throw new Error('Project type is invalid')
  if (changes.port !== undefined && changes.port !== null && !Number.isInteger(changes.port)) throw new Error('Port must be an integer or null')
  if (changes.commands !== undefined && !Array.isArray(changes.commands)) throw new Error('Project commands must be an array')
  if (Array.isArray(changes.commands)) {
    for (const item of changes.commands) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Each project command must be an object')
      const command = item as Record<string, unknown>
      const unknownCommandField = Object.keys(command).find((key) => !['id', 'name', 'command', 'port', 'primary'].includes(key))
      if (unknownCommandField) throw new Error(`Unsupported project command field: ${unknownCommandField}`)
      if (typeof command.id !== 'string' || typeof command.name !== 'string' || typeof command.command !== 'string') {
        throw new Error('Each project command must contain string id, name, and command fields')
      }
      if (command.port !== null && command.port !== undefined && !Number.isInteger(command.port)) throw new Error('Project command port must be an integer or null')
      if (command.primary !== undefined && typeof command.primary !== 'boolean') throw new Error('Project command primary must be a boolean')
    }
  }
  if (changes.schemaVersion !== undefined && !Number.isInteger(changes.schemaVersion)) throw new Error('schemaVersion must be an integer')
  if (changes.autoStart !== undefined && typeof changes.autoStart !== 'boolean') throw new Error('autoStart must be a boolean')
  if (changes.tags !== undefined) {
    if (!Array.isArray(changes.tags)) throw new Error('Tags must be an array')
    for (const tag of changes.tags) {
      if (typeof tag !== 'string' || !tag.trim()) throw new Error('Each tag must be a non-empty string')
    }
  }
  if (changes.customCommands !== undefined) {
    if (!Array.isArray(changes.customCommands)) throw new Error('Custom commands must be an array')
    for (const item of changes.customCommands) {
      if (!item || typeof item !== 'object') throw new Error('Each custom command must be an object')
      const command = item as Record<string, unknown>
      if (typeof command.id !== 'string' || !command.id.trim()) throw new Error('Custom command id is required')
      if (typeof command.label !== 'string' || !command.label.trim()) throw new Error('Custom command label is required')
      if (typeof command.command !== 'string' || !command.command.trim()) throw new Error('Custom command is required')
    }
  }
  if (changes.dependsOn !== undefined) {
    if (!Array.isArray(changes.dependsOn)) throw new Error('dependsOn must be an array')
    for (const dep of changes.dependsOn) {
      if (typeof dep !== 'string' || !dep.trim()) throw new Error('Each dependency must be a non-empty string')
    }
  }
  if (changes.envVars !== undefined && !Array.isArray(changes.envVars)) throw new Error('Environment variables must be an array')
  if (Array.isArray(changes.envVars)) {
    for (const item of changes.envVars) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || typeof (item as Record<string, unknown>).key !== 'string' || ((item as Record<string, unknown>).value != null && typeof (item as Record<string, unknown>).value !== 'string')) {
        throw new Error('Each environment variable must contain string key and value fields')
      }
      const env = item as Record<string, unknown>
      const unknownEnvField = Object.keys(env).find((key) => !['key', 'value', 'secret', 'unchanged'].includes(key))
      if (unknownEnvField) throw new Error(`Unsupported environment variable field: ${unknownEnvField}`)
      if (env.unchanged !== undefined && typeof env.unchanged !== 'boolean') throw new Error('Environment unchanged marker must be a boolean')
    }
  }
  return changes
}

function validateProject(project: Project): Project {
  if (!project.id || typeof project.id !== 'string') throw new Error('Project ID is required')
  if (!project.name) throw new Error('Project name is required')
  if (!project.path) throw new Error('Project path is required')
  if (!PROJECT_TYPES[project.type]) throw new Error('Project type is invalid')
  if (project.port !== null && (!Number.isInteger(project.port) || project.port < 1 || project.port > 65535)) {
    throw new Error('Port must be an integer between 1 and 65535')
  }
  if (!project.startCommand) throw new Error('Start command is required')
  if (!Array.isArray(project.commands) || project.commands.length === 0) throw new Error('At least one project command is required')
  const commandIds = new Set()
  const commandPorts = new Set()
  let primaryCommands = 0
  for (const command of project.commands) {
    if (!command.id || !command.name || !command.command) throw new Error('Project command id, name, and command are required')
    if (commandIds.has(command.id)) throw new Error(`Duplicate project command: ${command.id}`)
    commandIds.add(command.id)
    if (command.primary) primaryCommands += 1
    if (command.port !== null && (!Number.isInteger(command.port) || command.port < 1 || command.port > 65535)) {
      throw new Error('Project command port must be an integer between 1 and 65535')
    }
    if (command.port !== null) {
      if (commandPorts.has(command.port)) throw new Error(`Duplicate project command port: ${command.port}`)
      commandPorts.add(command.port)
    }
  }
  if (primaryCommands !== 1) throw new Error('Project must have exactly one primary command')
  if (!Array.isArray(project.envVars)) throw new Error('Environment variables must be an array')
  if (!Array.isArray(project.tags)) throw new Error('Tags must be an array')
  if (!Array.isArray(project.customCommands)) throw new Error('Custom commands must be an array')
  if (!Array.isArray(project.dependsOn)) throw new Error('dependsOn must be an array')

  const keys = new Set()
  for (const item of project.envVars) {
    if (!item.key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.key)) {
      throw new Error(`Invalid environment variable name: ${item.key || '(empty)'}`)
    }
    if (keys.has(item.key)) throw new Error(`Duplicate environment variable: ${item.key}`)
    keys.add(item.key)
  }

  if (!/^#[0-9a-f]{6}$/i.test(project.color)) throw new Error('Project color must be a hex color')
  return project
}

const SENSITIVE_KEYWORDS = [
  'PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'AUTH', 'CREDENTIAL', 'PRIVATE', 'DATABASE_URL', 'CONN_STRING', 'SALT', 'PASSPHRASE'
]

function isSensitiveKey(key: unknown): boolean {
  if (typeof key !== 'string') return false
  const upperKey = key.toUpperCase()
  return SENSITIVE_KEYWORDS.some((kw) => upperKey.includes(kw))
}

function redactSensitiveEnv(envInput: unknown): unknown {
  if (Array.isArray(envInput)) {
    return envInput.map((item) => {
      if (!item || typeof item !== 'object') return item
      const env = item as { key?: unknown; value?: unknown }
      if (isSensitiveKey(env.key)) {
        return { key: env.key, value: '', secret: true, unchanged: true }
      }
      return item
    })
  } else if (envInput && typeof envInput === 'object') {
    const redacted: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(envInput)) {
      redacted[k] = isSensitiveKey(k) ? '••••••••' : v
    }
    return redacted
  }
  return envInput
}

function normalizeCommands(commands: unknown, startCommand: string, port: number | null): ProjectCommand[] {
  const source: Array<Record<string, unknown>> = Array.isArray(commands) && commands.length > 0
    ? commands as Array<Record<string, unknown>>
    : [{ id: 'main', name: 'Application', command: startCommand, port, primary: true }]
  const hasPrimary = source.some((item) => item?.primary === true)
  return source.map((item, index) => ({
    id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : `command-${index + 1}`,
    name: typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : `Command ${index + 1}`,
    command: typeof item?.command === 'string' ? item.command.trim() : '',
    port: item?.port == null || item.port === '' ? null : Number(item.port),
    primary: item?.primary === true || (!hasPrimary && index === 0),
  }))
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  return tags
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim())
    .filter((item, index, arr) => arr.indexOf(item) === index)
}

function normalizeCustomCommands(customCommands: unknown): CustomCommand[] {
  if (!Array.isArray(customCommands)) return []
  return customCommands
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: typeof item.label === 'string' ? item.label.trim() : '',
      command: typeof item.command === 'string' ? item.command.trim() : '',
    }))
    .filter((item) => item.label && item.command)
}

function normalizeDependsOn(dependsOn: unknown): string[] {
  if (!Array.isArray(dependsOn)) return []
  return dependsOn
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim())
    .filter((item, index, arr) => arr.indexOf(item) === index)
}

function toRendererProject(project: Project): Project {
  return { ...project, envVars: redactSensitiveEnv(project.envVars) as EnvVar[] }
}

export {
  PROJECT_TYPES,
  PROJECT_SCHEMA_VERSION,
  migrateProjects,
  envVarsToObject,
  normalizeCommands,
  normalizeTags,
  normalizeCustomCommands,
  normalizeDependsOn,
  normalizeProject,
  normalizeType,
  sanitizeProjectChanges,
  validateProject,
  redactSensitiveEnv,
  isSensitiveKey,
  toRendererProject,
}

