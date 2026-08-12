import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import os from 'os'
import fs from 'fs'
import path from 'path'

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
}))

import StorageManager, { normalizePreset, PRESET_DEFAULT_COLOR } from '../StorageManager'

let tempDir
let storage

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gatrion-preset-'))
  storage = new StorageManager(tempDir)
})

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('normalizePreset (schema v2)', () => {
  test('migrates legacy v1 shape with v2 defaults', () => {
    const legacy = {
      id: 'preset-old',
      name: 'Full Stack',
      projectIds: ['a', 'b'],
      createdAt: '2024-01-01T00:00:00.000Z',
    }
    const preset = normalizePreset(legacy)
    expect(preset).toMatchObject({
      id: 'preset-old',
      name: 'Full Stack',
      projectIds: ['a', 'b'],
      description: '',
      color: PRESET_DEFAULT_COLOR,
      startDelayMs: 0,
      autoStart: false,
      createdAt: '2024-01-01T00:00:00.000Z',
    })
    expect(preset.updatedAt).toBeTruthy()
  })

  test('keeps valid v2 fields and sanitizes them', () => {
    const preset = normalizePreset({
      name: '  API Stack  ',
      description: '  backend + db  ',
      color: '#38BDF8',
      projectIds: ['db', 'api', 'db', ''],
      startDelayMs: 2500,
      autoStart: true,
    })
    expect(preset.name).toBe('API Stack')
    expect(preset.description).toBe('backend + db')
    expect(preset.color).toBe('#38BDF8')
    expect(preset.projectIds).toEqual(['db', 'api']) // deduped + empties dropped
    expect(preset.startDelayMs).toBe(2500)
    expect(preset.autoStart).toBe(true)
  })

  test('clamps startDelayMs to 0..60000 and rejects invalid colors', () => {
    expect(normalizePreset({ name: 'A', projectIds: [], startDelayMs: -5 }).startDelayMs).toBe(0)
    expect(normalizePreset({ name: 'A', projectIds: [], startDelayMs: 999999 }).startDelayMs).toBe(60000)
    expect(normalizePreset({ name: 'A', projectIds: [], startDelayMs: 'not-a-number' }).startDelayMs).toBe(0)
    expect(normalizePreset({ name: 'A', projectIds: [], color: 'blue' }).color).toBe(PRESET_DEFAULT_COLOR)
  })

  test('returns null for entries without a valid name', () => {
    expect(normalizePreset(null)).toBeNull()
    expect(normalizePreset({ name: '' })).toBeNull()
    expect(normalizePreset({ name: '   ' })).toBeNull()
  })
})

describe('StorageManager presets persistence', () => {
  test('roundtrips v2 fields through save + load', async () => {
    const input = [{
      id: 'preset-1',
      name: 'Dev Stack',
      description: 'daily stack',
      color: '#22C55E',
      projectIds: ['db', 'api', 'web'],
      startDelayMs: 3000,
      autoStart: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }]
    const saved = await storage.savePresets(input)
    expect(saved).toEqual(input)
    const loaded = await storage.loadPresets()
    expect(loaded).toEqual(input)
  })

  test('migrates a legacy presets.json file on load', async () => {
    const legacy = [{ id: 'p1', name: 'Old', projectIds: ['x', 'x'] }]
    await fs.promises.writeFile(path.join(tempDir, 'presets.json'), JSON.stringify(legacy))
    const loaded = await storage.loadPresets()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toMatchObject({ id: 'p1', name: 'Old', projectIds: ['x'], startDelayMs: 0, autoStart: false })
  })

  test('dedupes preset ids and drops invalid entries on save', async () => {
    const saved = await storage.savePresets([
      { id: 'dup', name: 'First', projectIds: ['a'] },
      { id: 'dup', name: 'Second', projectIds: ['b'] },
      { name: '', projectIds: ['c'] },
    ])
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('First')
  })

  test('returns [] when presets.json does not exist', async () => {
    expect(await storage.loadPresets()).toEqual([])
  })
})
