// @ts-check
const fs = require('fs').promises
const { ipcMain, dialog, app } = require('electron')
const { assertTrustedIpcEvent } = require('../utils/ipcSecurity')
const { safeHandle } = require('../utils/ipcValidation')
const { toRendererProject } = require('../projectSchema')
const {
  buildBundle,
  encryptBundle,
  parseBackupFile,
  validateBundle,
  mergeProjects,
} = require('../utils/workspaceBackup')
/** @typedef {import('../managers/StorageManager')} StorageManager */
/** @typedef {import('../managers/HealthManager')} HealthManager */
/** @typedef {import('electron').BrowserWindow} BrowserWindow */

/**
 * Collect the current workspace state for a backup: raw projects (env values
 * included — this is a recovery bundle), config, presets and health analytics.
 * @param {StorageManager} storageManager
 * @param {HealthManager} [healthManager]
 */
async function collectWorkspaceData(storageManager, healthManager) {
  const [projects, config, presets] = await Promise.all([
    storageManager.loadProjects(),
    storageManager.loadConfig(),
    storageManager.loadPresets(),
  ])
  let health = { projects: {} }
  if (healthManager && healthManager.data) {
    health = healthManager.data
  }
  return { projects, config, presets, health }
}

/**
 * Merge the backup's config/presets into the current state without
 * overwriting anything the user already has (current values win).
 * @param {object} current
 * @param {object} backupConfig
 * @param {Array<Record<string, any>>} currentPresets
 * @param {Array<Record<string, any>>} backupPresets
 */
function mergeConfigAndPresets(current, backupConfig, currentPresets, backupPresets) {
  const nextConfig = { ...(backupConfig || {}), ...current }
  const existingIds = new Set((currentPresets || []).map((preset) => preset?.id).filter(Boolean))
  const presetsToAdd = (Array.isArray(backupPresets) ? backupPresets : [])
    .filter((preset) => preset && preset.id && !existingIds.has(preset.id))
  return {
    config: nextConfig,
    configChanged: JSON.stringify(nextConfig) !== JSON.stringify(current),
    presetsToAdd,
  }
}

/**
 * Workspace backup: one portable file (optionally AES-256-GCM encrypted) with
 * projects (including env values), config, presets and health analytics. Used
 * to move the whole workspace to another machine or recover after a wipe.
 * @param {StorageManager} storageManager
 * @param {HealthManager} [healthManager]
 * @param {BrowserWindow} [mainWindow]
 */
function setupBackupHandlers(storageManager, healthManager, mainWindow) {
  const safeSend = (channel, ...args) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(channel, ...args)
      }
    } catch {
      // Window may be gone during quit — not critical.
    }
  }

  const handle = (channel, handler) => safeHandle(ipcMain, assertTrustedIpcEvent, channel, handler)

  // Export: assemble the bundle, optionally encrypt, save via the native dialog.
  handle('backup-export', async (event, password) => {
    const data = await collectWorkspaceData(storageManager, healthManager)
    const bundle = buildBundle({ ...data, appVersion: app.getVersion() })
    const json = JSON.stringify(bundle, null, 2)
    const content = password
      ? JSON.stringify(encryptBundle(json, password))
      : json

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const result = await dialog.showSaveDialog({
      title: 'Export workspace backup',
      defaultPath: `devlauncher-backup-${stamp}.json`,
      filters: [{ name: 'DevLauncher backup', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }

    await fs.writeFile(result.filePath, content, 'utf8')
    return {
      success: true,
      filePath: result.filePath,
      encrypted: Boolean(password),
      projectCount: data.projects.length,
    }
  })

  // Import: read a backup file (plaintext or encrypted), validate it, then
  // merge projects/config/presets — existing data is never overwritten.
  handle('backup-import', async (event, password) => {
    const result = await dialog.showOpenDialog({
      title: 'Import workspace backup',
      properties: ['openFile'],
      filters: [{ name: 'DevLauncher backup', extensions: ['json'] }],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    const filePath = result.filePaths[0]
    const text = await fs.readFile(filePath, 'utf8')
    const { parsed, wasEncrypted } = parseBackupFile(text.replace(/^\uFEFF/, ''), password || undefined)
    validateBundle(parsed)

    const current = await collectWorkspaceData(storageManager, healthManager)
    const merged = mergeProjects(current.projects, parsed.projects || [])
    const { config, configChanged, presetsToAdd } = mergeConfigAndPresets(
      current.config,
      parsed.config,
      current.presets,
      parsed.presets
    )

    if (merged.projects.length !== current.projects.length) {
      await storageManager.saveProjects(merged.projects)
      safeSend('projects-updated', merged.projects.map(toRendererProject))
    }
    if (configChanged) await storageManager.saveConfig(config)
    if (presetsToAdd.length > 0) {
      await storageManager.savePresets([...(current.presets || []), ...presetsToAdd])
    }

    return {
      success: true,
      filePath,
      wasEncrypted,
      added: merged.added.map(toRendererProject),
      skipped: merged.skipped,
      configUpdated: configChanged,
      presetsAdded: presetsToAdd.length,
      hasSecrets: parsed.hasSecrets === true,
    }
  })
}

module.exports = { setupBackupHandlers, mergeConfigAndPresets, collectWorkspaceData }
