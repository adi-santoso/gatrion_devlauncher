import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { applyPendingReset } from '../resetData'

let tempDir

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devlauncher-reset-'))
})

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true })
})

const seed = (userData, { flag = true } = {}) => {
  fs.mkdirSync(path.join(userData, 'backups'), { recursive: true })
  fs.mkdirSync(path.join(userData, 'logs'), { recursive: true })
  fs.mkdirSync(path.join(userData, 'crashDumps'), { recursive: true })
  for (const file of ['projects.json', 'config.json', 'presets.json', 'activities.json', 'health.json']) {
    fs.writeFileSync(path.join(userData, file), '{}')
  }
  fs.writeFileSync(path.join(userData, 'backups', 'projects-2026.json'), '{}')
  fs.writeFileSync(path.join(userData, 'logs', 'main.log'), 'line')
  fs.writeFileSync(path.join(userData, 'crashDumps', 'crash.dmp'), 'x')
  if (flag) fs.writeFileSync(path.join(userData, '.reset-pending'), '1')
  // A file that must survive the reset (e.g. omp binary dir or unknown data)
  fs.writeFileSync(path.join(userData, 'keep.txt'), 'keep')
}

describe('applyPendingReset', () => {
  test('wipes all app data when the marker exists', async () => {
    seed(tempDir)
    const result = await applyPendingReset(tempDir)
    expect(result).toBe(true)
    for (const file of ['projects.json', 'config.json', 'presets.json', 'activities.json', 'health.json']) {
      expect(fs.existsSync(path.join(tempDir, file))).toBe(false)
    }
    for (const dir of ['backups', 'logs', 'crashDumps']) {
      expect(fs.existsSync(path.join(tempDir, dir))).toBe(false)
    }
    expect(fs.existsSync(path.join(tempDir, '.reset-pending'))).toBe(false)
    // Unrelated files survive
    expect(fs.readFileSync(path.join(tempDir, 'keep.txt'), 'utf8')).toBe('keep')
  })

  test('does nothing without the marker', async () => {
    seed(tempDir, { flag: false })
    const result = await applyPendingReset(tempDir)
    expect(result).toBe(false)
    expect(fs.existsSync(path.join(tempDir, 'projects.json'))).toBe(true)
    expect(fs.existsSync(path.join(tempDir, 'backups'))).toBe(true)
  })
})
