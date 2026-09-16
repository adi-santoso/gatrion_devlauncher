import { test, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import ProjectDetector from '../ProjectDetector'
import ProcessManager from '../ProcessManager'
import net from 'node:net'
import { packageManager } from '../../utils/projectTooling'
import { normalizeProject } from '../../projectSchema'
import { normalizePathKey } from '../../utils/pathKey'
import { localPython } from '../../utils/projectMetadata'
import { waitForDependency } from '../../utils/dependencyReadiness'
import { setupProjectHandlers } from '../../handlers/projectHandlers'
import { createRequire } from 'node:module'
import { setupProcessHandlers } from '../../handlers/processHandlers'
const { ipcMain } = createRequire(import.meta.url)('electron')

let dir
const detector = new ProjectDetector()
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'add-audit-')) })
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })
const write = (name, value) => fs.writeFile(path.join(dir, name), typeof value === 'object' ? JSON.stringify(value) : value, 'utf8')

test('AP08 selected dev command owns its port, not an unrelated preview script', async () => {
  await write('package.json', { scripts: { preview: 'vite preview --port 4999', dev: 'vite --port 5173' }, dependencies: { react: '19', vite: '6' } })
  expect(await detector.detectProjectType(dir)).toMatchObject({ defaultCommand: 'npm run dev', defaultPort: 5173 })
})

test('AP08 generic Node worker has no invented web port', async () => {
  await write('package.json', { scripts: { start: 'node worker.js' } })
  expect(await detector.detectProjectType(dir)).toMatchObject({ type: 'NODEJS', defaultCommand: 'npm start', defaultPort: null, warnings: [] })
})

test('AP09 detection and dependency tooling share mixed-lockfile precedence and diagnostics', async () => {
  await write('package.json', { scripts: { dev: 'vite' } })
  await write('pnpm-lock.yaml', 'lockfileVersion: 9')
  await write('package-lock.json', '{}')
  expect((await detector.detectProjectType(dir)).packageManager).toBe('pnpm')
  expect(packageManager(dir)).toBe('pnpm')
  expect((await detector.detectProjectType(dir)).warnings.join(' ')).toMatch(/Multiple package-manager/)
})

test('AP10 Python library without an entrypoint requests manual command configuration', async () => {
  await write('pyproject.toml', '[project]\nname = "library"')
  expect(await detector.detectProjectType(dir)).toMatchObject({ type: 'PYTHON', defaultCommand: '', warnings: expect.arrayContaining([expect.stringMatching(/Start command/)]) })
})

test('AP10 standalone Django manage.py is recognized', async () => {
  await write('manage.py', '# Django manage entry point')
  expect(await detector.detectProjectType(dir)).toMatchObject({ type: 'PYTHON', defaultCommand: 'python manage.py runserver', defaultPort: 8000 })
})

test('AP11 BOM JSON is parsed normally', async () => {
  await write('package.json', '\uFEFF' + JSON.stringify({ name: 'valid-app', scripts: { dev: 'vite' }, dependencies: { react: '19', vite: '6' } }))
  const result = await detector.detectProjectType(dir)
  expect(result).toMatchObject({ success: true, type: 'REACT_VITE', defaultCommand: 'npm run dev', packageManager: 'npm' })
  expect(result.warnings.join(' ')).not.toMatch(/JSON|parse|BOM/i)
})

test('AP12 relative and absolute paths cannot register the same directory twice', async () => {
  const relative = path.relative(process.cwd(), dir)
  expect(normalizePathKey(relative)).toBe(normalizePathKey(dir))
  let projects = []
  const store = { updateProjects: async mutator => { const result = mutator(projects); projects = result.projects; return { projects } } }
  setupProjectHandlers(store, { on: vi.fn() }, null)
  const add = ipcMain._handlers.get('add-project'), event = { senderFrame: { url: 'http://localhost:5173/' } }
  const first = await add(event, { name: 'first', path: relative, startCommand: 'node worker.js' })
  expect(path.isAbsolute(first.project.path)).toBe(true)
  const second = await add(event, { name: 'second', path: dir, startCommand: 'node worker.js' })
  expect(second).toMatchObject({ success: false, existingProjectId: first.project.id, fieldErrors: { path: 'This folder is already registered' } })
  expect(projects).toHaveLength(1)
})

test('AP15 dependsOn waits until the dependency reports ready', async () => {
  const project = (id, dependsOn = []) => normalizeProject({ id, name: id, path: dir, startCommand: 'node server.js', port: 3000, dependsOn })
  let ready = false
  const pm = { on: vi.fn(), startProcess: vi.fn(async () => ({ success: true, status: 'starting' })), getProcessStatus: vi.fn(id => ({ status: id === 'db' && ready ? 'running' : 'starting' })) }
  setupProcessHandlers(pm, { loadProjects: async () => [project('db'), project('web', ['db'])] }, null)
  const pending = ipcMain._handlers.get('start-project')({ senderFrame: { url: 'http://localhost:5173/' } }, 'web')
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(pm.startProcess).not.toHaveBeenCalled()
  ready = true
  const result = await pending
  expect(result.success).toBe(true)
  expect(pm.startProcess.mock.calls.map(args => args[0])).toEqual(['web'])
})

test('AP15 readiness failure and timeout propagate instead of launching dependents', async () => {
  const dep = { id: 'db', name: 'Database' }
  await expect(waitForDependency(dep, () => ({ status: 'error', errorMessage: 'crashed' }))).rejects.toThrow('crashed')
  await expect(waitForDependency(dep, () => ({ status: 'starting' }), 0)).rejects.toThrow('Timed out')
})

test('AP08 explicit CLI wins over server config, which wins over preview config', async () => {
  await write('package.json', { scripts: { dev: 'vite' }, dependencies: { vite: '6', react: '19' } })
  await write('vite.config.ts', 'export default { preview: { port: 4999 }, server: { port: 5333 } }')
  expect((await detector.detectProjectType(dir)).defaultPort).toBe(5333)
  await write('package.json', { scripts: { dev: 'vite --port 5444' }, dependencies: { vite: '6', react: '19' } })
  expect((await detector.detectProjectType(dir)).defaultPort).toBe(5444)
})

test('AP10 selected local Python path is quoted and consistent with dependency tooling', async () => {
  const exe = path.join(dir, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  await fs.mkdir(path.dirname(exe), { recursive: true }); await fs.writeFile(exe, '')
  await write('main.py', 'print("hello")')
  const result = await detector.detectProjectType(dir)
  expect(result.defaultCommand).toContain(localPython(dir))
  expect(result.defaultCommand).toMatch(/ main.py$/)
})

test('AP11 malformed manifest gives a diagnostic instead of a false healthy result', async () => {
  await write('package.json', '{broken')
  expect(await detector.detectProjectType(dir)).toMatchObject({ success: false, error: 'Invalid JSON manifest: package.json' })
})

test('AP08 Laravel backend environment cannot become the assets monitored port', async () => {
  await write('artisan', '<?php')
  await write('composer.json', { require: { 'laravel/framework': '^10' } })
  await write('package.json', { scripts: { dev: 'vite' }, devDependencies: { vite: '6', 'laravel-vite-plugin': '1' } })
  await write('.env', 'APP_PORT=8123\nPORT=8123\n')
  let result = await detector.detectProjectType(dir)
  expect(result.defaultPort).toBe(8123)
  expect(result.commands.find(c => c.id === 'assets').port).toBe(5173)
  await write('.env.local', 'VITE_PORT=5444\n')
  result = await detector.detectProjectType(dir)
  expect(result.commands.find(c => c.id === 'assets').port).toBe(5444)
})

test('AP15 real process starts share a dependency and wait for its delayed TCP listener', async () => {
  const probe = net.createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  await write('db.js', `setTimeout(() => require('net').createServer().listen(${port}, '127.0.0.1'), 500)`)
  await write('web.js', 'setInterval(() => {}, 1000)')
  const projects = [
    normalizeProject({ id: 'db', name: 'db', path: dir, startCommand: 'node db.js', port }),
    ...['web', 'api'].map(id => normalizeProject({ id, name: id, path: dir, startCommand: 'node web.js', dependsOn: ['db'] })),
  ]
  const manager = new ProcessManager(), starts = []
  manager.loadProjects = async () => projects
  manager.on('status-change', event => {
    if (event.status === 'starting') starts.push({ id: event.projectId, dependency: manager.getProcessStatus('db').status })
  })
  try {
    await Promise.all(['web', 'api'].map(id => manager.startProcess(id, dir, 'node web.js')))
    expect(starts.filter(s => s.id === 'db')).toHaveLength(1)
    expect(starts.filter(s => s.id !== 'db')).toEqual(expect.arrayContaining([
      { id: 'web', dependency: manager.STATUS.RUNNING }, { id: 'api', dependency: manager.STATUS.RUNNING },
    ]))
  } finally { await manager.stopAllProcesses() }
}, 20000)

test('AP15 direct process entry points reject cycles and failed dependencies before spawning the dependent', async () => {
  const manager = new ProcessManager()
  const project = (id, dependsOn, command = 'node -e "process.exit(7)"', port = null) => normalizeProject({ id, name: id, path: dir, startCommand: command, port, dependsOn })
  manager.loadProjects = async () => [project('a', ['b']), project('b', ['a'])]
  await expect(manager.startProcess('a', dir, 'node --version')).rejects.toThrow('cycle')
  expect(manager.processes.size).toBe(0)
  manager.loadProjects = async () => [project('a', ['b']), project('b', [], 'node -e "process.exit(7)"', 65534)]
  try {
    await expect(manager.startProcess('a', dir, 'node --version')).rejects.toThrow(/Dependency b/)
    expect(manager.processes.has('a')).toBe(false)
  } finally { await manager.stopAllProcesses() }
}, 15000)
