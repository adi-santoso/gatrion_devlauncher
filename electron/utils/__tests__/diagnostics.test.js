import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { buildDiagnosticsBundle } from '../../handlers/systemHandlers'

describe('buildDiagnosticsBundle', () => {
  let tempDir

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'diag-test-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('collects config, health, redacted projects and the main.log tail', async () => {
    await fs.writeFile(path.join(tempDir, 'config.json'), JSON.stringify({ theme: 'dark' }), 'utf8')
    await fs.writeFile(path.join(tempDir, 'health.json'), JSON.stringify({ crashes: [] }), 'utf8')
    await fs.writeFile(path.join(tempDir, 'projects.json'), JSON.stringify([
      {
        id: 'p1',
        name: 'Demo',
        envVars: [
          { key: 'NODE_ENV', value: 'production' },
          { key: 'DB_PASSWORD', value: 'supersecret_123' },
        ],
      },
    ]), 'utf8')
    const logLines = Array.from({ length: 600 }, (_, index) => `line ${index}`)
    await fs.mkdir(path.join(tempDir, 'logs'), { recursive: true })
    await fs.writeFile(path.join(tempDir, 'logs', 'main.log'), logLines.join('\n'), 'utf8')

    const bundle = await buildDiagnosticsBundle({ userDataPath: tempDir, version: '1.0.0', meta: { platform: 'win32' } })

    expect(bundle.app.version).toBe('1.0.0')
    expect(bundle.app.platform).toBe('win32')
    expect(bundle.config).toEqual({ theme: 'dark' })
    expect(bundle.health).toEqual({ crashes: [] })

    // Secret env values must never leave the machine.
    expect(JSON.stringify(bundle.projects).includes('supersecret_123')).toBe(false)
    expect(bundle.projects[0].envVars[0]).toEqual({ key: 'NODE_ENV', value: 'production' })
    expect(bundle.projects[0].envVars[1]).toMatchObject({ key: 'DB_PASSWORD', value: '', secret: true, unchanged: true })

    // main.log tail is capped to the last 500 lines.
    const lines = bundle.mainLog.split('\n')
    expect(lines).toHaveLength(500)
    expect(lines[0]).toBe('line 100')
    expect(lines[lines.length - 1]).toBe('line 599')
  })

  test('handles missing files gracefully', async () => {
    const bundle = await buildDiagnosticsBundle({ userDataPath: tempDir, version: '0.0.0' })
    expect(bundle.config).toBeNull()
    expect(bundle.health).toBeNull()
    expect(bundle.projects).toBeNull()
    expect(bundle.mainLog).toBe('')
  })

  test('skips corrupt JSON files instead of failing the whole bundle', async () => {
    await fs.writeFile(path.join(tempDir, 'config.json'), '{broken', 'utf8')
    const bundle = await buildDiagnosticsBundle({ userDataPath: tempDir, version: '0.0.0' })
    expect(bundle.config).toBeNull()
    expect(bundle.generatedAt).toBeTruthy()
  })
})
