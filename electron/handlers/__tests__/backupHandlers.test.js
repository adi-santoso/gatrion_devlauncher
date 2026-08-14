import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { ipcMain, dialog, __reset } = createRequire(import.meta.url)('electron')

import { setupBackupHandlers, mergeConfigAndPresets } from '../backupHandlers'
import { encryptBundle } from '../../utils/workspaceBackup'

const fakeEvent = { senderFrame: { url: 'http://localhost:5173/' } }

let tempRoot

const project = (name, extra = {}) => ({
  id: `id-${name}`,
  name,
  path: `C:/projects/${name}`,
  type: 'NODEJS',
  startCommand: 'npm run dev',
  commands: [{ id: 'main', name: 'dev', command: 'npm run dev', primary: true }],
  envVars: [{ key: 'API_KEY', value: 'sekret' }],
  port: null,
  ...extra,
})

function makeStorageManager(initial = {}) {
  const state = {
    projects: initial.projects || [],
    config: initial.config || { theme: 'dark' },
    presets: initial.presets || [],
  }
  return {
    state,
    async loadProjects() {
      return state.projects
    },
    async loadConfig() {
      return state.config
    },
    async loadPresets() {
      return state.presets
    },
    async saveProjects(projects) {
      state.projects = projects
    },
    async saveConfig(config) {
      state.config = config
    },
    async savePresets(presets) {
      state.presets = presets
    },
  }
}

const makeHealth = () => ({ data: { projects: { 'id-a': { crashes: [], runs: [] } } } })

const makeWindow = () => ({ isDestroyed: () => false, webContents: { send: vi.fn() } })

beforeEach(() => {
  __reset()
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-handlers-'))
})

describe('backupHandlers', () => {
  test('backup-export writes a plaintext bundle with all workspace data', async () => {
    const storage = makeStorageManager({ projects: [project('a')], presets: [{ id: 'p1', name: 'web' }] })
    setupBackupHandlers(storage, makeHealth(), makeWindow())

    const target = path.join(tempRoot, 'backup.json')
    dialog.showSaveDialog = vi.fn(async () => ({ canceled: false, filePath: target }))

    const result = await ipcMain._handlers.get('backup-export')(fakeEvent)
    expect(result.success).toBe(true)
    expect(result.encrypted).toBe(false)
    expect(result.projectCount).toBe(1)

    const bundle = JSON.parse(fs.readFileSync(target, 'utf8'))
    expect(bundle.type).toBe('devlauncher-workspace-backup')
    expect(bundle.projects).toHaveLength(1)
    expect(bundle.projects[0].envVars[0].value).toBe('sekret') // recovery bundle keeps secrets
    expect(bundle.hasSecrets).toBe(true)
    expect(bundle.config.theme).toBe('dark')
    expect(bundle.presets).toHaveLength(1)
    expect(bundle.health.projects['id-a']).toBeDefined()
    expect(bundle.appVersion).toBe('0.0.0-test')
  })

  test('backup-export with a password writes an encrypted wrapper', async () => {
    const storage = makeStorageManager({ projects: [project('a')] })
    setupBackupHandlers(storage, null, null)

    const target = path.join(tempRoot, 'backup-enc.json')
    dialog.showSaveDialog = vi.fn(async () => ({ canceled: false, filePath: target }))

    const result = await ipcMain._handlers.get('backup-export')(fakeEvent, 'pw-123')
    expect(result.encrypted).toBe(true)

    const wrapper = JSON.parse(fs.readFileSync(target, 'utf8'))
    expect(wrapper.encrypted).toBe(true)
    expect(JSON.stringify(wrapper)).not.toContain('sekret')
  })

  test('backup-export reports a canceled save dialog', async () => {
    setupBackupHandlers(makeStorageManager(), null, null)
    dialog.showSaveDialog = vi.fn(async () => ({ canceled: true }))
    const result = await ipcMain._handlers.get('backup-export')(fakeEvent)
    expect(result).toEqual({ success: false, canceled: true })
  })

  test('backup-import merges plaintext projects/config/presets without overwriting', async () => {
    const storage = makeStorageManager({
      projects: [project('existing', { path: 'C:/projects/existing' })],
      config: { theme: 'light' },
      presets: [{ id: 'p1', name: 'web' }],
    })
    const window = makeWindow()
    setupBackupHandlers(storage, null, window)

    const backup = {
      type: 'devlauncher-workspace-backup',
      version: 1,
      projects: [
        project('existing', { path: 'C:/projects/existing' }), // skip: same name+path
        project('fresh'),
      ],
      config: { theme: 'dark', newKey: true },
      presets: [{ id: 'p1', name: 'web' }, { id: 'p2', name: 'api' }],
      health: { projects: {} },
    }
    const source = path.join(tempRoot, 'in.json')
    fs.writeFileSync(source, JSON.stringify(backup))
    dialog.showOpenDialog = vi.fn(async () => ({ canceled: false, filePaths: [source] }))

    const result = await ipcMain._handlers.get('backup-import')(fakeEvent)
    expect(result.success).toBe(true)
    expect(result.wasEncrypted).toBe(false)
    expect(result.added.map((p) => p.name)).toEqual(['fresh'])
    expect(result.skipped.some((s) => s.reason === 'path already exists')).toBe(true)
    expect(result.configUpdated).toBe(true)
    expect(result.presetsAdded).toBe(1)

    // Current config values win; backup's missing keys are added.
    expect(storage.state.config.theme).toBe('light')
    expect(storage.state.config.newKey).toBe(true)
    expect(storage.state.projects).toHaveLength(2)
    expect(storage.state.presets.map((p) => p.id).sort()).toEqual(['p1', 'p2'])
    expect(window.webContents.send).toHaveBeenCalledWith('projects-updated', expect.any(Array))
  })

  test('backup-import decrypts an encrypted backup with the right password', async () => {
    const storage = makeStorageManager()
    setupBackupHandlers(storage, null, null)

    // Encrypt a bundle the same way backup-export would.
    const json = JSON.stringify({
      type: 'devlauncher-workspace-backup',
      version: 1,
      projects: [project('fresh')],
      config: {},
      presets: [],
      health: {},
    })
    const source = path.join(tempRoot, 'enc.json')
    fs.writeFileSync(source, JSON.stringify(encryptBundle(json, 'pw-123')))
    dialog.showOpenDialog = vi.fn(async () => ({ canceled: false, filePaths: [source] }))

    const wrong = await ipcMain._handlers.get('backup-import')(fakeEvent, 'wrong')
    expect(wrong.success).toBe(false)
    expect(wrong.error).toMatch(/password|decipher|auth/i)

    const right = await ipcMain._handlers.get('backup-import')(fakeEvent, 'pw-123')
    expect(right.success).toBe(true)
    expect(right.wasEncrypted).toBe(true)
    expect(right.added.map((p) => p.name)).toEqual(['fresh'])
    expect(storage.state.projects).toHaveLength(1)
  })

  test('backup-import rejects non-backup files', async () => {
    setupBackupHandlers(makeStorageManager(), null, null)
    const source = path.join(tempRoot, 'not-backup.json')
    fs.writeFileSync(source, JSON.stringify({ type: 'something-else', version: 1 }))
    dialog.showOpenDialog = vi.fn(async () => ({ canceled: false, filePaths: [source] }))

    const result = await ipcMain._handlers.get('backup-import')(fakeEvent)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not a DevLauncher/i)
  })

  test('backup-import reports a canceled open dialog', async () => {
    setupBackupHandlers(makeStorageManager(), null, null)
    dialog.showOpenDialog = vi.fn(async () => ({ canceled: true }))
    const result = await ipcMain._handlers.get('backup-import')(fakeEvent)
    expect(result).toEqual({ success: false, canceled: true })
  })

  test('mergeConfigAndPresets: current wins, presets added by id only', () => {
    const { config, configChanged, presetsToAdd } = mergeConfigAndPresets(
      { theme: 'light' },
      { theme: 'dark', extra: 1 },
      [{ id: 'a' }],
      [{ id: 'a' }, { id: 'b' }]
    )
    expect(config.theme).toBe('light')
    expect(config.extra).toBe(1)
    expect(configChanged).toBe(true)
    expect(presetsToAdd.map((p) => p.id)).toEqual(['b'])
  })
})
