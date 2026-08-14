import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }))

import StorageManager, { normalizePreset, PRESET_DEFAULT_COLOR } from '../StorageManager'

describe('StorageManager', () => {
  let tempDir
  let manager

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'))
    manager = new StorageManager(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('init creates data files with defaults', async () => {
    await manager.init()
    const projects = JSON.parse(await fs.readFile(path.join(tempDir, 'projects.json'), 'utf8'))
    expect(projects).toEqual([])
    const config = JSON.parse(await fs.readFile(path.join(tempDir, 'config.json'), 'utf8'))
    expect(config).toHaveProperty('theme')
    expect(config).toHaveProperty('terminal')
  })

  test('projects save/load roundtrip preserves normalized shape', async () => {
    await manager.init()
    const projects = [{ id: 'p1', name: 'Demo', path: 'C:/demo', startCommand: 'npm run dev', type: 'NODEJS', envVars: [] }]
    await manager.saveProjects(projects)
    const loaded = await manager.loadProjects()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe('p1')
    expect(loaded[0].name).toBe('Demo')
  })

  test('config save/load and updateConfig merge', async () => {
    await manager.init()
    await manager.updateConfig({ theme: 'light' })
    const loaded = await manager.loadConfig()
    expect(loaded.theme).toBe('light')
    await manager.updateConfig({ sidebarExpanded: false })
    const merged = await manager.loadConfig()
    expect(merged.theme).toBe('light')
    expect(merged.sidebarExpanded).toBe(false)
  })

  test('loadProjects rejects corrupt JSON instead of silently losing data', async () => {
    await manager.init()
    await fs.writeFile(path.join(tempDir, 'projects.json'), '{not valid json', 'utf8')
    await expect(manager.loadProjects()).rejects.toThrow()
  })

  test('loadProjects recovers the latest backup after corruption', async () => {
    await manager.init()
    await manager.saveProjects([{ id: 'recoverable', name: 'R', path: 'C:/r', startCommand: 'npm start', type: 'NODEJS', envVars: [] }])
    await manager.saveProjects([{ id: 'latest', name: 'L', path: 'C:/l', startCommand: 'npm start', type: 'NODEJS', envVars: [] }])
    await fs.writeFile(path.join(tempDir, 'projects.json'), '{broken json', 'utf8')

    const recovered = await manager.loadProjects()
    expect(recovered).toHaveLength(1)
    expect(recovered[0].id).toBe('recoverable')
    // The file is rewritten to valid JSON after recovery.
    expect(JSON.parse(await fs.readFile(path.join(tempDir, 'projects.json'), 'utf8'))).toHaveLength(1)
  })

  test('loadProjects recovers from backups when the file has an invalid shape', async () => {
    await manager.init()
    // Two saves: the first save backs up the (empty) initial file, the second
    // backs up the project itself — recovery returns that latest valid backup.
    await manager.saveProjects([{ id: 'recoverable', name: 'R', path: 'C:/r', startCommand: 'npm start', type: 'NODEJS', envVars: [] }])
    await manager.saveProjects([{ id: 'latest', name: 'L', path: 'C:/l', startCommand: 'npm start', type: 'NODEJS', envVars: [] }])
    await fs.writeFile(path.join(tempDir, 'projects.json'), '{}', 'utf8')

    const recovered = await manager.loadProjects()
    expect(recovered).toHaveLength(1)
    expect(recovered[0].id).toBe('recoverable')
  })

  test('concurrent updateProjects calls serialize through the queue', async () => {
    await manager.init()
    await Promise.all(
      Array.from({ length: 10 }, (_, index) => manager.updateProjects((projects) => ({
        projects: [...projects, { id: String(index), name: `P${index}`, path: `C:/p${index}`, startCommand: 'npm start', type: 'NODEJS', envVars: [] }],
      })))
    )
    const projects = await manager.loadProjects()
    expect(projects).toHaveLength(10)
    expect(new Set(projects.map((item) => item.id))).toEqual(new Set(Array.from({ length: 10 }, (_, index) => String(index))))
  })

  test('concurrent config updates merge without losing fields', async () => {
    await manager.init()
    await Promise.all([
      manager.updateConfig({ notifications: { sound: true } }),
      manager.updateConfig({ terminal: { maxLines: 2500 } }),
    ])
    const config = await manager.loadConfig()
    expect(config.notifications.sound).toBe(true)
    expect(config.terminal.maxLines).toBe(2500)
  })

  test('no stale .tmp files remain after recovery', async () => {
    await manager.init()
    await manager.saveProjects([{ id: 'a', name: 'A', path: 'C:/a', startCommand: 'npm start', type: 'NODEJS', envVars: [] }])
    await fs.writeFile(path.join(tempDir, 'projects.json'), '{broken', 'utf8')
    await manager.loadProjects()
    const entries = await fs.readdir(tempDir)
    expect(entries.some((entry) => entry.endsWith('.tmp'))).toBe(false)
  })

  test('loadActivities returns [] when the file is missing', async () => {
    await manager.init()
    expect(await manager.loadActivities()).toEqual([])
  })

  test('appendActivities persists and caps at 50 entries', async () => {
    await manager.init()
    const entries = Array.from({ length: 60 }, (_, index) => ({ type: 'faint', project: 'p', message: `m${index}` }))
    await manager.appendActivities(entries)
    const loaded = await manager.loadActivities()
    expect(loaded).toHaveLength(50)
    // Newest entries are prepended; the first 50 of 60 are kept.
    expect(loaded[0].message).toBe('m0')
    expect(loaded[49].message).toBe('m49')
    expect(loaded.some((entry) => entry.message === 'm59')).toBe(false)
  })

  test('presets are normalized, deduped, and invalid entries dropped', async () => {
    await manager.init()
    const saved = await manager.savePresets([
      { name: '  Stack A  ', projectIds: ['a', 'a', 'b'], startDelayMs: 999999, autoStart: true },
      { name: 'Stack B', projectIds: ['c'] },
      { name: '   ', projectIds: ['d'] },
      { projectIds: ['e'] },
      null,
    ])
    expect(saved).toHaveLength(2)
    expect(saved[0].name).toBe('Stack A')
    expect(saved[0].projectIds).toEqual(['a', 'b'])
    expect(saved[0].startDelayMs).toBe(60000) // clamped
    expect(saved[0].autoStart).toBe(true)
    expect(saved[0].color).toBe(PRESET_DEFAULT_COLOR)

    const loaded = await manager.loadPresets()
    expect(loaded).toHaveLength(2)
  })

  test('atomicWrite replaces the target file', async () => {
    await manager.init()
    const target = path.join(tempDir, 'atomic.json')
    await manager.atomicWrite(target, '{"v":1}')
    expect(JSON.parse(await fs.readFile(target, 'utf8'))).toEqual({ v: 1 })
  })

  test('normalizePreset clamps startDelayMs to the allowed range', () => {
    expect(normalizePreset({ name: 'x', startDelayMs: -5 }).startDelayMs).toBe(0)
    expect(normalizePreset({ name: 'x', startDelayMs: 500 }).startDelayMs).toBe(500)
    expect(normalizePreset({ name: 'x' }).startDelayMs).toBe(0)
    expect(normalizePreset(null)).toBeNull()
  })
})
