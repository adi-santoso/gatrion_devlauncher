const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { ipcMain } = require('electron')
const { envVarsToObject } = require('../projectSchema')
const { assertTrustedIpcEvent } = require('../utils/ipcSecurity')

// Run git with no shell, GIT_TERMINAL_PROMPT disabled so a missing credential
// helper fails fast instead of hanging the app waiting for input.
function runGit(cwd, args, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      reject(new Error(`git ${args[0] || ''} timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)
    execFile(
      'git',
      args,
      {
        cwd,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) {
          const message = (stderr || error.message || '').trim()
          reject(new Error(message || `git ${args[0] || ''} failed`))
          return
        }
        resolve(stdout)
      }
    )
  })
}

// Parse `git status --porcelain=v1 -b` output into structured file lists.
const STATUS_LABELS = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'copied', U: 'unmerged', T: 'type change', '?': 'untracked' }
const cleanPath = (raw) => {
  let value = (raw || '').trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      value = JSON.parse(value)
    } catch { /* keep raw */ }
  }
  // Porcelain renames are reported as "old -> new"
  const arrow = value.indexOf(' -> ')
  return arrow !== -1 ? value.slice(arrow + 4) : value
}

function parseStatus(output) {
  const result = { branch: null, upstream: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] }
  for (const line of output.split('\n')) {
    if (!line) continue
    if (line.startsWith('## ')) {
      const head = line.slice(3).trim()
      const bracket = head.indexOf(' [')
      const branchPart = bracket === -1 ? head : head.slice(0, bracket)
      const [branch, upstream] = branchPart.split('...')
      result.branch = branch || null
      result.upstream = upstream || null
      if (bracket !== -1) {
        const aheadMatch = head.slice(bracket).match(/ahead (\d+)/)
        const behindMatch = head.slice(bracket).match(/behind (\d+)/)
        result.ahead = aheadMatch ? Number(aheadMatch[1]) : 0
        result.behind = behindMatch ? Number(behindMatch[1]) : 0
      }
      continue
    }
    const xy = line.slice(0, 2)
    const filePath = cleanPath(line.slice(3))
    if (xy[0] === '?' && xy[1] === '?') {
      result.untracked.push(filePath)
    } else {
      const entry = { path: filePath, staged: STATUS_LABELS[xy[0]] || xy[0], unstaged: STATUS_LABELS[xy[1]] || xy[1] }
      if (xy[0] !== ' ') result.staged.push(entry)
      if (xy[1] !== ' ') result.unstaged.push(entry)
    }
  }
  return result
}

function parseLog(output) {
  const commits = []
  for (const record of output.split('\x1e')) {
    if (!record.trim()) continue
    const [shortHash, author, date, subject] = record.split('\x1f')
    if (!shortHash) continue
    commits.push({ hash: shortHash, author: author || '', date: date || '', subject: subject || '' })
  }
  return commits
}

const BRANCH_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

function assertBranchName(branch) {
  if (typeof branch !== 'string' || !BRANCH_NAME.test(branch)) {
    throw new Error('Invalid branch name (letters, digits, dots, dashes, slashes and underscores only)')
  }
  return branch
}

function assertPathArray(files) {
  if (!Array.isArray(files) || files.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error('A file list is required')
  }
  return files
}

// ===========================================================================
// Package tooling (scripts + dependency health)
// ===========================================================================

const LOCKFILES = [
  { file: 'package-lock.json', pm: 'npm' },
  { file: 'pnpm-lock.yaml', pm: 'pnpm' },
  { file: 'yarn.lock', pm: 'yarn' },
  { file: 'bun.lockb', pm: 'bun' },
  { file: 'bun.lock', pm: 'bun' },
]

function readPackageJson(projectPath) {
  const file = path.join(projectPath, 'package.json')
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Setup repository & tooling handlers (git + package scripts + dependencies).
 * @param {StorageManager} storageManager
 * @param {ProcessManager} processManager
 * @param {BrowserWindow} mainWindow
 */
function setupRepoHandlers(storageManager, processManager, mainWindow) {
  const safeSend = (channel, ...args) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(channel, ...args)
      }
    } catch { /* window gone during quit */ }
  }

  const loadProject = async (projectId) => {
    if (typeof projectId !== 'string' || !projectId.trim()) throw new Error('Project ID is required')
    const projects = await storageManager.loadProjects()
    const project = projects.find((item) => item.id === projectId)
    if (!project) throw new Error(`Project ${projectId} not found`)
    return project
  }

  const secureHandle = (channel, handler) => ipcMain.handle(channel, async (event, ...args) => {
    try {
      assertTrustedIpcEvent(event)
      return await handler(event, ...args)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // --- Git: read ---------------------------------------------------------

  secureHandle('git-status', async (event, projectPath) => {
    try {
      await runGit(projectPath, ['rev-parse', '--is-inside-work-tree'])
      const output = await runGit(projectPath, ['status', '--porcelain=v1', '-b', '--untracked-files=all'])
      return { success: true, ...parseStatus(output) }
    } catch (error) {
      if (error && /not a git repository/i.test(error.message)) {
        return { success: true, isRepo: false, branch: null, upstream: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] }
      }
      return { success: false, error: error.message }
    }
  })

  secureHandle('git-log', async (event, projectPath, limit = 15) => {
    const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 15
    const output = await runGit(projectPath, ['log', `-${safeLimit}`, '--format=%h%x1f%an%x1f%ad%x1f%s%x1e', '--date=short'])
    return { success: true, commits: parseLog(output) }
  })

  secureHandle('git-diff', async (event, projectPath, filePath, staged = false) => {
    if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('A file path is required')
    const args = ['diff', '--color=never']
    if (staged) args.push('--cached')
    args.push('--', filePath)
    const output = await runGit(projectPath, args)
    return { success: true, diff: output }
  })

  // --- Git: write ----------------------------------------------------------

  secureHandle('git-stage', async (event, projectPath, files) => {
    const list = assertPathArray(files)
    const args = list.length === 0 ? ['add', '-A'] : ['add', '--', ...list]
    await runGit(projectPath, args)
    return { success: true }
  })

  secureHandle('git-unstage', async (event, projectPath, files) => {
    const list = assertPathArray(files)
    const args = list.length === 0 ? ['reset'] : ['reset', '--', ...list]
    await runGit(projectPath, args)
    return { success: true }
  })

  secureHandle('git-commit', async (event, projectPath, message) => {
    if (typeof message !== 'string' || !message.trim()) throw new Error('Commit message is required')
    if (message.length > 2000) throw new Error('Commit message is too long')
    const output = await runGit(projectPath, ['commit', '-m', message])
    return { success: true, output: output.trim() }
  })

  secureHandle('git-pull', async (event, projectPath) => {
    const output = await runGit(projectPath, ['pull'], { timeoutMs: 90000 })
    return { success: true, output: output.trim() }
  })

  secureHandle('git-push', async (event, projectPath) => {
    const output = await runGit(projectPath, ['push'], { timeoutMs: 90000 })
    return { success: true, output: output.trim() }
  })

  secureHandle('git-checkout', async (event, projectPath, branch, createNew = false) => {
    const name = assertBranchName(branch)
    await runGit(projectPath, createNew ? ['checkout', '-b', name] : ['checkout', name])
    return { success: true }
  })

  secureHandle('git-init', async (event, projectPath) => {
    await runGit(projectPath, ['init'])
    return { success: true }
  })

  // --- Package scripts + dependency health ---------------------------------

  secureHandle('read-package-scripts', async (event, projectPath) => {
    const pkg = readPackageJson(projectPath)
    if (!pkg) return { success: true, hasPackageJson: false, scripts: [], packageManager: null }
    const scripts = Object.entries(pkg.scripts || {})
      .map(([name, command]) => ({ name, command: String(command) }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return { success: true, hasPackageJson: true, scripts, packageManager: null }
  })

  secureHandle('check-dependencies', async (event, projectPath) => {
    const pkg = readPackageJson(projectPath)
    if (!pkg) {
      return { success: true, hasPackageJson: false, hasNodeModules: false, lockfile: null, packageManager: null, scriptCount: 0, depCount: 0 }
    }
    const lockfile = LOCKFILES.find((entry) => fs.existsSync(path.join(projectPath, entry.file)))
    const depCount = Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length
    return {
      success: true,
      hasPackageJson: true,
      hasNodeModules: fs.existsSync(path.join(projectPath, 'node_modules')),
      lockfile: lockfile ? lockfile.file : null,
      packageManager: lockfile ? lockfile.pm : 'npm',
      scriptCount: Object.keys(pkg.scripts || {}).length,
      depCount,
    }
  })

  // Run a package.json script as a managed custom command so its output lands
  // in the project's Terminal tab.
  secureHandle('run-project-script', async (event, projectId, scriptName) => {
    try {
      const project = await loadProject(projectId)
      if (typeof scriptName !== 'string' || !scriptName.trim()) throw new Error('Script name is required')
      const pkg = readPackageJson(project.path)
      const script = pkg && pkg.scripts && Object.prototype.hasOwnProperty.call(pkg.scripts, scriptName)
        ? { command: String(pkg.scripts[scriptName]) }
        : null
      if (!script) throw new Error(`Script "${scriptName}" not found in package.json`)
      const result = await processManager.runCustomCommand(
        project.id,
        project.path,
        `script:${scriptName}`,
        scriptName,
        `npm run ${scriptName}`,
        envVarsToObject(project.envVars),
        (pid, log) => safeSend('process-log', pid, log)
      )
      safeSend('process-status', project.id, processManager.getProcessStatus(project.id))
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Install dependencies through the process manager so progress is visible in
  // the Terminal tab. The renderer must confirm this before calling.
  secureHandle('install-dependencies', async (event, projectId) => {
    try {
      const project = await loadProject(projectId)
      const pkg = readPackageJson(project.path)
      const lockfile = LOCKFILES.find((entry) => fs.existsSync(path.join(project.path, entry.file)))
      const pm = lockfile ? lockfile.pm : 'npm'
      const result = await processManager.runCustomCommand(
        project.id,
        project.path,
        `install:${pm}`,
        `${pm} install`,
        `${pm} install`,
        envVarsToObject(project.envVars),
        (pid, log) => safeSend('process-log', pid, log)
      )
      return { success: true, ...result, packageManager: pm }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

module.exports = { setupRepoHandlers, parseStatus, parseLog, readPackageJson, runGit }
