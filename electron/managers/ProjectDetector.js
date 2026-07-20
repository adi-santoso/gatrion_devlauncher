const fs = require('fs').promises
const path = require('path')

class ProjectDetector {
  constructor() {
    this.projectTypes = {
      // Check Laravel FIRST before React/Vue (Laravel Inertia has vite.config.js too)
      LARAVEL: {
        name: 'Laravel',
        detector: async (projectPath) => {
          // Check for artisan file and composer.json with laravel/framework
          try {
            const artisanExists = await this.fileExists(path.join(projectPath, 'artisan'))
            if (!artisanExists) return false

            const composerPath = path.join(projectPath, 'composer.json')
            const composerJson = await this.readJson(composerPath)
            if (composerJson.require?.['laravel/framework']) {
              return true
            }
          } catch {
            // Ignore
          }
          return false
        },
        defaultCommand: 'php artisan serve',
        defaultPort: 8000,
        icon: '🔴',
        color: '#FF2D20',
      },
      NEXTJS: {
        name: 'Next.js',
        detector: async (projectPath) => {
          // Check for package.json with next dependency
          try {
            const packageJson = await this.readPackageJson(projectPath)
            if (packageJson.dependencies?.next || packageJson.devDependencies?.next) {
              return true
            }
          } catch {
            // Ignore
          }
          return false
        },
        defaultCommand: 'npm run dev',
        defaultPort: 3000,
        icon: '⚡',
        color: '#000000',
      },
      REACT_VITE: {
        name: 'React (Vite)',
        detector: async (projectPath) => {
          // Check for package.json with vite and react
          try {
            const packageJson = await this.readPackageJson(projectPath)
            const hasVite =
              packageJson.dependencies?.vite || packageJson.devDependencies?.vite
            const hasReact =
              packageJson.dependencies?.react || packageJson.devDependencies?.react
            if (hasVite && hasReact) return true

            // Also check for vite.config.js
            if (await this.fileExists(path.join(projectPath, 'vite.config.js'))) {
              return true
            }
          } catch {
            // Ignore
          }
          return false
        },
        defaultCommand: 'npm run dev',
        defaultPort: 5173,
        icon: '⚛️',
        color: '#61DAFB',
      },
      VUE: {
        name: 'Vue.js',
        detector: async (projectPath) => {
          // Check for package.json with vue
          try {
            const packageJson = await this.readPackageJson(projectPath)
            if (packageJson.dependencies?.vue || packageJson.devDependencies?.vue) {
              return true
            }
          } catch {
            // Ignore
          }
          return false
        },
        defaultCommand: 'npm run dev',
        defaultPort: 5173,
        icon: '🟢',
        color: '#42B883',
      },
      GOLANG: {
        name: 'Go',
        detector: async (projectPath) => {
          // Check for go.mod or main.go
          try {
            const goModExists = await this.fileExists(path.join(projectPath, 'go.mod'))
            const mainGoExists = await this.fileExists(path.join(projectPath, 'main.go'))
            return goModExists || mainGoExists
          } catch {
            return false
          }
        },
        defaultCommand: 'go run .',
        defaultPort: 8080,
        icon: '🐹',
        color: '#00ADD8',
      },
      NODEJS: {
        name: 'Node.js',
        detector: async (projectPath) => {
          // Check for package.json (fallback for generic Node.js projects)
          return await this.fileExists(path.join(projectPath, 'package.json'))
        },
        defaultCommand: 'npm start',
        defaultPort: 3000,
        icon: '🟩',
        color: '#339933',
      },
    }
  }

  /**
   * Detect project type from path
   * @param {string} projectPath - Project directory path
   * @returns {Promise<Object>} Detection result
   */
  async detectProjectType(projectPath) {
    try {
      // Check if path exists
      const exists = await this.directoryExists(projectPath)
      if (!exists) {
        throw new Error('Project directory does not exist')
      }

      // Try each detector in order
      for (const [typeKey, typeConfig] of Object.entries(this.projectTypes)) {
        try {
          const isMatch = await typeConfig.detector(projectPath)
          if (isMatch) {
            return {
              success: true,
              type: typeKey,
              name: typeConfig.name,
              defaultCommand: typeConfig.defaultCommand,
              defaultPort: typeConfig.defaultPort,
              icon: typeConfig.icon,
              color: typeConfig.color,
            }
          }
        } catch (error) {
          console.error(`Error detecting ${typeKey}:`, error)
        }
      }

      // No match found, return CUSTOM
      return {
        success: true,
        type: 'CUSTOM',
        name: 'Custom',
        defaultCommand: '',
        defaultPort: null,
        icon: '⚙️',
        color: '#6B7280',
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
      }
    }
  }

  /**
   * Helper: Read package.json
   */
  async readPackageJson(projectPath) {
    const packageJsonPath = path.join(projectPath, 'package.json')
    return await this.readJson(packageJsonPath)
  }

  /**
   * Helper: Read JSON file
   */
  async readJson(filePath) {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content)
  }

  /**
   * Helper: Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Helper: Check if directory exists
   */
  async directoryExists(dirPath) {
    try {
      const stats = await fs.stat(dirPath)
      return stats.isDirectory()
    } catch {
      return false
    }
  }
}

module.exports = ProjectDetector
