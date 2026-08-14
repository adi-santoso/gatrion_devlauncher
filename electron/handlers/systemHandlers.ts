const fs = require('fs').promises
const path = require('path')
const { ipcMain, app, dialog, shell } = require('electron') as typeof import('electron')
const { execFile } = require('child_process')
import { assertTrustedIpcEvent } from '../utils/ipcSecurity'
import { safeHandle } from '../utils/ipcValidation'
import { toRendererProject } from '../projectSchema'

interface ToolResult {
  name: string
  label: string
  found: boolean
  version: string | null
  path: string | null
  error: string | null
}

interface ToolInfo {
  name: string
  label: string
  args: string[]
}

// Tools checked on the host system. `args` is the version flag, `stdoutOnly`
// marks tools that print the version to stdout (all others may use stderr).
const TOOLS: ToolInfo[] = [
  { name: 'node', label: 'Node.js', args: ['--version'] },
  { name: 'npm', label: 'npm', args: ['--version'] },
  { name: 'npx', label: 'npx', args: ['--version'] },
  { name: 'yarn', label: 'Yarn', args: ['--version'] },
  { name: 'pnpm', label: 'pnpm', args: ['--version'] },
  { name: 'bun', label: 'Bun', args: ['--version'] },
  { name: 'git', label: 'Git', args: ['--version'] },
  { name: 'php', label: 'PHP', args: ['--version'] },
  { name: 'composer', label: 'Composer', args: ['--version'] },
  { name: 'python', label: 'Python', args: ['--version'] },
  { name: 'pip', label: 'pip', args: ['--version'] },
  { name: 'go', label: 'Go', args: ['version'] },
  { name: 'java', label: 'Java', args: ['-version'] },
  { name: 'docker', label: 'Docker', args: ['--version'] },
  { name: 'mysql', label: 'MySQL', args: ['--version'] },
  { name: 'redis-cli', label: 'Redis CLI', args: ['--version'] },
  { name: 'omp', label: 'oh-my-pi (AI agent)', args: ['--version'] },
]

const notFound = (tool: ToolInfo, error: string | null = null): ToolResult => ({ name: tool.name, label: tool.label, found: false, version: null, path: null, error })

/** Resolve a tool to its absolute path via `where`/`which` (locale-independent). */
function resolveToolPath(toolName: string): Promise<string | null> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    execFile(cmd, [toolName], { windowsHide: true, timeout: 5000 }, (error: Error | null, stdout: string) => {
      if (error) return resolve(null)
      const candidates = (stdout || '').trim().split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean)
      if (!candidates.length) return resolve(null)
      // Prefer a real executable for display; otherwise the first shim works too
      // (the version command goes through the shell which resolves PATHEXT).
      resolve(candidates.find((line: string) => /\.exe$/i.test(line)) || candidates[0])
    })
  })
}

function runVersionCommand(tool: ToolInfo, resolvedPath: string | null): Promise<ToolResult> {
  return new Promise((resolve) => {
    const finish = (error: Error | null, stdout: string, stderr: string) => {
      const text = (stdout || stderr || '').trim()
      if (error && !text) {
        resolve(notFound(tool, (error as NodeJS.ErrnoException).code === 'ENOENT' ? null : error.message))
        return
      }
      resolve({ name: tool.name, label: tool.label, found: true, version: firstLine(text), path: resolvedPath || null, error: null })
    }
    const options = { windowsHide: true, timeout: 5000, maxBuffer: 2 * 1024 * 1024 }
    if (process.platform === 'win32') {
      // npm/pnpm/composer/... are .cmd/.bat shims that execFile cannot run
      // directly (ENOENT). Running through cmd lets PATHEXT resolve them, and
      // existence was already confirmed by `where` above.
      execFile(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `${tool.name} ${tool.args.join(' ')}`], options, finish)
    } else {
      execFile(resolvedPath || tool.name, tool.args, options, finish)
    }
  })
}

function detectTool(tool: ToolInfo): Promise<ToolResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(notFound(tool, 'timeout')), 6000)
    resolveToolPath(tool.name).then((resolvedPath) => {
      if (!resolvedPath) {
        clearTimeout(timer)
        return resolve(notFound(tool))
      }
      return runVersionCommand(tool, resolvedPath).then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
    })
  })
}

function firstLine(text: string): string {
  const line = text.split(/\r?\n/).find((item: string) => item.trim()) || ''
  // Trim trailing punctuation noise like "(coreutils) 9.0" suffixes are kept as-is.
  return line.trim().slice(0, 120)
}

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

async function readJsonIfExists(filePath: string) {
  const text = await readTextIfExists(filePath)
  if (text == null) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Collect everything needed to troubleshoot the app on a remote machine:
 * app/OS versions, config, health, redacted projects (secret env stripped),
 * and the tail of main.log. Free of Electron calls so it can be unit-tested.
 * @param {{ userDataPath: string, version: string, meta?: object }} options
 */
async function buildDiagnosticsBundle({ userDataPath, version, meta = {} }: { userDataPath: string; version: string; meta?: Record<string, unknown> }) {
  const logsDir = path.join(userDataPath, 'logs')
  const [config, health, projects, activities, presets, mainLog] = await Promise.all([
    readJsonIfExists(path.join(userDataPath, 'config.json')),
    readJsonIfExists(path.join(userDataPath, 'health.json')),
    readJsonIfExists(path.join(userDataPath, 'projects.json')),
    readJsonIfExists(path.join(userDataPath, 'activities.json')),
    readJsonIfExists(path.join(userDataPath, 'presets.json')),
    readTextIfExists(path.join(logsDir, 'main.log')),
  ])
  return {
    generatedAt: new Date().toISOString(),
    app: { version, ...meta },
    config,
    health,
    activities,
    presets,
    // Secret env values must never leave the machine — apply the same
    // redaction the renderer already receives (values blanked, kept as
    // `unchanged` secrets).
    projects: Array.isArray(projects) ? projects.map(toRendererProject) : projects,
    mainLog: (mainLog || '').split(/\r?\n/).filter(Boolean).slice(-500).join('\n'),
  }
}

function setupSystemHandlers() {
  const handle = (channel: string, handler: import('../utils/ipcValidation').IpcHandler) => safeHandle(ipcMain, assertTrustedIpcEvent, channel, handler)

  handle('system-env-check', async () => {
    const results = await Promise.all(TOOLS.map(detectTool))
    return { success: true, tools: results, checkedAt: new Date().toISOString() }
  })

  // Tail of main.log (JSON lines) for the Settings log viewer. The renderer
  // never gets the raw file path, only the last N lines.
  handle('get-main-log', async (event, limit = 500) => {
    const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 10), 5000) : 500
    const logPath = path.join(app.getPath('userData'), 'logs', 'main.log')
    const text = await readTextIfExists(logPath)
    const lines = (text || '').split(/\r?\n/).filter(Boolean)
    return { success: true, lines: lines.slice(-safeLimit) }
  })

  // Crash dumps: minidumps collected locally by crashReporter (never
  // uploaded). The Settings card lists them and can open/clear the folder.
  const crashDumpsDir = () => path.join(app.getPath('userData'), 'crashDumps')

  handle('get-crash-dumps', async () => {
    const dir = crashDumpsDir()
    let dumps = []
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      dumps = entries
        .filter((entry: { isFile(): boolean; name: string }) => entry.isFile() && /\.dmp$/i.test(entry.name))
        .map((entry: { name: string }) => ({ name: entry.name, path: path.join(dir, entry.name) }))
        .sort((a: { name: string }, b: { name: string }) => b.name.localeCompare(a.name))
    } catch { /* no dumps yet */ }
    return { success: true, dir, dumps }
  })

  handle('clear-crash-dumps', async () => {
    const dir = crashDumpsDir()
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && /\.dmp$/i.test(entry.name)) {
          await fs.unlink(path.join(dir, entry.name)).catch(() => {})
        }
      }
    } catch { /* nothing to clear */ }
    return { success: true }
  })

  handle('open-crash-dumps-folder', async () => {
    const dir = crashDumpsDir()
    await fs.mkdir(dir, { recursive: true }).catch(() => {})
    const error = await shell.openPath(dir)
    if (error) return { success: false, error }
    return { success: true, dir }
  })

  // Export a support bundle: versions + config + health + redacted projects +
  // main.log tail, saved via the native save dialog.
  handle('export-diagnostics', async () => {
    const bundle = await buildDiagnosticsBundle({
      userDataPath: app.getPath('userData'),
      version: app.getVersion(),
      meta: {
        name: app.getName(),
        electron: process.versions.electron,
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        packaged: app.isPackaged,
      },
    })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const result = await dialog.showSaveDialog({
      title: 'Export diagnostics',
      defaultPath: `devlauncher-diagnostics-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    await fs.writeFile(result.filePath, JSON.stringify(bundle, null, 2), 'utf8')
    return { success: true, filePath: result.filePath }
  })
}

export { setupSystemHandlers, TOOLS, buildDiagnosticsBundle }

