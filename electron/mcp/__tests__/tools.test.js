import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { execFile } from 'child_process'
import { createTools, dispatchTool } from '../tools'
import { execNpm } from '../../utils/npmRunner'

vi.mock('../../utils/npmRunner', () => ({
  execNpm: vi.fn(async () => 'up to date'),
  assertSafePackageName: vi.fn(),
}))

const git = (cwd, args) => new Promise((resolve, reject) => {
  execFile('git', ['-C', cwd, ...args], (error, stdout, stderr) => {
    if (error) reject(new Error(stderr || error.message))
    else resolve(stdout)
  })
})

async function makeGitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-git-'))
  await git(dir, ['init', '-q'])
  // Keep LF on checkout regardless of the host's core.autocrlf setting.
  await git(dir, ['config', 'core.autocrlf', 'false'])
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello\n')
  await git(dir, ['add', 'a.txt'])
  await git(dir, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'initial'])
  return dir
}

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
    tags: ['web'],
    dependsOn: [],
    commands: undefined,
    customCommands: [],
    envVars: [{ key: 'NODE_ENV', value: 'development' }],
    ...overrides,
  }
}

const p1 = makeProject()
const p2 = makeProject({ id: 'p2', name: 'Api', port: 4000, dependsOn: ['p1'] })

function makeDeps(projects = [p1, p2], { envPath } = {}) {
  const activities = []
  const storageManager = {
    loadProjects: async () => projects,
    loadConfig: async () => ({ theme: 'dark', language: 'en', sidebarExpanded: true, agent: { controlEnabled: true } }),
    loadPresets: async () => [{ id: 'preset-1', name: 'Stack', projectIds: ['p1'] }],
    appendActivities: async (entries) => activities.push(...entries),
    updateConfig: vi.fn(async (updates) => ({ theme: 'dark', language: 'en', ...updates })),
  }
  const processManager = {
    getProcessStatus: (id) => (id === 'p1' ? { status: 'running', pid: 1234 } : null),
    getLogs: vi.fn(async () => ['log line']),
    startProcess: vi.fn(async () => ({ success: true })),
    stopProcess: vi.fn(async () => ({ success: true })),
    restartProcess: vi.fn(async () => ({ success: true })),
    stopAllProcesses: vi.fn(async () => []),
  }
  const previewManager = {
    getConsoleBuffer: vi.fn(async () => [{ level: 'error', message: 'boom' }]),
    show: vi.fn(),
    reload: vi.fn(),
    navigate: vi.fn(),
  }
  const window = { isDestroyed: () => false, webContents: { send: vi.fn() } }
  const deps = {
    storageManager,
    processManager,
    healthManager: {
      getStats: (id) => (id === 'p1' ? { totalRuns: 3, totalUptimeMs: 1000, crashes: [{ at: 'x' }] } : null),
    },
    previewManager,
    getWindow: () => window,
  }
  return { deps, activities, window, projectPath: envPath }
}

const call = async (deps, name, args = {}) => dispatchTool(createTools(), deps, name, args)

describe('MCP read tools', () => {
  test('list projects returns safe shapes with status', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_list_projects')
    expect(result.success).toBe(true)
    const list = result.data
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ id: 'p1', name: 'Demo', status: { status: 'running', pid: 1234 } })
    // env vars / secret material never leak
    expect(list[0].envVars).toBeUndefined()
  })

  test('get project includes health summary', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_get_project', { projectId: 'p1' })
    expect(result.data.project.name).toBe('Demo')
    expect(result.data.health).toEqual({ totalRuns: 3, totalUptimeMs: 1000, crashes: 1 })
  })

  test('get project errors on unknown id', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_get_project', { projectId: 'ghost' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/)
  })

  test('project logs tail through the manager with a bounded limit', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_get_project_logs', { projectId: 'p1', limit: 42 })
    expect(result.data).toEqual(['log line'])
    expect(deps.processManager.getLogs).toHaveBeenCalledWith('p1', 42)
    // out-of-range limit is rejected, not forwarded
    const bad = await call(deps, 'devlauncher_get_project_logs', { projectId: 'p1', limit: 99999 })
    expect(bad.success).toBe(false)
  })

  test('git status on a non-repo directory reports isRepo false', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-norepo-'))
    const { deps } = makeDeps([makeProject({ path: dir })])
    const result = await call(deps, 'devlauncher_git_status', { projectId: 'p1' })
    expect(result.data.isRepo).toBe(false)
  })

  test('app config strips window bounds and schema version', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_get_app_config')
    expect(result.data.theme).toBe('dark')
    expect(result.data.windowBounds).toBeUndefined()
    expect(result.data.schemaVersion).toBeUndefined()
  })

  test('presets list returns stored presets', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_get_presets')
    expect(result.data[0].name).toBe('Stack')
  })

  test('health analytics pass through', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_get_health', { projectId: 'p1' })
    expect(result.data.totalRuns).toBe(3)
  })

  test('preview console buffer is returned', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_preview_read_console', { projectId: 'p1', limit: 10 })
    expect(result.data[0].level).toBe('error')
    expect(deps.previewManager.getConsoleBuffer).toHaveBeenCalledWith('p1', 10)
  })

  test('read tools leave a brief audit entry (F4 full audit)', async () => {
    const { deps, activities } = makeDeps()
    await call(deps, 'devlauncher_list_projects')
    await call(deps, 'devlauncher_get_app_config')
    await new Promise((r) => setTimeout(r, 20))
    expect(activities).toHaveLength(2)
    expect(activities[0]).toMatchObject({ type: 'agent', message: 'Agent (MCP) membaca devlauncher_list_projects' })
    expect(activities[1].message).toContain('membaca devlauncher_get_app_config')
  })

  test('disabled permission category blocks tools with a clear error', async () => {
    const { deps } = makeDeps()
    deps.storageManager.loadConfig = async () => ({
      theme: 'dark',
      agent: { controlEnabled: true, permissions: { read: false, write: true, destructive: true } },
    })
    const blocked = await call(deps, 'devlauncher_list_projects')
    expect(blocked.success).toBe(false)
    expect(blocked.error).toMatch(/read tools are disabled/i)
    // Write category unaffected.
    const write = await call(deps, 'devlauncher_start_project', { projectId: 'p1' })
    expect(write.success).toBe(true)
  })
})

describe('MCP write tools — project lifecycle', () => {
  test('start project resolves the launch config and starts', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_start_project', { projectId: 'p1' })
    expect(result.success).toBe(true)
    const args = deps.processManager.startProcess.mock.calls[0]
    expect(args[0]).toBe('p1')
    expect(args[1]).toBe('C:\\demo')
    // resolveLaunchConfig appends the requested port to npm run scripts.
    expect(args[2]).toBe('npm run dev -- --port=3000')
    expect(args[3]).toEqual({ NODE_ENV: 'development' })
    expect(args[4]).toBe(3000)
  })

  test('stop project (graceful and force)', async () => {
    const { deps } = makeDeps()
    await call(deps, 'devlauncher_stop_project', { projectId: 'p1' })
    expect(deps.processManager.stopProcess).toHaveBeenCalledWith('p1', false)
    await call(deps, 'devlauncher_stop_project', { projectId: 'p1', force: true })
    expect(deps.processManager.stopProcess).toHaveBeenLastCalledWith('p1', true)
  })

  test('restart project', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_restart_project', { projectId: 'p1' })
    expect(result.success).toBe(true)
    expect(deps.processManager.restartProcess).toHaveBeenCalledTimes(1)
  })

  test('start all respects dependencies and subset', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_start_all_projects', {})
    // topological: p1 (dependency) starts before p2
    const startedIds = deps.processManager.startProcess.mock.calls.map((c) => c[0])
    expect(startedIds.indexOf('p1')).toBeLessThan(startedIds.indexOf('p2'))
    expect(result.data.started).toBe(2)

    deps.processManager.startProcess.mockClear()
    const subset = await call(deps, 'devlauncher_start_all_projects', { projectIds: ['p2'] })
    expect(subset.data.started).toBe(1)
  })

  test('stop all projects', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_stop_all_projects')
    expect(result.success).toBe(true)
    expect(deps.processManager.stopAllProcesses).toHaveBeenCalled()
  })

  test('apply preset starts its projects', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_apply_preset', { presetId: 'preset-1' })
    expect(result.data.preset).toBe('Stack')
    expect(result.data.started).toBe(1)
  })

  test('apply preset errors on unknown preset', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_apply_preset', { presetId: 'nope' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/)
  })
})

describe('MCP write tools — git (real repo)', () => {
  let repo
  let deps

  beforeEach(async () => {
    repo = await makeGitRepo()
    deps = makeDeps([makeProject({ path: repo })]).deps
  })

  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }))

  test('git status reports branch and clean state', async () => {
    const result = await call(deps, 'devlauncher_git_status', { projectId: 'p1' })
    expect(result.data.isRepo).toBe(true)
    expect(result.data.branch).toBeTruthy()
    expect(result.data.staged).toHaveLength(0)
  })

  test('stage → commit flow', async () => {
    fs.writeFileSync(path.join(repo, 'b.txt'), 'new\n')
    const staged = await call(deps, 'devlauncher_git_stage', { projectId: 'p1', files: ['b.txt'] })
    expect(staged.success).toBe(true)
    const afterStage = await call(deps, 'devlauncher_git_status', { projectId: 'p1' })
    expect(afterStage.data.staged.some((s) => s.path === 'b.txt')).toBe(true)

    const commit = await call(deps, 'devlauncher_git_commit', { projectId: 'p1', message: 'add b' })
    expect(commit.success).toBe(true)
    const afterCommit = await call(deps, 'devlauncher_git_status', { projectId: 'p1' })
    expect(afterCommit.data.staged).toHaveLength(0)
    expect(afterCommit.data.unstaged).toHaveLength(0)
  })

  test('checkout creates and switches to a new branch', async () => {
    const result = await call(deps, 'devlauncher_git_checkout', { projectId: 'p1', branch: 'feat/x', createNew: true })
    expect(result.success).toBe(true)
    const status = await call(deps, 'devlauncher_git_status', { projectId: 'p1' })
    expect(status.data.branch).toBe('feat/x')
  })

  test('stash push/pop round-trips', async () => {
    fs.writeFileSync(path.join(repo, 'a.txt'), 'dirty\n')
    const stash = await call(deps, 'devlauncher_git_stash', { projectId: 'p1', message: 'wip' })
    expect(stash.success).toBe(true)
    const clean = await call(deps, 'devlauncher_git_status', { projectId: 'p1' })
    expect(clean.data.unstaged).toHaveLength(0)

    const pop = await call(deps, 'devlauncher_git_stash_pop', { projectId: 'p1' })
    expect(pop.success).toBe(true)
    const dirtyAgain = await call(deps, 'devlauncher_git_status', { projectId: 'p1' })
    expect(dirtyAgain.data.unstaged.some((s) => s.path === 'a.txt')).toBe(true)
  })

  test('discard reverts a modified file', async () => {
    fs.writeFileSync(path.join(repo, 'a.txt'), 'broken\n')
    const result = await call(deps, 'devlauncher_git_discard', { projectId: 'p1', file: 'a.txt' })
    expect(result.success).toBe(true)
    expect(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8')).toBe('hello\n')
  })

  test('commit rejects blank or oversized messages', async () => {
    const blank = await call(deps, 'devlauncher_git_commit', { projectId: 'p1', message: '  ' })
    expect(blank.success).toBe(false)
    const huge = await call(deps, 'devlauncher_git_commit', { projectId: 'p1', message: 'x'.repeat(2001) })
    expect(huge.success).toBe(false)
  })
})

describe('MCP write tools — npm / terminal / preview / env / config / activity', () => {
  test('npm install runs through execNpm', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_npm_install', { projectId: 'p1' })
    expect(result.success).toBe(true)
    expect(execNpm).toHaveBeenCalledWith('C:\\demo', ['install'])
  })

  test('npm update validates the package name', async () => {
    const { deps } = makeDeps()
    const ok = await call(deps, 'devlauncher_npm_update', { projectId: 'p1', packageName: 'lodash' })
    expect(ok.success).toBe(true)
    expect(execNpm).toHaveBeenCalledWith('C:\\demo', ['update', 'lodash'])
    const missing = await call(deps, 'devlauncher_npm_update', { projectId: 'p1' })
    expect(missing.success).toBe(false)
  })

  test('run project script', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_run_project_script', { projectId: 'p1', script: 'build' })
    expect(result.success).toBe(true)
    expect(execNpm).toHaveBeenCalledWith('C:\\demo', ['run', 'build'])
  })

  test('terminal create/input/kill lifecycle', async () => {
    const { deps } = makeDeps()
    const created = await call(deps, 'devlauncher_terminal_create', { projectId: 'p1' })
    expect(created.success).toBe(true)
    expect(created.data.id).toMatch(/^term-/)

    const typed = await call(deps, 'devlauncher_terminal_input', { terminalId: created.data.id, data: 'ls\r' })
    expect(typed.success).toBe(true)

    const killed = await call(deps, 'devlauncher_terminal_kill', { terminalId: created.data.id })
    expect(killed.success).toBe(true)
  })

  test('preview open/reload/navigate', async () => {
    const { deps } = makeDeps()
    const opened = await call(deps, 'devlauncher_preview_open', { projectId: 'p1' })
    expect(opened.data.url).toBe('http://localhost:3000')
    expect(deps.previewManager.show).toHaveBeenCalledWith({ projectId: 'p1', url: 'http://localhost:3000' })

    await call(deps, 'devlauncher_preview_reload', { projectId: 'p1' })
    expect(deps.previewManager.reload).toHaveBeenCalledWith('p1')

    await call(deps, 'devlauncher_preview_navigate', { projectId: 'p1', url: 'http://localhost:3000/about' })
    expect(deps.previewManager.navigate).toHaveBeenCalledWith('p1', 'http://localhost:3000/about')
  })

  test('env write merges into .env and never echoes values', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-env-'))
    fs.writeFileSync(path.join(dir, '.env'), 'EXISTING=old\n')
    const { deps } = makeDeps([makeProject({ path: dir })])
    const result = await call(deps, 'devlauncher_env_write', {
      projectId: 'p1',
      entries: [{ key: 'EXISTING', value: 'new-secret' }, { key: 'API_KEY', value: 's3cr3t' }],
    })
    expect(result.success).toBe(true)
    // values must not be returned to the agent
    expect(JSON.stringify(result.data)).not.toMatch(/s3cr3t/)
    expect(result.data.writtenKeys.sort()).toEqual(['API_KEY', 'EXISTING'])
    const content = fs.readFileSync(path.join(dir, '.env'), 'utf8')
    expect(content).toContain('EXISTING=new-secret')
    expect(content).toContain('API_KEY=s3cr3t')

    const badKey = await call(deps, 'devlauncher_env_write', {
      projectId: 'p1',
      entries: [{ key: '1BAD', value: 'x' }],
    })
    expect(badKey.success).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('config update validates and broadcasts to the renderer', async () => {
    const { deps, window } = makeDeps()
    const result = await call(deps, 'devlauncher_config_update', { theme: 'light', sidebarExpanded: false })
    expect(result.success).toBe(true)
    expect(deps.storageManager.updateConfig).toHaveBeenCalledWith({ theme: 'light', sidebarExpanded: false })
    expect(window.webContents.send).toHaveBeenCalledWith('config-updated', expect.anything())

    const bad = await call(deps, 'devlauncher_config_update', { theme: 'neon' })
    expect(bad.success).toBe(false)
    expect(bad.error).toMatch(/invalid theme/)
  })

  test('append activity writes to the feed', async () => {
    const { deps, activities } = makeDeps()
    const result = await call(deps, 'devlauncher_append_activity', { message: 'agent finished', detail: 'detail' })
    expect(result.success).toBe(true)
    expect(activities[0]).toMatchObject({ type: 'agent', message: 'agent finished', detail: 'detail' })
  })
})

describe('MCP dispatch + audit', () => {
  test('unknown tool returns an error', async () => {
    const { deps } = makeDeps()
    const result = await call(deps, 'devlauncher_does_not_exist')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Unknown tool/)
  })

  test('write tools leave an audit trail (activity feed + detail)', async () => {
    const { deps, activities } = makeDeps()
    await call(deps, 'devlauncher_start_project', { projectId: 'p1' })
    await call(deps, 'devlauncher_git_stage', { projectId: 'p1', files: ['x'] })
    await new Promise((r) => setTimeout(r, 20))
    expect(activities.length).toBeGreaterThanOrEqual(2)
    expect(activities[0]).toMatchObject({ type: 'agent', project: 'p1' })
    expect(activities[0].message).toContain('devlauncher_start_project')
  })

  test('failing write tools still audit the error', async () => {
    const { deps, activities } = makeDeps()
    const result = await call(deps, 'devlauncher_start_project', { projectId: 'ghost' })
    expect(result.success).toBe(false)
    await new Promise((r) => setTimeout(r, 20))
    expect(activities[0].detail).toContain('error=')
  })

  test('handler errors never reject dispatch', async () => {
    const { deps } = makeDeps()
    deps.storageManager.loadProjects = async () => { throw new Error('storage down') }
    const result = await call(deps, 'devlauncher_list_projects')
    expect(result.success).toBe(false)
    expect(result.error).toBe('storage down')
  })
})
