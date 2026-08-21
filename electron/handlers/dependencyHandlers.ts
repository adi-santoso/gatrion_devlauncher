import type { IpcHandler } from '../utils/ipcValidation'
import { assertTrustedIpcEvent } from '../utils/ipcSecurity'
import { safeHandle } from '../utils/ipcValidation'
import { assertSafePackageName } from '../utils/npmRunner'
import { execTool } from '../utils/packageRunner'

const fs = require('fs')
const fsp = require('fs').promises
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

// `composer outdated --json` returns `{ installed: { name: {current,latest} } }`.
function parseComposerOutdated(raw: string): OutdatedEntry[] {
  let parsed: Record<string, { current?: string; wanted?: string; latest?: string }> = {}
  try {
    parsed = raw.trim() ? JSON.parse(raw).installed || {} : {}
  } catch {
    parsed = {}
  }
  return Object.entries(parsed).map(([name, info]) => ({
    name,
    current: info.current || null,
    wanted: info.wanted || null,
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
    const start = text.indexOf('{', i)
    if (start === -1) break
    let depth = 0
    let j = start
    for (; j < text.length; j++) {
      if (text[j] === '{') depth += 1
      else if (text[j] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    if (depth !== 0) break
    const chunk = text.slice(start, j + 1)
    try {
      records.push(JSON.parse(chunk) as Record<string, unknown>)
    } catch { /* skip partial/invalid blocks */ }
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
  } catch {
    parsed = []
  }
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

// `cargo outdated --format=json` returns `{ dependencies: [{ name, project: [...] }] }`.
function parseCargoOutdated(raw: string): OutdatedEntry[] {
  let parsed: Array<{ name?: string; project?: Array<{ name?: string; version?: string; latest?: string }> }> = []
  try {
    const data = raw.trim() ? JSON.parse(raw) : {}
    parsed = data.dependencies || []
  } catch {
    parsed = []
  }
  return parsed
    .map((item) => {
      const entry = (item.project || [])[0] || {}
      return {
        name: item.name || entry.name || '',
        current: entry.version || null,
        wanted: entry.latest || null,
        latest: entry.latest || null,
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
    const backupFiles = ['composer.json']
    if (fs.existsSync(path.join(projectPath, 'composer.lock'))) backupFiles.push('composer.lock')
    for (const file of backupFiles) {
      const source = path.join(projectPath, file)
      const target = path.join(projectPath, `${file}.bak-${Date.now()}`)
      await fsp.copyFile(source, target).catch(() => {})
    }
    const args = packageName ? ['update', packageName.trim()] : ['update']
    const output = await execTool('composer', projectPath, args, { timeoutMs: 300000 })
    return { success: true, output: output.trim().slice(-2000), backups: backupFiles.map((file) => `${file}.bak-*`) }
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
    const output = await execTool('go', projectPath, ['get', `${moduleName.trim()}@latest`], { timeoutMs: 300000 })
    return { success: true, output: output.trim().slice(-2000) }
  })

  // --- Python / pip -----------------------------------------------------
  // `pip list --outdated --format=json` (module name, current, latest). Exits 0
  // even when packages are outdated.
  secureHandle('pip-outdated', async (_event, projectPath) => {
    const hasRequirements = fs.existsSync(path.join(projectPath, 'requirements.txt'))
    const hasPyProject = fs.existsSync(path.join(projectPath, 'pyproject.toml'))
    if (!hasRequirements && !hasPyProject) return { success: true, hasPipManifest: false, outdated: [] }
const raw = await execTool('pip', projectPath, ['list', '--outdated', '--format=json'], { timeoutMs: 120000 })
    const outdated = parsePipOutdated(raw)
    return { success: true, hasPipManifest: true, outdated }
  })

  // Upgrade a single pip package (no safe "update all").
  secureHandle('pip-update', async (_event, projectPath, packageName) => {
    assertSafePackageName(packageName)
    const output = await execTool('pip', projectPath, ['install', '--upgrade', packageName.trim()], { timeoutMs: 300000 })
    return { success: true, output: output.trim().slice(-2000) }
  })

  // --- Rust / Cargo -----------------------------------------------------
  // Cargo has no built-in `outdated`; `cargo outdated` comes from the external
  // `cargo-outdated` plugin. We attempt it and surface a friendly notice if the
  // plugin is missing so the tab degrades gracefully.
  secureHandle('cargo-outdated', async (_event, projectPath) => {
    const cargoFile = path.join(projectPath, 'Cargo.toml')
    if (!fs.existsSync(cargoFile)) return { success: true, hasCargo: false, outdated: [] }
    try {
const raw = await execTool('cargo', projectPath, ['outdated', '--format=json'], { timeoutMs: 120000 })
      const outdated = parseCargoOutdated(raw)
      return { success: true, hasCargo: true, outdated }
    } catch (error) {
      const message = (error as Error).message
      if (/not found|could not|no such|not a (subcommand|command)/i.test(message)) {
        return { success: true, hasCargo: true, pluginMissing: true, outdated: [] }
      }
      throw error
    }
  })

  // Update a single cargo package (no safe update-all); Cargo.toml + Cargo.lock
  // are backed up first.
  secureHandle('cargo-update', async (_event, projectPath, packageName) => {
    assertSafePackageName(packageName)
    const backupFiles = ['Cargo.toml']
    if (fs.existsSync(path.join(projectPath, 'Cargo.lock'))) backupFiles.push('Cargo.lock')
    for (const file of backupFiles) {
      const source = path.join(projectPath, file)
      const target = path.join(projectPath, `${file}.bak-${Date.now()}`)
      await fsp.copyFile(source, target).catch(() => {})
    }
    const output = await execTool('cargo', projectPath, ['update', '-p', packageName.trim()], { timeoutMs: 300000 })
    return { success: true, output: output.trim().slice(-2000), backups: backupFiles.map((file) => `${file}.bak-*`) }
  })
}

export { setupDependencyHandlers, parseComposerOutdated, parseGoOutdated, parsePipOutdated, parseCargoOutdated }
export type { OutdatedEntry }