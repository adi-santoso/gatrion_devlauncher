const { ipcMain, shell } = require('electron')
const fs = require('fs')
const { assertTrustedIpcEvent } = require('../utils/ipcSecurity')

const MAX_MESSAGE = 20000

function assertProjectPath(cwd) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new Error('Project path is required')
  if (!fs.existsSync(cwd)) throw new Error('Project path does not exist')
  return cwd
}

function assertSessionId(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw new Error('Session ID is required')
  return sessionId
}

function setupAgentHandlers(ompManager, installer, getWindow) {
  const safeSend = (channel, ...args) => {
    try {
      const win = getWindow()
      if (win && !win.isDestroyed() && win.webContents) win.webContents.send(channel, ...args)
    } catch { /* window gone */ }
  }

  // Forward omp RPC events (streaming text, tool cards, approvals) to the renderer
  ompManager.on('event', ({ projectId, event }) => {
    safeSend('omp-event', { projectId, event })
  })
  installer.on('progress', (state) => {
    safeSend('omp-install-progress', state)
  })

  const secureHandle = (channel, handler) => ipcMain.handle(channel, async (event, ...args) => {
    try {
      assertTrustedIpcEvent(event)
      return await handler(event, ...args)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  secureHandle('omp-status', async () => ({ success: true, ...(await ompManager.getStatus()) }))

  secureHandle('omp-list-sessions', async (event, projectId) => {
    assertSessionId(projectId)
    return { success: true, sessions: ompManager.getSessions(projectId) }
  })

  secureHandle('omp-create-session', async (event, projectId, title) => {
    assertSessionId(projectId)
    const session = await ompManager.createSession(projectId, typeof title === 'string' ? title.slice(0, 80) : '')
    return { success: true, session }
  })

  secureHandle('omp-delete-session', async (event, projectId, sessionId) => {
    assertSessionId(projectId)
    assertSessionId(sessionId)
    await ompManager.deleteSession(projectId, sessionId)
    return { success: true }
  })

  secureHandle('omp-chat', async (event, projectId, cwd, message, options = {}) => {
    assertSessionId(projectId)
    assertProjectPath(cwd)
    if (typeof message !== 'string' || !message.trim()) throw new Error('Message is required')
    if (message.length > MAX_MESSAGE) throw new Error('Message is too long')
    const result = await ompManager.chat(projectId, cwd, message.slice(0, MAX_MESSAGE), {
      sessionId: options.sessionId || null,
      sessionPath: options.sessionPath || null,
    })
    return { success: true, sessionId: result.sessionId, session: result.session }
  })

  secureHandle('omp-steer', async (event, projectId, cwd, message) => {
    assertSessionId(projectId)
    assertProjectPath(cwd)
    if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE) throw new Error('Invalid message')
    await ompManager.steer(projectId, cwd, message.slice(0, MAX_MESSAGE))
    return { success: true }
  })

  secureHandle('omp-abort', async (event, projectId, cwd) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    await ompManager.abort(projectId, cwd || process.env.USERPROFILE || '')
    return { success: true }
  })

  secureHandle('omp-get-messages', async (event, projectId, cwd, options = {}) => {
    assertSessionId(projectId)
    assertProjectPath(cwd)
    await ompManager.ensureRpc(projectId, cwd)
    if (options.sessionPath) {
      await ompManager.switchToSession(projectId, options.sessionPath)
    }
    const messages = await ompManager.getMessages(projectId, cwd)
    return { success: true, messages }
  })

  secureHandle('omp-get-models', async (event, projectId, cwd) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    const data = await ompManager.getAvailableModels(projectId, cwd || process.env.USERPROFILE || '')
    return { success: true, models: data }
  })

  secureHandle('omp-set-model', async (event, projectId, cwd, provider, modelId) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    if (typeof provider !== 'string' || typeof modelId !== 'string' || !provider || !modelId) throw new Error('Provider and model are required')
    await ompManager.setModel(projectId, cwd || process.env.USERPROFILE || '', provider, modelId)
    return { success: true }
  })

  // --- Installer -----------------------------------------------------------

  secureHandle('omp-install', async () => {
    const state = await installer.install()
    return { success: state.status === 'installed', ...state }
  })

  secureHandle('omp-install-state', async () => {
    const state = installer.getState()
    return { success: true, ...state }
  })

  secureHandle('omp-check-update', async () => {
    const release = await installer.fetchLatestRelease()
    return { success: true, latest: release.version, size: release.size }
  })

  secureHandle('omp-open-docs', async () => {
    shell.openExternal('https://omp.sh/docs/providers')
    return { success: true }
  })
}

module.exports = { setupAgentHandlers }
