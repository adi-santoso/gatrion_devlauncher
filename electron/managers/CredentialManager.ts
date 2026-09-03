const fs = require('fs').promises
const path = require('path')
const { app, safeStorage } = require('electron') as typeof import('electron')
import Logger from '../utils/logger'
const log = Logger || { info() {}, warn() {}, error() {} }

interface StoredCredentials {
  /** Origin (protocol + host + port) → list of saved credentials. */
  [origin: string]: Array<{ username: string; password: string }>
}

/**
 * Manages saved credentials for the embedded preview.
 * Passwords are encrypted at rest via `safeStorage.encryptString`.
 * The file is stored outside projects.json so backup/export never includes
 * credentials (they are local to the machine).
 */
class CredentialManager {
  private filePath: string
  private cache: StoredCredentials | null = null

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'preview-credentials.json')
  }

  private async load(): Promise<StoredCredentials> {
    if (this.cache) return this.cache
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Record<string, string>
      const result: StoredCredentials = {}
      for (const [origin, encrypted] of Object.entries(parsed)) {
        if (!encrypted || typeof encrypted !== 'string') continue
        try {
          const decrypted = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
          result[origin] = JSON.parse(decrypted)
        } catch {
          // Corrupted entry — skip
          log.warn('[Credentials] Failed to decrypt entry for', origin)
        }
      }
      this.cache = result
      return result
    } catch {
      this.cache = {}
      return this.cache
    }
  }

  private async save(data: StoredCredentials): Promise<void> {
    this.cache = data
    const encrypted: Record<string, string> = {}
    for (const [origin, entries] of Object.entries(data)) {
      if (!entries.length) continue
      encrypted[origin] = safeStorage.encryptString(JSON.stringify(entries)).toString('base64')
    }
    await fs.writeFile(this.filePath, JSON.stringify(encrypted, null, 2), 'utf-8')
  }

  /** Get saved credentials for an origin. Returns empty array if none. */
  async getCredentials(origin: string): Promise<Array<{ username: string; password: string }>> {
    const data = await this.load()
    return data[origin] || []
  }

  /** Save or update a credential for an origin. */
  async saveCredential(origin: string, username: string, password: string): Promise<void> {
    const data = await this.load()
    const list = data[origin] || []
    const existing = list.findIndex((c) => c.username === username)
    if (existing >= 0) {
      list[existing] = { username, password }
    } else {
      list.push({ username, password })
    }
    data[origin] = list
    await this.save(data)
  }

  /** Remove a specific credential. */
  async removeCredential(origin: string, username: string): Promise<void> {
    const data = await this.load()
    if (!data[origin]) return
    data[origin] = data[origin].filter((c) => c.username !== username)
    if (!data[origin].length) delete data[origin]
    await this.save(data)
  }

  /** Remove all credentials for an origin. */
  async removeAll(origin: string): Promise<void> {
    const data = await this.load()
    delete data[origin]
    await this.save(data)
  }
}

export default CredentialManager
export type { CredentialManager }