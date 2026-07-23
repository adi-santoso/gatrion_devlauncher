const fs = require('fs').promises
const path = require('path')
const { app } = require('electron')
const { v4: uuidv4 } = require('uuid')
const { DEFAULT_CONFIG, applyConfigUpdates, normalizeConfig } = require('../configSchema')
const { normalizeProject, validateProject } = require('../projectSchema')

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
      // Ensure app data directory exists
      await fs.mkdir(this.appDataPath, { recursive: true })
      await fs.mkdir(this.backupDir, { recursive: true })

      // Create projects file if it doesn't exist
      try {
        await fs.access(this.projectsFilePath)
      } catch {
        await fs.writeFile(this.projectsFilePath, JSON.stringify([]))
      }

      // Create config file if it doesn't exist
      try {
        await fs.access(this.configFilePath)
      } catch {
        await fs.writeFile(this.configFilePath, JSON.stringify(this.defaultConfig, null, 2))
      }

      console.log('[StorageManager] Initialized:', {
        appDataPath: this.appDataPath,
        projectsFile: this.projectsFilePath,
        configFile: this.configFilePath,
      })
    } catch (error) {
      console.error('[StorageManager] Init error:', error)
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
      const parsed = JSON.parse(cleanData)
      if (!Array.isArray(parsed)) throw new SyntaxError('Projects data must be an array')

      const projects = parsed.map((project) => validateProject(normalizeProject(project, uuidv4)))
      if (JSON.stringify(projects) !== JSON.stringify(parsed)) {
        await this.saveProjectsUnlocked(projects)
      }
      return projects
    } catch (error) {
      console.error('[StorageManager] Error loading projects:', error)

      // If JSON is corrupt, try to recover from latest backup
      if (error instanceof SyntaxError) {
        console.log('[StorageManager] Attempting recovery from backup...')
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
              const projects = parsedProjects.map((project) => validateProject(normalizeProject(project, uuidv4)))
              console.log(`[StorageManager] Recovered ${projects.length} projects from ${backupFile}`)
              // Overwrite corrupted file with good backup
              await this.atomicWrite(this.projectsFilePath, JSON.stringify(projects, null, 2))
              return projects
            } catch {
              continue // try next backup
            }
          }
        } catch (backupError) {
          console.error('[StorageManager] Backup recovery failed:', backupError)
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
      // Backup current file before saving
      await this.backupProjects()

      // Save new data atomically (write to temp, then rename)
      await this.atomicWrite(this.projectsFilePath, JSON.stringify(projects, null, 2))
      console.log('[StorageManager] Saved', projects.length, 'projects')
    } catch (error) {
      console.error('[StorageManager] Error saving projects:', error)
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

      // Copy file
      await fs.copyFile(this.projectsFilePath, backupPath)

      // Keep only last 5 backups
      await this.cleanOldBackups()
    } catch (error) {
      // Ignore if file doesn't exist yet
      if (error.code !== 'ENOENT') {
        console.error('[StorageManager] Backup error:', error)
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
      console.error('[StorageManager] Error cleaning backups:', error)
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
      const parsed = JSON.parse(cleanData)
      const config = normalizeConfig(parsed)
      if (JSON.stringify(config) !== JSON.stringify(parsed)) {
        await this.saveConfigUnlocked(config)
      }
      return config
    } catch (error) {
      console.error('[StorageManager] Error loading config:', error)
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
      await this.atomicWrite(this.configFilePath, JSON.stringify(config, null, 2))
      console.log('[StorageManager] Config saved')
    } catch (error) {
      console.error('[StorageManager] Error saving config:', error)
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
        console.error('[StorageManager] Error updating config:', error)
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
