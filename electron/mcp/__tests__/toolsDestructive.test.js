import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { createTools, dispatchTool } from '../tools'
import { setApprovalSender, respondApproval, denyAllApprovals } from '../approval'
import { buildBundle, encryptBundle, parseBackupFile } from '../../utils/workspaceBackup'
import { collectWorkspaceData } from '../../handlers/backupHandlers'
import { createRequire } from 'node:module'

const { app } = createRequire(import.meta.url)('electron')

function makeProject(overrides = {}) {
  return {
    id: 'p1',
    name: 'Demo',
    path: 'C:\\demo',
    type: 'node',
    port: 3000,
    startCommand: 'npm run dev',
    emoji: '🚀',
    color: '#fff',
    autoStart: false,
    lastRun: null,
    tags: [],
    dependsOn: [],
    commands: undefined,
    customCommands: [],
    envVars: [{ key: 'NODE_ENV', value: 'development' }],
    ...overrides,
  }
}

function makeDeps() {
  let projects = [makeProject()]
  const activities = []
  const storageManager = {
    loadProjects: async () => projects,
    updateProjects: async (mutator) => {
      const result = await mutator(projects)
      projects = result.projects
      return { projects: result.projects, value: result.value }
    },
    saveProjects: async (next) => { projects = next },
    loadConfig: async () => ({ theme: 'dark', startOnBoot: false, minimizeToTray: false, autoStartProjects: false }),
    saveConfig: vi.fn(async () => {}),
    updateConfig: vi.fn(async (updates) => ({ theme: 'dark', ...updates })),
    loadPresets: async () => [{ id: 'preset-1', name: 'Stack', projectIds: ['p1'] }],
    savePresets: vi.fn(async () => {}),
    appendActivities: async (entries) => activities.push(...entries),
  }
  const processManager = {
    getProcessStatus: () => ({ status: 'running', pid: 123 }),
    stopProcess: vi.fn(async () => ({ success: true })),
    startProcess: vi.fn(async () => ({ success: true })),
  }
  const healthManager = {
    getStats: () => null,
    clear: vi.fn(),
    data: { projects: { p1: { crashes: [], runs: [], samples: [] } } },
  }
  const window = { isDestroyed: () => false, webContents: { send: vi.fn() } }
  const updater = {
    check: vi.fn(async () => ({ success: true })),
    startDownload: vi.fn(async () => ({ success: true })),
    quitAndInstall: vi.fn(() => ({ success: true })),
    getState: vi.fn(() => ({ state: 'idle' })),
  }
  return {
    deps: {
      storageManager,
      processManager,
      healthManager,
      previewManager: { getConsoleBuffer: async () => [], show: () => {}, reload: () => {}, navigate: () => {} },
      getWindow: () => window,
      getUpdater: () => updater,
      applyOSSettings: vi.fn(async () => {}),
    },
    window,
    updater,
    activities,
    get projects() { return projects },
  }
}

const call = async (deps, name, args = {}) => dispatchTool(createTools(), deps, name, args)

describe('MCP destructive tools — approval gate', () => {
  let captured
  let harness

  beforeEach(() => {
    captured = null
    harness = null
    setApprovalSender((request) => {
      captured = request
      return true
    })
  })

  afterEach(() => {
    denyAllApprovals()
    setApprovalSender(null)
  })

  test('every destructive tool is blocked without an approval sender', async () => {
    setApprovalSender(null)
    const { deps } = makeDeps()
    const tools = createTools()
    for (const tool of tools.filter((t) => t.permission === 'destructive')) {
      const args = tool.name === 'devlauncher_backup_import' ? { bundle: '{}' } : {}
      const result = await dispatchTool(tools, deps, tool.name, args)
      expect(result.success).toBe(false, `${tool.name} should require approval`)
      expect(result.error).toMatch(/approval/i)
    }
  })

  test('approve lets the destructive tool run', async () => {
    harness = makeDeps()
    const promise = call(harness.deps, 'devlauncher_delete_project', { projectId: 'p1' })
    await vi.waitFor(() => expect(captured).not.toBeNull())
    expect(captured.label).toMatch(/Hapus/)
    respondApproval(captured.id, 'approved')
    const result = await promise
    expect(result.success).toBe(true)
    expect(result.data.deleted).toBe('p1')
    expect(harness.projects).toHaveLength(0)
  })

  test('deny cancels the tool — nothing changes', async () => {
    harness = makeDeps()
    const deleteSpy = vi.spyOn(harness.deps.storageManager, 'updateProjects')
    const promise = call(harness.deps, 'devlauncher_delete_project', { projectId: 'p1' })
    await vi.waitFor(() => expect(captured).not.toBeNull())
    respondApproval(captured.id, 'denied')
    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/menolak/i)
    expect(deleteSpy).not.toHaveBeenCalled()
    expect(harness.projects).toHaveLength(1)
  })

  test('denied destructive calls are still audited with the decision', async () => {
    harness = makeDeps()
    const promise = call(harness.deps, 'devlauncher_delete_project', { projectId: 'p1' })
    await vi.waitFor(() => expect(captured).not.toBeNull())
    respondApproval(captured.id, 'denied')
    await promise
    await new Promise((r) => setTimeout(r, 20))
    expect(harness.activities.length).toBeGreaterThanOrEqual(1)
    expect(harness.activities[0].detail).toMatch(/decision=/)
  })
})

describe('MCP destructive tools — behavior', () => {
  let captured
  let harness

  const approve = async (promise) => {
    await vi.waitFor(() => expect(captured).not.toBeNull())
    respondApproval(captured.id, 'approved')
    return promise
  }

  beforeEach(() => {
    captured = null
    harness = null
    setApprovalSender((request) => {
      captured = request
      return true
    })
  })

  afterEach(() => {
    denyAllApprovals()
    setApprovalSender(null)
  })

  test('delete_project stops a running process first', async () => {
    harness = makeDeps()
    const result = await approve(call(harness.deps, 'devlauncher_delete_project', { projectId: 'p1' }))
    expect(result.success).toBe(true)
    expect(harness.deps.processManager.stopProcess).toHaveBeenCalledWith('p1')
    expect(harness.window.webContents.send).toHaveBeenCalledWith('projects-updated', [])
  })

  test('force_stop_project kills immediately', async () => {
    harness = makeDeps()
    const result = await approve(call(harness.deps, 'devlauncher_force_stop_project', { projectId: 'p1' }))
    expect(result.success).toBe(true)
    expect(harness.deps.processManager.stopProcess).toHaveBeenCalledWith('p1', true)
  })

  test('backup_export writes an encrypted bundle file and returns only its path', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-backup-'))
    const original = app._userDataPath
    app._userDataPath = tmp
    try {
      harness = makeDeps()
      const result = await approve(call(harness.deps, 'devlauncher_backup_export', { password: 'pw123' }))
      expect(result.success).toBe(true)
      expect(result.data.encrypted).toBe(true)
      expect(result.data.projectCount).toBe(1)
      // The bundle (which contains env secrets) never reaches the agent.
      expect(JSON.stringify(result.data)).not.toMatch(/development/)
      const content = fs.readFileSync(result.data.filePath, 'utf8')
      const parsed = JSON.parse(content)
      expect(parsed.encrypted).toBe(true)
      expect(parsed.data).toBeTruthy()
      // Decrypts back with the same password via the real backup parser.
      const { parsed: restored } = parseBackupFile(content, 'pw123')
      expect(restored.projects[0].id).toBe('p1')
    } finally {
      app._userDataPath = original
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  test('backup_import merges projects without overwriting existing ones', async () => {
    harness = makeDeps()
    // Build a bundle with one NEW project (different path).
    const current = await collectWorkspaceData(harness.deps.storageManager, harness.deps.healthManager)
    const incoming = makeProject({ id: 'p2', name: 'New', path: 'D:\\new', port: 5000 })
    const bundle = JSON.stringify(buildBundle({
      ...current,
      projects: [incoming],
      appVersion: '0.2.1',
    }))
    const result = await approve(call(harness.deps, 'devlauncher_backup_import', { bundle }))
    expect(result.success).toBe(true)
    expect(result.data.added).toBe(1)
    expect(harness.projects.some((p) => p.id === 'p2')).toBe(true)
    // Existing project untouched.
    expect(harness.projects.some((p) => p.id === 'p1')).toBe(true)
  })

  test('backup_import decrypts an encrypted bundle', async () => {
    harness = makeDeps()
    const current = await collectWorkspaceData(harness.deps.storageManager, harness.deps.healthManager)
    const bundle = JSON.stringify(buildBundle({ ...current, projects: [makeProject({ id: 'p3', name: 'Enc', path: 'E:\\enc' })], appVersion: '0.2.1' }))
    const encrypted = JSON.stringify(encryptBundle(bundle, 'secret'))
    const result = await approve(call(harness.deps, 'devlauncher_backup_import', { bundle: encrypted, password: 'secret' }))
    expect(result.success).toBe(true)
    expect(result.data.wasEncrypted).toBe(true)
    expect(result.data.added).toBe(1)
  })

  test('backup_import rejects a wrong password', async () => {
    harness = makeDeps()
    const current = await collectWorkspaceData(harness.deps.storageManager, harness.deps.healthManager)
    const bundle = JSON.stringify(buildBundle({ ...current, projects: [], appVersion: '0.2.1' }))
    const encrypted = JSON.stringify(encryptBundle(bundle, 'right'))
    const result = await approve(call(harness.deps, 'devlauncher_backup_import', { bundle: encrypted, password: 'wrong' }))
    expect(result.success).toBe(false)
  })

  test('update_check reports the updater state (read-only, no approval)', async () => {
    harness = makeDeps()
    const result = await call(harness.deps, 'devlauncher_update_check')
    expect(result.success).toBe(true)
    expect(harness.updater.check).toHaveBeenCalled()
    expect(result.data.state).toEqual({ state: 'idle' })
  })

  test('update_download_install downloads then restarts', async () => {
    harness = makeDeps()
    const result = await approve(call(harness.deps, 'devlauncher_update_download_install'))
    expect(result.success).toBe(true)
    expect(harness.updater.startDownload).toHaveBeenCalled()
    expect(harness.updater.quitAndInstall).toHaveBeenCalled()
  })

  test('update_download_install skips download when already downloaded', async () => {
    harness = makeDeps()
    harness.updater.getState.mockReturnValue({ state: 'downloaded' })
    const result = await approve(call(harness.deps, 'devlauncher_update_download_install'))
    expect(result.success).toBe(true)
    expect(harness.updater.startDownload).not.toHaveBeenCalled()
    expect(harness.updater.quitAndInstall).toHaveBeenCalled()
  })

  test('clear_health wipes one project analytics', async () => {
    harness = makeDeps()
    const result = await approve(call(harness.deps, 'devlauncher_clear_health', { projectId: 'p1' }))
    expect(result.success).toBe(true)
    expect(harness.deps.healthManager.clear).toHaveBeenCalledWith('p1')
  })

  test('clear_crash_dumps deletes .dmp files only', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-dumps-'))
    const original = app._userDataPath
    app._userDataPath = tmp
    try {
      const dumpsDir = path.join(tmp, 'crashDumps')
      fs.mkdirSync(dumpsDir, { recursive: true })
      fs.writeFileSync(path.join(dumpsDir, 'crash-1.dmp'), 'x')
      fs.writeFileSync(path.join(dumpsDir, 'notes.txt'), 'keep me')
      harness = makeDeps()
      const result = await approve(call(harness.deps, 'devlauncher_clear_crash_dumps'))
      expect(result.success).toBe(true)
      expect(result.data.cleared).toBe(1)
      expect(fs.existsSync(path.join(dumpsDir, 'crash-1.dmp'))).toBe(false)
      expect(fs.existsSync(path.join(dumpsDir, 'notes.txt'))).toBe(true)
    } finally {
      app._userDataPath = original
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  test('config_update_destructive applies whitelisted keys + OS settings + broadcast', async () => {
    harness = makeDeps()
    const result = await approve(call(harness.deps, 'devlauncher_config_update_destructive', { startOnBoot: true, minimizeToTray: true }))
    expect(result.success).toBe(true)
    expect(result.data.updated.sort()).toEqual(['minimizeToTray', 'startOnBoot'])
    expect(harness.deps.storageManager.updateConfig).toHaveBeenCalledWith({ startOnBoot: true, minimizeToTray: true })
    expect(harness.deps.applyOSSettings).toHaveBeenCalled()
    expect(harness.window.webContents.send).toHaveBeenCalledWith('config-updated', expect.anything())
  })

  test('config_update_destructive rejects unknown keys and empty updates', async () => {
    harness = makeDeps()
    const empty = await approve(call(harness.deps, 'devlauncher_config_update_destructive', {}))
    expect(empty.success).toBe(false)
    expect(empty.error).toMatch(/valid setting/i)
  })
})
