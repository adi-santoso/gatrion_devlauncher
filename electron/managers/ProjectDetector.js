const fs = require('fs').promises
const path = require('path')

class ProjectDetector {
  constructor() {
    this.projectTypes = {
      // Laravel must precede JS frameworks because Inertia projects also use Vite.
      LARAVEL: {
        name: 'Laravel',
        detector: async (projectPath) => {
          if (!await this.fileExists(path.join(projectPath, 'artisan'))) return false
          const composerJson = await this.readJsonIfExists(path.join(projectPath, 'composer.json'))
          return Boolean(composerJson?.require?.['laravel/framework'])
        },
        defaultCommand: 'php artisan serve',
        defaultPort: 8000,
        icon: '🔴',
        color: '#FF2D20',
      },
      NEXTJS: {
        name: 'Next.js',
        detector: async (projectPath) => this.hasPackage(projectPath, 'next'),
        defaultCommand: 'npm run dev',
        defaultPort: 3000,
        icon: '⚡',
        color: '#000000',
      },
      VUE: {
        name: 'Vue.js',
        detector: async (projectPath) => this.hasPackage(projectPath, 'vue'),
        defaultCommand: 'npm run dev',
        defaultPort: 5173,
        icon: '🟢',
        color: '#42B883',
      },
      REACT_VITE: {
        name: 'React (Vite)',
        detector: async (projectPath) => (
          await this.hasPackage(projectPath, 'vite') && await this.hasPackage(projectPath, 'react')
        ),
        defaultCommand: 'npm run dev',
        defaultPort: 5173,
        icon: '⚛️',
        color: '#61DAFB',
      },
      // React without Vite (e.g. Create React App / react-scripts) — must come after REACT_VITE
      // so Vite projects win, and after NEXTJS so Next.js projects are not mislabeled.
      REACT: {
        name: 'React',
        detector: async (projectPath) => this.hasPackage(projectPath, 'react'),
        defaultCommand: 'npm start',
        defaultPort: 3000,
        icon: '⚛️',
        color: '#61DAFB',
      },
      GOLANG: {
        name: 'Go',
        detector: async (projectPath) => (
          await this.fileExists(path.join(projectPath, 'go.mod')) ||
          await this.fileExists(path.join(projectPath, 'main.go'))
        ),
        defaultCommand: 'go run .',
        defaultPort: null,
        icon: '🐹',
        color: '#00ADD8',
      },
      NODEJS: {
        name: 'Node.js',
        detector: async (projectPath) => this.fileExists(path.join(projectPath, 'package.json')),
        defaultCommand: 'npm start',
        defaultPort: 3000,
        icon: '🟩',
        color: '#339933',
      },
    }
  }

  async detectProjectType(projectPath) {
    try {
      if (typeof projectPath !== 'string' || !projectPath.trim()) {
        throw new Error('Project directory path is required')
      }
      if (!await this.directoryExists(projectPath)) {
        throw new Error('Project directory does not exist')
      }

      const packageJson = await this.readJsonIfExists(path.join(projectPath, 'package.json'))
      const composerJson = await this.readJsonIfExists(path.join(projectPath, 'composer.json'))
      const goModule = await this.readGoModule(projectPath)
      const packageManager = packageJson
        ? await this.detectPackageManager(projectPath, packageJson)
        : null

      let matchedType = 'CUSTOM'
      let matchedConfig = {
        name: 'Custom',
        defaultCommand: '',
        defaultPort: null,
        icon: '⚙️',
        color: '#6B7280',
      }

      for (const [typeKey, typeConfig] of Object.entries(this.projectTypes)) {
        try {
          if (await typeConfig.detector(projectPath)) {
            matchedType = typeKey
            matchedConfig = typeConfig
            break
          }
        } catch (error) {
          console.error(`Error detecting ${typeKey}:`, error)
        }
      }

      const usesJavaScriptCommand = ['NEXTJS', 'VUE', 'REACT_VITE', 'REACT', 'NODEJS'].includes(matchedType)
      const startCommand = usesJavaScriptCommand
        ? this.detectStartCommand(packageJson?.scripts, packageManager)
        : matchedConfig.defaultCommand
      const detectedPort = matchedType === 'LARAVEL'
        ? matchedConfig.defaultPort
        : await this.detectActualPort(projectPath, matchedConfig.defaultPort)
      const projectName = this.detectProjectName(projectPath, packageJson, composerJson, goModule)
      const commands = await this.detectCommands(matchedType, matchedConfig, packageJson, packageManager, projectPath, detectedPort)
      const detectedName = this.detectStackName(matchedType, matchedConfig.name, packageJson)
      const warnings = []

      if (!startCommand) warnings.push('Start command could not be detected. Add it in Advanced Settings.')
      if (matchedType === 'CUSTOM') warnings.push('Project framework could not be identified.')

      return {
        success: true,
        type: matchedType,
        name: detectedName,
        projectName,
        packageManager,
        defaultCommand: startCommand,
        defaultPort: detectedPort,
        commands,
        icon: matchedConfig.icon,
        color: matchedConfig.color,
        warnings,
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async hasPackage(projectPath, packageName) {
    const packageJson = await this.readJsonIfExists(path.join(projectPath, 'package.json'))
    return Boolean(packageJson?.dependencies?.[packageName] || packageJson?.devDependencies?.[packageName])
  }

  detectProjectName(projectPath, packageJson, composerJson, goModule) {
    const packageName = typeof packageJson?.name === 'string' ? packageJson.name.trim() : ''
    if (packageName) return packageName.split('/').pop()

    const composerName = typeof composerJson?.name === 'string' ? composerJson.name.trim() : ''
    if (composerName) return composerName.split('/').pop()

    if (goModule) return goModule.split('/').pop()
    return path.basename(path.resolve(projectPath))
  }

  async detectPackageManager(projectPath, packageJson) {
    const declared = typeof packageJson.packageManager === 'string'
      ? packageJson.packageManager.split('@')[0].trim().toLowerCase()
      : ''
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(declared)) return declared

    const lockfiles = [
      ['pnpm-lock.yaml', 'pnpm'],
      ['yarn.lock', 'yarn'],
      ['bun.lock', 'bun'],
      ['bun.lockb', 'bun'],
      ['package-lock.json', 'npm'],
      ['npm-shrinkwrap.json', 'npm'],
    ]
    for (const [lockfile, manager] of lockfiles) {
      if (await this.fileExists(path.join(projectPath, lockfile))) return manager
    }
    return 'npm'
  }

  detectStartCommand(scripts, packageManager) {
    if (!scripts || typeof scripts !== 'object') return ''
    const scriptName = ['dev', 'start', 'serve', 'develop'].find((name) => typeof scripts[name] === 'string')
    if (!scriptName) return ''
    if (packageManager === 'npm') return scriptName === 'start' ? 'npm start' : `npm run ${scriptName}`
    return `${packageManager} ${scriptName}`
  }

  detectStackName(type, fallback, packageJson) {
    if (type !== 'LARAVEL') return fallback
    const packages = { ...packageJson?.dependencies, ...packageJson?.devDependencies }
    if (packages['@inertiajs/vue3']) return 'Laravel + Inertia + Vue'
    if (packages['@inertiajs/react']) return 'Laravel + Inertia + React'
    if (packages.vue) return 'Laravel + Vue'
    if (packages.react) return 'Laravel + React'
    if (packages.vite) return 'Laravel + Vite'
    return fallback
  }

  async detectCommands(type, config, packageJson, packageManager, projectPath, primaryPort) {
    const isJavaScriptProject = ['NEXTJS', 'VUE', 'REACT_VITE', 'REACT', 'NODEJS'].includes(type)
    const primaryCommand = type === 'LARAVEL'
      ? { id: 'app', name: 'Laravel', command: config.defaultCommand, port: primaryPort, primary: true }
      : {
        id: 'main',
        name: config.name,
        command: isJavaScriptProject
          ? this.detectStartCommand(packageJson?.scripts, packageManager)
          : config.defaultCommand,
        port: primaryPort,
        primary: true,
      }
    if (type !== 'LARAVEL') return primaryCommand.command ? [primaryCommand] : []

    const frontend = this.detectStartCommand(packageJson?.scripts, packageManager)
    const frontendName = packageJson?.dependencies?.['@inertiajs/vue3'] || packageJson?.devDependencies?.['@inertiajs/vue3']
      ? 'Inertia Vue assets'
      : packageJson?.dependencies?.['@inertiajs/react'] || packageJson?.devDependencies?.['@inertiajs/react']
        ? 'Inertia React assets'
        : 'Frontend assets'
    const hasFrontendSignal = Boolean(
      packageJson?.dependencies?.vite || packageJson?.devDependencies?.vite ||
      packageJson?.dependencies?.['@inertiajs/vue3'] || packageJson?.devDependencies?.['@inertiajs/vue3'] ||
      packageJson?.dependencies?.vue || packageJson?.devDependencies?.vue
    )
    if (!frontend || !hasFrontendSignal) return [primaryCommand]

    return [
      primaryCommand,
      {
        id: 'assets',
        name: frontendName,
        command: frontend,
        port: await this.detectFrontendPort(packageJson, projectPath),
        primary: false,
      },
    ]
  }

  async detectFrontendPort(packageJson, projectPath) {
    const script = Object.values(packageJson?.scripts || {}).find((value) => typeof value === 'string' && /(?:vite|--port|-p\s)/.test(value))
    const scriptPort = this.validPort(script?.match(/(?:-p|--port)\s*=?\s*(\d+)/)?.[1])
    if (scriptPort) return scriptPort
    for (const viteFile of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs']) {
      try {
        const content = await fs.readFile(path.join(projectPath, viteFile), 'utf8')
        const configuredPort = this.validPort(content.match(/port\s*:\s*(\d+)/)?.[1])
        if (configuredPort) return configuredPort
      } catch {
        // Missing and unreadable optional files are ignored.
      }
    }
    for (const envFile of ['.env', '.env.local', '.env.development']) {
      try {
        const content = await fs.readFile(path.join(projectPath, envFile), 'utf8')
        const envPort = this.validPort(content.match(/^VITE_PORT\s*=\s*["']?(\d+)["']?/m)?.[1])
        if (envPort) return envPort
      } catch {
        // Missing and unreadable optional files are ignored.
      }
    }
    return 5173
  }

  async detectActualPort(projectPath, defaultPort) {
    const envFiles = ['.env', '.env.local', '.env.development']
    for (const envFile of envFiles) {
      try {
        const content = await fs.readFile(path.join(projectPath, envFile), 'utf8')
        const match = content.match(/^(?:PORT|VITE_PORT|APP_PORT|SERVER_PORT|DEV_PORT)\s*=\s*["']?(\d+)["']?/m)
        const port = this.validPort(match?.[1])
        if (port) return port
      } catch {
        // Missing and unreadable optional files are ignored.
      }
    }

    for (const viteFile of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs']) {
      try {
        const content = await fs.readFile(path.join(projectPath, viteFile), 'utf8')
        const port = this.validPort(content.match(/port\s*:\s*(\d+)/)?.[1])
        if (port) return port
      } catch {
        // Missing and unreadable optional files are ignored.
      }
    }

    const packageJson = await this.readJsonIfExists(path.join(projectPath, 'package.json'))
    for (const scriptCommand of Object.values(packageJson?.scripts || {})) {
      if (typeof scriptCommand !== 'string') continue
      const port = this.validPort(scriptCommand.match(/(?:-p|--port)\s*=?\s*(\d+)/)?.[1])
      if (port) return port
    }

    return defaultPort
  }

  validPort(value) {
    const port = Number.parseInt(value, 10)
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
  }

  async readGoModule(projectPath) {
    try {
      const content = await fs.readFile(path.join(projectPath, 'go.mod'), 'utf8')
      return content.match(/^module\s+(\S+)/m)?.[1] || ''
    } catch {
      return ''
    }
  }

  async readJsonIfExists(filePath) {
    try {
      return await this.readJson(filePath)
    } catch {
      return null
    }
  }

  async readJson(filePath) {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async directoryExists(dirPath) {
    try {
      return (await fs.stat(dirPath)).isDirectory()
    } catch {
      return false
    }
  }
}

module.exports = ProjectDetector
