import type { Project, AppConfig, DeepPartial } from '../../src/types/shared'

const fs = require('fs').promises
const path = require('path')
const { app } = require('electron') as typeof import('electron')
const { v4: uuidv4 } = require('uuid')
import { DEFAULT_CONFIG, applyConfigUpdates, normalizeConfig, migrateConfig, CONFIG_SCHEMA_VERSION } from '../configSchema'
import { normalizeProject, validateProject, migrateProjects, PROJECT_SCHEMA_VERSION } from '../projectSchema'
import Logger from '../utils/logger'
const log = Logger || { info() {}, warn() {}, error() {}, debug() {}, fatal() {} }

import { normalizePreset, PRESET_DEFAULT_COLOR } from './presetSchema'
import type { PresetRecord } from './presetSchema'

export { normalizePreset, PRESET_DEFAULT_COLOR } from './presetSchema'
export type { PresetRecord } from './presetSchema'

interface ActivityEntry {
  type: string
  project: string
  message: string
  detail: string
  timestamp: string
}

interface ReadProjectsResult {
  parsed: unknown[]
  projects: Project[]
}

interface ReadConfigResult {
  parsed: Record<string, unknown>
  config: AppConfig
}

type MutatorResult = { projects?: Project[]; value?: unknown }

class StorageManager {
  static normalizePreset: typeof normalizePreset
  static PRESET_DEFAULT_COLOR: string

  appDataPath: string
  projectsFilePath: string
  configFilePath: string
  activitiesFilePath: string
  presetsFilePath: string
  backupDir: string
  defaultConfig: typeof DEFAULT_CONFIG
  projectQueue: Promise<unknown>
  configQueue: Promise<unknown>
  activityQueue: Promise<unknown>
  presetQueue: Promise<unknown>
  tempFileCounter: number
  backupFileCounter: number

  constructor(appDataPath: string = app.getPath('userData')) {
    // Get app data directory
    this.appDataPath = appDataPath
    this.projectsFilePath = path.join(this.appDataPath, 'projects.json')
    this.configFilePath = path.join(this.appDataPath, 'config.json')
    this.activitiesFilePath = path.join(this.appDataPath, 'activities.json')
    this.presetsFilePath = path.join(this.appDataPath, 'presets.json')
    this.backupDir = path.join(this.appDataPath, 'backups')

    // Default config
    this.defaultConfig = DEFAULT_CONFIG
    this.projectQueue = Promise.resolve()
    this.configQueue = Promise.resolve()
    this.activityQueue = Promise.resolve()
    this.presetQueue = Promise.resolve()
    this.tempFileCounter = 0
    this.backupFileCounter = 0
  }

  /**
   * Initialize storage (create directories if needed)
   */
  async init() {
    try {
      await fs.mkdir(this.appDataPath, { recursive: true })
      await fs.mkdir(this.backupDir, { recursive: true })

      try {
        await fs.access(this.projectsFilePath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        await fs.writeFile(this.projectsFilePath, JSON.stringify([]))
      }

      try {
        await fs.access(this.configFilePath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        await fs.writeFile(this.configFilePath, JSON.stringify(this.defaultConfig, null, 2))
      }

      log.info('Storage initialized', {
        appDataPath: this.appDataPath,
        projectsFile: this.projectsFilePath,
        configFile: this.configFilePath
      })
    } catch (error) {
      log.error('Storage init failed', error)
      throw error
    }
  }

  /**
   * Load projects from file
   */
  async loadProjects(): Promise<Project[]> {
    return this.enqueue('projectQueue', () => this.loadProjectsUnlocked())
  }

  async loadProjectsUnlocked(): Promise<Project[]> {
    try {
      const { parsed, projects } = await this.readProjectsFile(this.projectsFilePath)
      if (JSON.stringify(projects) !== JSON.stringify(parsed)) {
        await this.atomicWrite(this.projectsFilePath, JSON.stringify(projects, null, 2))
        log.info('Projects migrated', { version: PROJECT_SCHEMA_VERSION })
      }
      return projects
    } catch (error) {
      log.error('Error loading projects', error)
      if ((error as NodeJS.ErrnoException).code && !['ENOENT'].includes((error as NodeJS.ErrnoException).code!)) throw error
      const recovered = await this.recoverBackup('projects', (filePath) => this.readProjectsFile(filePath))
      if (!recovered) throw error
      const recoveredProjects = (recovered as ReadProjectsResult).projects
      await this.atomicWrite(this.projectsFilePath, JSON.stringify(recoveredProjects, null, 2))
      return recoveredProjects
    }
  }

  async readProjectsFile(filePath: string): Promise<ReadProjectsResult> {
    const data = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(data.replace(/^\uFEFF/, ''))
    if (!Array.isArray(parsed)) throw new Error('Projects data must be an array')
    const fromVersion = parsed[0]?.schemaVersion
    const migrated = migrateProjects(parsed, fromVersion)
    const projects = migrated.map((project) => validateProject(normalizeProject(project, uuidv4)))
    return { parsed, projects }
  }

  /**
   * Save projects to file
   */
  async saveProjects(projects: Project[]) {
    return this.enqueue('projectQueue', () => this.saveProjectsUnlocked(projects))
  }

  async saveProjectsUnlocked(projects: Project[]) {
    try {
      if (!Array.isArray(projects)) throw new Error('Projects data must be an array')
      const validatedProjects = projects.map((project) => validateProject(normalizeProject(project, uuidv4)))
      await this.backupProjects()

      const backupPath = `${this.projectsFilePath}.pre-migration`
      try {
        await fs.copyFile(this.projectsFilePath, backupPath)
      } catch {}

      try {
        const migratedProjects = validatedProjects.map(p => ({
          ...p,
          schemaVersion: p.schemaVersion || PROJECT_SCHEMA_VERSION
        }))

        await this.atomicWrite(this.projectsFilePath, JSON.stringify(migratedProjects, null, 2))
        log.info('Projects saved', { count: projects.length })
      } catch (migrationError) {
        log.error('Migration failed, restoring backup', migrationError)
        try {
          await fs.copyFile(backupPath, this.projectsFilePath)
          log.info('Backup restored')
        } catch (restoreError) {
          log.error('Backup restore failed', restoreError)
        }
        throw migrationError
      } finally {
        try {
          await fs.unlink(backupPath)
        } catch {}
      }
    } catch (error) {
      log.error('Error saving projects', error)
      throw error
    }
  }

  async updateProjects(mutator: (projects: Project[]) => Promise<MutatorResult> | MutatorResult): Promise<{ projects: Project[]; value: unknown }> {
    return this.enqueue('projectQueue', async () => {
      const projects = await this.loadProjectsUnlocked()
      const result = await mutator(projects)
      const nextProjects = result?.projects || projects
      await this.saveProjectsUnlocked(nextProjects)
      return { projects: nextProjects, value: result?.value }
    })
  }

  /**
   * Backup projects file
   */
  async backupProjects() {
    try {
      // Check if projects file exists
      await fs.access(this.projectsFilePath)

      // Create backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = path.join(this.backupDir, `projects-${timestamp}-${++this.backupFileCounter}.json`)

      await fs.copyFile(this.projectsFilePath, backupPath)

      // Keep only last 5 backups
      await this.cleanOldBackups()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.error('Backup creation failed', error)
      }
    }
  }

  /**
   * Clean old backup files (keep only last 5)
   */
  async cleanOldBackups() {
    try {
      const files = await fs.readdir(this.backupDir)
      const backupFiles = files
        .filter((f: string) => f.startsWith('projects-') && f.endsWith('.json'))
        .sort()
        .reverse()

      // Remove old backups
      for (let i = 5; i < backupFiles.length; i++) {
        await fs.unlink(path.join(this.backupDir, backupFiles[i]))
      }
    } catch (error) {
      log.error('Error cleaning backups', error)
    }
  }

  /**
   * Load config from file
   */
  async loadConfig(): Promise<AppConfig> {
    return this.enqueue('configQueue', () => this.loadConfigUnlocked())
  }

  async loadConfigUnlocked(): Promise<AppConfig> {
    try {
      const { parsed, config } = await this.readConfigFile(this.configFilePath)
      if (JSON.stringify(config) !== JSON.stringify(parsed)) {
        await this.atomicWrite(this.configFilePath, JSON.stringify(config, null, 2))
        log.info('Config migrated', { version: CONFIG_SCHEMA_VERSION })
      }
      return config
    } catch (error) {
      log.error('Error loading config', error)
      if ((error as NodeJS.ErrnoException).code && !['ENOENT'].includes((error as NodeJS.ErrnoException).code!)) throw error
      const recovered = await this.recoverBackup('config', (filePath) => this.readConfigFile(filePath))
      if (!recovered) throw error
      const recoveredConfig = (recovered as ReadConfigResult).config
      await this.atomicWrite(this.configFilePath, JSON.stringify(recoveredConfig, null, 2))
      return recoveredConfig
    }
  }

  async readConfigFile(filePath: string): Promise<ReadConfigResult> {
    const data = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(data.replace(/^\uFEFF/, ''))
    const migrated = migrateConfig(parsed, parsed?.schemaVersion)
    return { parsed, config: normalizeConfig(migrated) }
  }

  /**
   * Save config to file
   */
  async saveConfig(config: AppConfig) {
    return this.enqueue('configQueue', () => this.saveConfigUnlocked(config))
  }

  async saveConfigUnlocked(config: AppConfig) {
    try {
      const normalizedConfig = normalizeConfig(config)
      await this.backupFile('config', this.configFilePath)
      const backupPath = `${this.configFilePath}.pre-migration`

      try {
        await fs.copyFile(this.configFilePath, backupPath)
      } catch {}

      try {
        const configWithVersion = {
          ...normalizedConfig,
          schemaVersion: CONFIG_SCHEMA_VERSION
        }

        await this.atomicWrite(this.configFilePath, JSON.stringify(configWithVersion, null, 2))
        log.info('Config saved')
      } catch (migrationError) {
        log.error('Migration failed, restoring backup', migrationError)
        try {
          await fs.copyFile(backupPath, this.configFilePath)
          log.info('Backup restored')
        } catch (restoreError) {
          log.error('Backup restore failed', restoreError)
        }
        throw migrationError
      } finally {
        try {
          await fs.unlink(backupPath)
        } catch {}
      }
    } catch (error) {
      log.error('Error saving config', error)
      throw error
    }
  }

  /**
   * Update config (merge with existing)
   */
  async updateConfig(updates: DeepPartial<AppConfig>): Promise<AppConfig> {
    return this.enqueue('configQueue', async () => {
      try {
        const current = await this.loadConfigUnlocked()
        const merged = applyConfigUpdates(current, updates)
        await this.saveConfigUnlocked(merged)
        return merged
      } catch (error) {
        log.error('Error updating config', error)
        throw error
      }
    })
  }

  /**
   * Load persisted activity feed (most recent first)
   */
  async loadActivities(): Promise<ActivityEntry[]> {
    return this.enqueue('activityQueue', async () => {
      try {
        const data = await fs.readFile(this.activitiesFilePath, 'utf8')
        const parsed = JSON.parse(data)
        return Array.isArray(parsed) ? parsed : []
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') log.error('Error loading activities', error)
        return []
      }
    })
  }

  /**
   * Append activity entries (persisted, capped at 50 entries)
   */
  async appendActivities(entries: ActivityEntry[]): Promise<ActivityEntry[]> {
    if (!Array.isArray(entries) || entries.length === 0) return []
    return this.enqueue('activityQueue', async () => {
      try {
        let current: ActivityEntry[] = []
        try {
          const data = await fs.readFile(this.activitiesFilePath, 'utf8')
          const parsed = JSON.parse(data)
          current = Array.isArray(parsed) ? parsed : []
        } catch (readError) {
          if ((readError as NodeJS.ErrnoException).code !== 'ENOENT') throw readError
        }
        const stamped = entries.map((entry) => ({
          type: entry.type || 'faint',
          project: entry.project || '',
          message: entry.message || '',
          detail: entry.detail || '',
          timestamp: entry.timestamp || new Date().toISOString()
        }))
        const next = [...stamped, ...current].slice(0, 50)
        await this.atomicWrite(this.activitiesFilePath, JSON.stringify(next, null, 2))
        return next
      } catch (error) {
        log.error('Error appending activities', error)
        return []
      }
    })
  }

  /**
   * Load workspace presets
   */
  async loadPresets(): Promise<PresetRecord[]> {
    return this.enqueue('presetQueue', async () => {
      try {
        const data = await fs.readFile(this.presetsFilePath, 'utf8')
        const parsed = JSON.parse(data)
        return Array.isArray(parsed) ? parsed.map(normalizePreset).filter((p): p is PresetRecord => Boolean(p)) : []
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') log.error('Error loading presets', error)
        return []
      }
    })
  }

  async savePresets(presets: PresetRecord[]): Promise<PresetRecord[]> {
    return this.enqueue('presetQueue', async () => {
      if (!Array.isArray(presets)) throw new Error('Presets must be an array')
      const normalized = presets.map(normalizePreset).filter((p): p is PresetRecord => Boolean(p))
      const seenIds = new Set()
      const unique = normalized.filter((preset) => {
        if (seenIds.has(preset.id)) return false
        seenIds.add(preset.id)
        return true
      })
      await this.atomicWrite(this.presetsFilePath, JSON.stringify(unique, null, 2))
      return unique
    })
  }

  /**
   * Get app data path
   */
  getAppDataPath(): string {
    return this.appDataPath
  }

  enqueue<T>(queueName: 'projectQueue' | 'configQueue' | 'activityQueue' | 'presetQueue', operation: () => Promise<T> | T): Promise<T> {
    const result = this[queueName].then(operation, operation) as Promise<T>
    this[queueName] = result.catch(() => {})
    return result
  }

  /**
   * Atomic write: write to temp file first, then rename.
   * Prevents corruption from partial writes or crashes during write.
   * @param filePath - Target file path
   * @param content - Content to write
   */
  async atomicWrite(filePath: string, content: string) {
    const tmpPath = `${filePath}.${process.pid}.${++this.tempFileCounter}.tmp`
    try {
      await fs.writeFile(tmpPath, content, 'utf8')
      await fs.rename(tmpPath, filePath)
    } catch (error) {
      await fs.unlink(tmpPath).catch(() => {})
      throw error
    }
  }

  async backupFile(prefix: string, filePath: string) {
    try {
      await fs.access(filePath)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = path.join(this.backupDir, `${prefix}-${timestamp}-${++this.backupFileCounter}.json`)
      await fs.copyFile(filePath, backupPath)
      const files = (await fs.readdir(this.backupDir))
        .filter((file: string) => file.startsWith(`${prefix}-`) && file.endsWith('.json'))
        .sort()
        .reverse()
      for (const file of files.slice(5)) await fs.unlink(path.join(this.backupDir, file))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  async recoverBackup(prefix: string, reader: (filePath: string) => Promise<ReadProjectsResult | ReadConfigResult>): Promise<ReadProjectsResult | ReadConfigResult | null> {
    const files = (await fs.readdir(this.backupDir))
      .filter((file: string) => file.startsWith(`${prefix}-`) && file.endsWith('.json'))
      .sort()
      .reverse()
    for (const file of files) {
      try {
        const recovered = await reader(path.join(this.backupDir, file))
        log.info('Recovery from backup', { file })
        return recovered
      } catch {}
    }
    return null
  }
}

StorageManager.normalizePreset = normalizePreset
StorageManager.PRESET_DEFAULT_COLOR = PRESET_DEFAULT_COLOR
export default StorageManager

export type { StorageManager, ActivityEntry }
