const DEFAULT_CONFIG = {
  theme: 'dark',
  sidebarExpanded: true,
  startOnBoot: false,
  minimizeToTray: true,
  autoStartProjects: false,
  notifications: {
    onStart: true,
    onError: true,
    sound: false,
  },
  terminal: {
    fontSize: 14,
    maxLines: 1000,
    autoScroll: true,
  },
}

const CONFIG_SCHEMA_VERSION = 1

function migrateConfig(config, fromVersion) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Config data must be an object')
  }
  if (Number.isInteger(fromVersion) && fromVersion > CONFIG_SCHEMA_VERSION) {
    throw new Error(`Unsupported config schema version: ${fromVersion}`)
  }
  
  let migrated = { ...config }
  
  if (fromVersion === undefined || fromVersion === 0) {
    // Migrate old notification fields
    if (migrated.notifyOnStart !== undefined && migrated.notifications?.onStart === undefined) {
      migrated.notifications = {
        ...migrated.notifications,
        onStart: migrated.notifyOnStart,
      }
    }
    
    if (migrated.notifyOnCrash !== undefined && migrated.notifications?.onError === undefined) {
      migrated.notifications = {
        ...migrated.notifications,
        onError: migrated.notifyOnCrash,
      }
    }
    
    if (migrated.notificationSound !== undefined && migrated.notifications?.sound === undefined) {
      migrated.notifications = {
        ...migrated.notifications,
        sound: migrated.notificationSound,
      }
    }
    
    // Migrate old terminal fields
    if (migrated.terminalFontSize !== undefined && migrated.terminal?.fontSize === undefined) {
      migrated.terminal = {
        ...migrated.terminal,
        fontSize: migrated.terminalFontSize,
      }
    }
    
    if (migrated.terminalMaxLines !== undefined && migrated.terminal?.maxLines === undefined) {
      migrated.terminal = {
        ...migrated.terminal,
        maxLines: migrated.terminalMaxLines,
      }
    }
    
    if (migrated.terminalAutoScroll !== undefined && migrated.terminal?.autoScroll === undefined) {
      migrated.terminal = {
        ...migrated.terminal,
        autoScroll: migrated.terminalAutoScroll,
      }
    }
  }
  
  migrated.schemaVersion = CONFIG_SCHEMA_VERSION
  
  return migrated
}

function booleanOr(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function integerOr(value, fallback, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback
}

function normalizeConfig(config = {}) {
  const migrated = migrateConfig(config, config.schemaVersion)
  
  if (migrated.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    console.warn(`[configSchema] Config version mismatch: ${migrated.schemaVersion} vs ${CONFIG_SCHEMA_VERSION}`)
  }
  
  const notifications = migrated.notifications && typeof migrated.notifications === 'object'
    ? migrated.notifications
    : {}
  const terminal = migrated.terminal && typeof migrated.terminal === 'object' ? migrated.terminal : {}

  return {
    theme: migrated.theme === 'light' ? 'light' : 'dark',
    sidebarExpanded: booleanOr(migrated.sidebarExpanded, DEFAULT_CONFIG.sidebarExpanded),
    startOnBoot: booleanOr(migrated.startOnBoot, DEFAULT_CONFIG.startOnBoot),
    minimizeToTray: booleanOr(migrated.minimizeToTray, DEFAULT_CONFIG.minimizeToTray),
    autoStartProjects: booleanOr(migrated.autoStartProjects, DEFAULT_CONFIG.autoStartProjects),
    notifications: {
      onStart: booleanOr(notifications.onStart, booleanOr(migrated.notifyOnStart, DEFAULT_CONFIG.notifications.onStart)),
      onError: booleanOr(notifications.onError, booleanOr(migrated.notifyOnCrash, DEFAULT_CONFIG.notifications.onError)),
      sound: booleanOr(notifications.sound, booleanOr(migrated.notificationSound, DEFAULT_CONFIG.notifications.sound)),
    },
    terminal: {
      fontSize: integerOr(terminal.fontSize, integerOr(migrated.terminalFontSize, DEFAULT_CONFIG.terminal.fontSize, 8, 32), 8, 32),
      maxLines: integerOr(terminal.maxLines, integerOr(migrated.terminalMaxLines, DEFAULT_CONFIG.terminal.maxLines, 100, 10000), 100, 10000),
      autoScroll: booleanOr(terminal.autoScroll, booleanOr(migrated.terminalAutoScroll, DEFAULT_CONFIG.terminal.autoScroll)),
    },
    schemaVersion: CONFIG_SCHEMA_VERSION,
  }
}

function applyConfigUpdates(current, updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('Config updates must be an object')
  }

  const allowed = new Set(['theme', 'sidebarExpanded', 'startOnBoot', 'minimizeToTray', 'autoStartProjects', 'notifications', 'terminal'])
  const unknown = Object.keys(updates).find((key) => !allowed.has(key))
  if (unknown) throw new Error(`Unsupported config field: ${unknown}`)

  for (const nestedKey of ['notifications', 'terminal']) {
    if (updates[nestedKey] !== undefined && (!updates[nestedKey] || typeof updates[nestedKey] !== 'object' || Array.isArray(updates[nestedKey]))) {
      throw new Error(`${nestedKey} config must be an object`)
    }
  }

  for (const key of ['sidebarExpanded', 'startOnBoot', 'minimizeToTray', 'autoStartProjects']) {
    if (updates[key] !== undefined && typeof updates[key] !== 'boolean') throw new Error(`${key} must be a boolean`)
  }
  for (const key of ['onStart', 'onError', 'sound']) {
    if (updates.notifications?.[key] !== undefined && typeof updates.notifications[key] !== 'boolean') {
      throw new Error(`notifications.${key} must be a boolean`)
    }
  }
  if (updates.terminal?.autoScroll !== undefined && typeof updates.terminal.autoScroll !== 'boolean') {
    throw new Error('terminal.autoScroll must be a boolean')
  }

  const notificationKey = Object.keys(updates.notifications || {}).find((key) => !['onStart', 'onError', 'sound'].includes(key))
  if (notificationKey) throw new Error(`Unsupported notifications field: ${notificationKey}`)
  const terminalKey = Object.keys(updates.terminal || {}).find((key) => !['fontSize', 'maxLines', 'autoScroll'].includes(key))
  if (terminalKey) throw new Error(`Unsupported terminal field: ${terminalKey}`)

  const merged = {
    ...current,
    ...updates,
    notifications: { ...current.notifications, ...(updates.notifications || {}) },
    terminal: { ...current.terminal, ...(updates.terminal || {}) },
  }
  const normalized = normalizeConfig(merged)

  if (updates.theme !== undefined && !['dark', 'light'].includes(updates.theme)) throw new Error('Theme must be dark or light')
  if (updates.terminal?.fontSize !== undefined && normalized.terminal.fontSize !== updates.terminal.fontSize) throw new Error('Terminal font size must be an integer between 8 and 32')
  if (updates.terminal?.maxLines !== undefined && normalized.terminal.maxLines !== updates.terminal.maxLines) throw new Error('Terminal max lines must be an integer between 100 and 10000')

  return normalized
}

module.exports = { DEFAULT_CONFIG, CONFIG_SCHEMA_VERSION, applyConfigUpdates, normalizeConfig, migrateConfig }
