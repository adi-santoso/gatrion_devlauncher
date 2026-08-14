// @ts-check
const fs = require('fs').promises
const path = require('path')

// Directories that are never worth searching (dependencies, build output,
// VCS metadata). Anything matching is skipped entirely, including children.
const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'coverage',
  '.next', '.nuxt', '.cache', 'target', 'out', 'bin', 'obj',
  '.idea', '.vscode', '.gitignore', '.turbo', '.vercel',
  'vendor', '__pycache__', '.venv', 'venv', '.tox', '.pytest_cache',
])

// Large or volatile files that would only add noise.
const IGNORED_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb',
  'npm-shrinkwrap.json', '.DS_Store', 'Thumbs.db',
])

const MAX_DEPTH = 6
const DEFAULT_LIMIT = 25
const MIN_QUERY_LENGTH = 2
const MAX_QUERY_LENGTH = 100

function isIgnored(name, isDir) {
  if (isDir) return IGNORED_DIRS.has(name)
  return IGNORED_FILES.has(name)
}

/**
 * Search one or more project roots for files whose name contains `query`
 * (case-insensitive substring). Depth and result count are bounded so the
 * palette stays snappy even on large workspaces.
 * @param {string[]} roots - absolute project directory paths
 * @param {string} query
 * @param {{ limit?: number, depth?: number }} [options]
 * @returns {Promise<Array<{ path: string, name: string, project: string, dir: string }>>}
 */
async function searchWorkspaceFiles(roots, query, { limit = DEFAULT_LIMIT, depth = MAX_DEPTH } = {}) {
  const cleanQuery = String(query || '').trim()
  if (cleanQuery.length < MIN_QUERY_LENGTH || cleanQuery.length > MAX_QUERY_LENGTH) return []
  const lower = cleanQuery.toLowerCase()
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : DEFAULT_LIMIT
  const safeDepth = Number.isInteger(depth) && depth > 0 ? Math.min(depth, 12) : MAX_DEPTH

  const results = []
  const visited = new Set()

  const walk = async (dir, currentDepth, projectName) => {
    if (results.length >= safeLimit || currentDepth > safeDepth) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return // unreadable / missing dir — skip quietly
    }
    for (const entry of entries) {
      if (results.length >= safeLimit) return
      const name = entry.name
      if (isIgnored(name, entry.isDirectory())) continue
      const full = path.join(dir, name)
      if (entry.isDirectory()) {
        await walk(full, currentDepth + 1, projectName)
      } else if (name.toLowerCase().includes(lower)) {
        results.push({ path: full, name, project: projectName, dir })
      }
    }
  }

  for (const root of roots) {
    if (typeof root !== 'string' || !root.trim()) continue
    let resolved
    try {
      resolved = path.resolve(root)
    } catch {
      continue
    }
    if (visited.has(resolved)) continue
    visited.add(resolved)
    await walk(resolved, 0, path.basename(resolved) || resolved)
    if (results.length >= safeLimit) break
  }
  return results
}

module.exports = { searchWorkspaceFiles, IGNORED_DIRS, IGNORED_FILES, MAX_DEPTH, DEFAULT_LIMIT }
