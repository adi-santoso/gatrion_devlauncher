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
    // Test/CI hook: when set, RPC processes are spawned as `node <script>`
    // instead of the real omp binary, so the JSON-lines protocol can be
    // driven deterministically (vitest + Playwright e2e with a mock agent).
    this.rpcMockScript = process.env.OMP_RPC_MOCK_SCRIPT || null
    this.managedBinary = path.join(userDataDir, 'omp', 'omp.exe')
    this.binaryPath = null
    this.version = null
    this.registryPath = path.join(userDataDir, 'agent-sessions.json')
    this.registry = { projects: {} }
    this.rpcs = new Map() // projectId -> { proc, ready, cwd, nextId, pending, sessionFile, idleTimer, lastActive }
    this.nextRpcId = 1
    this.IDLE_TIMEOUT_MS = 15 * 60 * 1000
    // Short timeout for read-only RPC calls (get_messages etc.): they only
    // read local session files, so a stall means the RPC process is wedged
    // (e.g. a dead proxy holds it up at startup). Fail fast instead of
    // leaving the renderer's history skeleton spinning for minutes.
    this.READ_TIMEOUT_MS = 30000
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
    // Mock mode (e2e/vitest): report a fully ready agent so the UI never
    // blocks on the real omp install or provider config.
    if (this.rpcMockScript) {
      return { installed: true, version: 'mock', binaryPath: null, configured: true }
    }
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

  /** All sessions across every project (for workspace-wide search). */
  getAllSessions() {
    const all = []
    for (const [projectId, sessions] of Object.entries(this.registry.projects || {})) {
      for (const session of Array.isArray(sessions) ? sessions : []) {
        all.push({ projectId, ...session })
      }
    }
    return all
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
      pinned: false,
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
    if (typeof meta.tokens === 'number' && Number.isFinite(meta.tokens)) session.tokens = meta.tokens
    if (typeof meta.cost === 'number' && Number.isFinite(meta.cost)) session.cost = meta.cost
    if (meta.title) session.title = meta.title
    if (typeof meta.pinned === 'boolean') session.pinned = meta.pinned
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
    if (!this.binaryPath && !this.rpcMockScript) {
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
      // Mock mode: a Node process runs the fixture script and ignores the real
      // binary. Under Electron, process.execPath is electron.exe (which cannot
      // run plain Node scripts), so resolve a real Node binary: npm's
      // npm_node_execpath when launched via npm, else 'node' from PATH. Under
      // plain Node (vitest) process.execPath is already correct.
      const isElectron = Boolean(process.versions && process.versions.electron)
      const nodeBinary = isElectron ? (process.env.npm_node_execpath || 'node') : process.execPath
      const binary = this.rpcMockScript ? nodeBinary : this.binaryPath
      const args = this.rpcMockScript ? [this.rpcMockScript, '--mode', 'rpc'] : ['--mode', 'rpc']
      const child = spawn(binary, args, {
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

  _send(projectId, command, timeoutMs = 120000) {
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
      }, timeoutMs)
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

  /**
   * Start a conversation turn. Creates/reuses the session file on the RPC side.
   * @param {object} [options]
   * @param {string|null} [options.sessionId]
   * @param {string|null} [options.sessionPath]
   * @param {Array<{type: 'image', data: string, mimeType: string}>} [options.images] - base64 image attachments
   */
  async chat(projectId, cwd, message, { sessionId = null, sessionPath = null, images = [] } = {}) {
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
      // `new_session` does not return the session file path — read it back
      // from `get_state` so the session can be resumed later (switch_session
      // + get_messages) even after the process is killed and respawned.
      await this._send(projectId, { type: 'new_session' })
      const state = await this._send(projectId, { type: 'get_state' })
      session.sessionPath = state?.sessionFile || null
      await this.touchSession(projectId, sessionId, { sessionPath: session.sessionPath })
    }
    await this._send(projectId, { type: 'prompt', message, images })
    await this.touchSession(projectId, sessionId)
    return { sessionId, session }
  }

  async switchToSession(projectId, sessionPath) {
    const entry = this.rpcs.get(projectId)
    if (!entry) return
    if (typeof sessionPath !== 'string' || !sessionPath.trim()) return
    entry.sessionFile = sessionPath
    return this._send(projectId, { type: 'switch_session', sessionPath }, this.READ_TIMEOUT_MS)
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
    // Prefer the paged endpoint: a long transcript can exceed the 1 MiB frame
    // limit of the monolithic get_messages and get truncated silently. Falls
    // back to the legacy snapshot when paging is unavailable or fails.
    try {
      const pages = []
      let cursor = null
      for (let i = 0; i < 200; i += 1) {
        const payload = { type: 'get_messages_page' }
        if (cursor) payload.cursor = cursor
        const page = await this._send(projectId, payload, this.READ_TIMEOUT_MS)
        pages.push(...(Array.isArray(page?.messages) ? page.messages : []))
        if (!page?.nextCursor) break
        cursor = page.nextCursor
      }
      if (pages.length > 0) return this.normalizeMessages(pages)
    } catch { /* fall through to the monolithic snapshot */ }
    const data = await this._send(projectId, { type: 'get_messages' }, this.READ_TIMEOUT_MS)
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

  /** @param {string} level - off|minimal|low|medium|high|xhigh|max */
  async setThinkingLevel(projectId, cwd, level) {
    await this.ensureRpc(projectId, cwd)
    return this._send(projectId, { type: 'set_thinking_level', level })
  }

  /** @param {string} [customInstructions] */
  async compact(projectId, cwd, customInstructions) {
    await this.ensureRpc(projectId, cwd)
    const payload = { type: 'compact' }
    if (typeof customInstructions === 'string' && customInstructions.trim()) payload.customInstructions = customInstructions.slice(0, 2000)
    return this._send(projectId, payload)
  }

  /** @param {boolean} enabled */
  async setAutoCompaction(projectId, cwd, enabled) {
    await this.ensureRpc(projectId, cwd)
    return this._send(projectId, { type: 'set_auto_compaction', enabled: Boolean(enabled) })
  }

  /** @param {boolean} enabled */
  async setAutoRetry(projectId, cwd, enabled) {
    await this.ensureRpc(projectId, cwd)
    return this._send(projectId, { type: 'set_auto_retry', enabled: Boolean(enabled) })
  }

  async abortRetry(projectId, cwd) {
    await this.ensureRpc(projectId, cwd)
    return this._send(projectId, { type: 'abort_retry' })
  }

  /** @param {boolean} enabled */
  async setFastMode(projectId, cwd, enabled) {
    await this.ensureRpc(projectId, cwd)
    return this._send(projectId, { type: 'set_fast_mode', enabled: Boolean(enabled) })
  }

  /** @returns {Promise<Array>} available slash commands */
  async getAvailableCommands(projectId, cwd) {
    await this.ensureRpc(projectId, cwd)
    const data = await this._send(projectId, { type: 'get_available_commands' })
    return Array.isArray(data) ? data : (data?.commands || [])
  }

  /** @param {string} entryId - branch from this transcript entry */
  async branch(projectId, cwd, entryId) {
    await this.ensureRpc(projectId, cwd)
    return this._send(projectId, { type: 'branch', entryId: String(entryId).slice(0, 200) })
  }

  async getBranchMessages(projectId, cwd) {
    await this.ensureRpc(projectId, cwd)
    const data = await this._send(projectId, { type: 'get_branch_messages' })
    return this.normalizeMessages(Array.isArray(data) ? data : (data?.messages || data || []))
  }

  /** @param {string} level - off | progress | events */
  async setSubagentSubscription(projectId, cwd, level) {
    await this.ensureRpc(projectId, cwd)
    return this._send(projectId, { type: 'set_subagent_subscription', level })
  }

  /** @returns {Promise<Array>} subagent registry snapshot */
  async getSubagents(projectId, cwd) {
    await this.ensureRpc(projectId, cwd)
    const data = await this._send(projectId, { type: 'get_subagents' })
    return Array.isArray(data) ? data : (data?.subagents || [])
  }

  /** @param {string} customInstructions */
  async handoff(projectId, cwd, customInstructions) {
    await this.ensureRpc(projectId, cwd)
    return this._send(projectId, { type: 'handoff', customInstructions: String(customInstructions).slice(0, 2000) })
  }

  /**
   * Run a bash command in the session's project directory via the RPC bash
   * command. The response (BashResult) arrives when the command completes;
   * abort_bash cancels it. Long-running commands (builds, tests) get a
   * generous deadline.
   * @param {string} command
   * @returns {Promise<{output: string, exitCode: number|undefined, cancelled: boolean, timedOut?: boolean, truncated: boolean}>}
   */
  async bash(projectId, cwd, command) {
    await this.ensureRpc(projectId, cwd)
    return this._send(projectId, { type: 'bash', command: String(command).slice(0, 2000) }, 300000)
  }

  async abortBash(projectId, cwd) {
    await this.ensureRpc(projectId, cwd)
    return this._send(projectId, { type: 'abort_bash' })
  }
}

module.exports = OmpManager
