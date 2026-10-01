/**
 * VPS IPC handlers — the renderer's only route to VpsManager.
 *
 * Nothing here ever returns SSH secrets: the renderer can learn whether a
 * credential exists, but the key/password/passphrase never crosses the IPC
 * boundary (they are decrypted inside the transport only).
 */
import type { BrowserWindow } from 'electron'
import type { IpcHandler } from '../utils/ipcValidation'
import type { VpsManager } from '../managers/vps/VpsManager'
import type { VpsJobEvent, VpsServerStatus } from '../../src/types/vps'

const { ipcMain } = require('electron') as typeof import('electron')
import { assertTrustedIpcEvent } from '../utils/ipcSecurity'
import { safeHandle } from '../utils/ipcValidation'
import { writeScopedOmpConfig, type VpsScope } from '../managers/vps/vpsScopes'

const MAX_COMMAND = 8000
const MAX_SECRET_TEXT = 64 * 1024

function localScopeUrl(port: number, scopeId: string): string {
  return `http://127.0.0.1:${port}/mcp/${scopeId}`
}

export function setupVpsHandlers(
  vpsManager: VpsManager,
  getWindow: () => BrowserWindow | null | undefined,
  getMcpPort: () => number | null,
): void {
  const safeSend = (channel: string, ...args: unknown[]): void => {
    try {
      const win = getWindow()
      if (win && !win.isDestroyed() && win.webContents) win.webContents.send(channel, ...args)
    } catch { /* window gone */ }
  }

  vpsManager.on('status', (status: VpsServerStatus) => safeSend('vps-status', status))
  vpsManager.on('job-event', (event: VpsJobEvent) => safeSend('vps-job-event', event))
  vpsManager.on('terminal-data', (serverId: string, chunk: string) => safeSend('vps-terminal-data', serverId, chunk))
  vpsManager.on('terminal-close', (serverId: string) => safeSend('vps-terminal-close', serverId))

  const secureHandle = (channel: string, handler: IpcHandler): void =>
    safeHandle(ipcMain, assertTrustedIpcEvent, channel, handler)

  const assertId = (value: unknown, field = 'serverId'): string => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`)
    return value
  }

  // ── registry ───────────────────────────────────────────────────────────
  secureHandle('vps-list-servers', async () => ({ success: true, servers: await vpsManager.listServers() }))

  secureHandle('vps-add-server', async (_event, input, secret) => {
    const server = await vpsManager.addServer(input || {}, secret || undefined)
    return { success: true, server }
  })

  secureHandle('vps-update-server', async (_event, serverId, patch) => {
    assertId(serverId)
    const server = await vpsManager.updateServer(serverId, patch || {})
    return { success: true, server }
  })

  secureHandle('vps-delete-server', async (_event, serverId) => {
    assertId(serverId)
    await vpsManager.deleteServer(serverId)
    return { success: true }
  })

  secureHandle('vps-set-credential', async (_event, serverId, secret) => {
    assertId(serverId)
    if (secret && typeof secret === 'object') {
      const key = (secret as { privateKey?: unknown }).privateKey
      if (typeof key === 'string' && key.length > MAX_SECRET_TEXT) throw new Error('Private key is too large')
    }
    await vpsManager.setCredential(serverId, secret || {})
    return { success: true }
  })

  secureHandle('vps-has-credential', async (_event, serverId) => {
    assertId(serverId)
    return { success: true, has: await vpsManager.hasCredential(serverId) }
  })

  // ── connection ─────────────────────────────────────────────────────────
  secureHandle('vps-test-connection', async (_event, input, secret) => {
    const result = await vpsManager.testConnection(input || {}, secret || null)
    return { success: result.success, result }
  })

  secureHandle('vps-connect', async (_event, serverId, trustedFingerprint) => {
    assertId(serverId)
    const fingerprint = typeof trustedFingerprint === 'string' && trustedFingerprint ? trustedFingerprint : undefined
    const status = await vpsManager.connect(serverId, fingerprint)
    return { success: true, status }
  })

  secureHandle('vps-disconnect', async (_event, serverId) => {
    assertId(serverId)
    vpsManager.disconnect(serverId)
    return { success: true }
  })

  secureHandle('vps-trust-host-key', async (_event, serverId, fingerprint) => {
    assertId(serverId)
    if (typeof fingerprint !== 'string' || !fingerprint) throw new Error('fingerprint is required')
    const status = await vpsManager.trustHostKey(serverId, fingerprint)
    return { success: true, status }
  })

  secureHandle('vps-forget-host-key', async (_event, serverId) => {
    assertId(serverId)
    await vpsManager.forgetHostKey(serverId)
    return { success: true }
  })

  secureHandle('vps-get-status', async (_event, serverId) => {
    assertId(serverId)
    return { success: true, status: vpsManager.getStatus(serverId) }
  })

  // ── structured read + control ──────────────────────────────────────────
  secureHandle('vps-overview', async (_event, serverId) => {
    assertId(serverId)
    return { success: true, overview: await vpsManager.getOverview(serverId) }
  })

  secureHandle('vps-list-services', async (_event, serverId) => {
    assertId(serverId)
    return { success: true, services: await vpsManager.listServices(serverId) }
  })

  secureHandle('vps-get-logs', async (_event, serverId, service, lines) => {
    assertId(serverId)
    if (typeof service !== 'string' || !service.trim()) throw new Error('service is required')
    const count = Number.isInteger(lines) ? (lines as number) : 200
    return { success: true, ...(await vpsManager.getLogs(serverId, service, count)) }
  })

  secureHandle('vps-restart-service', async (_event, serverId, service) => {
    assertId(serverId)
    if (typeof service !== 'string' || !service.trim()) throw new Error('service is required')
    const result = await vpsManager.restartService(serverId, service)
    return { success: true, ...result }
  })

  secureHandle('vps-exec', async (_event, serverId, options) => {
    assertId(serverId)
    const opts = (options || {}) as { command?: unknown; cwd?: unknown; timeoutMs?: unknown; mutating?: unknown; sessionId?: unknown }
    if (typeof opts.command !== 'string' || !opts.command.trim()) throw new Error('command is required')
    if (opts.command.length > MAX_COMMAND) throw new Error('command is too long')
    const { job } = await vpsManager.execute(serverId, {
      command: opts.command,
      cwd: typeof opts.cwd === 'string' ? opts.cwd : '',
      timeoutMs: Number.isInteger(opts.timeoutMs) ? (opts.timeoutMs as number) : undefined,
      mutating: opts.mutating === true,
      origin: 'user',
      sessionId: typeof opts.sessionId === 'string' ? opts.sessionId : null,
      waitMs: 0,
    })
    return { success: true, job }
  })

  // ── jobs ───────────────────────────────────────────────────────────────
  secureHandle('vps-list-jobs', async (_event, serverId, limit) => {
    assertId(serverId)
    const count = Number.isInteger(limit) ? (limit as number) : 20
    return { success: true, jobs: vpsManager.listJobs(serverId, count) }
  })

  secureHandle('vps-get-job', async (_event, jobId, serverId) => {
    assertId(jobId, 'jobId')
    const job = vpsManager.getJob(jobId, typeof serverId === 'string' ? serverId : undefined)
    return job ? { success: true, job } : { success: false, error: 'Job not found' }
  })

  secureHandle('vps-cancel-job', async (_event, jobId) => {
    assertId(jobId, 'jobId')
    return { success: true, ...vpsManager.cancelJob(jobId) }
  })

  // ── terminal ───────────────────────────────────────────────────────────
  secureHandle('vps-terminal-open', async (_event, serverId, cols, rows) => {
    assertId(serverId)
    const width = Number.isInteger(cols) ? Math.min(Math.max(cols as number, 1), 500) : 80
    const height = Number.isInteger(rows) ? Math.min(Math.max(rows as number, 1), 500) : 24
    return { success: true, ...(await vpsManager.openTerminal(serverId, { cols: width, rows: height })) }
  })

  secureHandle('vps-terminal-input', async (_event, serverId, data) => {
    assertId(serverId)
    if (typeof data !== 'string') throw new Error('data must be a string')
    return { success: vpsManager.writeTerminal(serverId, data) }
  })

  secureHandle('vps-terminal-resize', async (_event, serverId, cols, rows) => {
    assertId(serverId)
    return { success: vpsManager.resizeTerminal(serverId, Number(cols) || 80, Number(rows) || 24) }
  })

  secureHandle('vps-terminal-close', async (_event, serverId) => {
    assertId(serverId)
    vpsManager.closeTerminal(serverId)
    return { success: true }
  })

  // ── agent session scope (F0 §11.2) ─────────────────────────────────────
  secureHandle('vps-prepare-scope', async (_event, serverId, sessionId) => {
    assertId(serverId)
    assertId(sessionId, 'sessionId')
    const port = getMcpPort()
    const scope: VpsScope | null = vpsManager.createScope(serverId, sessionId)
    if (!scope) throw new Error('Server is not connected')
    if (!port) {
      throw new Error('Enable Agent control in Settings before starting a VPS chat')
    }
    writeScopedOmpConfig(scope, localScopeUrl(port, scope.scopeId))
    return { success: true, scopeId: scope.scopeId, contextDir: scope.contextDir, scoped: true }
  })
}
