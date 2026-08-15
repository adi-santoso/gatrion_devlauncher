import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { ipcMain, dialog, __reset } = createRequire(import.meta.url)('electron')

import { setupProjectHandlers } from '../projectHandlers'

const fakeEvent = { senderFrame: { url: 'http://localhost:5173/' } }

let tempRoot

function makeStorageManager(projects = []) {
  return {
    _projects: projects,
    async loadProjects() {
      return this._projects
    },
    async updateProjects(mutator) {
      const result = await mutator(this._projects)
      if (result?.projects) this._projects = result.projects
      return { projects: this._projects, value: result?.value }
    },
  }
}

function makeProcessManager() {
  return {
    STATUS: { RUNNING: 'running', STARTING: 'starting', STOPPING: 'stopping', STOPPED: 'stopped' },
    on: vi.fn(),
    getProcessStatus: vi.fn(() => ({ status: 'stopped' })),
    stopProcess: vi.fn(async () => ({ success: true })),
  }
}

function makeWindow() {
  return { isDestroyed: () => false, webContents: { send: vi.fn() } }
}

const projectTemplate = (dir) => ({
  name: 'demo',
  path: dir,
  type: 'NODEJS',
  startCommand: 'npm run dev',
  envVars: [],
  port: null,
})

beforeEach(() => {
  __reset()
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-handlers-'))
})

describe('projectHandlers', () => {
  test('get-projects returns renderer-safe projects', async () => {
    const storage = makeStorageManager()
    setupProjectHandlers(storage, makeProcessManager(), makeWindow())
    const result = await ipcMain._handlers.get('get-projects')(fakeEvent)
    expect(result.success).toBe(true)
    expect(result.projects).toEqual([])
  })

  test('add-project persists a validated project', async () => {
    const storage = makeStorageManager()
    setupProjectHandlers(storage, makeProcessManager(), makeWindow())
    const handler = ipcMain._handlers.get('add-project')
    const result = await handler(fakeEvent, projectTemplate(tempRoot))
    expect(result.success).toBe(true)
    expect(result.project.name).toBe('demo')
    expect(result.project.id).toBeTruthy()
    expect(storage._projects).toHaveLength(1)
  })

  test('add-project rejects duplicate names and paths', async () => {
    const otherDir = path.join(tempRoot, 'other')
    fs.mkdirSync(otherDir)
    const storage = makeStorageManager()
    setupProjectHandlers(storage, makeProcessManager(), makeWindow())
    const handler = ipcMain._handlers.get('add-project')
    await handler(fakeEvent, projectTemplate(tempRoot))
    const dupName = await handler(fakeEvent, { ...projectTemplate(tempRoot), path: otherDir })
    expect(dupName.success).toBe(false)
    expect(dupName.error).toMatch(/already exists/)
    const dupPath = await handler(fakeEvent, { ...projectTemplate(tempRoot), name: 'other-name' })
    expect(dupPath.success).toBe(false)
    expect(dupPath.error).toMatch(/already exists/)
  })

  test('add-project rejects a missing directory', async () => {
    const storage = makeStorageManager()
    setupProjectHandlers(storage, makeProcessManager(), makeWindow())
    const result = await ipcMain._handlers.get('add-project')(fakeEvent, projectTemplate(path.join(tempRoot, 'ghost')))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/does not exist/)
  })

  test('update-project renames and reports missing ids', async () => {
    const storage = makeStorageManager()
    setupProjectHandlers(storage, makeProcessManager(), makeWindow())
    const added = await ipcMain._handlers.get('add-project')(fakeEvent, projectTemplate(tempRoot))
    const id = added.project.id

    const renamed = await ipcMain._handlers.get('update-project')(fakeEvent, id, { name: 'renamed' })
    expect(renamed.success).toBe(true)
    expect(renamed.project.name).toBe('renamed')

    const missing = await ipcMain._handlers.get('update-project')(fakeEvent, 'nope', { name: 'x' })
    expect(missing.success).toBe(false)
    expect(missing.error).toMatch(/not found/)
  })

  test('delete-project stops a running process first, then removes', async () => {
    const storage = makeStorageManager()
    const pm = makeProcessManager()
    pm.getProcessStatus.mockReturnValue({ status: 'running' })
    setupProjectHandlers(storage, pm, makeWindow())
    const added = await ipcMain._handlers.get('add-project')(fakeEvent, projectTemplate(tempRoot))
    const id = added.project.id

    const result = await ipcMain._handlers.get('delete-project')(fakeEvent, id)
    expect(result.success).toBe(true)
    expect(pm.stopProcess).toHaveBeenCalledWith(id)
    expect(storage._projects).toHaveLength(0)

    const missing = await ipcMain._handlers.get('delete-project')(fakeEvent, id)
    expect(missing.success).toBe(false)
    expect(missing.error).toMatch(/not found/)
  })

  test('delete-project cleans up agent data (RPC process + session registry)', async () => {
    const storage = makeStorageManager()
    const pm = makeProcessManager()
    const omp = { clearProject: vi.fn(async () => {}) }
    setupProjectHandlers(storage, pm, makeWindow(), omp)
    const added = await ipcMain._handlers.get('add-project')(fakeEvent, projectTemplate(tempRoot))
    const id = added.project.id

    const result = await ipcMain._handlers.get('delete-project')(fakeEvent, id)
    expect(result.success).toBe(true)
    expect(omp.clearProject).toHaveBeenCalledWith(id)
  })

  test('workspace-search-files returns hits and honors a short query', async () => {
    fs.mkdirSync(path.join(tempRoot, 'src'))
    fs.writeFileSync(path.join(tempRoot, 'src', 'App.jsx'), 'export default () => null')
    fs.writeFileSync(path.join(tempRoot, 'README.md'), '# hi')
    fs.mkdirSync(path.join(tempRoot, 'node_modules'))
    fs.writeFileSync(path.join(tempRoot, 'node_modules', 'lodash.js'), 'x')
    setupProjectHandlers(makeStorageManager(), makeProcessManager(), makeWindow())
    const handler = ipcMain._handlers.get('workspace-search-files')

    const short = await handler(fakeEvent, 'a', [tempRoot])
    expect(short.files).toEqual([])

    const hits = await handler(fakeEvent, 'app', [tempRoot])
    expect(hits.files.some((f) => f.name === 'App.jsx')).toBe(true)
    expect(hits.files.some((f) => f.name === 'lodash.js')).toBe(false)
  })

  test('browse-folder honors the e2e test hook', async () => {
    setupProjectHandlers(makeStorageManager(), makeProcessManager(), makeWindow())
    const oldEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    process.env.DEVLAUNCHER_TEST_FOLDER = tempRoot
    try {
      const result = await ipcMain._handlers.get('browse-folder')(fakeEvent)
      expect(result).toEqual({ success: true, path: tempRoot })
    } finally {
      process.env.NODE_ENV = oldEnv
      delete process.env.DEVLAUNCHER_TEST_FOLDER
    }
  })

  test('browse-folder uses the native dialog outside tests', async () => {
    setupProjectHandlers(makeStorageManager(), makeProcessManager(), makeWindow())
    dialog.showOpenDialog = vi.fn(async () => ({ canceled: false, filePaths: [tempRoot] }))
    const result = await ipcMain._handlers.get('browse-folder')(fakeEvent)
    expect(result).toEqual({ success: true, path: tempRoot })

    dialog.showOpenDialog = vi.fn(async () => ({ canceled: true }))
    const canceled = await ipcMain._handlers.get('browse-folder')(fakeEvent)
    expect(canceled).toEqual({ success: false, canceled: true })
  })

  test('list-env-files returns only .env* entries, sorted with .env first', async () => {
    fs.writeFileSync(path.join(tempRoot, '.env'), 'A=1')
    fs.writeFileSync(path.join(tempRoot, '.env.local'), 'B=2')
    fs.writeFileSync(path.join(tempRoot, 'README.md'), 'no')
    setupProjectHandlers(makeStorageManager(), makeProcessManager(), makeWindow())
    const result = await ipcMain._handlers.get('list-env-files')(fakeEvent, tempRoot)
    expect(result.success).toBe(true)
    expect(result.files).toEqual(['.env', '.env.local'])
  })

  test('read-env-file reads content and reports missing/bad files', async () => {
    fs.writeFileSync(path.join(tempRoot, '.env'), 'PORT=3000\n')
    setupProjectHandlers(makeStorageManager(), makeProcessManager(), makeWindow())
    const handler = ipcMain._handlers.get('read-env-file')

    const ok = await handler(fakeEvent, tempRoot, '.env')
    expect(ok.success).toBe(true)
    expect(ok.content).toBe('PORT=3000\n')
    expect(typeof ok.modifiedAt).toBe('number')

    const missing = await handler(fakeEvent, tempRoot, '.env.prod')
    expect(missing.success).toBe(false)
    expect(missing.error).toMatch(/does not exist/)

    const badName = await handler(fakeEvent, tempRoot, '..\\secret.txt')
    expect(badName.success).toBe(false)
  })

  test('write-env-file writes, backs up the previous file, and rejects traversal', async () => {
    fs.writeFileSync(path.join(tempRoot, '.env'), 'OLD=1')
    setupProjectHandlers(makeStorageManager(), makeProcessManager(), makeWindow())
    const handler = ipcMain._handlers.get('write-env-file')

    const result = await handler(fakeEvent, tempRoot, '.env', 'NEW=2')
    expect(result.success).toBe(true)
    expect(fs.readFileSync(path.join(tempRoot, '.env'), 'utf8')).toBe('NEW=2')
    const backups = fs.readdirSync(tempRoot).filter((f) => f.startsWith('.env.backup-'))
    expect(backups).toHaveLength(1)

    const nonString = await handler(fakeEvent, tempRoot, '.env', 42)
    expect(nonString.success).toBe(false)
    expect(nonString.error).toMatch(/must be a string/)

    const traversal = await handler(fakeEvent, tempRoot, '../outside', 'x')
    expect(traversal.success).toBe(false)
  })

  test('export-projects writes the bundle via the save dialog; cancel is reported', async () => {
    const storage = makeStorageManager([{ ...projectTemplate(tempRoot), id: 'p1' }])
    setupProjectHandlers(storage, makeProcessManager(), makeWindow())
    const handler = ipcMain._handlers.get('export-projects')

    const target = path.join(tempRoot, 'out.json')
    dialog.showSaveDialog = vi.fn(async () => ({ canceled: false, filePath: target }))
    const ok = await handler(fakeEvent)
    expect(ok.success).toBe(true)
    expect(ok.count).toBe(1)
    const written = JSON.parse(fs.readFileSync(target, 'utf8'))
    expect(written.type).toBe('devlauncher-projects')

    dialog.showSaveDialog = vi.fn(async () => ({ canceled: true }))
    const canceled = await handler(fakeEvent)
    expect(canceled).toEqual({ success: false, canceled: true })
  })

  test('import-projects adds valid entries and skips duplicates/invalid', async () => {
    const existingDir = fs.mkdtempSync(path.join(tempRoot, 'existing-'))
    fs.writeFileSync(path.join(tempRoot, 'to-import.json'), JSON.stringify({
      app: 'devlauncher',
      type: 'devlauncher-projects',
      version: 1,
      projects: [
        projectTemplate(existingDir),
        projectTemplate(path.join(tempRoot, 'ghost-dir')),
      ],
    }))
    const storage = makeStorageManager()
    setupProjectHandlers(storage, makeProcessManager(), makeWindow())
    const handler = ipcMain._handlers.get('import-projects')

    dialog.showOpenDialog = vi.fn(async () => ({ canceled: false, filePaths: [path.join(tempRoot, 'to-import.json')] }))
    const result = await handler(fakeEvent)
    expect(result.success).toBe(true)
    expect(result.added).toHaveLength(1)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe('directory does not exist')

    dialog.showOpenDialog = vi.fn(async () => ({ canceled: true }))
    const canceled = await handler(fakeEvent)
    expect(canceled).toEqual({ success: false, canceled: true })
  })
})
