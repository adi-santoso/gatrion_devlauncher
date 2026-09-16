import type { IpcHandler } from '../utils/ipcValidation'
import { assertTrustedIpcEvent } from '../utils/ipcSecurity'
import { safeHandle } from '../utils/ipcValidation'
import { assertSafePackageName } from '../utils/npmRunner'
import { execTool } from '../utils/packageRunner'
import { backupFiles, pythonTool } from '../utils/projectTooling'

const fs = require('fs')
const path = require('path')
const { ipcMain } = require('electron') as typeof import('electron')

/**
 * Dependency managers beyond npm (Composer, Go, pip, Cargo). Each follows the
 * npm pattern: an `outdated` inspection call plus an `update` call. Written as
 * a separate handler module so repoHandlers.ts stays under the lint line cap.
 */

interface OutdatedEntry {
  name: string
  current: string | null
  wanted: string | null
  latest: string | null
  type: string
}

// --- Pure parsers (unit-testable) --------------------------------------------

// Composer 2: `installed` is an array, with the installed version in `version`.
function parseComposerOutdated(raw: string): OutdatedEntry[] {
  const parsed = JSON.parse(raw).installed
  if (!Array.isArray(parsed)) throw new Error('Invalid Composer outdated response')
  if (parsed.some(info => !info || !['name', 'version', 'latest'].every(key => typeof info[key] === 'string'))) throw new Error('Invalid Composer package entry')
  return parsed.map((info: { name: string; version: string; latest: string }) => ({
    name: info.name,
    current: info.version || null,
    wanted: null,
    latest: info.latest || null,
    type: 'dependency',
  })).filter((item) => item.latest && item.current && item.latest !== item.current)
}

// `go list -m -u -json all` emits one JSON object per module, whitespace-separated
// and optionally multi-line. Objects can contain nested braces (e.g. `Update`),
// so we scan by matching top-level braces instead of a naive split.
function parseGoObjects(raw: string): Array<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = []
  const text = raw.trim()
  let i = 0
  while (i < text.length) {
    while (/\s/.test(text[i] || '') && i < text.length) i++
    if (i === text.length) break
    const start = i
    if (text[start] !== '{') throw new Error('Invalid Go module response')
    let depth = 0
    let quoted = false
    let escaped = false
    let j = start
    for (; j < text.length; j++) {
      if (quoted) {
        if (escaped) escaped = false
        else if (text[j] === '\\') escaped = true
        else if (text[j] === '"') quoted = false
        continue
      }
      if (text[j] === '"') quoted = true
      else if (text[j] === '{') depth += 1
      else if (text[j] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    if (depth !== 0) throw new Error('Incomplete Go module response')
    const chunk = text.slice(start, j + 1)
    const record = JSON.parse(chunk)
    if (typeof record.Path !== 'string' || record.Error) throw new Error('Invalid or failed Go module response')
    records.push(record)
    i = j + 1
  }
  return records
}

function parseGoOutdated(raw: string): OutdatedEntry[] {
  const records = parseGoObjects(raw) as Array<{ Path?: string; Version?: string; Update?: { Version?: string } }>
  return records
    .filter((r) => r.Path && r.Update?.Version && r.Version && r.Update.Version !== r.Version)
    .map((r) => ({
      name: r.Path as string,
      current: r.Version || null,
      wanted: r.Update?.Version || null,
      latest: r.Update?.Version || null,
      type: 'dependency',
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// `pip list --outdated --format=json` returns `[{ name, version, latest_version }]`.
function parsePipOutdated(raw: string): OutdatedEntry[] {
  let parsed: Array<{ name?: string; version?: string; latest_version?: string }> = []
  try {
    parsed = raw.trim() ? JSON.parse(raw) : []
  } catch { throw new Error('Invalid pip outdated response') }
  if (!Array.isArray(parsed)) throw new Error('Invalid pip outdated response')
  if (parsed.some(item => !item || typeof item.name !== 'string' || typeof item.version !== 'string' || typeof item.latest_version !== 'string')) throw new Error('Invalid pip package entry')
  return parsed
    .filter((item) => item.name && item.version && item.latest_version && item.latest_version !== item.version)
    .map((item) => ({
      name: item.name as string,
      current: item.version || null,
      wanted: item.latest_version || null,
      latest: item.latest_version || null,
      type: 'dependency',
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// cargo-outdated: project/compat/latest are version strings, not nested objects.
function parseCargoOutdated(raw: string): OutdatedEntry[] {
  const parsed: Array<{ name: string; project: string; compat: string; latest: string }> = JSON.parse(raw).dependencies
  if (!Array.isArray(parsed)) throw new Error('Invalid Cargo outdated response')
  if (parsed.some(item => !item || typeof item.name !== 'string' || typeof item.project !== 'string' || typeof item.compat !== 'string' || typeof item.latest !== 'string')) throw new Error('Invalid Cargo package entry')
  return parsed
    .map((item) => {
      return {
        name: item.name,
        current: item.project || null,
        wanted: item.compat || null,
        latest: item.latest || null,
        type: 'dependency',
      }
    })
    .filter((item) => item.name && item.latest && item.current && item.latest !== item.current)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function setupDependencyHandlers(): void {
  const secureHandle = (channel: string, handler: IpcHandler): void => safeHandle(ipcMain, assertTrustedIpcEvent, channel, handler)

  // --- Composer (PHP) ---------------------------------------------------
  // `composer outdated --direct --format=json` lists only direct (not
  // transitive) dependencies so the table stays focused on what the developer
  // owns, matching the npm tab.
  secureHandle('composer-outdated', async (_event, projectPath) => {
    const composerFile = path.join(projectPath, 'composer.json')
    if (!fs.existsSync(composerFile)) return { success: true, hasComposerJson: false, outdated: [] }
    const raw = await execTool('composer', projectPath, ['outdated', '--direct', '--format=json'], { timeoutMs: 120000 })
    const outdated = parseComposerOutdated(raw)
    return { success: true, hasComposerJson: true, outdated }
  })

  // Update a single composer package (or all direct deps). composer.json and
  // composer.lock are backed up first.
  secureHandle('composer-update', async (_event, projectPath, packageName = null) => {
    assertSafePackageName(packageName)
    const backups = await backupFiles(projectPath, ['composer.json', 'composer.lock'])
    const args = packageName ? ['update', packageName.trim()] : ['update']
    const output = await execTool('composer', projectPath, args, { timeoutMs: 300000 })
    return { success: true, output: output.trim().slice(-2000), backups }
  })

  // --- Go modules -------------------------------------------------------
  // `go list -m -u -json all` reports every module with its latest available
  // version under `Update.Version`. There is no safe "update all" — each module
  // is upgraded individually with `go get <module>@latest`.
  secureHandle('go-outdated', async (_event, projectPath) => {
    const goFile = path.join(projectPath, 'go.mod')
    if (!fs.existsSync(goFile)) return { success: true, hasGoMod: false, outdated: [] }
    const raw = await execTool('go', projectPath, ['list', '-m', '-u', '-json', 'all'], { timeoutMs: 120000 })
    const outdated = parseGoOutdated(raw)
    return { success: true, hasGoMod: true, outdated }
  })

  // Upgrade a single Go module to its latest release.
  secureHandle('go-update', async (_event, projectPath, moduleName) => {
    assertSafePackageName(moduleName)
    const backups = await backupFiles(projectPath, ['go.mod', 'go.sum'])
    const output = await execTool('go', projectPath, ['get', `${moduleName.trim()}@latest`], { timeoutMs: 300000 })
    return { success: true, output: output.trim().slice(-2000), backups }
  })

  // --- Python / pip -----------------------------------------------------
  // `pip list --outdated --format=json` (module name, current, latest). Exits 0
  // even when packages are outdated.
  secureHandle('pip-outdated', async (_event, projectPath) => {
    const hasRequirements = fs.existsSync(path.join(projectPath, 'requirements.txt'))
    const hasPyProject = fs.existsSync(path.join(projectPath, 'pyproject.toml'))
    if (!hasRequirements && !hasPyProject) return { success: true, hasPipManifest: false, outdated: [] }
    const raw = await execTool(pythonTool(projectPath), projectPath, ['-m', 'pip', 'list', '--outdated', '--format=json'], { timeoutMs: 120000 })
    const outdated = parsePipOutdated(raw)
    return { success: true, hasPipManifest: true, outdated }
  })

  // Upgrade a single pip package (no safe "update all").
  secureHandle('pip-update', async (_event, projectPath, packageName) => {
    assertSafePackageName(packageName)
    const python = pythonTool(projectPath)
    const backups = await backupFiles(projectPath, ['requirements.txt', 'pyproject.toml'])
    const output = await execTool(python, projectPath, ['-m', 'pip', 'install', '--upgrade', packageName.trim()], { timeoutMs: 300000 })
    return { success: true, output: output.trim().slice(-2000), backups }
  })

  // --- Rust / Cargo -----------------------------------------------------
  // Cargo has no built-in `outdated`; `cargo outdated` comes from the external
  // `cargo-outdated` plugin. We attempt it and surface a friendly notice if the
  // plugin is missing so the tab degrades gracefully.
  secureHandle('cargo-outdated', async (_event, projectPath) => {
    const cargoFile = path.join(projectPath, 'Cargo.toml')
    if (!fs.existsSync(cargoFile)) return { success: true, hasCargo: false, outdated: [] }
    try {
      const raw = await execTool('cargo', projectPath, ['outdated', '--root-deps-only', '--format=json'], { timeoutMs: 120000 })
      const outdated = parseCargoOutdated(raw)
      return { success: true, hasCargo: true, outdated }
    } catch (error) {
      const message = (error as Error).message
      if (/no such (command|subcommand).*outdated|not a (subcommand|command).*outdated/i.test(message)) {
        return { success: true, hasCargo: true, pluginMissing: true, outdated: [] }
      }
      throw error
    }
  })

  // Update a single cargo package (no safe update-all); Cargo.toml + Cargo.lock
  // are backed up first.
  secureHandle('cargo-update', async (_event, projectPath, packageName) => {
    assertSafePackageName(packageName)
    const backups = await backupFiles(projectPath, ['Cargo.toml', 'Cargo.lock'])
    const output = await execTool('cargo', projectPath, ['update', '-p', packageName.trim()], { timeoutMs: 300000 })
    return { success: true, output: output.trim().slice(-2000), backups }
  })
}

export { setupDependencyHandlers, parseComposerOutdated, parseGoOutdated, parsePipOutdated, parseCargoOutdated }
export type { OutdatedEntry }
