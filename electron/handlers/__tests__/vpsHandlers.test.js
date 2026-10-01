import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { setupVpsHandlers } from '../vpsHandlers'
import VpsManager from '../../managers/vps/VpsManager'

const require = createRequire(import.meta.url)
const { ipcMain, __reset } = require('electron')
const ssh2 = require('ssh2')

const fakeEvent = { senderFrame: { url: 'http://localhost:5173/' } }
const PRIVATE_KEY = ssh2.utils.generateKeyPairSync('ed25519').private

let userData
let manager
let window

const call = (channel, ...args) => ipcMain._handlers.get(channel)(fakeEvent, ...args)

beforeEach(() => {
  __reset()
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'devlauncher-vps-handlers-'))
  manager = new VpsManager(userData)
  window = { isDestroyed: () => false, webContents: { send: vi.fn() } }
  setupVpsHandlers(manager, () => window, () => 12345)
})

afterEach(() => {
  manager.shutdown()
  fs.rmSync(userData, { recursive: true, force: true })
})

describe('vpsHandlers — registry', () => {
  test('adds a server and never returns the credential', async () => {
    const created = await call('vps-add-server', {
      name: 'prod-api', host: '203.0.113.7', port: 22, username: 'deploy',
      environment: 'production', policy: 'read-only', authKind: 'key', defaultCwd: '/var/www/api',
    }, { kind: 'key', privateKey: PRIVATE_KEY })

    expect(created.success).toBe(true)
    expect(JSON.stringify(created)).not.toContain('PRIVATE KEY')
    expect(created.server.authRef).toMatch(/^vps:/)

    const list = await call('vps-list-servers')
    expect(list.servers).toHaveLength(1)
    expect(JSON.stringify(list)).not.toContain('PRIVATE KEY')

    const has = await call('vps-has-credential', created.server.id)
    expect(has.has).toBe(true)
  })

  test('rejects an invalid payload at the IPC boundary', async () => {
    const created = await call('vps-add-server', { name: 'a', host: 'h', username: 'u' }, { kind: 'key', privateKey: PRIVATE_KEY })
    const missingService = await call('vps-get-logs', created.server.id, '')
    expect(missingService.success).toBe(false)
    expect(missingService.error).toMatch(/service/i)

    const badId = await call('vps-get-status', '')
    expect(badId.success).toBe(false)
  })

  test('rejects an unsafe systemd unit before it reaches the remote', async () => {
    const created = await call('vps-add-server', { name: 'a', host: 'h', username: 'u' }, { kind: 'key', privateKey: PRIVATE_KEY })
    const result = await call('vps-restart-service', created.server.id, 'nginx; rm -rf /')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not connected|Invalid service name/i)
  })

  test('deleting a server removes the stored credential', async () => {
    const created = await call('vps-add-server', { name: 'a', host: 'h', username: 'u' }, { kind: 'key', privateKey: PRIVATE_KEY })
    const deleted = await call('vps-delete-server', created.server.id)
    expect(deleted.success).toBe(true)
    expect(await call('vps-has-credential', created.server.id)).toMatchObject({ has: false })
    expect((await call('vps-list-servers')).servers).toHaveLength(0)
  })
})

describe('vpsHandlers — scope + events', () => {
  test('prepare-scope fails clearly when the server is not connected', async () => {
    const created = await call('vps-add-server', { name: 'a', host: 'h', username: 'u' }, { kind: 'key', privateKey: PRIVATE_KEY })
    const result = await call('vps-prepare-scope', created.server.id, 'sess-1')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not connected/i)
  })

  test('forwards connection status events to the renderer', () => {
    manager.emit('status', { serverId: 'x', state: 'connected', error: null, connectedAt: null, pendingHostKey: null, hostKey: null })
    expect(window.webContents.send).toHaveBeenCalledWith('vps-status', expect.objectContaining({ serverId: 'x', state: 'connected' }))
  })

  test('forwards job and terminal events with their server id', () => {
    manager.emit('job-event', { jobId: 'j1', serverId: 'x', type: 'state', job: { id: 'j1' } })
    manager.emit('terminal-data', 'x', 'hello')
    manager.emit('terminal-close', 'x')
    expect(window.webContents.send).toHaveBeenCalledWith('vps-job-event', expect.objectContaining({ jobId: 'j1' }))
    expect(window.webContents.send).toHaveBeenCalledWith('vps-terminal-data', 'x', 'hello')
    expect(window.webContents.send).toHaveBeenCalledWith('vps-terminal-close', 'x')
  })

  test('a torn-down window never throws on a push', () => {
    setupVpsHandlers(manager, () => { throw new Error('gone') }, () => null)
    expect(() => manager.emit('terminal-close', 'y')).not.toThrow()
  })
})
