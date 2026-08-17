import Logger from './logger'

const fs = require('fs').promises
const path = require('path')

/**
 * Reset-app-data flow (Settings → Data & Backup → Reset DevLauncher).
 *
 * The reset handler writes a `.reset-pending` marker into userData and then
 * relaunches the app normally. On the next startup, `applyPendingReset` runs
 * BEFORE any manager initializes, deletes every piece of app state (projects,
 * config, presets, activities, health, backups, logs, crash dumps), and clears
 * the marker — leaving DevLauncher exactly as a fresh install.
 *
 * Deleting on startup instead of in the reset handler is deliberate:
 * `HealthManager.dispose()` (and other managers) flush their in-memory state
 * to disk during quit, which would resurrect the files if we deleted them
 * first. Project folders on disk are never touched — only DevLauncher data.
 */
const RESET_FLAG_FILE = '.reset-pending'

// Files managed by StorageManager / HealthManager, plus support folders.
const DATA_FILES = ['projects.json', 'config.json', 'presets.json', 'activities.json', 'health.json']
const DATA_DIRS = ['backups', 'logs', 'crashDumps']

export async function applyPendingReset(userDataPath: string): Promise<boolean> {
  const flagPath = path.join(userDataPath, RESET_FLAG_FILE)
  let pending = true
  try {
    await fs.access(flagPath)
  } catch {
    pending = false
  }
  if (!pending) return false

  for (const file of DATA_FILES) {
    await fs.rm(path.join(userDataPath, file), { force: true }).catch(() => {})
  }
  for (const dir of DATA_DIRS) {
    await fs.rm(path.join(userDataPath, dir), { recursive: true, force: true }).catch(() => {})
  }
  await fs.rm(flagPath, { force: true }).catch(() => {})
  Logger.info('Reset', 'App data reset to fresh state', { userDataPath })
  return true
}
