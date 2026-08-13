// @ts-check
const { ipcMain } = require('electron')
const { execFile } = require('child_process')
const { assertTrustedIpcEvent } = require('../utils/ipcSecurity')

// Tools checked on the host system. `args` is the version flag, `stdoutOnly`
// marks tools that print the version to stdout (all others may use stderr).
const TOOLS = [
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

const notFound = (tool, error = null) => ({ name: tool.name, label: tool.label, found: false, version: null, path: null, error })

/** Resolve a tool to its absolute path via `where`/`which` (locale-independent). */
function resolveToolPath(toolName) {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    execFile(cmd, [toolName], { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      if (error) return resolve(null)
      const candidates = (stdout || '').trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      if (!candidates.length) return resolve(null)
      // Prefer a real executable for display; otherwise the first shim works too
      // (the version command goes through the shell which resolves PATHEXT).
      resolve(candidates.find((line) => /\.exe$/i.test(line)) || candidates[0])
    })
  })
}

function runVersionCommand(tool, resolvedPath) {
  return new Promise((resolve) => {
    const finish = (error, stdout, stderr) => {
      const text = (stdout || stderr || '').trim()
      if (error && !text) {
        resolve(notFound(tool, error.code === 'ENOENT' ? null : error.message))
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

function detectTool(tool) {
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

function firstLine(text) {
  const line = text.split(/\r?\n/).find((item) => item.trim()) || ''
  // Trim trailing punctuation noise like "(coreutils) 9.0" suffixes are kept as-is.
  return line.trim().slice(0, 120)
}

function setupSystemHandlers() {
  ipcMain.handle('system-env-check', async (event) => {
    try {
      assertTrustedIpcEvent(event)
      const results = await Promise.all(TOOLS.map(detectTool))
      return { success: true, tools: results, checkedAt: new Date().toISOString() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

module.exports = { setupSystemHandlers, TOOLS }
