import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { ipcMain, dialog, shell, __reset } = createRequire(import.meta.url)('electron')

import { setupAgentHandlers } from '../agentHandlers'

const fakeEvent = { senderFrame: { url: 'http://localhost:5173/' } }

let tempDir

function makeOmpManager(sessions = []) {
  return {
    _sessions: sessions,
    on: vi.fn(),
    getStatus: vi.fn(async () => ({ installed: true, configured: true, version: '1.2.3' })),
    getSessions: vi.fn(() => sessions),
    getAllSessions: vi.fn(() => sessions),
    createSession: vi.fn(async (projectId, title) => ({ id: 's1', title, tokens: 0 })),
    deleteSession: vi.fn(async () => true),
    touchSession: vi.fn(async (projectId, sessionId, meta) => ({ id: sessionId, ...meta })),
    chat: vi.fn(async () => ({ sessionId: 's1', session: { id: 's1' } })),
    steer: vi.fn(async () => true),
    abort: vi.fn(async () => true),
    ensureRpc: vi.fn(async () => true),
    switchToSession: vi.fn(async () => true),
    getMessages: vi.fn(async () => [{ role: 'user', content: 'hi' }]),
    getAvailableModels: vi.fn(async () => ({ models: ['claude-sonnet-4'] })),
    setModel: vi.fn(async () => true),
    setThinkingLevel: vi.fn(async () => true),
    getState: vi.fn(async () => ({ state: 'ready' })),
    compact: vi.fn(async () => true),
    setAutoCompaction: vi.fn(async () => true),
    setAutoRetry: vi.fn(async () => true),
    abortRetry: vi.fn(async () => true),
    setFastMode: vi.fn(async () => true),
    getAvailableCommands: vi.fn(async () => ['/help', '/compact']),
    branch: vi.fn(async () => ({ branchId: 'b1' })),
    getBranchMessages: vi.fn(async () => []),
    setSubagentSubscription: vi.fn(async () => true),
    getSubagents: vi.fn(async () => []),
    handoff: vi.fn(async () => true),
    bash: vi.fn(async () => ({ exitCode: 0, stdout: 'ok' })),
    abortBash: vi.fn(async () => true),
    getBinaryPath: vi.fn(() => null),
  }
}

function makeInstaller() {
  return {
    on: vi.fn(),
    install: vi.fn(async () => ({ status: 'installed' })),
    getState: vi.fn(() => ({ status: 'installed' })),
    fetchLatestRelease: vi.fn(async () => ({ version: '2.0.0', size: 1000 })),
  }
}

function makeOmpConfig() {
  return {
    getConfig: vi.fn(async () => ({ providers: [] })),
    saveProvider: vi.fn(async () => ({ success: true })),
    deleteProvider: vi.fn(async () => ({ success: true })),
    setDefaultModel: vi.fn(async () => ({ success: true })),
  }
}

function makeWindow() {
  return { isDestroyed: () => false, webContents: { send: vi.fn() } }
}

function register(overrides = {}) {
  const ompManager = overrides.ompManager || makeOmpManager()
  const installer = overrides.installer || makeInstaller()
  const ompConfig = overrides.ompConfig || makeOmpConfig()
  const window = overrides.window || makeWindow()
  setupAgentHandlers(ompManager, installer, ompConfig, () => window)
  return { ompManager, installer, ompConfig, window }
}

beforeEach(() => {
  __reset()
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-handlers-'))
})

describe('agentHandlers — status & sessions', () => {
  test('omp-status reports manager state', async () => {
    const { ompManager } = register()
    const result = await ipcMain._handlers.get('omp-status')(fakeEvent)
    expect(result).toMatchObject({ success: true, installed: true, configured: true })
    expect(ompManager.getStatus).toHaveBeenCalled()
  })

  test('omp-list-sessions / omp-list-all-sessions return session lists', async () => {
    const { ompManager } = register({ ompManager: makeOmpManager([{ id: 's1', title: 'A' }]) })
    expect(await ipcMain._handlers.get('omp-list-sessions')(fakeEvent, 'p1')).toEqual({
      success: true,
      sessions: [{ id: 's1', title: 'A' }],
    })
    expect(await ipcMain._handlers.get('omp-list-all-sessions')(fakeEvent)).toEqual({
      success: true,
      sessions: [{ id: 's1', title: 'A' }],
    })
    expect(ompManager.getSessions).toHaveBeenCalledWith('p1')
  })

  test('omp-create-session and omp-delete-session delegate', async () => {
    const { ompManager } = register()
    const created = await ipcMain._handlers.get('omp-create-session')(fakeEvent, 'p1', 'New chat')
    expect(created.success).toBe(true)
    expect(ompManager.createSession).toHaveBeenCalledWith('p1', 'New chat')

    await ipcMain._handlers.get('omp-delete-session')(fakeEvent, 'p1', 's1')
    expect(ompManager.deleteSession).toHaveBeenCalledWith('p1', 's1')
  })

  test('omp-update-session-tokens validates tokens and persists cost', async () => {
    const { ompManager } = register()
    const ok = await ipcMain._handlers.get('omp-update-session-tokens')(fakeEvent, 'p1', 's1', 3500, 0.015)
    expect(ok.success).toBe(true)
    expect(ompManager.touchSession).toHaveBeenCalledWith('p1', 's1', { tokens: 3500, cost: 0.015 })

    const badTokens = await ipcMain._handlers.get('omp-update-session-tokens')(fakeEvent, 'p1', 's1', -5)
    expect(badTokens.success).toBe(false)
    expect(badTokens.error).toMatch(/>=\s*0/)

    const badCost = await ipcMain._handlers.get('omp-update-session-tokens')(fakeEvent, 'p1', 's1', 10, -1)
    expect(badCost.success).toBe(false)
  })

  test('omp-rename-session requires a title and delegates', async () => {
    const { ompManager } = register()
    const ok = await ipcMain._handlers.get('omp-rename-session')(fakeEvent, 'p1', 's1', '  Tidy name  ')
    expect(ok.success).toBe(true)
    expect(ompManager.touchSession).toHaveBeenCalledWith('p1', 's1', { title: 'Tidy name' })

    const missing = await ipcMain._handlers.get('omp-rename-session')(fakeEvent, 'p1', 's1', '   ')
    expect(missing.success).toBe(false)
    expect(missing.error).toMatch(/required/)
  })

  test('omp-toggle-pin flips the pinned flag', async () => {
    const { ompManager } = register({ ompManager: makeOmpManager([{ id: 's1', pinned: false }]) })
    const ok = await ipcMain._handlers.get('omp-toggle-pin')(fakeEvent, 'p1', 's1')
    expect(ok.success).toBe(true)
    expect(ompManager.touchSession).toHaveBeenCalledWith('p1', 's1', { pinned: true })

    ompManager.getSessions.mockReturnValue([])
    const missing = await ipcMain._handlers.get('omp-toggle-pin')(fakeEvent, 'p1', 's1')
    expect(missing.success).toBe(false)
    expect(missing.error).toMatch(/not found/)
  })
})

describe('agentHandlers — chat & RPC', () => {
  test('omp-chat sends text and optional images', async () => {
    const { ompManager } = register()
    const ok = await ipcMain._handlers.get('omp-chat')(fakeEvent, 'p1', tempDir, 'hello', {
      sessionId: 's1',
      images: [{ type: 'image', data: 'aGk=', mimeType: 'image/png' }],
    })
    expect(ok.success).toBe(true)
    expect(ompManager.chat).toHaveBeenCalledWith('p1', tempDir, 'hello', {
      sessionId: 's1',
      sessionPath: null,
      images: [{ type: 'image', data: 'aGk=', mimeType: 'image/png' }],
    })
  })

  test('omp-chat rejects empty messages and bad images', async () => {
    const { ompManager } = register()
    const handler = ipcMain._handlers.get('omp-chat')
    expect((await handler(fakeEvent, 'p1', tempDir, '   ')).error).toMatch(/required/)
    expect((await handler(fakeEvent, 'p1', tempDir, 'x', { images: [{ type: 'file' }] })).error).toMatch(/Invalid image/)
    expect((await handler(fakeEvent, 'p1', tempDir, 'x', { images: new Array(9).fill({ type: 'image', data: 'a', mimeType: 'image/png' }) })).error).toMatch(/At most 8/)
    expect(ompManager.chat).not.toHaveBeenCalled()
  })

  test('omp-steer, omp-abort and omp-abort-retry delegate', async () => {
    const { ompManager } = register()
    await ipcMain._handlers.get('omp-steer')(fakeEvent, 'p1', tempDir, 'continue')
    expect(ompManager.steer).toHaveBeenCalledWith('p1', tempDir, 'continue')

    await ipcMain._handlers.get('omp-abort')(fakeEvent, 'p1', tempDir)
    expect(ompManager.abort).toHaveBeenCalledWith('p1', tempDir)

    await ipcMain._handlers.get('omp-abort-retry')(fakeEvent, 'p1', tempDir)
    expect(ompManager.abortRetry).toHaveBeenCalled()
  })

  test('omp-get-messages switches session and returns messages', async () => {
    const { ompManager } = register()
    const result = await ipcMain._handlers.get('omp-get-messages')(fakeEvent, 'p1', tempDir, { sessionPath: '/tmp/s.json' })
    expect(result.success).toBe(true)
    expect(ompManager.ensureRpc).toHaveBeenCalledWith('p1', tempDir)
    expect(ompManager.switchToSession).toHaveBeenCalledWith('p1', '/tmp/s.json')
  })

  test('omp-get-models normalizes both array and { models } shapes', async () => {
    const { ompManager } = register()
    ompManager.getAvailableModels.mockResolvedValueOnce(['a', 'b'])
    expect((await ipcMain._handlers.get('omp-get-models')(fakeEvent, 'p1')).models).toEqual(['a', 'b'])
    ompManager.getAvailableModels.mockResolvedValueOnce({ models: ['c'] })
    expect((await ipcMain._handlers.get('omp-get-models')(fakeEvent, 'p1')).models).toEqual(['c'])
  })

  test('omp-set-model and omp-set-thinking-level validate their args', async () => {
    const { ompManager } = register()
    await ipcMain._handlers.get('omp-set-model')(fakeEvent, 'p1', tempDir, 'anthropic', 'claude-sonnet-4')
    expect(ompManager.setModel).toHaveBeenCalledWith('p1', tempDir, 'anthropic', 'claude-sonnet-4')

    expect((await ipcMain._handlers.get('omp-set-model')(fakeEvent, 'p1', tempDir, '', 'x')).error).toMatch(/required/)

    const badLevel = await ipcMain._handlers.get('omp-set-thinking-level')(fakeEvent, 'p1', tempDir, 'extreme')
    expect(badLevel.success).toBe(false)
    expect(badLevel.error).toMatch(/Invalid thinking level/)
  })

  test('state/config toggles delegate to the manager', async () => {
    const { ompManager } = register()
    const h = ipcMain._handlers
    expect((await h.get('omp-get-state')(fakeEvent, 'p1', tempDir)).state).toEqual({ state: 'ready' })
    await h.get('omp-compact')(fakeEvent, 'p1', tempDir, 'summarize')
    expect(ompManager.compact).toHaveBeenCalledWith('p1', tempDir, 'summarize')
    await h.get('omp-set-auto-compaction')(fakeEvent, 'p1', tempDir, true)
    expect(ompManager.setAutoCompaction).toHaveBeenCalledWith('p1', tempDir, true)
    await h.get('omp-set-auto-retry')(fakeEvent, 'p1', tempDir, false)
    expect(ompManager.setAutoRetry).toHaveBeenCalledWith('p1', tempDir, false)
    await h.get('omp-set-fast-mode')(fakeEvent, 'p1', tempDir, true)
    expect(ompManager.setFastMode).toHaveBeenCalledWith('p1', tempDir, true)
    const commands = await h.get('omp-get-commands')(fakeEvent, 'p1', tempDir)
    expect(commands.commands).toEqual(['/help', '/compact'])
  })

  test('branch/subagent channels validate entryId and level', async () => {
    register()
    const h = ipcMain._handlers
    expect((await h.get('omp-branch')(fakeEvent, 'p1', tempDir, '')).error).toMatch(/required/)

    const badLevel = await h.get('omp-set-subagent-subscription')(fakeEvent, 'p1', tempDir, 'always')
    expect(badLevel.success).toBe(false)
    expect(badLevel.error).toMatch(/Invalid subscription level/)

    expect((await h.get('omp-get-branch-messages')(fakeEvent, 'p1', tempDir)).success).toBe(true)
    expect((await h.get('omp-get-subagents')(fakeEvent, 'p1', tempDir)).success).toBe(true)
  })

  test('omp-handoff and omp-bash validate and delegate', async () => {
    const { ompManager } = register()
    const h = ipcMain._handlers
    expect((await h.get('omp-handoff')(fakeEvent, 'p1', tempDir, '  ')).error).toMatch(/required/)

    await h.get('omp-handoff')(fakeEvent, 'p1', tempDir, 'hand over now')
    expect(ompManager.handoff).toHaveBeenCalledWith('p1', tempDir, 'hand over now')

    const bash = await h.get('omp-bash')(fakeEvent, 'p1', tempDir, 'npm test')
    expect(bash.success).toBe(true)
    expect(ompManager.bash).toHaveBeenCalledWith('p1', tempDir, 'npm test')
    expect((await h.get('omp-bash')(fakeEvent, 'p1', tempDir, '  ')).error).toMatch(/required/)

    await h.get('omp-abort-bash')(fakeEvent, 'p1', tempDir)
    expect(ompManager.abortBash).toHaveBeenCalled()
  })

  test('omp-export-conversation writes markdown via the save dialog', async () => {
    register()
    const target = path.join(tempDir, 'conv.md')
    dialog.showSaveDialog = vi.fn(async () => ({ canceled: false, filePath: target }))
    const result = await ipcMain._handlers.get('omp-export-conversation')(fakeEvent, 'p1', tempDir, null, 'My chat')
    expect(result.success).toBe(true)
    expect(result.canceled).toBe(false)
    expect(fs.existsSync(target)).toBe(true)
    expect(fs.readFileSync(target, 'utf8')).toContain('My chat')

    dialog.showSaveDialog = vi.fn(async () => ({ canceled: true }))
    const canceled = await ipcMain._handlers.get('omp-export-conversation')(fakeEvent, 'p1', tempDir)
    expect(canceled).toEqual({ success: true, canceled: true })
  })
})

describe('agentHandlers — installer & config', () => {
  test('omp-install / omp-install-state / omp-check-update', async () => {
    const { installer } = register()
    expect(await ipcMain._handlers.get('omp-install')(fakeEvent)).toEqual({ success: true, status: 'installed' })
    expect(await ipcMain._handlers.get('omp-install-state')(fakeEvent)).toEqual({ success: true, status: 'installed' })
    expect(await ipcMain._handlers.get('omp-check-update')(fakeEvent)).toEqual({ success: true, latest: '2.0.0', size: 1000 })
    expect(installer.install).toHaveBeenCalled()
  })

  test('omp-config channels read/save/delete/set-default', async () => {
    const { ompConfig } = register()
    const h = ipcMain._handlers
    expect((await h.get('omp-config-get')(fakeEvent)).providers).toEqual([])

    await h.get('omp-config-save-provider')(fakeEvent, { name: 'openrouter' })
    expect(ompConfig.saveProvider).toHaveBeenCalledWith({ name: 'openrouter' })

    expect((await h.get('omp-config-save-provider')(fakeEvent, { name: 'x'.repeat(61) })).error).toMatch(/too long/)

    await h.get('omp-config-delete-provider')(fakeEvent, 'openrouter')
    expect(ompConfig.deleteProvider).toHaveBeenCalledWith('openrouter')

    await h.get('omp-config-set-default')(fakeEvent, 'claude-sonnet-4')
    expect(ompConfig.setDefaultModel).toHaveBeenCalledWith('claude-sonnet-4')
  })

  test('omp-run-setup requires an installed binary', async () => {
    register()
    const result = await ipcMain._handlers.get('omp-run-setup')(fakeEvent)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not installed/)
  })

  test('omp-open-docs opens the docs site', async () => {
    register()
    shell.openExternal = vi.fn(async () => {})
    await ipcMain._handlers.get('omp-open-docs')(fakeEvent)
    expect(shell.openExternal).toHaveBeenCalledWith('https://omp.sh/docs/providers')
  })
})
