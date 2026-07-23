const fs = require('fs').promises
const path = require('path')
const { app } = require('electron')

class StorageManager {
  constructor() {
    // Get app data directory
    this.appDataPath = app.getPath('userData')
    this.projectsFilePath = path.join(this.appDataPath, 'projects.json')
    this.configFilePath = path.join(this.appDataPath, 'config.json')
    this.backupDir = path.join(this.appDataPath, 'backups')

    // Default config
    this.defaultConfig = {
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
    try {
      const data = await fs.readFile(this.projectsFilePath, 'utf8')
      const cleanData = data.replace(/^\uFEFF/, '')
      return JSON.parse(cleanData)
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
              const projects = JSON.parse(cleanBackupData)
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

  /**
   * Backup projects file
   */
  async backupProjects() {
    try {
      // Check if projects file exists
      await fs.access(this.projectsFilePath)

      // Create backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = path.join(this.backupDir, `projects-${timestamp}.json`)

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
    try {
      const data = await fs.readFile(this.configFilePath, 'utf8')
      const cleanData = data.replace(/^\uFEFF/, '')
      return JSON.parse(cleanData)
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
    try {
      const current = await this.loadConfig()
      // Deep merge for nested objects like notifications and terminal
      const merged = this.deepMerge(current, updates)
      await this.saveConfig(merged)
      return merged
    } catch (error) {
      console.error('[StorageManager] Error updating config:', error)
      throw error
    }
  }

  /**
   * Deep merge two objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} Merged object
   */
  deepMerge(target, source) {
    const result = { ...target }
    for (const key in source) {
      if (source[key] instanceof Object && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key])
      } else {
        result[key] = source[key]
      }
    }
    return result
  }

  /**
   * Get app data path
   */
  getAppDataPath() {
    return this.appDataPath
  }
  /**
   * Atomic write: write to temp file first, then rename.
   * Prevents corruption from partial writes or crashes during write.
   * @param {string} filePath - Target file path
   * @param {string} content - Content to write
   */
  async atomicWrite(filePath, content) {
    const tmpPath = filePath + '.tmp'
    await fs.writeFile(tmpPath, content, 'utf8')
    await fs.rename(tmpPath, filePath)
  }
}

module.exports = StorageManager
