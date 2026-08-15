const { execFile } = require('child_process')
const path = require('path')
const os = require('os')
const fs = require('fs').promises
const { EventEmitter } = require('events')
import { OmpRpcTransport, type RpcEntry } from './ompRpc'

interface AgentSessionMeta {
  id: string
  title: string
  createdAt: number
  lastActive: number
  tokens: number
  sessionPath: string | null
  pinned: boolean
  cost?: number
}

interface NormalizedMessage {
  role: 'user' | 'assistant'
  content: string
}

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
  userDataDir: string
  rpcMockScript: string | null
  managedBinary: string
  binaryPath: string | null
  version: string | null
  registryPath: string
  registry: { projects: Record<string, AgentSessionMeta[]> }
  rpc: OmpRpcTransport
  READ_TIMEOUT_MS: number

  constructor(userDataDir: string) {
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
    this.rpc = new OmpRpcTransport((projectId, event) => this._emit(projectId, event))
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

  /** @returns the absolute path of a usable omp binary, or null */
  async resolveBinary(): Promise<string | null> {
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
        execFile(process.platform === 'win32' ? 'where' : 'which', ['omp'], { windowsHide: true }, (error: Error | null, stdout: string) => {
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

  getVersion(binary: string): Promise<string | null> {
    return new Promise((resolve) => {
      execFile(binary, ['--version'], { windowsHide: true, timeout: 8000 }, (error: Error | null, stdout: string, stderr: string) => {
        const text = (stdout || stderr || '').trim().split(/\r?\n/)[0]
        resolve(text || null)
      })
    })
  }

  async getStatus(): Promise<{ installed: boolean; version: string | null; binaryPath: string | null; configured: boolean }> {
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
  async isConfigured(): Promise<boolean> {
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

  getSessions(projectId: string): AgentSessionMeta[] {
    return this.registry.projects[projectId] || []
  }

  /** All sessions across every project (for workspace-wide search). */
  getAllSessions(): Array<AgentSessionMeta & { projectId: string }> {
    const all: Array<AgentSessionMeta & { projectId: string }> = []
    for (const [projectId, sessions] of Object.entries(this.registry.projects || {})) {
      for (const session of Array.isArray(sessions) ? sessions : []) {
        all.push({ projectId, ...session })
      }
    }
    return all
  }

  async createSession(projectId: string, title: string): Promise<AgentSessionMeta> {
    const list = this.registry.projects[projectId] || []
    const session: AgentSessionMeta = {
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

  async touchSession(projectId: string, sessionId: string, meta: Partial<Pick<AgentSessionMeta, 'sessionPath' | 'tokens' | 'cost' | 'title' | 'pinned'>> = {}): Promise<AgentSessionMeta | null> {
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

  async deleteSession(projectId: string, sessionId: string) {
    const list = (this.registry.projects[projectId] || []).filter((item) => item.id !== sessionId)
    this.registry.projects[projectId] = list
    await this.saveRegistry()
  }

  // =========================================================================
  // RPC process management (one per project, lazy spawn, idle kill)
  // =========================================================================

  /** @returns resolved binary path (used for spawning `omp setup`) */
  getBinaryPath(): string | null {
    return this.binaryPath
  }

  /** @returns a live RPC entry for the project, spawning the process if needed. */
  ensureRpc(projectId: string, cwd: string): Promise<RpcEntry> {
    return this.rpc.ensureRpc(projectId, cwd, this.binaryPath, this.rpcMockScript)
  }

  _emit(projectId: string, event: unknown) {
    this.emit('event', { projectId, event })
  }

  // =========================================================================
  // High-level RPC commands
  // =========================================================================

  /**
   * Start a conversation turn. Creates/reuses the session file on the RPC side.
   */
  async chat(
    projectId: string,
    cwd: string,
    message: string,
    options: { sessionId?: string | null; sessionPath?: string | null; images?: Array<{ type: string; data: string; mimeType: string }> } = {}
  ): Promise<{ sessionId: string; session: AgentSessionMeta }> {
    const { sessionId: optSessionId = null, sessionPath = null, images = [] } = options
    await this.ensureRpc(projectId, cwd)
    let session = optSessionId ? this.registry.projects[projectId]?.find((item) => item.id === optSessionId) : null
    let sessionId = optSessionId
    if (!session) {
      session = await this.createSession(projectId, message.slice(0, 48))
      sessionId = session.id
    }
    // Point the RPC process at this session before prompting.
    if (sessionPath || session.sessionPath) {
      const target = sessionPath || session.sessionPath
      await this.rpc._send(projectId, { type: 'switch_session', sessionPath: target })
    } else {
      // `new_session` does not return the session file path — read it back
      // from `get_state` so the session can be resumed later (switch_session
      // + get_messages) even after the process is killed and respawned.
      await this.rpc._send(projectId, { type: 'new_session' })
      const state = await this.rpc._send(projectId, { type: 'get_state' }) as { sessionFile?: unknown } | null
      const sessionFile = state?.sessionFile
      session.sessionPath = typeof sessionFile === 'string' ? sessionFile : null
      await this.touchSession(projectId, sessionId!, { sessionPath: session.sessionPath })
    }
    await this.rpc._send(projectId, { type: 'prompt', message, images })
    await this.touchSession(projectId, sessionId!)
    return { sessionId: sessionId!, session }
  }

  async switchToSession(projectId: string, sessionPath: string | null) {
    const entry = this.rpc.rpcs.get(projectId)
    if (!entry) return
    if (typeof sessionPath !== 'string' || !sessionPath.trim()) return
    entry.sessionFile = sessionPath
    return this.rpc._send(projectId, { type: 'switch_session', sessionPath }, this.READ_TIMEOUT_MS)
  }

  async steer(projectId: string, cwd: string, message: string) {
    await this.ensureRpc(projectId, cwd)
    return this.rpc._send(projectId, { type: 'steer', message })
  }

  async abort(projectId: string, cwd: string) {
    await this.ensureRpc(projectId, cwd)
    return this.rpc._send(projectId, { type: 'abort' })
  }

  async getState(projectId: string, cwd: string) {
    await this.ensureRpc(projectId, cwd)
    return this.rpc._send(projectId, { type: 'get_state' })
  }

  /** @returns conversation messages, normalized defensively */
  async getMessages(projectId: string, cwd: string): Promise<NormalizedMessage[]> {
    await this.ensureRpc(projectId, cwd)
    // Prefer the paged endpoint: a long transcript can exceed the 1 MiB frame
    // limit of the monolithic get_messages and get truncated silently. Falls
    // back to the legacy snapshot when paging is unavailable or fails.
    try {
      const pages: unknown[] = []
      let cursor: string | null = null
      for (let i = 0; i < 200; i += 1) {
        const payload: Record<string, unknown> = { type: 'get_messages_page' }
        if (cursor) payload.cursor = cursor
        const page = await this.rpc._send(projectId, payload, this.READ_TIMEOUT_MS) as { messages?: unknown[]; nextCursor?: string } | null
        const pageMessages = page?.messages
        pages.push(...(Array.isArray(pageMessages) ? pageMessages : []))
        if (!page?.nextCursor) break
        cursor = page.nextCursor
      }
      if (pages.length > 0) return this.normalizeMessages(pages)
    } catch { /* fall through to the monolithic snapshot */ }
    const data = await this.rpc._send(projectId, { type: 'get_messages' }, this.READ_TIMEOUT_MS)
    return this.normalizeMessages(data)
  }

  normalizeMessages(data: unknown): NormalizedMessage[] {
    if (!data) return []
    const raw = Array.isArray(data)
      ? data
      : ((data as { messages?: unknown[]; items?: unknown[] }).messages || (data as { messages?: unknown[]; items?: unknown[] }).items || [])
    const messages: NormalizedMessage[] = []
    for (const item of raw) {
      if (!item) continue
      const msg = item as Record<string, unknown>
      const role = msg.role || msg.type || (msg.from === 'assistant' ? 'assistant' : 'user')
      const content = msg.content || msg.text || msg.message || ''
      if (typeof content === 'string' && content.trim()) {
        messages.push({ role: role === 'assistant' ? 'assistant' : 'user', content })
      } else if (Array.isArray(content)) {
        const text = content.map((part) => part?.text || (part?.type === 'text' ? part?.text : '')).filter(Boolean).join('\n')
        if (text.trim()) messages.push({ role: role === 'assistant' ? 'assistant' : 'user', content: text })
      }
    }
    return messages
  }

  async getAvailableModels(projectId: string, cwd: string) {
    await this.ensureRpc(projectId, cwd)
    return this.rpc._send(projectId, { type: 'get_available_models' })
  }

  async setModel(projectId: string, cwd: string, provider: string, modelId: string) {
    await this.ensureRpc(projectId, cwd)
    return this.rpc._send(projectId, { type: 'set_model', provider, modelId })
  }

  /** @param level - off|minimal|low|medium|high|xhigh|max */
  async setThinkingLevel(projectId: string, cwd: string, level: string) {
    await this.ensureRpc(projectId, cwd)
    return this.rpc._send(projectId, { type: 'set_thinking_level', level })
  }

  async compact(projectId: string, cwd: string, customInstructions?: string) {
    await this.ensureRpc(projectId, cwd)
    const payload: Record<string, unknown> = { type: 'compact' }
    if (typeof customInstructions === 'string' && customInstructions.trim()) payload.customInstructions = customInstructions.slice(0, 2000)
    return this.rpc._send(projectId, payload)
  }

  async setAutoCompaction(projectId: string, cwd: string, enabled: boolean) {
    await this.ensureRpc(projectId, cwd)
    return this.rpc._send(projectId, { type: 'set_auto_compaction', enabled: Boolean(enabled) })
  }

  async setAutoRetry(projectId: string, cwd: string, enabled: boolean) {
    await this.ensureRpc(projectId, cwd)
    return this.rpc._send(projectId, { type: 'set_auto_retry', enabled: Boolean(enabled) })
  }

  async abortRetry(projectId: string, cwd: string) {
    await this.ensureRpc(projectId, cwd)
    return this.rpc._send(projectId, { type: 'abort_retry' })
  }

  async setFastMode(projectId: string, cwd: string, enabled: boolean) {
    await this.ensureRpc(projectId, cwd)
    return this.rpc._send(projectId, { type: 'set_fast_mode', enabled: Boolean(enabled) })
  }

  /** @returns available slash commands */
  async getAvailableCommands(projectId: string, cwd: string) {
    await this.ensureRpc(projectId, cwd)
    const data = await this.rpc._send(projectId, { type: 'get_available_commands' })
    return Array.isArray(data) ? data : ((data as { commands?: unknown[] } | null)?.commands || [])
  }

  /** @param entryId - branch from this transcript entry */
  async branch(projectId: string, cwd: string, entryId: string) {
    await this.ensureRpc(projectId, cwd)
    return this.rpc._send(projectId, { type: 'branch', entryId: String(entryId).slice(0, 200) })
  }

  async getBranchMessages(projectId: string, cwd: string) {
    await this.ensureRpc(projectId, cwd)
    const data = await this.rpc._send(projectId, { type: 'get_branch_messages' })
    return this.normalizeMessages(Array.isArray(data) ? data : ((data as { messages?: unknown[] } | null)?.messages || data || []))
  }

  /** @param level - off | progress | events */
  async setSubagentSubscription(projectId: string, cwd: string, level: string) {
    await this.ensureRpc(projectId, cwd)
    return this.rpc._send(projectId, { type: 'set_subagent_subscription', level })
  }

  /** @returns subagent registry snapshot */
  async getSubagents(projectId: string, cwd: string) {
    await this.ensureRpc(projectId, cwd)
    const data = await this.rpc._send(projectId, { type: 'get_subagents' })
    return Array.isArray(data) ? data : ((data as { subagents?: unknown[] } | null)?.subagents || [])
  }

  async handoff(projectId: string, cwd: string, customInstructions: string) {
    await this.ensureRpc(projectId, cwd)
    return this.rpc._send(projectId, { type: 'handoff', customInstructions: String(customInstructions).slice(0, 2000) })
  }

  /**
   * Run a bash command in the session's project directory via the RPC bash
   * command. The response (BashResult) arrives when the command completes;
   * abort_bash cancels it. Long-running commands (builds, tests) get a
   * generous deadline.
   */
  async bash(projectId: string, cwd: string, command: string) {
    await this.ensureRpc(projectId, cwd)
    return this.rpc._send(projectId, { type: 'bash', command: String(command).slice(0, 2000) }, 300000)
  }

  async abortBash(projectId: string, cwd: string) {
    await this.ensureRpc(projectId, cwd)
    return this.rpc._send(projectId, { type: 'abort_bash' })
  }

  // ── RPC transport passthroughs (kept for tests + the app quit path) ──

  /** Low-level RPC call — used by tests and internal callers. */
  _send(projectId: string, command: Record<string, unknown>, timeoutMs = 120000): Promise<unknown> {
    return this.rpc._send(projectId, command, timeoutMs)
  }

  /** Tear down one project's RPC process. */
  killRpc(projectId: string) {
    this.rpc.killRpc(projectId)
  }

  /** Tear down every RPC process (app quit). */
  killAll() {
    this.rpc.killAll()
  }

  /** Live RPC registry (projectId → process entry) — read-only accessor. */
  get rpcs() {
    return this.rpc.rpcs
  }
}

export default OmpManager


export type { OmpManager }
