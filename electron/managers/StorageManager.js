const fs = require('fs').promises
const path = require('path')
const { app } = require('electron')
const { v4: uuidv4 } = require('uuid')
const { DEFAULT_CONFIG, applyConfigUpdates, normalizeConfig, migrateConfig, CONFIG_SCHEMA_VERSION } = require('../configSchema')
const { normalizeProject, validateProject, migrateProjects, PROJECT_SCHEMA_VERSION } = require('../projectSchema')
const Logger = require('../utils/logger')
const log = Logger || {}

class StorageManager {
  constructor(appDataPath = app.getPath('userData')) {
    // Get app data directory
    this.appDataPath = appDataPath
    this.projectsFilePath = path.join(this.appDataPath, 'projects.json')
    this.configFilePath = path.join(this.appDataPath, 'config.json')
    this.backupDir = path.join(this.appDataPath, 'backups')

    // Default config
    this.defaultConfig = DEFAULT_CONFIG
    this.projectQueue = Promise.resolve()
    this.configQueue = Promise.resolve()
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
        if (error.code !== 'ENOENT') throw error
        await fs.writeFile(this.projectsFilePath, JSON.stringify([]))
      }

      try {
        await fs.access(this.configFilePath)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
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
   * @returns {Promise<Array>} Array of projects
   */
  async loadProjects() {
    return this.enqueue('projectQueue', () => this.loadProjectsUnlocked())
  }

  async loadProjectsUnlocked() {
    try {
      const { parsed, projects } = await this.readProjectsFile(this.projectsFilePath)
      if (JSON.stringify(projects) !== JSON.stringify(parsed)) {
        await this.atomicWrite(this.projectsFilePath, JSON.stringify(projects, null, 2))
        log.info('Projects migrated', { version: PROJECT_SCHEMA_VERSION })
      }
      return projects
    } catch (error) {
      log.error('Error loading projects', error)
      if (error.code && !['ENOENT'].includes(error.code)) throw error
      const recovered = await this.recoverBackup('projects', (filePath) => this.readProjectsFile(filePath))
      if (!recovered) throw error
      await this.atomicWrite(this.projectsFilePath, JSON.stringify(recovered.projects, null, 2))
      return recovered.projects
    }
  }

  async readProjectsFile(filePath) {
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
   * @param {Array} projects - Array of projects
   */
  async saveProjects(projects) {
    return this.enqueue('projectQueue', () => this.saveProjectsUnlocked(projects))
  }

  async saveProjectsUnlocked(projects) {
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

  async updateProjects(mutator) {
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
      if (error.code !== 'ENOENT') {
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
        .filter((f) => f.startsWith('projects-') && f.endsWith('.json'))
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
   * @returns {Promise<Object>} Config object
   */
  async loadConfig() {
    return this.enqueue('configQueue', () => this.loadConfigUnlocked())
  }

  async loadConfigUnlocked() {
    try {
      const { parsed, config } = await this.readConfigFile(this.configFilePath)
      if (JSON.stringify(config) !== JSON.stringify(parsed)) {
        await this.atomicWrite(this.configFilePath, JSON.stringify(config, null, 2))
        log.info('Config migrated', { version: CONFIG_SCHEMA_VERSION })
      }
      return config
    } catch (error) {
      log.error('Error loading config', error)
      if (error.code && !['ENOENT'].includes(error.code)) throw error
      const recovered = await this.recoverBackup('config', (filePath) => this.readConfigFile(filePath))
      if (!recovered) throw error
      await this.atomicWrite(this.configFilePath, JSON.stringify(recovered.config, null, 2))
      return recovered.config
    }
  }

  async readConfigFile(filePath) {
    const data = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(data.replace(/^\uFEFF/, ''))
    const migrated = migrateConfig(parsed, parsed?.schemaVersion)
    return { parsed, config: normalizeConfig(migrated) }
  }

  /**
   * Save config to file
   * @param {Object} config - Config object
   */
  async saveConfig(config) {
    return this.enqueue('configQueue', () => this.saveConfigUnlocked(config))
  }

  async saveConfigUnlocked(config) {
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
   * @param {Object} updates - Partial config updates
   */
  async updateConfig(updates) {
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
   * Get app data path
   */
  getAppDataPath() {
    return this.appDataPath
  }

  enqueue(queueName, operation) {
    const result = this[queueName].then(operation, operation)
    this[queueName] = result.catch(() => {})
    return result
  }

  /**
   * Atomic write: write to temp file first, then rename.
   * Prevents corruption from partial writes or crashes during write.
   * @param {string} filePath - Target file path
   * @param {string} content - Content to write
   */
  async atomicWrite(filePath, content) {
    const tmpPath = `${filePath}.${process.pid}.${++this.tempFileCounter}.tmp`
    try {
      await fs.writeFile(tmpPath, content, 'utf8')
      await fs.rename(tmpPath, filePath)
    } catch (error) {
      await fs.unlink(tmpPath).catch(() => {})
      throw error
    }
  }

  async backupFile(prefix, filePath) {
    try {
      await fs.access(filePath)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = path.join(this.backupDir, `${prefix}-${timestamp}-${++this.backupFileCounter}.json`)
      await fs.copyFile(filePath, backupPath)
      const files = (await fs.readdir(this.backupDir))
        .filter((file) => file.startsWith(`${prefix}-`) && file.endsWith('.json'))
        .sort()
        .reverse()
      for (const file of files.slice(5)) await fs.unlink(path.join(this.backupDir, file))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }

  async recoverBackup(prefix, reader) {
    const files = (await fs.readdir(this.backupDir))
      .filter((file) => file.startsWith(`${prefix}-`) && file.endsWith('.json'))
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

module.exports = StorageManager

