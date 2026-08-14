import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'node:module'

const { ipcMain, __reset } = createRequire(import.meta.url)('electron')

import { setupProcessHandlers, resolveLaunchConfig, withRequestedPort } from '../processHandlers'

const fakeEvent = { senderFrame: { url: 'http://localhost:5173/' } }

const project = {
  id: 'trusted-id',
  path: 'C:/trusted',
  startCommand: 'npm start',
  commands: [
    { id: 'app', name: 'App', command: 'npm start', port: 3000, primary: true },
    { id: 'assets', name: 'Assets', command: 'npm run dev', port: 5173, primary: false },
  ],
  envVars: [{ key: 'TOKEN', value: 'secret' }],
  port: 3000,
}

function makeHarness(projects) {
  const calls = []
  const processManager = {
    on: () => {},
    startProcess: async (...args) => { calls.push(args); return { status: 'RUNNING' } },
    restartProcess: async (...args) => { calls.push(args); return { status: 'RUNNING' } },
    getProcessStatus: () => ({ status: 'RUNNING' }),
  }
  const storageManager = { loadProjects: async () => projects }
  const mainWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } }
  setupProcessHandlers(processManager, storageManager, mainWindow)
  return { calls, processManager, storageManager }
}

beforeEach(() => __reset())

describe('processHandlers security (trusted-id lookup)', () => {
  test('start-project ignores attacker-supplied args and uses stored data', async () => {
    const { calls } = makeHarness([project])
    const maliciousArgs = ['C:/malicious', 'del /s /q C:\\*', { TOKEN: 'attacker' }, 1]
    const expectedCommands = [
      { ...project.commands[0] },
      { ...project.commands[1], command: 'npm run dev -- --port=5173' },
    ]

    const started = await ipcMain._handlers.get('start-project')(fakeEvent, project.id, ...maliciousArgs)
    expect(started.success).toBe(true)
    expect(calls[0].slice(0, 5)).toEqual([project.id, project.path, expectedCommands, { TOKEN: 'secret' }, project.port])

    const restarted = await ipcMain._handlers.get('restart-project')(fakeEvent, project.id, ...maliciousArgs)
    expect(restarted.success).toBe(true)
    expect(calls[1].slice(0, 5)).toEqual([project.id, project.path, expectedCommands, { TOKEN: 'secret' }, project.port])
  })

  test('start-project rejects unknown projects and untrusted senders', async () => {
    const { calls } = makeHarness([project])

    const missing = await ipcMain._handlers.get('start-project')(fakeEvent, 'missing')
    expect(missing.success).toBe(false)
    expect(missing.error).toMatch(/not found/)
    expect(calls).toHaveLength(0)

    const unauthorized = await ipcMain._handlers.get('start-project')(
      { senderFrame: { url: 'https://attacker.example/' } },
      project.id
    )
    expect(unauthorized.success).toBe(false)
    expect(unauthorized.error).toMatch(/Unauthorized/)
    expect(calls).toHaveLength(0)
  })

  test('start-all-projects uses stored paths and rejects malformed ids', async () => {
    const { calls, storageManager } = makeHarness([project])

    const all = await ipcMain._handlers.get('start-all-projects')(fakeEvent, [project.id], { delayMs: 0 })
    expect(all[0].projectId).toBe(project.id)
    expect(calls[0][1]).toBe(project.path)
    expect(calls[0][2]).toEqual([
      { ...project.commands[0] },
      { ...project.commands[1], command: 'npm run dev -- --port=5173' },
    ])

    const injected = await ipcMain._handlers.get('start-all-projects')(fakeEvent, [{ id: project.id, path: 'C:/bad' }])
    expect(injected.success).toBe(false)
    expect(injected.error).toMatch(/non-empty strings/)

    // A Laravel-style composite gets per-command port injection.
    const laravelProject = {
      id: 'laravel-id', path: 'C:/laravel', type: 'LARAVEL', startCommand: 'php artisan serve',
      commands: [
        { id: 'app', name: 'Laravel', command: 'php artisan serve', port: 8001, primary: true },
        { id: 'assets', name: 'Inertia Vue assets', command: 'npm run dev', port: 5173, primary: false },
      ],
      envVars: [], port: 8001,
    }
    storageManager.loadProjects = async () => [laravelProject]

    const laravelStarted = await ipcMain._handlers.get('start-project')(fakeEvent, laravelProject.id)
    expect(laravelStarted.success).toBe(true)
    expect(calls[1][2][0].command).toBe('php artisan serve --port=8001')
    expect(calls[1][2][1].command).toBe('npm run dev -- --port=5173')
    expect(calls[1][4]).toBe(8001)
  })

  test('withRequestedPort covers every supported launcher', () => {
    expect(withRequestedPort('php artisan serve', 8001)).toBe('php artisan serve --port=8001')
    expect(withRequestedPort('php artisan serve --port=9000', 8001)).toBe('php artisan serve --port=9000')
    expect(withRequestedPort('npm run dev', 5174)).toBe('npm run dev -- --port=5174')
    expect(withRequestedPort('npm run dev -- --port=5175', 5174)).toBe('npm run dev -- --port=5175')
    expect(withRequestedPort('pnpm dev', 5174)).toBe('pnpm dev --port=5174')
    expect(withRequestedPort('yarn dev', 5174)).toBe('yarn dev --port=5174')
    expect(withRequestedPort('bun dev', 5174)).toBe('bun dev --port=5174')
  })

  test('resolveLaunchConfig falls back to startCommand when commands are missing', () => {
    const fallback = resolveLaunchConfig({
      ...project,
      commands: null,
      startCommand: 'php artisan serve',
      port: 8001,
    })
    expect(fallback.command).toBe('php artisan serve --port=8001')
    expect(fallback.port).toBe(8001)
  })
})
