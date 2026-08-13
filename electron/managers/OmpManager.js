// @ts-check
const { spawn, execFile } = require('child_process')
const path = require('path')
const os = require('os')
const fs = require('fs').promises
const { EventEmitter } = require('events')

/**
 * OmpManager — talks to the oh-my-pi (omp) coding agent over its documented
 * JSON-lines RPC protocol (`omp --mode rpc`).
 *
 * One RPC child process is spawned per project (lazily on first chat, cwd =
 * project path) so every conversation runs in the correct workspace. The
 * conversation context itself lives in omp session files on disk, so killing
 * an idle process never loses history — it is reloaded via `switch_session`
 * + `get_messages` when the user returns.
 *
 * We never touch provider keys: provider/model selection stays in omp's own
 * config (~/.omp). Our registry only stores lightweight metadata (title,
 * timestamps, token usage) keyed by project.
 */
class OmpManager extends EventEmitter {
  constructor(userDataDir) {
    super()
    this.userDataDir = userDataDir
    this.managedBinary = path.join(userDataDir, 'omp', 'omp.exe')
    this.binaryPath = null
    this.version = null
    this.registryPath = path.join(userDataDir, 'agent-sessions.json')
    this.registry = { projects: {} }
    this.rpcs = new Map() // projectId -> { proc, ready, cwd, nextId, pending, sessionFile, idleTimer, lastActive }
    this.nextRpcId = 1
    this.IDLE_TIMEOUT_MS = 15 * 60 * 1000
  }

  async init() {
    try {
      const raw = await fs.readFile(this.registryPath, 'utf8')
      const parsed = JSON.parse(raw)
      this.registry = parsed && typeof parsed === 'object' && parsed.projects ? parsed : { projects: {} }
    } catch {
      this.registry = { projects: {} }
    }
    await this.resolveBinary()
  }

  /** @returns {Promise<string|null>} the absolute path of a usable omp binary, or null */
  async resolveBinary() {
    const candidates = [this.managedBinary, path.join(process.env.LOCALAPPDATA || '', 'omp', 'omp.exe'), path.join(os.homedir(), '.bun', 'bin', 'omp.exe'), path.join(os.homedir(), '.bun', 'bin', 'omp')]
    for (const candidate of candidates) {
      try {
        await fs.access(candidate)
        this.binaryPath = candidate
        this.version = await this.getVersion(candidate)
        return this.binaryPath
      } catch { /* keep looking */ }
    }
    // Fall back to PATH lookup
    try {
      this.binaryPath = await new Promise((resolve, reject) => {
        execFile(process.platform === 'win32' ? 'where' : 'which', ['omp'], { windowsHide: true }, (error, stdout) => {
          if (error) reject(error)
          else resolve((stdout || '').trim().split(/\r?\n/)[0])
        })
      })
      if (this.binaryPath) this.version = await this.getVersion(this.binaryPath)
    } catch {
      this.binaryPath = null
    }
    return this.binaryPath
  }

  /** @param {string} binary @returns {Promise<string|null>} */
  getVersion(binary) {
    return new Promise((resolve) => {
      execFile(binary, ['--version'], { windowsHide: true, timeout: 8000 }, (error, stdout, stderr) => {
        const text = (stdout || stderr || '').trim().split(/\r?\n/)[0]
        resolve(text || null)
      })
    })
  }

  /** @returns {Promise<{installed: boolean, version: string|null, binaryPath: string|null, configured: boolean}>} */
  async getStatus() {
    const configured = await this.isConfigured()
    return {
      installed: Boolean(this.binaryPath),
      version: this.version,
      binaryPath: this.binaryPath,
      configured,
    }
  }

  // A provider is considered configured when a well-known API key env var is
  // set or omp's config declares a default model role. We never read the keys.
  async isConfigured() {
    const keys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY']
    if (keys.some((key) => process.env[key])) return true
    try {
      const configPath = path.join(os.homedir(), '.omp', 'agent', 'config.yml')
      const content = await fs.readFile(configPath, 'utf8')
      return /modelRoles:|default:|loginState:/i.test(content)
    } catch {
      return false
    }
  }

  // =========================================================================
  // Session registry (lightweight metadata, keyed by project)
  // =========================================================================

  async saveRegistry() {
    try {
      const tempPath = `${this.registryPath}.tmp`
      await fs.writeFile(tempPath, JSON.stringify(this.registry), 'utf8')
      await fs.rename(tempPath, this.registryPath)
    } catch { /* non-critical */ }
  }

  getSessions(projectId) {
    return this.registry.projects[projectId] || []
  }

  async createSession(projectId, title) {
    const list = this.registry.projects[projectId] || []
    const session = {
      id: `s${Date.now()}${Math.floor(Math.random() * 1000)}`,
      title: title || `Session ${list.length + 1}`,
      createdAt: Date.now(),
      lastActive: Date.now(),
      tokens: 0,
      sessionPath: null,
    }
    list.push(session)
    this.registry.projects[projectId] = list
    await this.saveRegistry()
    return session
  }

  async touchSession(projectId, sessionId, meta = {}) {
    const list = this.registry.projects[projectId] || []
    const session = list.find((item) => item.id === sessionId)
    if (!session) return null
    if (meta.sessionPath) session.sessionPath = meta.sessionPath
    if (meta.tokens) session.tokens = meta.tokens
    if (meta.title) session.title = meta.title
    session.lastActive = Date.now()
    await this.saveRegistry()
    return session
  }

  async deleteSession(projectId, sessionId) {
    const list = (this.registry.projects[projectId] || []).filter((item) => item.id !== sessionId)
    this.registry.projects[projectId] = list
    await this.saveRegistry()
  }

  // =========================================================================
  // RPC process management (one per project, lazy spawn, idle kill)
  // =========================================================================

  /** @returns {string|null} resolved binary path (used for spawning `omp setup`) */
  getBinaryPath() {
    return this.binaryPath
  }

  ensureRpc(projectId, cwd) {
    let entry = this.rpcs.get(projectId)
    if (entry && entry.proc && !entry.proc.killed) {
      entry.cwd = cwd || entry.cwd
      this._touch(projectId)
      return Promise.resolve(entry)
    }
    if (!this.binaryPath) {
      return Promise.reject(new Error('omp is not installed'))
    }
    entry = {
      proc: null,
      ready: false,
      cwd: cwd || os.homedir(),
      nextId: 1,
      pending: new Map(),
      sessionFile: null,
      idleTimer: null,
      buffer: '',
    }
    this.rpcs.set(projectId, entry)
    this._touch(projectId)
    return new Promise((resolve, reject) => {
      let settled = false
      let startupError = null
      const child = spawn(this.binaryPath, ['--mode', 'rpc'], {
        cwd: entry.cwd,
        env: process.env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      entry.proc = child
      const fail = (error) => {
        if (settled) return
        settled = true
        entry.ready = false
        entry.proc = null
        reject(error)
      }
      child.on('error', (error) => {
        this._emit(projectId, { type: 'rpc_error', error: error.message })
        fail(error)
      })
      child.stdout.on('data', (chunk) => {
        if (!entry.ready && !startupError) {
          // omp prints a plain-text error (e.g. "No models available") and
          // exits before the RPC ready frame when the provider is missing.
          const text = chunk.toString('utf8').trim()
          if (text && !text.startsWith('{')) startupError = text.slice(0, 400)
        }
        this._onData(projectId, chunk)
      })
      child.stderr.on('data', (chunk) => {
        if (!entry.ready && !startupError) {
          const text = chunk.toString('utf8').trim()
          if (text && !text.startsWith('{')) startupError = text.slice(0, 400)
        }
        this._onData(projectId, chunk, true)
      })
      child.on('exit', (code) => {
        entry.ready = false
        entry.proc = null
        if (!settled) fail(new Error(startupError || `omp exited with code ${code} before starting`))
        this._emit(projectId, { type: 'rpc_exit', code })
      })
      // Wait for the ready frame before resolving.
      const timeout = setTimeout(() => {
        if (entry.ready) return
        fail(new Error(startupError || 'omp RPC did not start (check provider configuration)'))
      }, 12000)
      const checkReady = () => {
        if (settled) return
        if (entry.ready) {
          clearTimeout(timeout)
          resolve(entry)
        } else {
          setTimeout(checkReady, 50)
        }
      }
      checkReady()
    })
  }

  _onData(projectId, chunk, isStderr = false) {
    const entry = this.rpcs.get(projectId)
    if (!entry) return
    entry.buffer += chunk.toString('utf8')
    let newlineIndex
    while ((newlineIndex = entry.buffer.indexOf('\n')) !== -1) {
      const line = entry.buffer.slice(0, newlineIndex).trim()
      entry.buffer = entry.buffer.slice(newlineIndex + 1)
      if (!line) continue
      let frame
      try {
        frame = JSON.parse(line)
      } catch {
        if (isStderr) this._emit(projectId, { type: 'rpc_log', level: 'error', message: line.slice(0, 500) })
        continue
      }
      this._handleFrame(projectId, frame)
    }
  }

  _handleFrame(projectId, frame) {
    const entry = this.rpcs.get(projectId)
    if (!entry) return
    if (frame.type === 'ready') {
      entry.ready = true
      return
    }
    // Command response → resolve pending promise
    if (frame.type === 'response' && frame.id && entry.pending.has(frame.id)) {
      const { resolve, reject } = entry.pending.get(frame.id)
      entry.pending.delete(frame.id)
      if (frame.success) resolve(frame.data)
      else reject(new Error(frame.error || 'omp command failed'))
      return
    }
    // Forward agent/session events to the renderer
    if (frame.type && frame.type !== 'response') {
      this._emit(projectId, frame)
    }
  }

  _send(projectId, command) {
    const entry = this.rpcs.get(projectId)
    if (!entry || !entry.proc || entry.proc.killed) {
      return Promise.reject(new Error('omp process is not running'))
    }
    this._touch(projectId)
    const id = `req_${entry.nextId++}`
    const payload = { ...command, id }
    return new Promise((resolve, reject) => {
      entry.pending.set(id, { resolve, reject })
      entry.proc.stdin.write(JSON.stringify(payload) + '\n')
      setTimeout(() => {
        if (entry.pending.has(id)) {
          entry.pending.delete(id)
          reject(new Error(`omp command timed out: ${command.type}`))
        }
      }, 120000)
    })
  }

  _touch(projectId) {
    const entry = this.rpcs.get(projectId)
    if (!entry) return
    entry.lastActive = Date.now()
    if (entry.idleTimer) clearTimeout(entry.idleTimer)
    entry.idleTimer = setTimeout(() => {
      const current = this.rpcs.get(projectId)
      if (current && Date.now() - current.lastActive >= this.IDLE_TIMEOUT_MS) {
        this.killRpc(projectId)
      } else if (current) {
        this._touch(projectId)
      }
    }, this.IDLE_TIMEOUT_MS)
  }

  killRpc(projectId) {
    const entry = this.rpcs.get(projectId)
    if (!entry) return
    if (entry.idleTimer) clearTimeout(entry.idleTimer)
    try {
      entry.proc?.stdin?.end()
      entry.proc?.kill()
    } catch { /* already gone */ }
    this.rpcs.delete(projectId)
  }

  killAll() {
    for (const projectId of [...this.rpcs.keys()]) this.killRpc(projectId)
  }

  _emit(projectId, event) {
    this.emit('event', { projectId, event })
  }

  // =========================================================================
  // High-level RPC commands
  // =========================================================================

  /** Start a conversation turn. Creates/reuses the session file on the RPC side. */
  async chat(projectId, cwd, message, { sessionId = null, sessionPath = null } = {}) {
    await this.ensureRpc(projectId, cwd)
    let session = sessionId ? this.registry.projects[projectId]?.find((item) => item.id === sessionId) : null
    if (!session) {
      session = await this.createSession(projectId, message.slice(0, 48))
      sessionId = session.id
    }
    // Point the RPC process at this session before prompting.
    if (sessionPath || session.sessionPath) {
      const target = sessionPath || session.sessionPath
      await this._send(projectId, { type: 'switch_session', sessionPath: target })
    } else {
      const created = await this._send(projectId, { type: 'new_session' })
      session.sessionPath = created?.sessionFile || created?.sessionPath || created?.path || null
      await this.touchSession(projectId, sessionId, { sessionPath: session.sessionPath })
    }
    await this._send(projectId, { type: 'prompt', message })
    await this.touchSession(projectId, sessionId)
    return { sessionId, session }
  }

  async switchToSession(projectId, sessionPath) {
    const entry = this.rpcs.get(projectId)
    if (!entry) return
    if (typeof sessionPath !== 'string' || !sessionPath.trim()) return
    entry.sessionFile = sessionPath
    return this._send(projectId, { type: 'switch_session', sessionPath })
  }

  async steer(projectId, cwd, message) {
    await this.ensureRpc(projectId, cwd)
    return this._send(projectId, { type: 'steer', message })
  }

  async abort(projectId, cwd) {
    await this.ensureRpc(projectId, cwd)
    return this._send(projectId, { type: 'abort' })
  }

  async getState(projectId, cwd) {
    await this.ensureRpc(projectId, cwd)
    return this._send(projectId, { type: 'get_state' })
  }

  /** @returns {Promise<Array>} conversation messages, normalized defensively */
  async getMessages(projectId, cwd) {
    await this.ensureRpc(projectId, cwd)
    const data = await this._send(projectId, { type: 'get_messages' })
    return this.normalizeMessages(data)
  }

  normalizeMessages(data) {
    if (!data) return []
    const raw = Array.isArray(data) ? data : data.messages || data.items || []
    const messages = []
    for (const item of raw) {
      if (!item) continue
      const role = item.role || item.type || (item.from === 'assistant' ? 'assistant' : 'user')
      const content = item.content || item.text || item.message || ''
      if (typeof content === 'string' && content.trim()) {
        messages.push({ role: role === 'assistant' ? 'assistant' : 'user', content })
      } else if (Array.isArray(content)) {
        const text = content.map((part) => part?.text || (part?.type === 'text' ? part?.text : '')).filter(Boolean).join('\n')
        if (text.trim()) messages.push({ role: role === 'assistant' ? 'assistant' : 'user', content: text })
      }
    }
    return messages
  }

  async getAvailableModels(projectId, cwd) {
    await this.ensureRpc(projectId, cwd)
    return this._send(projectId, { type: 'get_available_models' })
  }

  async setModel(projectId, cwd, provider, modelId) {
    await this.ensureRpc(projectId, cwd)
    return this._send(projectId, { type: 'set_model', provider, modelId })
  }
}

module.exports = OmpManager
