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

function detectTool(tool) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ name: tool.name, label: tool.label, found: false, version: null, path: null, error: 'timeout' }), 6000)
    execFile(
      tool.name,
      tool.args,
      { windowsHide: true, timeout: 5000, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout, stderr) => {
        clearTimeout(timer)
        if (error) {
          // ENOENT => not on PATH; other errors (e.g. non-zero exit) may still
          // have printed a version (java prints to stderr).
          const text = (stdout || stderr || '').trim()
          if (text) {
            resolve({ name: tool.name, label: tool.label, found: true, version: firstLine(text), path: null, error: null })
          } else {
            resolve({ name: tool.name, label: tool.label, found: false, version: null, path: null, error: error.code === 'ENOENT' ? null : error.message })
          }
          return
        }
        const text = (stdout || stderr || '').trim()
        resolve({ name: tool.name, label: tool.label, found: true, version: firstLine(text), path: null, error: null })
      }
    )
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
