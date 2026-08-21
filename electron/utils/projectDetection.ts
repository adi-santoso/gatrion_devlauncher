const fs = require('fs').promises
const path = require('path')

/**
 * Shared detect-time helpers for ProjectDetector. Kept here so ProjectDetector
 * stays focused on the framework table + orchestration and remains under the
 * lint line cap.
 */

function validPort(value: string | null | undefined): number | null {
  const port = Number.parseInt(value || '', 10)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

// Laravel 11+ ships a `scripts.dev` entry in composer.json. When present we
// surface `composer run dev` as a single composite command, matching the official
// recommendation. For Laravel 10 (no composer dev script) it returns null.
function detectComposerDevScript(composerJson: Record<string, unknown> | null | undefined): string | null {
  if (!composerJson || typeof composerJson !== 'object') return null
  const scripts = (composerJson.scripts as Record<string, unknown> | undefined) || {}
  const flatten = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) return value.map((entry) => flatten(entry)).join(' ')
    return ''
  }
  return flatten(scripts.dev).trim() ? 'composer run dev' : null
}

async function detectAppPortFromEnv(projectPath: string): Promise<number | null> {
  for (const envFile of ['.env', '.env.local', '.env.development']) {
    try {
      const content = await fs.readFile(path.join(projectPath, envFile), 'utf8')
      const port = validPort(content.match(/^APP_PORT\s*=\s*["']?(\d+)["']?/m)?.[1])
      if (port) return port
    } catch {
      // Missing and unreadable optional files are ignored.
    }
  }
  return null
}

// Infer the Python entry point and typical dev port by framework convention:
// Django (`manage.py`, 8000), Flask (`app.py`, 5000), else generic `main.py`.
async function detectPythonConfig(projectPath: string): Promise<{ command: string; port: number | null }> {
  const probes: Array<[string, string, number | null]> = [
    ['manage.py', 'python manage.py runserver', 8000],
    ['app.py', 'python app.py', 5000],
    ['main.py', 'python main.py', null],
  ]
  for (const [file, command, port] of probes) {
    if (await fileExists(path.join(projectPath, file))) return { command, port }
  }
  return { command: 'python main.py', port: null }
}

export { detectComposerDevScript, detectAppPortFromEnv, detectPythonConfig }