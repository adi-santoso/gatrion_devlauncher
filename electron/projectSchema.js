const PROJECT_TYPES = {
  LARAVEL: { labels: ['Laravel', '🔴 Laravel'], emoji: '🔴', color: '#FF2D20' },
  NEXTJS: { labels: ['Next.js', '⚡ Next.js'], emoji: '⚡', color: '#000000' },
  REACT_VITE: { labels: ['React', 'React (Vite)', '⚛️ React (Vite)'], emoji: '⚛️', color: '#61DAFB' },
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

function migrateProjects(projects, fromVersion) {
  if (!Array.isArray(projects)) return projects
  
  const migrated = projects.map(project => {
    let migratedProject = { ...project }
    
    if (fromVersion === undefined || fromVersion === 0) {
      if (project.env && !project.envVars) {
        migratedProject.envVars = Array.isArray(project.env) 
          ? project.env 
          : Object.entries(project.env).map(([key, value]) => ({ key, value }))
      }
      
      if (!project.createdAt) {
        migratedProject.createdAt = new Date().toISOString()
      }
      
      if (!project.id) {
        migratedProject.schemaVersion = PROJECT_SCHEMA_VERSION
      }
    }
    
    if (!migratedProject.schemaVersion) {
      migratedProject.schemaVersion = PROJECT_SCHEMA_VERSION
    }
    
    return migratedProject
  })
  
  return migrated
}

function normalizeType(value) {
  if (typeof value !== 'string') return 'CUSTOM'
  const normalized = value.trim()
  if (PROJECT_TYPES[normalized]) return normalized

  const match = Object.entries(PROJECT_TYPES).find(([, metadata]) =>
    metadata.labels.some((label) => label.toLowerCase() === normalized.toLowerCase())
  )
  return match?.[0] || 'CUSTOM'
}

function normalizeEnvVars(envVars, legacyEnv) {
  const source = Array.isArray(envVars)
    ? envVars
    : legacyEnv && typeof legacyEnv === 'object' && !Array.isArray(legacyEnv)
      ? Object.entries(legacyEnv).map(([key, value]) => ({ key, value }))
      : []

  return source
    .filter((item) => item && typeof item === 'object' && typeof item.key === 'string' && item.key.trim())
    .map((item) => ({
      key: item.key.trim(),
      value: item.value == null ? '' : String(item.value),
    }))
}

function envVarsToObject(envVars) {
  return normalizeEnvVars(envVars).reduce((result, item) => {
    result[item.key] = item.value
    return result
  }, {})
}

function normalizeProject(project, createId) {
  const type = normalizeType(project?.type)
  const metadata = PROJECT_TYPES[type]
  const parsedPort = project?.port == null || project.port === '' ? null : Number(project.port)
  const legacyCommand = typeof project?.startCommand === 'string' && project.startCommand.trim()
    ? project.startCommand.trim()
    : typeof project?.command === 'string' ? project.command.trim() : ''
  const commands = normalizeCommands(project?.commands, legacyCommand, parsedPort)
  const primaryCommand = commands.find((item) => item.primary) || commands[0]
  if (primaryCommand) {
    primaryCommand.command = legacyCommand || primaryCommand.command
    primaryCommand.port = parsedPort === null || Number.isInteger(parsedPort) ? parsedPort : primaryCommand.port
  }
  const id = typeof project?.id === 'string' && project.id.trim()
    ? project.id.trim()
    : createId?.()
  
  const normalizedVersion = typeof project.schemaVersion === 'number' 
    ? project.schemaVersion 
    : PROJECT_SCHEMA_VERSION

  return {
    id,
    name: typeof project?.name === 'string' ? project.name.trim() : '',
    path: typeof project?.path === 'string' ? project.path.trim() : '',
    type,
    port: primaryCommand?.port === null || Number.isInteger(primaryCommand?.port) ? primaryCommand.port : null,
    startCommand: primaryCommand?.command || legacyCommand,
    commands,
    envVars: normalizeEnvVars(project?.envVars, project?.env),
    emoji: typeof project?.emoji === 'string' && project.emoji.trim()
      ? project.emoji.trim()
      : typeof project?.icon === 'string' && project.icon.trim() ? project.icon.trim() : metadata.emoji,
    color: typeof project?.color === 'string' && /^#[0-9a-f]{6}$/i.test(project.color)
      ? project.color
      : metadata.color,
    autoStart: project?.autoStart === true,
    createdAt: typeof project?.createdAt === 'string' ? project.createdAt : new Date().toISOString(),
    lastRun: typeof project?.lastRun === 'string' ? project.lastRun : null,
    tags: normalizeTags(project?.tags),
    customCommands: normalizeCustomCommands(project?.customCommands),
    dependsOn: normalizeDependsOn(project?.dependsOn),
    schemaVersion: Math.max(normalizedVersion, PROJECT_SCHEMA_VERSION),
  }
}

function sanitizeProjectChanges(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Project data must be an object')
  }

  const unknown = Object.keys(input).filter((key) => !PROJECT_FIELDS.has(key))
  if (unknown.length > 0) {
    throw new Error(`Unsupported project field: ${unknown[0]}`)
  }

  const changes = {}
  for (const field of PROJECT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) changes[field] = input[field]
  }

  for (const field of ['name', 'path', 'startCommand', 'emoji', 'color']) {
    if (changes[field] !== undefined && typeof changes[field] !== 'string') {
      throw new Error(`${field} must be a string`)
    }
  }
  if (changes.type !== undefined && !PROJECT_TYPES[changes.type]) throw new Error('Project type is invalid')
  if (changes.port !== undefined && changes.port !== null && !Number.isInteger(changes.port)) throw new Error('Port must be an integer or null')
  if (changes.commands !== undefined && !Array.isArray(changes.commands)) throw new Error('Project commands must be an array')
  if (Array.isArray(changes.commands)) {
    for (const item of changes.commands) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Each project command must be an object')
      const unknownCommandField = Object.keys(item).find((key) => !['id', 'name', 'command', 'port', 'primary'].includes(key))
      if (unknownCommandField) throw new Error(`Unsupported project command field: ${unknownCommandField}`)
      if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.command !== 'string') {
        throw new Error('Each project command must contain string id, name, and command fields')
      }
      if (item.port !== null && item.port !== undefined && !Number.isInteger(item.port)) throw new Error('Project command port must be an integer or null')
      if (item.primary !== undefined && typeof item.primary !== 'boolean') throw new Error('Project command primary must be a boolean')
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
      if (typeof item.id !== 'string' || !item.id.trim()) throw new Error('Custom command id is required')
      if (typeof item.label !== 'string' || !item.label.trim()) throw new Error('Custom command label is required')
      if (typeof item.command !== 'string' || !item.command.trim()) throw new Error('Custom command is required')
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
      if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.key !== 'string' || (item.value != null && typeof item.value !== 'string')) {
        throw new Error('Each environment variable must contain string key and value fields')
      }
      const unknownEnvField = Object.keys(item).find((key) => !['key', 'value', 'secret', 'unchanged'].includes(key))
      if (unknownEnvField) throw new Error(`Unsupported environment variable field: ${unknownEnvField}`)
      if (item.unchanged !== undefined && typeof item.unchanged !== 'boolean') throw new Error('Environment unchanged marker must be a boolean')
    }
  }
  return changes
}

function validateProject(project) {
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
  let primaryCommands = 0
  for (const command of project.commands) {
    if (!command.id || !command.name || !command.command) throw new Error('Project command id, name, and command are required')
    if (commandIds.has(command.id)) throw new Error(`Duplicate project command: ${command.id}`)
    commandIds.add(command.id)
    if (command.primary) primaryCommands += 1
    if (command.port !== null && (!Number.isInteger(command.port) || command.port < 1 || command.port > 65535)) {
      throw new Error('Project command port must be an integer between 1 and 65535')
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

function isSensitiveKey(key) {
  if (typeof key !== 'string') return false
  const upperKey = key.toUpperCase()
  return SENSITIVE_KEYWORDS.some((kw) => upperKey.includes(kw))
}

function redactSensitiveEnv(envInput) {
  if (Array.isArray(envInput)) {
    return envInput.map((item) => {
      if (!item || typeof item !== 'object') return item
      if (isSensitiveKey(item.key)) {
        return { key: item.key, value: '', secret: true, unchanged: true }
      }
      return item
    })
  } else if (envInput && typeof envInput === 'object') {
    const redacted = {}
    for (const [k, v] of Object.entries(envInput)) {
      redacted[k] = isSensitiveKey(k) ? '••••••••' : v
    }
    return redacted
  }
  return envInput
}

function normalizeCommands(commands, startCommand, port) {
  const source = Array.isArray(commands) && commands.length > 0
    ? commands
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

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return []
  return tags
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim())
    .filter((item, index, arr) => arr.indexOf(item) === index)
}

function normalizeCustomCommands(customCommands) {
  if (!Array.isArray(customCommands)) return []
  return customCommands
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: typeof item.label === 'string' ? item.label.trim() : '',
      command: typeof item.command === 'string' ? item.command.trim() : '',
    }))
    .filter((item) => item.label && item.command)
}

function normalizeDependsOn(dependsOn) {
  if (!Array.isArray(dependsOn)) return []
  return dependsOn
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim())
    .filter((item, index, arr) => arr.indexOf(item) === index)
}

function toRendererProject(project) {
  return { ...project, envVars: redactSensitiveEnv(project.envVars) }
}

module.exports = {
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
