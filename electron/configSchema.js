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

function booleanOr(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function integerOr(value, fallback, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback
}

function normalizeConfig(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) config = {}
  const notifications = config.notifications && typeof config.notifications === 'object'
    ? config.notifications
    : {}
  const terminal = config.terminal && typeof config.terminal === 'object' ? config.terminal : {}

  return {
    theme: config.theme === 'light' ? 'light' : 'dark',
    sidebarExpanded: booleanOr(config.sidebarExpanded, DEFAULT_CONFIG.sidebarExpanded),
    startOnBoot: booleanOr(config.startOnBoot, DEFAULT_CONFIG.startOnBoot),
    minimizeToTray: booleanOr(config.minimizeToTray, DEFAULT_CONFIG.minimizeToTray),
    autoStartProjects: booleanOr(config.autoStartProjects, DEFAULT_CONFIG.autoStartProjects),
    notifications: {
      onStart: booleanOr(notifications.onStart, booleanOr(config.notifyOnStart, DEFAULT_CONFIG.notifications.onStart)),
      onError: booleanOr(notifications.onError, booleanOr(config.notifyOnCrash, DEFAULT_CONFIG.notifications.onError)),
      sound: booleanOr(notifications.sound, booleanOr(config.notificationSound, DEFAULT_CONFIG.notifications.sound)),
    },
    terminal: {
      fontSize: integerOr(terminal.fontSize, integerOr(config.terminalFontSize, DEFAULT_CONFIG.terminal.fontSize, 8, 32), 8, 32),
      maxLines: integerOr(terminal.maxLines, integerOr(config.terminalMaxLines, DEFAULT_CONFIG.terminal.maxLines, 100, 10000), 100, 10000),
      autoScroll: booleanOr(terminal.autoScroll, booleanOr(config.terminalAutoScroll, DEFAULT_CONFIG.terminal.autoScroll)),
    },
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

module.exports = { DEFAULT_CONFIG, applyConfigUpdates, normalizeConfig }
