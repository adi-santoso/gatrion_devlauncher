const fs = require('fs').promises
const path = require('path')
import { detectComposerDevScript as detectComposerDev, detectAppPortFromEnv as detectAppPort, detectPythonConfig as detectPython } from '../utils/projectDetection'

interface ProjectTypeConfig {
  name: string
  detector: (projectPath: string) => Promise<boolean>
  defaultCommand: string
  defaultPort: number | null
  icon: string
  color: string
}

class ProjectDetector {
  projectTypes: Record<string, ProjectTypeConfig>

  constructor() {
    this.projectTypes = {
      // Laravel must precede JS frameworks because Inertia projects also use Vite.
      LARAVEL: {
        name: 'Laravel',
        detector: async (projectPath: string): Promise<boolean> => {
          if (!await this.fileExists(path.join(projectPath, 'artisan'))) return false
          const composerJson = await this.readJsonIfExists(path.join(projectPath, 'composer.json'))
          const requireDeps = (composerJson?.require as Record<string, unknown> | undefined) || {}
          return Boolean(requireDeps['laravel/framework'])
        },
        defaultCommand: 'php artisan serve',
        defaultPort: 8000,
        icon: '🔴',
        color: '#FF2D20',
      },
      NEXTJS: {
        name: 'Next.js',
        detector: (projectPath: string): Promise<boolean> => this.hasPackage(projectPath, 'next'),
        defaultCommand: 'npm run dev',
        defaultPort: 3000,
        icon: '⚡',
        color: '#000000',
      },
      VUE: {
        name: 'Vue.js',
        detector: (projectPath: string): Promise<boolean> => this.hasPackage(projectPath, 'vue'),
        defaultCommand: 'npm run dev',
        defaultPort: 5173,
        icon: '🟢',
        color: '#42B883',
      },
      REACT_VITE: {
        name: 'React (Vite)',
        detector: async (projectPath: string): Promise<boolean> => (
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
        detector: (projectPath: string): Promise<boolean> => this.hasPackage(projectPath, 'react'),
        defaultCommand: 'npm start',
        defaultPort: 3000,
        icon: '⚛️',
        color: '#61DAFB',
      },
      GOLANG: {
        name: 'Go',
        detector: async (projectPath: string): Promise<boolean> => (
          await this.fileExists(path.join(projectPath, 'go.mod')) ||
          await this.fileExists(path.join(projectPath, 'main.go'))
        ),
        defaultCommand: 'go run .',
        defaultPort: null,
        icon: '🐹',
        color: '#00ADD8',
      },
      PYTHON: {
        name: 'Python',
        detector: async (projectPath: string): Promise<boolean> => (
          await this.fileExists(path.join(projectPath, 'requirements.txt')) ||
          await this.fileExists(path.join(projectPath, 'pyproject.toml')) ||
          await this.fileExists(path.join(projectPath, 'main.py')) ||
          await this.fileExists(path.join(projectPath, 'app.py'))
        ),
        defaultCommand: 'python main.py',
        defaultPort: null,
        icon: '🐍',
        color: '#3776AB',
      },
      NODEJS: {
        name: 'Node.js',
        detector: (projectPath: string): Promise<boolean> => this.fileExists(path.join(projectPath, 'package.json')),
        defaultCommand: 'npm start',
        defaultPort: 3000,
        icon: '🟩',
        color: '#339933',
      },
    }
  }

  async detectProjectType(projectPath: unknown) {
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
      let matchedConfig: {
        name: string
        defaultCommand: string
        defaultPort: number | null
        icon: string
        color: string
      } = {
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
      const composerDevScript = matchedType === 'LARAVEL'
        ? detectComposerDev(composerJson)
        : null
      const pythonHint = matchedType === 'PYTHON'
        ? await detectPython(projectPath)
        : null
      const startCommand = pythonHint
        ? pythonHint.command
        : usesJavaScriptCommand
          ? this.detectStartCommand(packageJson?.scripts as Record<string, unknown> | undefined, packageManager)
          : composerDevScript ?? matchedConfig.defaultCommand
      const laravelAppPort = matchedType === 'LARAVEL'
        ? await detectAppPort(projectPath)
        : null
      const detectedPort = matchedType === 'LARAVEL'
        ? laravelAppPort ?? matchedConfig.defaultPort
        : pythonHint
          ? pythonHint.port
          : await this.detectActualPort(projectPath, matchedConfig.defaultPort)
      const projectName = this.detectProjectName(projectPath, packageJson, composerJson, goModule)
      const commands = await this.detectCommands(matchedType, matchedConfig, packageJson, composerJson, packageManager, projectPath, detectedPort)
      const detectedName = this.detectStackName(matchedType, matchedConfig.name, packageJson)
      const warnings: string[] = []

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
      return { success: false, error: (error as Error).message }
    }
  }

  async hasPackage(projectPath: string, packageName: string): Promise<boolean> {
    const packageJson = await this.readJsonIfExists(path.join(projectPath, 'package.json'))
    const dependencies = (packageJson?.dependencies as Record<string, unknown> | undefined) || {}
    const devDependencies = (packageJson?.devDependencies as Record<string, unknown> | undefined) || {}
    return Boolean(dependencies[packageName] || devDependencies[packageName])
  }

  detectProjectName(projectPath: string, packageJson: Record<string, unknown> | null, composerJson: Record<string, unknown> | null, goModule: string): string {
    const packageName = typeof packageJson?.name === 'string' ? packageJson.name.trim() : ''
    if (packageName) return packageName.split('/').pop() || ''

    const composerName = typeof composerJson?.name === 'string' ? composerJson.name.trim() : ''
    if (composerName) return composerName.split('/').pop() || ''

    if (goModule) return goModule.split('/').pop() || ''
    return path.basename(path.resolve(projectPath))
  }

  async detectPackageManager(projectPath: string, packageJson: Record<string, unknown>): Promise<string> {
    const declared = typeof packageJson.packageManager === 'string'
      ? packageJson.packageManager.split('@')[0].trim().toLowerCase()
      : ''
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(declared)) return declared

    const lockfiles: Array<[string, string]> = [
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

  detectStartCommand(scripts: Record<string, unknown> | null | undefined, packageManager: string | null): string {
    if (!scripts || typeof scripts !== 'object') return ''
    const scriptName = ['dev', 'start', 'serve', 'develop'].find((name) => typeof scripts[name] === 'string')
    if (!scriptName) return ''
    if (packageManager === 'npm') return scriptName === 'start' ? 'npm start' : `npm run ${scriptName}`
    return `${packageManager} ${scriptName}`
  }

  detectStackName(type: string, fallback: string, packageJson: Record<string, unknown> | null | undefined): string {
    if (type !== 'LARAVEL') return fallback
    const packages: Record<string, unknown> = {
      ...(packageJson?.dependencies as Record<string, unknown> | undefined),
      ...(packageJson?.devDependencies as Record<string, unknown> | undefined),
    }
    if (packages['@inertiajs/vue3']) return 'Laravel + Inertia + Vue'
    if (packages['@inertiajs/react']) return 'Laravel + Inertia + React'
    if (packages.vue) return 'Laravel + Vue'
    if (packages.react) return 'Laravel + React'
    if (packages.vite) return 'Laravel + Vite'
    return fallback
  }

  // Laravel 11+ ships a `scripts.dev` entry in composer.json. Laravel 11/12
  // runs `npx concurrently "php artisan serve" "npm run dev" ...`; Laravel 13
  // runs `@php artisan dev` (single artisan command). When present we surface
  // `composer run dev` as a single composite command — matching the official
  // recommendation — instead of splitting into separate serve/assets slots.
  // For Laravel 10 (no composer dev script) we fall back to the legacy
  // two-slot `php artisan serve` + `npm run dev` behavior.
  async detectCommands(
    type: string,
    config: { name: string; defaultCommand: string; defaultPort: number | null; icon: string; color: string },
    packageJson: Record<string, unknown> | null | undefined,
    composerJson: Record<string, unknown> | null | undefined,
    packageManager: string | null,
    projectPath: string,
    primaryPort: number | null,
  ): Promise<Array<{ id: string; name: string; command: string; port: number | null; primary: boolean }>> {
    const isJavaScriptProject = ['NEXTJS', 'VUE', 'REACT_VITE', 'REACT', 'NODEJS'].includes(type)
    const composerDevScript = type === 'LARAVEL'
      ? detectComposerDev(composerJson)
      : null
    const primaryCommand: { id: string; name: string; command: string; port: number | null; primary: boolean } = type === 'LARAVEL'
      ? { id: 'app', name: 'Laravel', command: composerDevScript ?? config.defaultCommand, port: primaryPort, primary: true }
      : type === 'PYTHON'
        ? { id: 'main', name: 'Python', command: (await detectPython(projectPath)).command, port: primaryPort, primary: true }
        : {
          id: 'main',
          name: config.name,
          command: isJavaScriptProject
            ? this.detectStartCommand(packageJson?.scripts as Record<string, unknown> | undefined, packageManager)
            : config.defaultCommand,
          port: primaryPort,
          primary: true,
        }
    if (type !== 'LARAVEL') return primaryCommand.command ? [primaryCommand] : []

    // Laravel with a composer dev script (L11/12/13): single composite command.
    // `composer run dev` wraps server + queue + vite (and more) per official docs,
    // so we don't split into separate slots — the user can still edit/remove it.
    if (composerDevScript) return [primaryCommand]

    // Laravel without a composer dev script (L10 or custom): legacy two-slot
    // behavior splitting `php artisan serve` and the frontend asset builder.
    const frontend = this.detectStartCommand(packageJson?.scripts as Record<string, unknown> | undefined, packageManager)
    const dependencies = (packageJson?.dependencies as Record<string, unknown> | undefined) || {}
    const devDependencies = (packageJson?.devDependencies as Record<string, unknown> | undefined) || {}
    const frontendName = dependencies['@inertiajs/vue3'] || devDependencies['@inertiajs/vue3']
      ? 'Inertia Vue assets'
      : dependencies['@inertiajs/react'] || devDependencies['@inertiajs/react']
        ? 'Inertia React assets'
        : 'Frontend assets'
    const hasFrontendSignal = Boolean(
      dependencies.vite || devDependencies.vite ||
      dependencies['@inertiajs/vue3'] || devDependencies['@inertiajs/vue3'] ||
      dependencies.vue || devDependencies.vue
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

  async detectFrontendPort(packageJson: Record<string, unknown> | null | undefined, projectPath: string): Promise<number> {
    const script = Object.values((packageJson?.scripts || {}) as Record<string, unknown>).find((value) => typeof value === 'string' && /(?:vite|--port|-p\s)/.test(value as string))
    const scriptPort = this.validPort((script as string | undefined)?.match(/(?:-p|--port)\s*=?\s*(\d+)/)?.[1])
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

  async detectActualPort(projectPath: string, defaultPort: number | null): Promise<number | null> {
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
    for (const scriptCommand of Object.values((packageJson?.scripts || {}) as Record<string, unknown>)) {
      if (typeof scriptCommand !== 'string') continue
      const port = this.validPort(scriptCommand.match(/(?:-p|--port)\s*=?\s*(\d+)/)?.[1])
      if (port) return port
    }

    return defaultPort
  }

  validPort(value: string | null | undefined): number | null {
    const port = Number.parseInt(value || '', 10)
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
  }

  async readGoModule(projectPath: string): Promise<string> {
    try {
      const content = await fs.readFile(path.join(projectPath, 'go.mod'), 'utf8')
      return content.match(/^module\s+(\S+)/m)?.[1] || ''
    } catch {
      return ''
    }
  }

  // TODO(ts): parsed JSON documents are unvalidated — typed as Record<string, unknown>
  // until a schema check is introduced; every read site guards with typeof checks.
  async readJsonIfExists(filePath: string): Promise<Record<string, unknown> | null> {
    try {
      return await this.readJson(filePath)
    } catch {
      return null
    }
  }

  async readJson(filePath: string): Promise<Record<string, unknown>> {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async directoryExists(dirPath: string): Promise<boolean> {
    try {
      return (await fs.stat(dirPath)).isDirectory()
    } catch {
      return false
    }
  }
}

export default ProjectDetector


export type { ProjectDetector }
