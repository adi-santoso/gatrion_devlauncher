import type { Project } from '../../src/types/shared'

const crypto = require('crypto')
import { migrateProjects, normalizeProject, validateProject } from '../projectSchema'
import { normalizePathKey } from './pathKey'

const BACKUP_TYPE = 'devlauncher-workspace-backup'
const BACKUP_VERSION = 1

interface BackupBundle {
  app: string
  type: string
  version: number
  exportedAt: string
  appVersion: string | null
  hasSecrets: boolean
  projects: Array<Record<string, any>>
  config: Record<string, any>
  presets: Array<Record<string, any>>
  health: Record<string, any>
}

interface EncryptedPayload {
  version: number
  encrypted: true
  salt: string
  iv: string
  tag: string
  data: string
}

interface MergeResult {
  projects: Project[]
  added: Project[]
  skipped: Array<{ name: string; reason: string }>
}

/**
 * Assemble a full workspace backup payload: projects (with env values, since
 * this is a recovery bundle), config, presets and health analytics.
 */
function buildBundle(input: {
  projects: Array<Record<string, any>>
  config: Record<string, any>
  presets: Array<Record<string, any>>
  health: Record<string, any>
  appVersion?: string
}): BackupBundle {
  const { projects, config, presets, health, appVersion } = input
  return {
    app: 'devlauncher',
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: appVersion || null,
    hasSecrets: Array.isArray(projects)
      && projects.some((project) => (project.envVars || []).some((env: Record<string, any>) => env.value)),
    projects: Array.isArray(projects) ? projects : [],
    config: config || {},
    presets: Array.isArray(presets) ? presets : [],
    health: health && typeof health === 'object' ? health : { projects: {} },
  }
}

/**
 * Encrypt a JSON string with AES-256-GCM (scrypt-derived key from the
 * password). Output is portable base64 — safe to email or store in the cloud.
 */
function encryptBundle(json: string, password: string): EncryptedPayload {
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(password, salt, 32)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    version: BACKUP_VERSION,
    encrypted: true,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64'),
  }
}

/**
 * Decrypt an encrypted bundle payload back to the original JSON string.
 * Throws on wrong password or tampered data.
 */
function decryptBundle(payload: { salt: string; iv: string; tag: string; data: string }, password: string): string {
  const key = crypto.scryptSync(password, Buffer.from(payload.salt, 'base64'), 32)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

/**
 * Parse a backup file into its inner bundle JSON, handling both plaintext
 * (JSON) and encrypted (wrapper object) formats.
 */
function parseBackupFile(text: string, password?: string): { parsed: Record<string, any>; wasEncrypted: boolean } {
  const trimmed = (text || '').trim()
  if (!trimmed) throw new Error('Backup file is empty')
  let first
  try {
    first = JSON.parse(trimmed)
  } catch {
    throw new Error('Backup file is not valid JSON')
  }
  if (first && first.encrypted === true) {
    if (!password) throw new Error('This backup is encrypted — enter the password to import it')
    const json = decryptBundle(first, password)
    try {
      return { parsed: JSON.parse(json), wasEncrypted: true }
    } catch {
      throw new Error('Backup contents are corrupted after decryption')
    }
  }
  return { parsed: first, wasEncrypted: false }
}

/**
 * Validate a parsed bundle: right type + version, usable arrays/objects.
 */
function validateBundle(parsed: Record<string, any>): Record<string, any> {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Backup file does not contain a bundle object')
  }
  if (parsed.type !== BACKUP_TYPE) {
    throw new Error('File is not a DevLauncher workspace backup')
  }
  if (!Number.isInteger(parsed.version) || parsed.version > BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${parsed.version}`)
  }
  return parsed
}

/**
 * Merge incoming projects into the current registry (no overwrites): each
 * incoming project is normalized/validated, skipped when its path or name
 * already exists. Returns { projects, added, skipped }.
 */
function mergeProjects(
  currentProjects: Array<Record<string, any>>,
  incoming: Array<Record<string, any>>
): MergeResult {
  const migrated = migrateProjects(Array.isArray(incoming) ? incoming : [], incoming?.[0]?.schemaVersion)
  const candidates = migrated.map((project: Record<string, any>) => {
    try {
      return { project: validateProject(normalizeProject(project, crypto.randomUUID)), error: null }
    } catch (error: any) {
      return { project: null, error: `${project?.name || '(unnamed)'}: ${error.message}` }
    }
  })

  const next: Project[] = [...(currentProjects as Project[])]
  const existingPaths = new Set(next.map((project) => normalizePathKey(project.path)))
  const existingNames = new Set(next.map((project) => project.name.toLowerCase()))
  const added: Project[] = []
  const skipped: Array<{ name: string; reason: string }> = []

  for (const { project, error } of candidates) {
    if (!project) {
      skipped.push({ name: error, reason: 'invalid' })
      continue
    }
    const normPath = normalizePathKey(project.path)
    if (existingPaths.has(normPath)) {
      skipped.push({ name: project.name, reason: 'path already exists' })
      continue
    }
    if (existingNames.has(project.name.toLowerCase())) {
      skipped.push({ name: project.name, reason: 'name already exists' })
      continue
    }
    existingPaths.add(normPath)
    existingNames.add(project.name.toLowerCase())
    next.push(project)
    added.push(project)
  }
  return { projects: next, added, skipped }
}

export {
  BACKUP_TYPE,
  BACKUP_VERSION,
  buildBundle,
  encryptBundle,
  decryptBundle,
  parseBackupFile,
  validateBundle,
  mergeProjects,
}

