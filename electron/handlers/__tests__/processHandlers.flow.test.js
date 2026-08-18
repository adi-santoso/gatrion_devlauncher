import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'node:module'

const { ipcMain, __reset } = createRequire(import.meta.url)('electron')

import { setupProcessHandlers, withRequestedPort, resolveLaunchConfig } from '../processHandlers'

const fakeEvent = { senderFrame: { url: 'http://localhost:5173/' } }

function makeProcessManager() {
  return {
    STATUS: { RUNNING: 'running', STARTING: 'starting', STOPPING: 'stopping', STOPPED: 'stopped' },
    on: vi.fn(),
    getProcessStatus: vi.fn(() => ({ status: 'stopped', pid: null })),
    startProcess: vi.fn(async () => ({ started: true, pid: 123 })),
    stopProcess: vi.fn(async () => ({ stopped: true })),
    restartProcess: vi.fn(async () => ({ restarted: true })),
    findPortOwner: vi.fn(async () => null),
    getProcessMetrics: vi.fn(() => ({ cpu: 1.5, memory: 100 })),
    getLogs: vi.fn(() => ['line 1', 'line 2']),
    clearLogs: vi.fn(),
    runCustomCommand: vi.fn(async () => ({ runId: 7 })),
    stopCustomCommand: vi.fn(async () => ({ stopped: true })),
    getCustomRunStatus: vi.fn(() => ({ status: 'running' })),
    stopAllProcesses: vi.fn(async () => [{ projectId: 'p1', success: true }]),
  }
}

function makeStorageManager(projects) {
  return {
    _projects: projects,
    async loadProjects() {
      return this._projects
    },
  }
}

function makeWindow() {
  return { isDestroyed: () => false, webContents: { send: vi.fn() } }
}

const project = (id, extra = {}) => ({
  id,
  name: id,
  path: 'C:\\projects\\' + id,
  startCommand: 'npm run dev',
  envVars: [],
  port: null,
  dependsOn: [],
  ...extra,
})

beforeEach(() => __reset())

describe('processHandlers flows', () => {
  test('start-project loads the project and starts the process', async () => {
    const pm = makeProcessManager()
    const storage = makeStorageManager([project('app')])
    const window = makeWindow()
    setupProcessHandlers(pm, storage, window)
    const result = await ipcMain._handlers.get('start-project')(fakeEvent, 'app')
    expect(result.success).toBe(true)
    expect(pm.startProcess).toHaveBeenCalled()
    expect(pm.startProcess.mock.calls[0][0]).toBe('app')
    expect(pm.startProcess.mock.calls[0][2]).toBe('npm run dev')
    expect(window.webContents.send).toHaveBeenCalledWith('process-status', 'app', expect.anything())
  })

  test('start-project reports unknown projects', async () => {
    const pm = makeProcessManager()
    setupProcessHandlers(pm, makeStorageManager([]), makeWindow())
    const result = await ipcMain._handlers.get('start-project')(fakeEvent, 'ghost')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/)
  })

  test('stop-project and restart-project delegate with force flag', async () => {
    const pm = makeProcessManager()
    setupProcessHandlers(pm, makeStorageManager([project('app')]), makeWindow())
    const stop = await ipcMain._handlers.get('stop-project')(fakeEvent, 'app', true)
    expect(stop.success).toBe(true)
    expect(pm.stopProcess).toHaveBeenCalledWith('app', true)

    const restart = await ipcMain._handlers.get('restart-project')(fakeEvent, 'app')
    expect(restart.success).toBe(true)
    expect(pm.restartProcess).toHaveBeenCalled()
  })

  test('read-only status/metrics/log channels delegate', async () => {
    const pm = makeProcessManager()
    setupProcessHandlers(pm, makeStorageManager([]), makeWindow())

    expect(await ipcMain._handlers.get('get-process-status')(fakeEvent, 'app')).toEqual({ status: 'stopped', pid: null })
    expect(pm.getProcessStatus).toHaveBeenCalledWith('app')

    expect(await ipcMain._handlers.get('check-port-conflict')(fakeEvent, 3000)).toBeNull()
    expect(pm.findPortOwner).toHaveBeenCalledWith(3000)

    expect(await ipcMain._handlers.get('get-process-metrics')(fakeEvent, 'app')).toEqual({ cpu: 1.5, memory: 100 })

    expect(await ipcMain._handlers.get('get-logs')(fakeEvent, 'app', 200)).toEqual(['line 1', 'line 2'])
    expect(pm.getLogs).toHaveBeenCalledWith('app', 200)

    expect(await ipcMain._handlers.get('clear-logs')(fakeEvent, 'app')).toEqual({ success: true })
    expect(pm.clearLogs).toHaveBeenCalledWith('app')
  })

  test('run-custom-command finds the command and reports missing ones', async () => {
    const pm = makeProcessManager()
    const storage = makeStorageManager([project('app', { customCommands: [{ id: 'seed', label: 'Seed', command: 'npm run seed' }] })])
    setupProcessHandlers(pm, storage, makeWindow())

    const ok = await ipcMain._handlers.get('run-custom-command')(fakeEvent, 'app', 'seed')
    expect(ok.success).toBe(true)
    expect(ok.runId).toBe(7)

    const missing = await ipcMain._handlers.get('run-custom-command')(fakeEvent, 'app', 'nope')
    expect(missing.success).toBe(false)
    expect(missing.error).toMatch(/not found/)
  })

  test('custom command lifecycle channels delegate', async () => {
    const pm = makeProcessManager()
    setupProcessHandlers(pm, makeStorageManager([]), makeWindow())

    const stop = await ipcMain._handlers.get('stop-custom-command')(fakeEvent, 7)
    expect(stop).toEqual({ success: true, stopped: true })
    expect(pm.stopCustomCommand).toHaveBeenCalledWith(7, true)

    expect(await ipcMain._handlers.get('get-custom-command-status')(fakeEvent, 7)).toEqual({ status: 'running' })

    expect(await ipcMain._handlers.get('stop-all-projects')(fakeEvent)).toEqual([{ projectId: 'p1', success: true }])
    expect(pm.stopAllProcesses).toHaveBeenCalled()
  })

  test('start-project auto-starts missing dependencies first (dependsOn)', async () => {
    const pm = makeProcessManager()
    const storage = makeStorageManager([project('db'), project('app', { dependsOn: ['db'] })])
    setupProcessHandlers(pm, storage, makeWindow())

    const result = await ipcMain._handlers.get('start-project')(fakeEvent, 'app')
    expect(result.success).toBe(true)
    expect(result.startedDependencies).toEqual(['db'])
    // db starts before app
    expect(pm.startProcess.mock.calls.map((call) => call[0])).toEqual(['db', 'app'])
  })

  test('start-project starts transitive dependencies in order', async () => {
    const pm = makeProcessManager()
    const storage = makeStorageManager([
      project('db'),
      project('api', { dependsOn: ['db'] }),
      project('web', { dependsOn: ['api'] }),
    ])
    setupProcessHandlers(pm, storage, makeWindow())

    const result = await ipcMain._handlers.get('start-project')(fakeEvent, 'web')
    expect(result.startedDependencies).toEqual(['db', 'api'])
    expect(pm.startProcess.mock.calls.map((call) => call[0])).toEqual(['db', 'api', 'web'])
  })

  test('start-project skips dependencies that are already running', async () => {
    const pm = makeProcessManager()
    pm.getProcessStatus.mockImplementation((id) => ({
      status: id === 'db' ? 'running' : 'stopped',
      pid: id === 'db' ? 5 : null,
    }))
    const storage = makeStorageManager([project('db'), project('app', { dependsOn: ['db'] })])
    setupProcessHandlers(pm, storage, makeWindow())

    const result = await ipcMain._handlers.get('start-project')(fakeEvent, 'app')
    expect(result.success).toBe(true)
    expect(result.startedDependencies).toEqual([])
    expect(pm.startProcess.mock.calls.map((call) => call[0])).toEqual(['app'])
  })

  test('start-project fails when a dependency fails to start', async () => {
    const pm = makeProcessManager()
    pm.startProcess.mockImplementation(async (id) => {
      if (id === 'db') throw new Error('db exploded')
      return { started: true, pid: 123 }
    })
    const storage = makeStorageManager([project('db'), project('app', { dependsOn: ['db'] })])
    setupProcessHandlers(pm, storage, makeWindow())

    const result = await ipcMain._handlers.get('start-project')(fakeEvent, 'app')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/db exploded/)
    // app is never started because its dependency failed
    expect(pm.startProcess.mock.calls.map((call) => call[0])).toEqual(['db'])
  })

  test('start-all-projects starts everything without a filter', async () => {
    const pm = makeProcessManager()
    const storage = makeStorageManager([project('db'), project('app', { dependsOn: ['db'] })])
    setupProcessHandlers(pm, storage, makeWindow())

    const results = await ipcMain._handlers.get('start-all-projects')(fakeEvent, undefined, { delayMs: 0 })
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.success === true)).toBe(true)
    // Topological order: db before app.
    expect(results[0].projectId).toBe('db')
    expect(results[1].projectId).toBe('app')
    expect(pm.startProcess).toHaveBeenCalledTimes(2)
  })

  test('start-all-projects honors a subset filter', async () => {
    const pm = makeProcessManager()
    const storage = makeStorageManager([project('db'), project('app', { dependsOn: ['db'] })])
    setupProcessHandlers(pm, storage, makeWindow())

    const results = await ipcMain._handlers.get('start-all-projects')(fakeEvent, ['app'], { delayMs: 0 })
    expect(results).toHaveLength(1)
    expect(results[0].projectId).toBe('app')
  })

  test('withRequestedPort appends --port for supported commands', () => {
    expect(withRequestedPort('npm run dev', 5173)).toBe('npm run dev -- --port=5173')
    expect(withRequestedPort('php artisan serve', 8000)).toBe('php artisan serve --port=8000')
    expect(withRequestedPort('pnpm start', 4000)).toBe('pnpm start --port=4000')
    expect(withRequestedPort('node server.js', 3000)).toBe('node server.js')
    expect(withRequestedPort('npm run dev --port=9999', 5173)).toBe('npm run dev --port=9999')
    expect(withRequestedPort('cmd', 'not-a-port')).toBe('cmd')
  })

  test('resolveLaunchConfig handles single and multi commands', () => {
    const single = resolveLaunchConfig(project('a', { commands: undefined }))
    expect(single.command).toBe('npm run dev')

    const multi = resolveLaunchConfig(project('a', {
      commands: [
        { id: 'c1', name: 'One', command: 'npm run one', primary: false },
        { id: 'c2', name: 'Two', command: 'npm run two', primary: true, port: 4000 },
      ],
    }))
    expect(Array.isArray(multi.command)).toBe(true)
    const primary = multi.command.find((c) => c.primary)
    expect(primary.port).toBe(4000)
  })
})
