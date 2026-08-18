import type { AppConfig } from '../src/types/shared'
import type { ProcessManager as ProcessManagerType } from './managers/ProcessManager'
import type { StorageManager as StorageManagerType, PresetRecord, ActivityEntry } from './managers/StorageManager'
import type { HealthManager as HealthManagerType } from './managers/HealthManager'
import type { ProjectDetector as ProjectDetectorType } from './managers/ProjectDetector'
import { assertTrustedIpcEvent } from './utils/ipcSecurity'
import { isVersionNewer } from './utils/versionCompare'
import { respondApproval } from './mcp/approval'
import Logger from './utils/logger'

const { app, ipcMain, Notification } = require('electron') as typeof import('electron')
const https = require('https')
const path = require('path')
const fs = require('fs').promises

export interface IpcHandlersDeps {
  processManager: ProcessManagerType
  storageManager: StorageManagerType
  healthManager: HealthManagerType
  projectDetector: ProjectDetectorType
  getWindow: () => InstanceType<typeof import('electron').BrowserWindow> | null
  getUpdater: () => {
    check: () => Promise<{ success: boolean; error?: string }>
    startDownload: () => Promise<{ success: boolean; error?: string }>
    quitAndInstall: () => { success: boolean; error?: string }
    getState: () => { state: string; progress: unknown; error: string | null; version?: string | null }
  } | null
  getMcp: () => {
    start: () => Promise<{ ok: boolean; port?: number; error?: string }>
    stop: () => Promise<void>
    getState: () => { running: boolean; port: number | null; token: string | null }
  } | null
  applyOSSettings: (config: AppConfig) => Promise<void>
}

/**
 * Registers every ipcMain.handle the app exposes. Kept out of main.ts so the
 * entry point stays a thin orchestrator (managers, events, lifecycle).
 */
export function registerCoreIpcHandlers({
  processManager,
  storageManager,
  healthManager,
  getMcp,
  projectDetector,
  getWindow,
  getUpdater,
  applyOSSettings,
}: IpcHandlersDeps) {
  ipcMain.handle('update-download', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      const updater = getUpdater()
      if (!updater) return { success: false, error: 'Auto-update is unavailable' }
      return await updater.startDownload()
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Explicit check triggered by the Settings "Check update" button. This runs
  // the real electron-updater check (not the GitHub API one) so its internal
  // state is populated before the user can ask for a download — without this,
  // downloadUpdate() throws "Please check update first" when the silent
  // launch-time check failed (e.g. release was incomplete / GitHub down).
  ipcMain.handle('update-check', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      const updater = getUpdater()
      if (!updater) return { success: false, error: 'Auto-update is unavailable' }
      return await updater.check()
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('update-install', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      const updater = getUpdater()
      if (!updater) return { success: false, error: 'Auto-update is unavailable' }
      return await updater.quitAndInstall()
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Current updater state snapshot — the Settings banner pulls this on mount so
  // it reflects reality even when push events fired before the view subscribed
  // (e.g. an update that was already downloaded by the silent launch check).
  ipcMain.handle('update-get-state', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      const updater = getUpdater()
      if (!updater) return { success: false, error: 'Auto-update is unavailable' }
      return { success: true, state: updater.getState() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // MCP server status (agent-control feature) — the Settings toggle polls this.
  ipcMain.handle('mcp-status', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      const mcp = getMcp()
      if (!mcp) return { success: false, error: 'MCP is unavailable' }
      const state = mcp.getState()
      return { success: true, running: state.running, port: state.port }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Renderer answers the destructive-tool approval modal; the pending tool
  // call resolves (approve) or errors with a clear denial message (deny).
  ipcMain.handle('mcp-approval-respond', (event, id: string, decision: string) => {
    try {
      assertTrustedIpcEvent(event)
      if (typeof id !== 'string' || !id.trim()) return { success: false, error: 'Approval id is required' }
      const resolved = respondApproval(id.trim(), decision === 'approve' ? 'approved' : 'denied')
      return resolved ? { success: true } : { success: false, error: 'Unknown or expired approval request' }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Prayer reminder: native notifications + city geocoding (renderer CSP blocks external fetch)
  ipcMain.handle('app-notify', (event, payload: Record<string, unknown> = {}) => {
    try {
      assertTrustedIpcEvent(event)
      if (!Notification.isSupported()) return { success: false, error: 'Notifications are not supported on this system' }
      new Notification({
        title: String(payload.title || 'Gatrion'),
        body: String(payload.body || ''),
        silent: !!payload.silent,
      }).show()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('prayer-geocode', async (event, query: string) => {
    try {
      assertTrustedIpcEvent(event)
      const q = String(query || '').trim()
      if (!q) return { success: false, error: 'Query is empty' }
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`
      const body = await new Promise<string>((resolve, reject) => {
        const req = https.get(url, {
          headers: { 'User-Agent': 'Gatrion/1.0 (desktop project manager)', 'Accept': 'application/json' },
        }, (res: import('http').IncomingMessage) => {
          let data = ''
          res.on('data', (chunk: Buffer) => { data += chunk })
          res.on('end', () => resolve(data))
        })
        req.setTimeout(10000, () => req.destroy(new Error('Geocoding request timed out')))
        req.on('error', reject)
      })
      const parsed = JSON.parse(body)
      if (!Array.isArray(parsed)) return { success: false, error: 'Unexpected geocoding response' }
      const results = parsed
        .map((item) => ({
          name: item.display_name || item.name || 'Unknown',
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
        }))
        .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
      return { success: true, results }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Renderer errors (window.onerror / unhandledrejection) land in main.log
  ipcMain.handle('renderer-error', async (event, payload = {}) => {
    try {
      assertTrustedIpcEvent(event)
      const meta = typeof payload === 'object' && payload !== null ? payload : {}
      Logger.error('renderer', String(meta.message || 'Unknown renderer error'), {
        type: String(meta.type || ''),
        source: String(meta.source || ''),
        line: Number.isFinite(meta.line) ? meta.line : undefined,
        column: Number.isFinite(meta.column) ? meta.column : undefined,
        stack: String(meta.stack || '').slice(0, 2000),
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Frameless window controls — the renderer-drawn title bar (TopBar) drives
  // the native window. window-close routes through the normal close flow so
  // minimize-to-tray (if enabled) still applies. window-get-state lets the
  // renderer pull the initial state on mount (the maximize/unmaximize push
  // can arrive before React has subscribed).
  ipcMain.handle('window-get-state', (event) => {
    try {
      assertTrustedIpcEvent(event)
      const win = getWindow()
      if (!win) return { success: false, error: 'Window not available' }
      return { success: true, maximized: win.isMaximized(), platform: process.platform }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('window-minimize', (event) => {
    try {
      assertTrustedIpcEvent(event)
      getWindow()?.minimize()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('window-maximize-toggle', (event) => {
    try {
      assertTrustedIpcEvent(event)
      const win = getWindow()
      if (!win) return { success: false, error: 'Window not available' }
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('window-close', (event) => {
    try {
      assertTrustedIpcEvent(event)
      getWindow()?.close()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Health analytics IPC
  ipcMain.handle('get-health', async (event, projectId) => {
    try {
      assertTrustedIpcEvent(event)
      if (typeof projectId !== 'string' || !projectId.trim()) throw new Error('Project ID is required')
      return { success: true, stats: healthManager.getStats(projectId) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('clear-health', async (event, projectId) => {
    try {
      assertTrustedIpcEvent(event)
      if (typeof projectId !== 'string' || !projectId.trim()) throw new Error('Project ID is required')
      healthManager.clear(projectId)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Workspace presets
  ipcMain.handle('get-presets', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      return { success: true, presets: await storageManager.loadPresets() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('save-presets', async (event, presets: Array<Record<string, unknown>>) => {
    try {
      assertTrustedIpcEvent(event)
      const saved = await storageManager.savePresets(presets as unknown as PresetRecord[])
      return { success: true, presets: saved }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Config
  ipcMain.handle('get-config', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      const currentConfig = await storageManager.loadConfig()
      return { success: true, config: currentConfig }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('update-config', async (event, updates: Record<string, unknown>) => {
    try {
      assertTrustedIpcEvent(event)
      const updatedConfig = await storageManager.updateConfig(updates)
      await applyOSSettings(updatedConfig)
      if (Number.isInteger(updatedConfig?.terminal?.maxLines) && updatedConfig.terminal.maxLines > 0) {
        processManager.maxLogLines = updatedConfig.terminal.maxLines
      }
      if (updatedConfig?.autoRestart) {
        processManager.autoRestartConfig = updatedConfig.autoRestart
      }
      // Agent-control toggle: start/stop the MCP server (and keep the omp
      // config entry in sync) when agent.controlEnabled changes.
      if (updatedConfig?.agent && typeof updatedConfig.agent.controlEnabled === 'boolean') {
        const mcp = getMcp()
        if (updatedConfig.agent.controlEnabled) {
          const result = mcp ? await mcp.start() : null
          if (result && !result.ok) console.warn('[MCP] Failed to start:', result.error)
        } else if (mcp) {
          await mcp.stop()
        }
      }
      // Broadcast so every renderer context (e.g. MainLayout's own config hook)
      // stays in sync with the caller that just changed the config.
      getWindow()?.webContents.send('config-updated', updatedConfig)
      return { success: true, config: updatedConfig }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Activity feed persistence
  ipcMain.handle('get-activities', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      const activities = await storageManager.loadActivities()
      return { success: true, activities }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('append-activities', async (event, entries: Array<Record<string, unknown>>) => {
    try {
      assertTrustedIpcEvent(event)
      const activities = await storageManager.appendActivities(entries as unknown as ActivityEntry[])
      return { success: true, activities }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Update checker — compare the running version against the latest GitHub release
  ipcMain.handle('check-update', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      const url = 'https://api.github.com/repos/adi-santoso/gatrion_devlauncher/releases/latest'
      const body = await new Promise<string>((resolve, reject) => {
        const req = https.get(url, {
          headers: { 'User-Agent': 'Gatrion/1.0 (desktop project manager)', 'Accept': 'application/vnd.github+json' },
          timeout: 10000,
        }, (res: import('http').IncomingMessage) => {
          let data = ''
          res.on('data', (chunk: Buffer) => { data += chunk })
          res.on('end', () => resolve(data))
        })
        req.on('error', reject)
        req.on('timeout', () => req.destroy(new Error('Update check timed out')))
      })
      const parsed = JSON.parse(body)
      const latest = String(parsed.tag_name || '').replace(/^v/, '')
      const current = app.getVersion()
      // Numeric compare (not string !==) so 1.0.10 > 1.0.9 and an older
      // release is never advertised as an available update.
      const updateAvailable = Boolean(latest) && isVersionNewer(latest, current)
      return {
        success: true,
        current,
        latest: latest || null,
        updateAvailable,
        url: String(parsed.html_url || 'https://github.com/adi-santoso/gatrion_devlauncher/releases'),
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Reset DevLauncher to a fresh-install state. We only write a marker file
  // and relaunch — the actual deletion happens on the NEXT startup in
  // `applyPendingReset` (electron/utils/resetData.ts), before any manager
  // initializes. Deleting here would be undone by manager flush-on-quit
  // (e.g. HealthManager.dispose rewrites health.json).
  ipcMain.handle('reset-app-data', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      const marker = path.join(app.getPath('userData'), '.reset-pending')
      await fs.writeFile(marker, new Date().toISOString(), 'utf8')
      // E2E hook: verify the marker without actually relaunching the app.
      if (!process.env.DEVLAUNCHER_E2E_NO_RELAUNCH) {
        app.relaunch()
        app.quit()
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Project detection
  ipcMain.handle('detect-project-type', async (event, projectPath: string) => {
    try {
      assertTrustedIpcEvent(event)
      const result = await projectDetector.detectProjectType(projectPath)
      return result
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
