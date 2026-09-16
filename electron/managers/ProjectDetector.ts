const fs = require('fs').promises
const path = require('path')
import { detectComposerDevScript as detectComposerDev, detectAppPortFromEnv as detectAppPort, detectPythonConfig as detectPython } from '../utils/projectDetection'
import { detectLaunchPort } from '../utils/projectDetection'
import { readManifest, resolvePackageManager } from '../utils/projectMetadata'
import { canonicalProjectPath } from '../utils/pathKey'

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
  private manifests = new Map<string, Record<string, unknown> | null>()

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
          await this.fileExists(path.join(projectPath, 'manage.py')) ||
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
        defaultPort: null,
        icon: '🟩',
        color: '#339933',
      },
    }
  }

  async detectProjectType(projectPath: unknown) {
    // Per-request detector cache: simultaneous folder requests never share metadata.
    return new ProjectDetector().analyze(projectPath)
  }

  private async analyze(projectPath: unknown) {
    try {
      if (typeof projectPath !== 'string' || !projectPath.trim()) {
        throw new Error('Project directory path is required')
      }
      projectPath = canonicalProjectPath(projectPath)
      if (!await this.directoryExists(projectPath as string)) {
        throw new Error('Project directory does not exist')
      }
      const cwd = projectPath as string

      const packageJson = await this.readJsonIfExists(path.join(cwd, 'package.json'))
      const composerJson = await this.readJsonIfExists(path.join(cwd, 'composer.json'))
      const goModule = await this.readGoModule(cwd)
      const packageManager = packageJson
        ? await this.detectPackageManager(cwd, packageJson)
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
          if (await typeConfig.detector(cwd)) {
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
        ? await detectPython(cwd)
        : null
      const startCommand = pythonHint
        ? pythonHint.command
        : usesJavaScriptCommand
          ? this.detectStartCommand(packageJson?.scripts as Record<string, unknown> | undefined, packageManager)
          : composerDevScript ?? matchedConfig.defaultCommand
      const laravelAppPort = matchedType === 'LARAVEL'
        ? await detectAppPort(cwd)
        : null
      const scripts = (packageJson?.scripts || {}) as Record<string, unknown>
      const selectedScript = ['dev', 'start', 'serve', 'develop'].find(key => typeof scripts[key] === 'string' && String(scripts[key]).trim())
      const script = selectedScript ? String(scripts[selectedScript]) : ''
      const portHint = await detectLaunchPort(cwd, script, matchedConfig.defaultPort)
      const detectedPort = matchedType === 'LARAVEL'
        ? laravelAppPort ?? matchedConfig.defaultPort
        : pythonHint
          ? pythonHint.port
          : portHint.port
      const projectName = this.detectProjectName(cwd, packageJson, composerJson, goModule)
      const commands = await this.detectCommands(matchedType, matchedConfig, packageJson, composerJson, packageManager, cwd, detectedPort)
      const detectedName = this.detectStackName(matchedType, matchedConfig.name, packageJson)
      const managerHint = packageJson ? resolvePackageManager(cwd, packageJson) : null
      const warnings: string[] = [...(managerHint?.warnings || [])]

      if (!startCommand) warnings.push('Start command could not be detected. Enter a command to continue.')
      if (matchedType === 'CUSTOM') warnings.push('Project framework could not be identified.')

      return {
        success: true,
        path: cwd,
        sources: { command: usesJavaScriptCommand ? `package.json → scripts.${selectedScript || '(none)'}` : matchedType === 'PYTHON' ? 'Python entrypoint / local virtual environment' : 'Framework convention', port: matchedType === 'LARAVEL' ? 'APP_PORT / Laravel convention' : pythonHint ? (pythonHint.port ? 'Django runserver convention' : 'No port monitoring') : portHint.source, packageManager: managerHint?.source },
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
    return resolvePackageManager(projectPath, packageJson).manager
  }

  detectStartCommand(scripts: Record<string, unknown> | null | undefined, packageManager: string | null): string {
    if (!scripts || typeof scripts !== 'object') return ''
    const scriptName = ['dev', 'start', 'serve', 'develop'].find((name) => typeof scripts[name] === 'string' && String(scripts[name]).trim())
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
    // Only add a frontend slot when vite is genuinely wired to Laravel:
    // the official `laravel-vite-plugin` (or Inertia adapter) is present,
    // or the vite config references Laravel's resources directory.
    // A bare `vite` in package.json is not enough — many Laravel projects
    // include it as a transitive dependency without using it for assets.
    const hasLaravelPlugin = Boolean(
      devDependencies['laravel-vite-plugin'] ||
      dependencies['@inertiajs/vue3'] || devDependencies['@inertiajs/vue3'] ||
      dependencies['@inertiajs/react'] || devDependencies['@inertiajs/react']
    )
    const hasFrontendSignal = hasLaravelPlugin
      ? true
      : await this.viteConfigReferencesLaravel(projectPath)
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
    const scripts = (packageJson?.scripts || {}) as Record<string, unknown>
    const key = ['dev', 'start', 'serve', 'develop'].find(name => typeof scripts[name] === 'string' && String(scripts[name]).trim())
    return (await detectLaunchPort(projectPath, key ? String(scripts[key]) : '', 5173, true)).port || 5173
  }

  /**
   * Whether a vite config actually targets Laravel's frontend resources.
   * The official `laravel-vite-plugin` writes `input` pointing at
   * `resources/js/app.js` / `resources/css/app.css`, so the config
   * references a `resources/` path (or imports the plugin from a
   * `vendor/laravel/vite-plugin`-flavoured path). A bare vite project
   * (no resources dir) does not qualify.
   */
  async viteConfigReferencesLaravel(projectPath: string): Promise<boolean> {
    for (const viteFile of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs']) {
      try {
        const content = await fs.readFile(path.join(projectPath, viteFile), 'utf8')
        if (/resources\/(?:js|css|ts)\//.test(content)) return true
        if (/laravel-vite-plugin/.test(content)) return true
      } catch {
        // Missing and unreadable optional files are ignored.
      }
    }
    return false
  }

  async detectActualPort(projectPath: string, defaultPort: number | null): Promise<number | null> {
    return (await detectLaunchPort(projectPath, '', defaultPort)).port
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
    if (!this.manifests.has(filePath)) this.manifests.set(filePath, readManifest(filePath))
    return this.manifests.get(filePath)!
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
