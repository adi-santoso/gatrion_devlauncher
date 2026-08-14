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
