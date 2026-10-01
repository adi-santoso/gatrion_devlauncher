/**
 * VpsStore — persists VPS server metadata and the host-key trust store.
 *
 * Two files under userData:
 *   vps-servers.json   { schemaVersion, servers: VpsServer[] }  — no secrets
 *   vps-hostkeys.json  { [serverId]: VpsHostKeyInfo }           — trust-on-review
 *
 * Secrets live in a separate encrypted store (vpsCredentials.ts) and are never
 * written here, so registry export/backup can never leak credentials.
 */
import type { VpsHostKeyInfo, VpsServer, VpsServerInput } from '../../../src/types/vps'

const fs = require('fs').promises
const path = require('path')
const { app } = require('electron') as typeof import('electron')
const { randomUUID } = require('crypto')

const SCHEMA_VERSION = 1

interface ServerFile {
  schemaVersion: number
  servers: VpsServer[]
}

const DEFAULT_INPUT: Omit<VpsServer, 'id' | 'createdAt' | 'lastConnectedAt' | 'authRef'> = {
  name: '',
  host: '',
  port: 22,
  username: 'root',
  environment: 'development',
  policy: 'read-only',
  authKind: 'key',
  defaultCwd: '',
  tags: [],
}

export function normalizeServerInput(input: Partial<VpsServerInput>): VpsServerInput {
  const merged = { ...DEFAULT_INPUT, ...input } as VpsServerInput
  const name = String(merged.name || '').trim()
  const host = String(merged.host || '').trim()
  const username = String(merged.username || '').trim()
  const port = Number(merged.port)
  if (!name) throw new Error('Server name is required')
  if (!host || /\s/.test(host)) throw new Error('A valid host is required')
  if (!username || /\s/.test(username)) throw new Error('A valid username is required')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535')
  if (!['production', 'staging', 'development'].includes(merged.environment)) throw new Error('Invalid environment')
  if (!['agent-disabled', 'read-only', 'controlled'].includes(merged.policy)) throw new Error('Invalid policy')
  if (!['key', 'password', 'agent'].includes(merged.authKind)) throw new Error('Invalid auth kind')
  const defaultCwd = String(merged.defaultCwd || '').trim()
  if (defaultCwd && !defaultCwd.startsWith('/')) throw new Error('Default working directory must be an absolute path')
  return {
    name,
    host,
    port,
    username,
    environment: merged.environment,
    policy: merged.policy,
    authKind: merged.authKind,
    defaultCwd,
    tags: Array.isArray(merged.tags) ? merged.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20) : [],
  }
}

export class VpsStore {
  private serversPath: string
  private hostKeysPath: string

  constructor(userDataDir?: string) {
    const base = userDataDir || app.getPath('userData')
    this.serversPath = path.join(base, 'vps-servers.json')
    this.hostKeysPath = path.join(base, 'vps-hostkeys.json')
  }

  private async readJson<T>(filePath: string, fallback: T): Promise<T> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? (parsed as T) : fallback
    } catch {
      return fallback
    }
  }

  /** Atomic write: temp file + rename, so a crash never truncates the registry. */
  private async writeJson(filePath: string, value: unknown): Promise<void> {
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8')
    await fs.rename(tmp, filePath)
  }

  async loadServers(): Promise<VpsServer[]> {
    const file = await this.readJson<ServerFile>(this.serversPath, { schemaVersion: SCHEMA_VERSION, servers: [] })
    const servers = Array.isArray(file.servers) ? file.servers : []
    return servers.filter((s) => s && typeof s.id === 'string')
  }

  async getServer(id: string): Promise<VpsServer | null> {
    const servers = await this.loadServers()
    return servers.find((s) => s.id === id) || null
  }

  private async saveServers(servers: VpsServer[]): Promise<void> {
    await this.writeJson(this.serversPath, { schemaVersion: SCHEMA_VERSION, servers })
  }

  async addServer(input: Partial<VpsServerInput>): Promise<VpsServer> {
    const normalized = normalizeServerInput(input)
    const servers = await this.loadServers()
    if (servers.some((s) => s.name.toLowerCase() === normalized.name.toLowerCase())) {
      throw new Error(`A server named "${normalized.name}" already exists`)
    }
    const server: VpsServer = {
      ...normalized,
      id: randomUUID(),
      authRef: `vps:${randomUUID()}`,
      createdAt: new Date().toISOString(),
      lastConnectedAt: null,
    }
    servers.push(server)
    await this.saveServers(servers)
    return server
  }

  async updateServer(id: string, patch: Partial<VpsServerInput>): Promise<VpsServer> {
    const servers = await this.loadServers()
    const index = servers.findIndex((s) => s.id === id)
    if (index < 0) throw new Error(`Server ${id} not found`)
    const merged = normalizeServerInput({ ...servers[index], ...patch })
    if (servers.some((s) => s.id !== id && s.name.toLowerCase() === merged.name.toLowerCase())) {
      throw new Error(`A server named "${merged.name}" already exists`)
    }
    servers[index] = { ...servers[index], ...merged }
    await this.saveServers(servers)
    return servers[index]
  }

  async deleteServer(id: string): Promise<boolean> {
    const servers = await this.loadServers()
    const next = servers.filter((s) => s.id !== id)
    if (next.length === servers.length) return false
    await this.saveServers(next)
    await this.forgetHostKey(id)
    return true
  }

  async markConnected(id: string): Promise<void> {
    const servers = await this.loadServers()
    const index = servers.findIndex((s) => s.id === id)
    if (index < 0) return
    servers[index] = { ...servers[index], lastConnectedAt: new Date().toISOString() }
    await this.saveServers(servers)
  }

  // ── host key trust store ────────────────────────────────────────────────

  async getHostKey(serverId: string): Promise<VpsHostKeyInfo | null> {
    const map = await this.readJson<Record<string, VpsHostKeyInfo>>(this.hostKeysPath, {})
    return map[serverId] || null
  }

  async trustHostKey(serverId: string, info: Omit<VpsHostKeyInfo, 'trustedAt'>): Promise<VpsHostKeyInfo> {
    const map = await this.readJson<Record<string, VpsHostKeyInfo>>(this.hostKeysPath, {})
    const entry: VpsHostKeyInfo = { ...info, trustedAt: new Date().toISOString() }
    map[serverId] = entry
    await this.writeJson(this.hostKeysPath, map)
    return entry
  }

  async forgetHostKey(serverId: string): Promise<void> {
    const map = await this.readJson<Record<string, VpsHostKeyInfo>>(this.hostKeysPath, {})
    if (!(serverId in map)) return
    delete map[serverId]
    await this.writeJson(this.hostKeysPath, map)
  }
}

export default VpsStore
