// @ts-check
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
  autoRestart: {
    enabled: false,
    maxRetries: 3,
    delayMs: 2000,
  },
  preview: {
    keepAlive: true,
  },
  prayer: {
    showIn: 'both', // 'sidebar' | 'topbar' | 'both' | 'off'
    method: 'KEMENAG',
    city: 'Jakarta',
    latitude: -6.2088,
    longitude: 106.8456,
    utcOffset: 7,
    adjustments: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
    notify: true,
    sound: true,
  },
  agent: {
    notifyOnFinish: true, // system notification when an agent turn completes while the app is unfocused
    sound: false,
  },
  windowBounds: null,
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
  const autoRestart = migrated.autoRestart && typeof migrated.autoRestart === 'object' ? migrated.autoRestart : {}
  const preview = migrated.preview && typeof migrated.preview === 'object' ? migrated.preview : {}
  const prayer = migrated.prayer && typeof migrated.prayer === 'object' ? migrated.prayer : {}
  const adjustments = prayer.adjustments && typeof prayer.adjustments === 'object' ? prayer.adjustments : {}
  const agent = migrated.agent && typeof migrated.agent === 'object' ? migrated.agent : {}
  const windowBounds = migrated.windowBounds && typeof migrated.windowBounds === 'object' && !Array.isArray(migrated.windowBounds) ? migrated.windowBounds : null

  return {
    theme: ['dark', 'light', 'system'].includes(migrated.theme) ? migrated.theme : 'dark',
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
    autoRestart: {
      enabled: booleanOr(autoRestart.enabled, DEFAULT_CONFIG.autoRestart.enabled),
      maxRetries: integerOr(autoRestart.maxRetries, DEFAULT_CONFIG.autoRestart.maxRetries, 0, 10),
      delayMs: integerOr(autoRestart.delayMs, DEFAULT_CONFIG.autoRestart.delayMs, 500, 60000),
    },
    preview: {
      keepAlive: booleanOr(preview.keepAlive, DEFAULT_CONFIG.preview.keepAlive),
    },
    prayer: {
      showIn: ['sidebar', 'topbar', 'both', 'off'].includes(prayer.showIn) ? prayer.showIn : DEFAULT_CONFIG.prayer.showIn,
      method: ['KEMENAG', 'MWL', 'ISNA', 'Egypt', 'Makkah', 'Karachi'].includes(prayer.method) ? prayer.method : DEFAULT_CONFIG.prayer.method,
      city: typeof prayer.city === 'string' && prayer.city.trim() ? prayer.city.trim().slice(0, 100) : DEFAULT_CONFIG.prayer.city,
      latitude: Number.isFinite(prayer.latitude) && prayer.latitude >= -90 && prayer.latitude <= 90 ? prayer.latitude : DEFAULT_CONFIG.prayer.latitude,
      longitude: Number.isFinite(prayer.longitude) && prayer.longitude >= -180 && prayer.longitude <= 180 ? prayer.longitude : DEFAULT_CONFIG.prayer.longitude,
      utcOffset: Number.isInteger(prayer.utcOffset) && prayer.utcOffset >= -12 && prayer.utcOffset <= 14 ? prayer.utcOffset : DEFAULT_CONFIG.prayer.utcOffset,
      adjustments: {
        fajr: integerOr(adjustments.fajr, DEFAULT_CONFIG.prayer.adjustments.fajr, -60, 60),
        dhuhr: integerOr(adjustments.dhuhr, DEFAULT_CONFIG.prayer.adjustments.dhuhr, -60, 60),
        asr: integerOr(adjustments.asr, DEFAULT_CONFIG.prayer.adjustments.asr, -60, 60),
        maghrib: integerOr(adjustments.maghrib, DEFAULT_CONFIG.prayer.adjustments.maghrib, -60, 60),
        isha: integerOr(adjustments.isha, DEFAULT_CONFIG.prayer.adjustments.isha, -60, 60),
      },
      notify: booleanOr(prayer.notify, DEFAULT_CONFIG.prayer.notify),
      sound: booleanOr(prayer.sound, DEFAULT_CONFIG.prayer.sound),
    },
    agent: {
      notifyOnFinish: booleanOr(agent.notifyOnFinish, DEFAULT_CONFIG.agent.notifyOnFinish),
      sound: booleanOr(agent.sound, DEFAULT_CONFIG.agent.sound),
    },
    windowBounds: windowBounds && Number.isFinite(windowBounds.width) && Number.isFinite(windowBounds.height)
      ? {
          x: Number.isFinite(windowBounds.x) ? windowBounds.x : undefined,
          y: Number.isFinite(windowBounds.y) ? windowBounds.y : undefined,
          width: Math.max(400, windowBounds.width),
          height: Math.max(300, windowBounds.height),
          maximized: !!windowBounds.maximized,
        }
      : null,
    schemaVersion: CONFIG_SCHEMA_VERSION,
  }
}

function applyConfigUpdates(current, updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('Config updates must be an object')
  }

  const allowed = new Set(['theme', 'sidebarExpanded', 'startOnBoot', 'minimizeToTray', 'autoStartProjects', 'notifications', 'terminal', 'autoRestart', 'preview', 'prayer', 'agent', 'windowBounds'])
  const unknown = Object.keys(updates).find((key) => !allowed.has(key))
  if (unknown) throw new Error(`Unsupported config field: ${unknown}`)

  for (const nestedKey of ['notifications', 'terminal', 'autoRestart', 'preview', 'prayer', 'agent', 'windowBounds']) {
    if (updates[nestedKey] !== undefined && updates[nestedKey] !== null && (!updates[nestedKey] || typeof updates[nestedKey] !== 'object' || Array.isArray(updates[nestedKey]))) {
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
  if (updates.autoRestart?.enabled !== undefined && typeof updates.autoRestart.enabled !== 'boolean') {
    throw new Error('autoRestart.enabled must be a boolean')
  }
  if (updates.preview?.keepAlive !== undefined && typeof updates.preview.keepAlive !== 'boolean') {
    throw new Error('preview.keepAlive must be a boolean')
  }
  if (updates.prayer?.showIn !== undefined && !['sidebar', 'topbar', 'both', 'off'].includes(updates.prayer.showIn)) {
    throw new Error('prayer.showIn must be sidebar, topbar, both, or off')
  }
  if (updates.prayer?.method !== undefined && !['KEMENAG', 'MWL', 'ISNA', 'Egypt', 'Makkah', 'Karachi'].includes(updates.prayer.method)) {
    throw new Error('prayer.method is invalid')
  }
  if (updates.prayer?.latitude !== undefined && (!Number.isFinite(updates.prayer.latitude) || updates.prayer.latitude < -90 || updates.prayer.latitude > 90)) {
    throw new Error('prayer.latitude must be a number between -90 and 90')
  }
  if (updates.prayer?.longitude !== undefined && (!Number.isFinite(updates.prayer.longitude) || updates.prayer.longitude < -180 || updates.prayer.longitude > 180)) {
    throw new Error('prayer.longitude must be a number between -180 and 180')
  }
  if (updates.prayer?.utcOffset !== undefined && (!Number.isInteger(updates.prayer.utcOffset) || updates.prayer.utcOffset < -12 || updates.prayer.utcOffset > 14)) {
    throw new Error('prayer.utcOffset must be an integer between -12 and 14')
  }
  if (updates.prayer?.notify !== undefined && typeof updates.prayer.notify !== 'boolean') throw new Error('prayer.notify must be a boolean')
  if (updates.prayer?.sound !== undefined && typeof updates.prayer.sound !== 'boolean') throw new Error('prayer.sound must be a boolean')
  if (updates.agent?.notifyOnFinish !== undefined && typeof updates.agent.notifyOnFinish !== 'boolean') throw new Error('agent.notifyOnFinish must be a boolean')
  if (updates.agent?.sound !== undefined && typeof updates.agent.sound !== 'boolean') throw new Error('agent.sound must be a boolean')

  const notificationKey = Object.keys(updates.notifications || {}).find((key) => !['onStart', 'onError', 'sound'].includes(key))
  if (notificationKey) throw new Error(`Unsupported notifications field: ${notificationKey}`)
  const terminalKey = Object.keys(updates.terminal || {}).find((key) => !['fontSize', 'maxLines', 'autoScroll'].includes(key))
  if (terminalKey) throw new Error(`Unsupported terminal field: ${terminalKey}`)
  const autoRestartKey = Object.keys(updates.autoRestart || {}).find((key) => !['enabled', 'maxRetries', 'delayMs'].includes(key))
  if (autoRestartKey) throw new Error(`Unsupported autoRestart field: ${autoRestartKey}`)
  const previewKey = Object.keys(updates.preview || {}).find((key) => !['keepAlive'].includes(key))
  if (previewKey) throw new Error(`Unsupported preview field: ${previewKey}`)
  const prayerKey = Object.keys(updates.prayer || {}).find((key) => !['showIn', 'method', 'city', 'latitude', 'longitude', 'utcOffset', 'adjustments', 'notify', 'sound'].includes(key))
  if (prayerKey) throw new Error(`Unsupported prayer field: ${prayerKey}`)
  const agentKey = Object.keys(updates.agent || {}).find((key) => !['notifyOnFinish', 'sound'].includes(key))
  if (agentKey) throw new Error(`Unsupported agent field: ${agentKey}`)
  const adjustmentKey = Object.keys(updates.prayer?.adjustments || {}).find((key) => !['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].includes(key))
  if (adjustmentKey) throw new Error(`Unsupported prayer.adjustments field: ${adjustmentKey}`)

  const merged = {
    ...current,
    ...updates,
    notifications: { ...current.notifications, ...(updates.notifications || {}) },
    terminal: { ...current.terminal, ...(updates.terminal || {}) },
    autoRestart: updates.autoRestart !== undefined && updates.autoRestart !== null
      ? { ...current.autoRestart, ...updates.autoRestart }
      : current.autoRestart,
    preview: updates.preview !== undefined && updates.preview !== null
      ? { ...current.preview, ...updates.preview }
      : current.preview,
    prayer: updates.prayer !== undefined && updates.prayer !== null
      ? { ...current.prayer, ...updates.prayer, adjustments: { ...(current.prayer?.adjustments || {}), ...(updates.prayer?.adjustments || {}) } }
      : current.prayer,
    agent: updates.agent !== undefined && updates.agent !== null
      ? { ...current.agent, ...updates.agent }
      : current.agent,
    windowBounds: updates.windowBounds !== undefined ? updates.windowBounds : current.windowBounds,
  }
  const normalized = normalizeConfig(merged)

  if (updates.theme !== undefined && !['dark', 'light', 'system'].includes(updates.theme)) throw new Error('Theme must be dark, light or system')
  if (updates.terminal?.fontSize !== undefined && normalized.terminal.fontSize !== updates.terminal.fontSize) throw new Error('Terminal font size must be an integer between 8 and 32')
  if (updates.terminal?.maxLines !== undefined && normalized.terminal.maxLines !== updates.terminal.maxLines) throw new Error('Terminal max lines must be an integer between 100 and 10000')
  for (const adjustmentKey of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
    if (updates.prayer?.adjustments?.[adjustmentKey] !== undefined
      && normalized.prayer.adjustments[adjustmentKey] !== updates.prayer.adjustments[adjustmentKey]) {
      throw new Error(`prayer.adjustments.${adjustmentKey} must be an integer between -60 and 60`)
    }
  }

  return normalized
}

module.exports = { DEFAULT_CONFIG, CONFIG_SCHEMA_VERSION, applyConfigUpdates, normalizeConfig, migrateConfig }
