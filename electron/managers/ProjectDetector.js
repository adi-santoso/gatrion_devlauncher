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
            const detectedPort = await this.detectActualPort(projectPath, typeConfig.defaultPort)
            return {
              success: true,
              type: typeKey,
              name: typeConfig.name,
              defaultCommand: typeConfig.defaultCommand,
              defaultPort: detectedPort,
              icon: typeConfig.icon,
              color: typeConfig.color,
            }
          }
        } catch (error) {
          console.error(`Error detecting ${typeKey}:`, error)
        }
      }

      // No match found, check if custom port exists in .env
      const customPort = await this.detectActualPort(projectPath, null)
      return {
        success: true,
        type: 'CUSTOM',
        name: 'Custom',
        defaultCommand: '',
        defaultPort: customPort,
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
   * Helper: Detect actual port from .env files, vite.config.js/ts, or package.json scripts
   */
  async detectActualPort(projectPath, defaultPort) {
    // 1. Check .env files (.env, .env.local, .env.development)
    const envFiles = ['.env', '.env.local', '.env.development']
    for (const envFile of envFiles) {
      try {
        const filePath = path.join(projectPath, envFile)
        if (await this.fileExists(filePath)) {
          const content = await fs.readFile(filePath, 'utf8')
          // Match PORT=3000, VITE_PORT=3000, APP_PORT=8000, SERVER_PORT=4000
          const match = content.match(/^(?:PORT|VITE_PORT|APP_PORT|SERVER_PORT|DEV_PORT)\s*=\s*(\d+)/m)
          if (match && match[1]) {
            const parsed = parseInt(match[1], 10)
            if (parsed > 0 && parsed < 65536) return parsed
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    // 2. Check vite.config.js / vite.config.ts / vite.config.mjs
    const viteConfigFiles = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs']
    for (const viteFile of viteConfigFiles) {
      try {
        const filePath = path.join(projectPath, viteFile)
        if (await this.fileExists(filePath)) {
          const content = await fs.readFile(filePath, 'utf8')
          // Match server: { port: 3000 } or port: 3000
          const match = content.match(/port\s*:\s*(\d+)/)
          if (match && match[1]) {
            const parsed = parseInt(match[1], 10)
            if (parsed > 0 && parsed < 65536) return parsed
          }
        }
      } catch {
        // Ignore
      }
    }

    // 3. Check package.json scripts (e.g. "next dev -p 4000" or "vite --port 3000")
    try {
      const packageJson = await this.readPackageJson(projectPath)
      const scripts = packageJson.scripts || {}
      for (const scriptCmd of Object.values(scripts)) {
        if (typeof scriptCmd === 'string') {
          const match = scriptCmd.match(/(?:-p|--port)\s+=?\s*(\d+)/)
          if (match && match[1]) {
            const parsed = parseInt(match[1], 10)
            if (parsed > 0 && parsed < 65536) return parsed
          }
        }
      }
    } catch {
      // Ignore
    }

    return defaultPort
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
