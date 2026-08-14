const { ipcMain, shell, dialog } = require('electron')
const fs = require('fs')
const { spawn } = require('child_process')
const { assertTrustedIpcEvent } = require('../utils/ipcSecurity')
const { safeHandle } = require('../utils/ipcValidation')
const { messagesToMarkdown } = require('../utils/messagesToMarkdown')

const MAX_MESSAGE = 20000
const MAX_INSTRUCTIONS = 2000

function assertProjectPath(cwd) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new Error('Project path is required')
  if (!fs.existsSync(cwd)) throw new Error('Project path does not exist')
  return cwd
}

function assertSessionId(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw new Error('Session ID is required')
  return sessionId
}

function setupAgentHandlers(ompManager, installer, ompConfig, getWindow) {
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

  const secureHandle = (channel, handler) => safeHandle(ipcMain, assertTrustedIpcEvent, channel, handler)

  secureHandle('omp-status', async () => ({ success: true, ...(await ompManager.getStatus()) }))

  secureHandle('omp-list-sessions', async (event, projectId) => {
    assertSessionId(projectId)
    return { success: true, sessions: ompManager.getSessions(projectId) }
  })

  // All sessions across every project (workspace-wide search in the palette).
  secureHandle('omp-list-all-sessions', async () => {
    return { success: true, sessions: ompManager.getAllSessions() }
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

  secureHandle('omp-update-session-tokens', async (event, projectId, sessionId, tokens) => {
    assertSessionId(projectId)
    if (typeof sessionId !== 'string' || !sessionId.trim()) throw new Error('Session ID is required')
    const count = Number(tokens)
    if (!Number.isInteger(count) || count < 0) throw new Error('Tokens must be a non-negative integer')
    const session = await ompManager.touchSession(projectId, sessionId, { tokens: count })
    if (!session) throw new Error('Session not found')
    return { success: true, session }
  })

  secureHandle('omp-rename-session', async (event, projectId, sessionId, title) => {
    assertSessionId(projectId)
    assertSessionId(sessionId)
    const cleanTitle = String(title || '').trim().slice(0, 80)
    if (!cleanTitle) throw new Error('Title is required')
    const session = await ompManager.touchSession(projectId, sessionId, { title: cleanTitle })
    return { success: true, session }
  })

  // omp RPC ImageContent: { type: 'image', data: <base64>, mimeType: 'image/png' }
  const MAX_IMAGES = 8
  const MAX_IMAGE_BASE64 = 12 * 1024 * 1024
  function assertImages(images) {
    if (images === undefined || images === null) return []
    if (!Array.isArray(images)) throw new Error('Images must be an array')
    if (images.length > MAX_IMAGES) throw new Error(`At most ${MAX_IMAGES} images per message`)
    for (const image of images) {
      if (!image || image.type !== 'image') throw new Error('Invalid image attachment')
      if (typeof image.mimeType !== 'string' || !image.mimeType.startsWith('image/')) throw new Error('Invalid image mime type')
      if (typeof image.data !== 'string' || !image.data || image.data.length > MAX_IMAGE_BASE64) throw new Error('Invalid image data')
    }
    return images.map(({ type, data, mimeType }) => ({ type, data, mimeType }))
  }

  secureHandle('omp-chat', async (event, projectId, cwd, message, options = {}) => {
    assertSessionId(projectId)
    assertProjectPath(cwd)
    const text = typeof message === 'string' ? message.trim() : ''
    const images = assertImages(options.images)
    if (!text && images.length === 0) throw new Error('Message is required')
    if (text.length > MAX_MESSAGE) throw new Error('Message is too long')
    const result = await ompManager.chat(projectId, cwd, text.slice(0, MAX_MESSAGE), {
      sessionId: options.sessionId || null,
      sessionPath: options.sessionPath || null,
      images,
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
    // get_available_models resolves to { models: [...] } — normalize to a flat
    // array so the renderer always receives `models` as a list.
    const list = Array.isArray(data) ? data : (data?.models || [])
    return { success: true, models: list }
  })

  secureHandle('omp-set-model', async (event, projectId, cwd, provider, modelId) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    if (typeof provider !== 'string' || typeof modelId !== 'string' || !provider || !modelId) throw new Error('Provider and model are required')
    await ompManager.setModel(projectId, cwd || process.env.USERPROFILE || '', provider, modelId)
    return { success: true }
  })

  const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

  secureHandle('omp-set-thinking-level', async (event, projectId, cwd, level) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    if (!THINKING_LEVELS.includes(level)) throw new Error('Invalid thinking level')
    await ompManager.setThinkingLevel(projectId, cwd || process.env.USERPROFILE || '', level)
    return { success: true }
  })

  secureHandle('omp-get-state', async (event, projectId, cwd) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    const state = await ompManager.getState(projectId, cwd || process.env.USERPROFILE || '')
    return { success: true, state }
  })

  secureHandle('omp-compact', async (event, projectId, cwd, customInstructions) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    const instructions = typeof customInstructions === 'string' ? customInstructions.slice(0, 2000) : undefined
    await ompManager.compact(projectId, cwd || process.env.USERPROFILE || '', instructions)
    return { success: true }
  })

  secureHandle('omp-set-auto-compaction', async (event, projectId, cwd, enabled) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    await ompManager.setAutoCompaction(projectId, cwd || process.env.USERPROFILE || '', Boolean(enabled))
    return { success: true }
  })

  secureHandle('omp-set-auto-retry', async (event, projectId, cwd, enabled) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    await ompManager.setAutoRetry(projectId, cwd || process.env.USERPROFILE || '', Boolean(enabled))
    return { success: true }
  })

  secureHandle('omp-abort-retry', async (event, projectId, cwd) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    await ompManager.abortRetry(projectId, cwd || process.env.USERPROFILE || '')
    return { success: true }
  })

  secureHandle('omp-set-fast-mode', async (event, projectId, cwd, enabled) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    await ompManager.setFastMode(projectId, cwd || process.env.USERPROFILE || '', Boolean(enabled))
    return { success: true }
  })

  secureHandle('omp-get-commands', async (event, projectId, cwd) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    const commands = await ompManager.getAvailableCommands(projectId, cwd || process.env.USERPROFILE || '')
    return { success: true, commands }
  })

  // --- Tier 2: export, branch, subagents, handoff, pin --------------------

  // Export the canonical omp transcript (paged, so long conversations are
  // never silently truncated) as Markdown via the native save dialog.
  secureHandle('omp-export-conversation', async (event, projectId, cwd, sessionPath, title) => {
    assertSessionId(projectId)
    assertProjectPath(cwd)
    await ompManager.ensureRpc(projectId, cwd)
    if (sessionPath) await ompManager.switchToSession(projectId, sessionPath)
    const messages = await ompManager.getMessages(projectId, cwd)
    const safeTitle = typeof title === 'string' && title.trim() ? title.trim().slice(0, 80) : 'conversation'
    const markdown = messagesToMarkdown(messages, safeTitle)
    const win = getWindow()
    const options = {
      title: 'Export conversation',
      defaultPath: `${safeTitle.replace(/[\\/:*?"<>|]/g, '-')}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    }
    const result = win && !win.isDestroyed() ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { success: true, canceled: true }
    fs.writeFileSync(result.filePath, markdown, 'utf8')
    return { success: true, canceled: false, path: result.filePath }
  })

  // Pin/unpin a session so it stays on top of the sidebar list.
  secureHandle('omp-toggle-pin', async (event, projectId, sessionId) => {
    assertSessionId(projectId)
    assertSessionId(sessionId)
    const list = ompManager.getSessions(projectId)
    const session = list.find((item) => item.id === sessionId)
    if (!session) throw new Error('Session not found')
    const updated = await ompManager.touchSession(projectId, sessionId, { pinned: !session.pinned })
    return { success: true, session: updated }
  })

  secureHandle('omp-branch', async (event, projectId, cwd, entryId) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    if (typeof entryId !== 'string' || !entryId.trim()) throw new Error('Entry ID is required')
    const data = await ompManager.branch(projectId, cwd || process.env.USERPROFILE || '', entryId)
    return { success: true, data }
  })

  secureHandle('omp-get-branch-messages', async (event, projectId, cwd) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    const messages = await ompManager.getBranchMessages(projectId, cwd || process.env.USERPROFILE || '')
    return { success: true, messages }
  })

  const SUBAGENT_LEVELS = ['off', 'progress', 'events']

  secureHandle('omp-set-subagent-subscription', async (event, projectId, cwd, level) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    if (!SUBAGENT_LEVELS.includes(level)) throw new Error('Invalid subscription level')
    await ompManager.setSubagentSubscription(projectId, cwd || process.env.USERPROFILE || '', level)
    return { success: true }
  })

  secureHandle('omp-get-subagents', async (event, projectId, cwd) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    const subagents = await ompManager.getSubagents(projectId, cwd || process.env.USERPROFILE || '')
    return { success: true, subagents }
  })

  secureHandle('omp-handoff', async (event, projectId, cwd, customInstructions) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    if (typeof customInstructions !== 'string' || !customInstructions.trim()) throw new Error('Instructions are required')
    if (customInstructions.length > MAX_INSTRUCTIONS) throw new Error('Instructions are too long')
    await ompManager.handoff(projectId, cwd || process.env.USERPROFILE || '', customInstructions)
    return { success: true }
  })

  const MAX_BASH_COMMAND = 2000

  // Run a bash command in the project directory through omp's RPC bash
  // command. The response arrives when the command finishes (BashResult);
  // abort_bash cancels a long-running command.
  secureHandle('omp-bash', async (event, projectId, cwd, command) => {
    assertSessionId(projectId)
    assertProjectPath(cwd)
    if (typeof command !== 'string' || !command.trim()) throw new Error('Command is required')
    if (command.length > MAX_BASH_COMMAND) throw new Error('Command is too long')
    const data = await ompManager.bash(projectId, cwd, command.trim())
    return { success: true, data }
  })

  secureHandle('omp-abort-bash', async (event, projectId, cwd) => {
    assertSessionId(projectId)
    if (cwd) assertProjectPath(cwd)
    await ompManager.abortBash(projectId, cwd || process.env.USERPROFILE || '')
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

  // --- Config (models.yml / config.yml) -----------------------------------

  secureHandle('omp-config-get', async () => {
    const data = await ompConfig.getConfig()
    return { success: true, ...data }
  })

  secureHandle('omp-config-save-provider', async (event, input = {}) => {
    if (typeof input !== 'object' || input === null) throw new Error('Provider data is required')
    const name = String(input.name || '').trim()
    if (name.length > 60) throw new Error('Provider name is too long')
    const result = await ompConfig.saveProvider(input)
    if (!result.success) throw new Error(result.error)
    return { success: true }
  })

  secureHandle('omp-config-delete-provider', async (event, name) => {
    const result = await ompConfig.deleteProvider(String(name || '').trim())
    if (!result.success) throw new Error(result.error)
    return { success: true }
  })

  secureHandle('omp-config-set-default', async (event, modelRef) => {
    const result = await ompConfig.setDefaultModel(String(modelRef || '').trim())
    if (!result.success) throw new Error(result.error)
    return { success: true }
  })

  // Launch `omp setup` (interactive wizard) in its own console window, so the
  // user manages provider keys themselves without us ever reading them.
  secureHandle('omp-run-setup', async () => {
    const binary = ompManager.getBinaryPath()
    if (!binary) throw new Error('omp is not installed')
    if (process.platform === 'win32') {
      const comspec = process.env.ComSpec || 'cmd.exe'
      const child = spawn(comspec, ['/c', 'start', '', `"${binary}"`, 'setup'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })
      child.unref()
    } else {
      const child = spawn(binary, ['setup'], { detached: true, stdio: 'ignore' })
      child.unref()
    }
    return { success: true }
  })

  secureHandle('omp-open-docs', async () => {
    shell.openExternal('https://omp.sh/docs/providers')
    return { success: true }
  })
}

module.exports = { setupAgentHandlers }
