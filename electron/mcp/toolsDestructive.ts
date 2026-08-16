/**
 * F3 destructive MCP tools — every call requires explicit user approval via
 * the renderer modal (dispatchTool blocks until approve/deny). Implemented on
 * top of existing managers/handlers; the user decision is audited.
 *
 * Design notes:
 * - backup export writes the bundle to a file (Documents) and returns the
 *   path — the bundle contains env secrets, so its content never reaches the
 *   agent (D8). Import accepts a bundle string the agent already has.
 * - update_check is read-only; only download+install is destructive.
 */
import type { McpTool } from './toolsShared'
import { resolveProject, requireString } from './toolsShared'
import { buildBundle, encryptBundle, parseBackupFile, validateBundle, mergeProjects } from '../utils/workspaceBackup'
import { mergeConfigAndPresets, collectWorkspaceData } from '../handlers/backupHandlers'
import { toRendererProject } from '../projectSchema'

const { app } = require('electron') as typeof import('electron')
const fs = require('fs').promises
const path = require('path')

const projectIdSchema = { type: 'object', properties: { projectId: { type: 'string', description: 'DevLauncher project id' } }, required: ['projectId'] }

export function createDestructiveTools(): McpTool[] {
  return [
    {
      name: 'devlauncher_delete_project',
      description: 'Remove a project from the DevLauncher workspace (stops it first if running). Files on disk are NOT deleted.',
      label: 'Hapus project dari workspace',
      inputSchema: projectIdSchema,
      permission: 'destructive',
      summary: async (args, d) => {
        const project = await resolveProject(d, args.projectId)
        return `Hapus "${project.name}" dari workspace DevLauncher. File di disk tidak dihapus.`
      },
      handler: async (args, d) => {
        const project = await resolveProject(d, args.projectId)
        const status = d.processManager.getProcessStatus(project.id)
        const current = String(status?.status || 'stopped').toLowerCase()
        if (current === 'running' || current === 'starting') {
          await d.processManager.stopProcess(project.id)
        } else if (current === 'stopping') {
          throw new Error('Cannot delete project while its process is stopping')
        }
        await d.storageManager.updateProjects((projects) => {
          const filtered = projects.filter((p) => p.id !== project.id)
          if (filtered.length === projects.length) throw new Error(`Project ${project.id} not found`)
          return { projects: filtered }
        })
        const win = d.getWindow()
        if (win && !win.isDestroyed()) {
          const projects = await d.storageManager.loadProjects()
          win.webContents.send('projects-updated', projects.map(toRendererProject))
        }
        return { success: true, deleted: project.id, name: project.name }
      },
    },
    {
      name: 'devlauncher_force_stop_project',
      description: 'Force-stop a running project immediately (SIGKILL / taskkill /F). Prefer devlauncher_stop_project for a graceful stop.',
      label: 'Stop paksa project',
      inputSchema: projectIdSchema,
      permission: 'destructive',
      summary: async (args, d) => {
        const project = await resolveProject(d, args.projectId)
        return `Stop paksa "${project.name}" (proses di-kill seketika).`
      },
      handler: async (args, d) => {
        const project = await resolveProject(d, args.projectId)
        return d.processManager.stopProcess(project.id, true)
      },
    },
    {
      name: 'devlauncher_backup_export',
      description: 'Export the whole workspace (projects incl. env values, config, presets, health) to a backup JSON file in Documents, optionally password-encrypted. Returns the file path.',
      label: 'Ekspor backup workspace',
      inputSchema: {
        type: 'object',
        properties: { password: { type: 'string', description: 'Optional password to AES-encrypt the bundle' } },
        additionalProperties: false,
      },
      permission: 'destructive',
      summary: () => 'Ekspor seluruh workspace (project, config, preset, health) menjadi file backup JSON di folder Documents.',
      handler: async (args, d) => {
        const data = await collectWorkspaceData(d.storageManager, d.healthManager)
        const bundle = buildBundle({ ...data, appVersion: app.getVersion() })
        const json = JSON.stringify(bundle, null, 2)
        const password = typeof args.password === 'string' && args.password ? args.password : null
        const content = password ? JSON.stringify(encryptBundle(json, password)) : json
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        let dir: string
        try { dir = app.getPath('documents') } catch { dir = app.getPath('userData') }
        const filePath = path.join(dir, `DevLauncher-backup-${stamp}.json`)
        await fs.writeFile(filePath, content, 'utf8')
        return { success: true, filePath, encrypted: Boolean(password), projectCount: data.projects.length }
      },
    },
    {
      name: 'devlauncher_backup_import',
      description: 'Import a DevLauncher backup bundle (JSON string, optionally encrypted) and merge its projects/config/presets into the workspace. Existing data is never overwritten.',
      label: 'Import backup workspace',
      inputSchema: {
        type: 'object',
        properties: {
          bundle: { type: 'string', description: 'Full backup JSON (from devlauncher_backup_export or a backup file)' },
          password: { type: 'string', description: 'Password if the bundle is encrypted' },
        },
        required: ['bundle'],
        additionalProperties: false,
      },
      permission: 'destructive',
      summary: () => 'Import backup dan gabungkan project/config/preset ke workspace (data yang ada tidak ditimpa).',
      handler: async (args, d) => {
        const bundle = requireString(args, 'bundle')
        if (bundle.length > 10 * 1024 * 1024) throw new Error('bundle is too large')
        const password = typeof args.password === 'string' && args.password ? args.password : undefined
        const { parsed, wasEncrypted } = parseBackupFile(bundle.replace(/^\uFEFF/, ''), password)
        validateBundle(parsed)

        const current = await collectWorkspaceData(d.storageManager, d.healthManager)
        const merged = mergeProjects(current.projects, parsed.projects || [])
        const { config, configChanged, presetsToAdd } = mergeConfigAndPresets(
          current.config,
          parsed.config,
          current.presets,
          parsed.presets
        )
        if (merged.projects.length !== current.projects.length) {
          await d.storageManager.saveProjects(merged.projects)
          const win = d.getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send('projects-updated', merged.projects.map(toRendererProject))
          }
        }
        if (configChanged) await d.storageManager.saveConfig(config)
        if (presetsToAdd.length > 0) {
          await d.storageManager.savePresets([...(current.presets || []), ...presetsToAdd])
        }
        return {
          success: true,
          wasEncrypted,
          added: merged.added.length,
          skipped: merged.skipped,
          configUpdated: configChanged,
          presetsAdded: presetsToAdd.length,
        }
      },
    },
    {
      name: 'devlauncher_update_check',
      description: 'Check whether a new DevLauncher version is available (uses electron-updater; packaged builds only).',
      label: 'Cek update aplikasi',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      permission: 'read',
      handler: async (_args, d) => {
        const updater = d.getUpdater?.()
        if (!updater || typeof updater.check !== 'function') throw new Error('Auto-update is unavailable in this build')
        const result = await updater.check()
        return { success: result.success, error: result.error, state: updater.getState() }
      },
    },
    {
      name: 'devlauncher_update_download_install',
      description: 'Download the available update (if not already downloaded) and restart DevLauncher to install it.',
      label: 'Update & restart aplikasi',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      permission: 'destructive',
      summary: () => 'Unduh update aplikasi yang tersedia, lalu restart DevLauncher untuk memasangnya.',
      handler: async (_args, d) => {
        const updater = d.getUpdater?.()
        if (!updater || typeof updater.startDownload !== 'function' || typeof updater.quitAndInstall !== 'function') {
          throw new Error('Auto-update is unavailable in this build')
        }
        const current = updater.getState()
        if (current?.state !== 'downloaded') {
          const download = await updater.startDownload()
          if (!download.success) return { success: false, error: download.error || 'Download failed' }
        }
        return updater.quitAndInstall()
      },
    },
    {
      name: 'devlauncher_clear_health',
      description: 'Clear health analytics (run history, crashes, resource trends) of one project.',
      label: 'Hapus data kesehatan project',
      inputSchema: projectIdSchema,
      permission: 'destructive',
      summary: async (args, d) => {
        const project = await resolveProject(d, args.projectId)
        return `Hapus seluruh data kesehatan (riwayat run, crash, tren resource) dari "${project.name}".`
      },
      handler: async (args, d) => {
        const project = await resolveProject(d, args.projectId)
        d.healthManager.clear(project.id)
        return { success: true, cleared: project.id }
      },
    },
    {
      name: 'devlauncher_clear_crash_dumps',
      description: 'Delete all local crash dump files (minidumps). They are never uploaded, but this frees disk space.',
      label: 'Hapus semua crash dump',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      permission: 'destructive',
      summary: () => 'Hapus semua file crash dump lokal (minidump) dari folder crashDumps.',
      handler: async () => {
        let dir: string
        try { dir = path.join(app.getPath('userData'), 'crashDumps') } catch { return { success: true, cleared: 0 } }
        let cleared = 0
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.isFile() && /\.dmp$/i.test(entry.name)) {
              await fs.unlink(path.join(dir, entry.name)).catch(() => {})
              cleared += 1
            }
          }
        } catch { /* no dumps / dir missing */ }
        return { success: true, cleared }
      },
    },
    {
      name: 'devlauncher_config_update_destructive',
      description: 'Update sensitive DevLauncher settings: startOnBoot (launch at login), autoStartProjects (auto-start all flagged projects on launch), minimizeToTray, autoRestart (crash recovery).',
      label: 'Ubah pengaturan sensitif aplikasi',
      inputSchema: {
        type: 'object',
        properties: {
          startOnBoot: { type: 'boolean' },
          autoStartProjects: { type: 'boolean' },
          minimizeToTray: { type: 'boolean' },
          autoRestart: {
            type: 'object',
            properties: { enabled: { type: 'boolean' }, maxRetries: { type: 'number' }, delayMs: { type: 'number' } },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
      permission: 'destructive',
      summary: (args) => `Ubah pengaturan sensitif aplikasi: ${Object.keys(args).join(', ')}.`,
      handler: async (args, d) => {
        const updates: Record<string, unknown> = {}
        for (const key of ['startOnBoot', 'autoStartProjects', 'minimizeToTray'] as const) {
          if (typeof args[key] === 'boolean') updates[key] = args[key]
        }
        if (args.autoRestart && typeof args.autoRestart === 'object') {
          const ar = args.autoRestart as Record<string, unknown>
          const next: Record<string, unknown> = {}
          if (typeof ar.enabled === 'boolean') next.enabled = ar.enabled
          if (Number.isInteger(ar.maxRetries)) next.maxRetries = ar.maxRetries
          if (Number.isInteger(ar.delayMs)) next.delayMs = ar.delayMs
          if (Object.keys(next).length > 0) updates.autoRestart = next
        }
        if (Object.keys(updates).length === 0) throw new Error('At least one valid setting is required')
        const config = await d.storageManager.updateConfig(updates as never)
        if (typeof d.applyOSSettings === 'function') await d.applyOSSettings(config)
        const win = d.getWindow()
        if (win && !win.isDestroyed()) win.webContents.send('config-updated', config)
        return { success: true, updated: Object.keys(updates) }
      },
    },
  ]
}
