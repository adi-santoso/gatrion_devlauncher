import { describe, test, expect } from 'vitest'
import {
  BACKUP_TYPE,
  buildBundle,
  encryptBundle,
  decryptBundle,
  parseBackupFile,
  validateBundle,
  mergeProjects,
} from '../workspaceBackup'

const project = (name, extra = {}) => ({
  id: `id-${name}`,
  name,
  path: `C:/projects/${name}`,
  type: 'NODEJS',
  startCommand: 'npm run dev',
  commands: [{ id: 'main', name: 'dev', command: 'npm run dev', primary: true }],
  envVars: [],
  port: null,
  ...extra,
})

describe('workspaceBackup (pure)', () => {
  test('buildBundle marks hasSecrets when a project carries env values', () => {
    const plain = buildBundle({ projects: [project('a')], config: {}, presets: [], health: {} })
    expect(plain.type).toBe(BACKUP_TYPE)
    expect(plain.version).toBe(1)
    expect(plain.hasSecrets).toBe(false)

    const withSecret = buildBundle({
      projects: [project('b', { envVars: [{ key: 'KEY', value: 'secret' }] })],
      config: {},
      presets: [],
      health: {},
    })
    expect(withSecret.hasSecrets).toBe(true)
  })

  test('encrypt/decrypt roundtrip preserves the JSON', () => {
    const json = JSON.stringify({ hello: 'world', n: 42 })
    const payload = encryptBundle(json, 'correct horse battery staple')
    expect(payload.encrypted).toBe(true)
    expect(payload.data).not.toContain('world')
    expect(decryptBundle(payload, 'correct horse battery staple')).toBe(json)
  })

  test('decrypt rejects a wrong password', () => {
    const payload = encryptBundle('secret-content', 'right')
    expect(() => decryptBundle(payload, 'wrong')).toThrow()
  })

  test('encrypt produces a different ciphertext every time (random IV/salt)', () => {
    const a = encryptBundle('same', 'pw')
    const b = encryptBundle('same', 'pw')
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.data).not.toBe(b.data)
  })

  test('parseBackupFile reads plaintext and encrypted bundles', () => {
    const plain = parseBackupFile(JSON.stringify({ type: BACKUP_TYPE, version: 1 }))
    expect(plain.wasEncrypted).toBe(false)
    expect(plain.parsed.type).toBe(BACKUP_TYPE)

    const encrypted = encryptBundle(JSON.stringify({ type: BACKUP_TYPE, version: 1 }), 'pw')
    expect(() => parseBackupFile(JSON.stringify(encrypted))).toThrow(/encrypted/i)
    const parsed = parseBackupFile(JSON.stringify(encrypted), 'pw')
    expect(parsed.wasEncrypted).toBe(true)
    expect(parsed.parsed.type).toBe(BACKUP_TYPE)
  })

  test('parseBackupFile rejects empty and non-JSON input', () => {
    expect(() => parseBackupFile('')).toThrow(/empty/i)
    expect(() => parseBackupFile('not json')).toThrow(/not valid JSON/i)
  })

  test('validateBundle enforces type and version', () => {
    expect(() => validateBundle({ type: 'something-else', version: 1 })).toThrow(/not a DevLauncher/i)
    expect(() => validateBundle({ type: BACKUP_TYPE, version: 999 })).toThrow(/Unsupported backup version/i)
    expect(validateBundle({ type: BACKUP_TYPE, version: 1 }).type).toBe(BACKUP_TYPE)
  })

  test('mergeProjects adds new projects and skips duplicates', () => {
    const current = [project('existing', { path: 'C:/projects/existing' })]
    const incoming = [
      project('existing', { path: 'C:/projects/other' }), // same name → skipped
      project('dup-path', { path: 'C:/projects/existing' }), // same path → skipped
      project('fresh'),
      { name: 'broken', path: 42, commands: [] }, // invalid → skipped
    ]
    const { projects, added, skipped } = mergeProjects(current, incoming)
    expect(projects).toHaveLength(2)
    expect(added.map((p) => p.name)).toEqual(['fresh'])
    expect(skipped.map((s) => s.reason)).toEqual(
      expect.arrayContaining(['name already exists', 'path already exists', 'invalid'])
    )
  })
})
