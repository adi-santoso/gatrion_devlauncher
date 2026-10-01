/**
 * VpsCredentialStore — SSH secrets encrypted at rest with Electron
 * `safeStorage`, in a file separate from the server registry so backups and
 * diagnostics never carry credentials. Mirrors the preview CredentialManager
 * pattern but keeps its own store (the roadmap explicitly forbids mixing the
 * preview credential store).
 *
 * Secrets are decrypted only inside the SSH transport and are never returned
 * over IPC (the renderer can only learn whether a credential exists).
 */
const fs = require('fs').promises
const path = require('path')
const { app, safeStorage } = require('electron') as typeof import('electron')
import Logger from '../../utils/logger'

const log = Logger || { info() {}, warn() {}, error() {} }

export interface VpsSecret {
  kind: 'key' | 'password' | 'agent'
  /** OpenSSH/PEM private key text (kind: 'key'). */
  privateKey?: string
  /** Key passphrase (kind: 'key'). */
  passphrase?: string
  /** Login password (kind: 'password'). */
  password?: string
}

/** Strip anything we would never persist. */
export function sanitizeSecret(input: Partial<VpsSecret>): VpsSecret {
  const kind = input.kind
  if (kind !== 'key' && kind !== 'password' && kind !== 'agent') throw new Error('Invalid credential kind')
  if (kind === 'key') {
    const privateKey = typeof input.privateKey === 'string' ? input.privateKey.trim() : ''
    if (!privateKey.includes('PRIVATE KEY')) throw new Error('A valid private key is required')
    return {
      kind,
      privateKey,
      ...(input.passphrase ? { passphrase: String(input.passphrase) } : {}),
    }
  }
  if (kind === 'password') {
    const password = typeof input.password === 'string' ? input.password : ''
    if (!password) throw new Error('Password is required')
    return { kind, password }
  }
  return { kind: 'agent' }
}

export class VpsCredentialStore {
  private filePath: string

  constructor(userDataDir?: string) {
    const base = userDataDir || app.getPath('userData')
    this.filePath = path.join(base, 'vps-credentials.json')
  }

  private async readRaw(): Promise<Record<string, string>> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
    } catch {
      return {}
    }
  }

  private async writeRaw(map: Record<string, string>): Promise<void> {
    const tmp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`
    await fs.writeFile(tmp, JSON.stringify(map, null, 2), 'utf-8')
    await fs.rename(tmp, this.filePath)
  }

  /** Persist (or replace) the credential behind an opaque auth reference. */
  async set(authRef: string, secret: Partial<VpsSecret>): Promise<void> {
    if (!authRef) throw new Error('authRef is required')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('OS credential encryption is unavailable')
    const clean = sanitizeSecret(secret)
    const map = await this.readRaw()
    map[authRef] = safeStorage.encryptString(JSON.stringify(clean)).toString('base64')
    await this.writeRaw(map)
  }

  /** Decrypt the credential for the transport. Never expose this to a renderer. */
  async get(authRef: string): Promise<VpsSecret | null> {
    if (!authRef) return null
    const map = await this.readRaw()
    const encoded = map[authRef]
    if (!encoded) return null
    try {
      const decrypted = safeStorage.decryptString(Buffer.from(encoded, 'base64'))
      return JSON.parse(decrypted) as VpsSecret
    } catch {
      log.warn('[VpsCredentials] Failed to decrypt credential entry')
      return null
    }
  }

  async has(authRef: string): Promise<boolean> {
    if (!authRef) return false
    const map = await this.readRaw()
    return Boolean(map[authRef])
  }

  async delete(authRef: string): Promise<void> {
    const map = await this.readRaw()
    if (!(authRef in map)) return
    delete map[authRef]
    await this.writeRaw(map)
  }
}

export default VpsCredentialStore
