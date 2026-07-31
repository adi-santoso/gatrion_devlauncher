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
      } catch {
        await fs.writeFile(this.projectsFilePath, JSON.stringify([]))
      }

      try {
        await fs.access(this.configFilePath)
      } catch {
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
      const data = await fs.readFile(this.projectsFilePath, 'utf8')
      const cleanData = data.replace(/^\uFEFF/, '')
      let parsed = JSON.parse(cleanData)
      
      const fromVersion = Array.isArray(parsed) && parsed[0]?.schemaVersion 
        ? parsed[0].schemaVersion 
        : undefined
      
      parsed = migrateProjects(parsed, fromVersion)
      
      if (JSON.stringify(parsed) !== JSON.stringify(JSON.parse(cleanData))) {
        await this.saveProjectsUnlocked(parsed)
        log.info('Projects migrated', { version: PROJECT_SCHEMA_VERSION })
      }
      
      const projects = parsed.map((project) => validateProject(normalizeProject(project, uuidv4)))
      return projects
    } catch (error) {
      log.error('Error loading projects', error)

      if (error instanceof SyntaxError) {
        try {
          const files = await fs.readdir(this.backupDir)
          const backups = files
            .filter(f => f.startsWith('projects-') && f.endsWith('.json'))
            .sort()
            .reverse()

          for (const backupFile of backups) {
            try {
              const backupData = await fs.readFile(path.join(this.backupDir, backupFile), 'utf8')
              const cleanBackupData = backupData.replace(/^\uFEFF/, '')
              const parsedProjects = JSON.parse(cleanBackupData)
              if (!Array.isArray(parsedProjects)) continue
              
              const fromVersion = parsedProjects[0]?.schemaVersion ? parsedProjects[0].schemaVersion : undefined
              const migratedProjects = migrateProjects(parsedProjects, fromVersion)
              const projects = migratedProjects.map((project) => validateProject(normalizeProject(project, uuidv4)))
              log.info('Recovery from backup', { file: backupFile, count: projects.length })
              await this.atomicWrite(this.projectsFilePath, JSON.stringify(projects, null, 2))
              return projects
            } catch {
              continue
            }
          }
        } catch (backupError) {
          log.error('Backup recovery failed', backupError)
        }
      }

      return []
    }
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
      await this.backupProjects()
      
      const backupPath = `${this.projectsFilePath}.pre-migration`
      try {
        await fs.copyFile(this.projectsFilePath, backupPath)
      } catch {}
      
      try {
        const migratedProjects = projects.map(p => ({
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
      const data = await fs.readFile(this.configFilePath, 'utf8')
      const cleanData = data.replace(/^\uFEFF/, '')
      let parsed = JSON.parse(cleanData)
      
      const fromVersion = parsed?.schemaVersion ? parsed.schemaVersion : undefined
      
      parsed = migrateConfig(parsed, fromVersion)
      
      if (JSON.stringify(parsed) !== JSON.stringify(JSON.parse(cleanData))) {
        await this.saveConfigUnlocked(parsed)
        log.info('Config migrated', { version: CONFIG_SCHEMA_VERSION })
      }
      
      const config = normalizeConfig(parsed)
      return config
    } catch (error) {
      log.error('Error loading config', error)
      return this.defaultConfig
    }
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
      const backupPath = `${this.configFilePath}.pre-migration`
      
      try {
        await fs.copyFile(this.configFilePath, backupPath)
      } catch {}
      
      try {
        const configWithVersion = {
          ...config,
          schemaVersion: config.schemaVersion || CONFIG_SCHEMA_VERSION
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
}

module.exports = StorageManager

