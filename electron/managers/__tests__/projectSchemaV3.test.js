import { describe, test, expect } from 'vitest'
import {
  normalizeProject,
  sanitizeProjectChanges,
  validateProject,
  redactSensitiveEnv,
  isSensitiveKey,
  toRendererProject,
  envVarsToObject,
} from '../../projectSchema'

const base = {
  id: 'p1',
  name: 'App',
  path: 'C:/projects/app',
  type: 'NODEJS',
  startCommand: 'npm start',
  port: 3000,
}

describe('project schema v3 (tags / customCommands / dependsOn)', () => {
  test('normalizeProject keeps valid tags, custom commands, and dependencies', () => {
    const project = normalizeProject({
      ...base,
      tags: ['frontend', 'frontend', '  api  ', ''],
      customCommands: [
        { id: 'cc1', label: 'Seed DB', command: 'npm run seed' },
        { id: 'cc2', label: '', command: '' },
      ],
      dependsOn: ['db', 'db', ''],
    })
    expect(project.tags).toEqual(['frontend', 'api'])
    expect(project.customCommands).toEqual([{ id: 'cc1', label: 'Seed DB', command: 'npm run seed' }])
    expect(project.dependsOn).toEqual(['db'])
  })

  test('validateProject accepts v3 fields', () => {
    const project = validateProject(normalizeProject({
      ...base,
      tags: ['frontend'],
      customCommands: [{ id: 'cc1', label: 'Lint', command: 'npm run lint' }],
      dependsOn: ['db'],
    }))
    expect(project.schemaVersion).toBe(3)
  })

  test('sanitizeProjectChanges rejects malformed tags', () => {
    expect(() => sanitizeProjectChanges({ tags: ['ok', ''] })).toThrow(/non-empty string/)
    expect(() => sanitizeProjectChanges({ tags: 'frontend' })).toThrow(/array/)
  })

  test('sanitizeProjectChanges rejects malformed custom commands', () => {
    expect(() => sanitizeProjectChanges({ customCommands: [{ id: 'cc1', label: '', command: 'x' }] })).toThrow(/label is required/)
    expect(() => sanitizeProjectChanges({ customCommands: [{ id: '', label: 'x', command: 'y' }] })).toThrow(/id is required/)
    expect(() => sanitizeProjectChanges({ customCommands: [{ id: 'cc1', label: 'x', command: '' }] })).toThrow(/Custom command is required/)
  })

  test('sanitizeProjectChanges rejects malformed dependsOn', () => {
    expect(() => sanitizeProjectChanges({ dependsOn: ['db', 3] })).toThrow(/non-empty string/)
  })

  test('validateProject rejects duplicate ports across commands', () => {
    // The top-level port is the source of truth for the primary command, so the
    // duplicate here is between the primary (8000) and the assets command (8000).
    expect(() => validateProject(normalizeProject({
      ...base,
      port: 8000,
      commands: [
        { id: 'app', name: 'Laravel', command: 'php artisan serve', port: 8000, primary: true },
        { id: 'assets', name: 'Assets', command: 'npm run dev', port: 8000, primary: false },
      ],
    }))).toThrow(/Duplicate project command port: 8000/)
  })

  test('normalizeType keeps REACT distinct from REACT_VITE', () => {
    expect(normalizeProject({ ...base, type: 'REACT' }).type).toBe('REACT')
    expect(normalizeProject({ ...base, type: 'REACT_VITE' }).type).toBe('REACT_VITE')
    // Legacy plain-label "React" data predates the REACT type and maps to Vite
    expect(normalizeProject({ ...base, type: 'React' }).type).toBe('REACT_VITE')
  })

  test('sanitizeProjectChanges accepts valid v3 fields', () => {
    const changes = sanitizeProjectChanges({
      tags: ['frontend'],
      customCommands: [{ id: 'cc1', label: 'Lint', command: 'npm run lint' }],
      dependsOn: ['db'],
    })
    expect(changes).toEqual({
      tags: ['frontend'],
      customCommands: [{ id: 'cc1', label: 'Lint', command: 'npm run lint' }],
      dependsOn: ['db'],
    })
  })
})

describe('legacy migration (pre-v3 shapes)', () => {
  test('migrates a legacy project with emoji type, env object and string port', () => {
    const migrated = validateProject(normalizeProject({
      id: 'legacy-id',
      name: ' Legacy App ',
      path: ' C:/projects/legacy ',
      type: '⚛️ React (Vite)',
      port: '5173',
      command: ' npm run dev ',
      env: { NODE_ENV: 'development', PORT: 5173 },
      icon: '⚛️',
      color: '#61DAFB',
    }))
    expect(migrated.type).toBe('REACT_VITE')
    expect(migrated.port).toBe(5173)
    expect(migrated.startCommand).toBe('npm run dev')
    expect(migrated.envVars).toEqual([
      { key: 'NODE_ENV', value: 'development' },
      { key: 'PORT', value: '5173' },
    ])
    expect(envVarsToObject(migrated.envVars)).toEqual({ NODE_ENV: 'development', PORT: '5173' })
    expect(migrated.commands).toEqual([
      { id: 'main', name: 'Application', command: 'npm run dev', port: 5173, primary: true },
    ])
  })

  test('empty port normalizes to null and sanitize passes null through', () => {
    const withoutPort = validateProject(normalizeProject({ ...base, port: null }))
    expect(withoutPort.port).toBeNull()
    expect(normalizeProject({ ...base, port: '' }).port).toBeNull()
    expect(sanitizeProjectChanges({ port: null })).toEqual({ port: null })
  })

  test('composite commands require exactly one primary', () => {
    const composite = validateProject(normalizeProject({
      ...base,
      commands: [
        { id: 'app', name: 'Laravel', command: 'php artisan serve', port: 8000, primary: true },
        { id: 'assets', name: 'Frontend assets', command: 'npm run dev', port: 5173, primary: false },
      ],
      startCommand: 'php artisan serve',
      port: 8000,
    }))
    expect(composite.commands).toHaveLength(2)
    expect(composite.startCommand).toBe('php artisan serve')
    expect(() => validateProject({
      ...composite,
      commands: composite.commands.map((item) => ({ ...item, primary: true })),
    })).toThrow(/exactly one primary/)
  })

  test('sanitize rejects unsupported fields and out-of-range ports', () => {
    expect(() => sanitizeProjectChanges({ commands: [{ id: 'app', name: 'App', command: 'npm start', pid: 1 }] }))
      .toThrow(/Unsupported project command field: pid/)
    expect(() => sanitizeProjectChanges({ id: 'changed' })).toThrow(/Unsupported project field: id/)
    expect(() => sanitizeProjectChanges({ type: 'React (Vite)' })).toThrow(/Project type is invalid/)
    expect(() => sanitizeProjectChanges({ port: '5173' })).toThrow(/Port must be an integer/)
    expect(() => validateProject({ ...base, port: 70000 })).toThrow(/Port must be an integer/)
    const withCommands = validateProject(normalizeProject({ ...base, commands: [{ id: 'main', name: 'App', command: 'npm start', primary: true }] }))
    expect(() => validateProject({ ...withCommands, envVars: [{ key: 'BAD KEY', value: '' }] }))
      .toThrow(/Invalid environment variable name/)
  })
})

describe('sensitive env redaction', () => {
  test('isSensitiveKey detects secret-looking names', () => {
    expect(isSensitiveKey('API_KEY')).toBe(true)
    expect(isSensitiveKey('DB_PASSWORD')).toBe(true)
    expect(isSensitiveKey('DATABASE_URL')).toBe(true)
    expect(isSensitiveKey('NODE_ENV')).toBe(false)
    expect(isSensitiveKey('PORT')).toBe(false)
  })

  test('redactSensitiveEnv marks sensitive array entries as unchanged secrets', () => {
    const redacted = redactSensitiveEnv([
      { key: 'NODE_ENV', value: 'development' },
      { key: 'DB_PASSWORD', value: 'hunter2' },
    ])
    expect(redacted[0]).toEqual({ key: 'NODE_ENV', value: 'development' })
    expect(redacted[1]).toEqual({ key: 'DB_PASSWORD', value: '', secret: true, unchanged: true })
  })

  test('toRendererProject never leaks secret values', () => {
    const project = validateProject(normalizeProject({
      ...base,
      envVars: [
        { key: 'PORT', value: '3000' },
        { key: 'SECRET_TOKEN', value: 'supersecret' },
      ],
    }))
    const rendererProject = toRendererProject(project)
    const secret = rendererProject.envVars.find((item) => item.key === 'SECRET_TOKEN')
    expect(secret.value).toBe('')
    expect(secret.secret).toBe(true)
  })
})
