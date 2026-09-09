import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import * as os from 'os'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

interface RpcFrame {
  type?: string
  id?: string
  success?: boolean
  data?: unknown
  error?: string
  [key: string]: unknown
}

export interface RpcEntry {
  proc: ChildProcess | null
  ready: boolean
  cwd: string
  nextId: number
  pending: Map<string, PendingRequest>
  sessionFile: string | null
  idleTimer: ReturnType<typeof setTimeout> | null
  lastActive: number
  buffer: string
  protocolVersion: number
  autoRestart: boolean
  restartBackoff: number
  projectId: string
  binaryPath: string | null
  rpcMockScript: string | null
  spawnArgs: string[]
}

/**
 * One RPC process per project (lazy spawn, idle kill). Speaks omp's
 * newline-delimited JSON protocol: `ensureRpc` waits for the ready frame,
 * `_send` issues a command and resolves/rejects on the response frame, and
 * everything else is forwarded to `onEvent` for the caller to surface.
 */
export class OmpRpcTransport {
  rpcs = new Map<string, RpcEntry>()
  IDLE_TIMEOUT_MS = 5 * 60 * 1000
  // Desired auto-restart state per project, applied when the RPC entry is
  // created. `setAutoRestart` can be called before the first spawn (e.g. by
  // OmpManager.ensureRpc, which enables it by default) — without this the flag
  // would silently no-op and crashes of the initial process would never restart.
  private autoRestartDefaults = new Map<string, boolean>()
  private onEvent: (projectId: string, event: unknown) => void
  private onCrash?: (projectId: string) => void

  constructor(onEvent: (projectId: string, event: unknown) => void, onCrash?: (projectId: string) => void) {
    this.onEvent = onEvent
    this.onCrash = onCrash
  }

  /**
   * Best-effort negotiation of the RPC protocol version. v2 enables chunked
   * frames so large payloads (get_state, get_available_models) do not hit the
   * v1 1 MiB per-frame limit. `negotiate_protocol` is not in the JSON-lines
   * command set on every build; the response `data.protocolVersion` tells us
   * what the peer accepted, and we silently stay on v1 when it errors or is
   * absent (mock scripts, older binaries).
   */
  private async negotiateProtocol(entry: RpcEntry, projectId: string): Promise<void> {
    if (entry.rpcMockScript) return
    try {
      const res = (await this._send(
        projectId,
        { type: 'negotiate_protocol', protocolVersion: 2 },
        5000,
      )) as { protocolVersion?: number } | null
      if (res && typeof res.protocolVersion === 'number') {
        entry.protocolVersion = res.protocolVersion
      }
    } catch {
      entry.protocolVersion = 1
    }
  }

  /** Spawn the omp RPC child process and wire up stdout/stderr/exit handlers. */
  private spawnRpcChild(entry: RpcEntry, projectId: string) {
    const isElectron = Boolean(process.versions && process.versions.electron)
    const nodeBinary = isElectron ? (process.env.npm_node_execpath || 'node') : process.execPath
    const binary = entry.rpcMockScript ? nodeBinary : entry.binaryPath!
    const args = entry.rpcMockScript ? [entry.rpcMockScript, '--mode', 'rpc'] : ['--mode', 'rpc']
    const child = spawn(binary, args, {
      cwd: entry!.cwd,
      env: process.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    entry.proc = child
    const fail = () => {
      entry.ready = false
      entry.proc = null
    }
    // A request that was already in flight must never hang until its own
    // timeout — the process is gone, so settle it immediately.
    const rejectPending = (message: string) => {
      for (const pending of [...entry!.pending.values()]) pending.reject(new Error(message))
      entry!.pending.clear()
    }
    child.on('error', (error: Error) => {
      const wasReady = entry.ready
      this.onEvent(projectId, { type: 'rpc_error', error: error.message })
      rejectPending('omp process failed to start')
      fail()
      this.maybeRestart(projectId, wasReady)
    })
    child.stdout.on('data', (chunk: Buffer) => {
      this._onData(projectId, chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      this._onData(projectId, chunk, true)
    })
    child.on('exit', (code: number | null) => {
      const wasReady = entry.ready
      entry.ready = false
      entry.proc = null
      rejectPending(`omp process exited${code === null ? '' : ` (code ${code})`} before responding`)
      this.onEvent(projectId, { type: 'rpc_exit', code })
      this.maybeRestart(projectId, wasReady)
    })
  }

  /**
   * Restart a crashed RPC process with backoff, preserving the active session.
   * Only processes that were previously ready are restarted — a process that
   * never reached `ready` (broken binary, bad provider config) must fail fast
   * instead of looping forever.
   */
  private maybeRestart(projectId: string, wasReady: boolean) {
    const entry = this.rpcs.get(projectId)
    if (!entry || !entry.autoRestart || entry.proc || !wasReady) return
    const backoff = Math.min(entry.restartBackoff, 15000)
    entry.restartBackoff = Math.min(backoff * 2, 30000)
    this.onEvent(projectId, { type: 'rpc_restarting', delayMs: backoff })
    setTimeout(() => {
      const current = this.rpcs.get(projectId)
      if (!current || !current.autoRestart || current.proc) return
      this.spawnRpcChild(current, projectId)
      // Re-ready the session after restart so a running conversation can resume.
      const waitReady = () => {
        if (!this.rpcs.get(projectId)?.ready) {
          setTimeout(waitReady, 100)
          return
        }
        if (current.sessionFile) {
          this._send(projectId, { type: 'switch_session', sessionPath: current.sessionFile }).catch(() => {})
        }
        this.onCrash?.(projectId)
      }
      waitReady()
    }, backoff)
  }

  ensureRpc(projectId: string, cwd: string, binaryPath: string | null, rpcMockScript: string | null): Promise<RpcEntry> {
    let entry = this.rpcs.get(projectId)
    if (entry && entry.proc && !entry.proc.killed) {
      entry.cwd = cwd || entry.cwd
      this._touch(projectId)
      return Promise.resolve(entry)
    }
    if (!binaryPath && !rpcMockScript) {
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
      lastActive: Date.now(),
      buffer: '',
      protocolVersion: 1,
      autoRestart: this.autoRestartDefaults.get(projectId) || false,
      restartBackoff: 1000,
      projectId,
      binaryPath,
      rpcMockScript,
      spawnArgs: ['--mode', 'rpc'],
    }
    this.rpcs.set(projectId, entry)
    this._touch(projectId)
    return new Promise<RpcEntry>((resolve, reject) => {
      let settled = false
      let startupError: string | null = null
      // Mock mode: a Node process runs the fixture script and ignores the real
      // binary. Under Electron, process.execPath is electron.exe (which cannot
      // run plain Node scripts), so resolve a real Node binary: npm's
      // npm_node_execpath when launched via npm, else 'node' from PATH. Under
      // plain Node (vitest) process.execPath is already correct.
      const isElectron = Boolean(process.versions && process.versions.electron)
      const nodeBinary = isElectron ? (process.env.npm_node_execpath || 'node') : process.execPath
      const binary = rpcMockScript ? nodeBinary : binaryPath!
      const args = rpcMockScript ? [rpcMockScript, '--mode', 'rpc'] : ['--mode', 'rpc']
      const child = spawn(binary, args, {
        cwd: entry!.cwd,
        env: process.env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      entry!.proc = child
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        entry!.ready = false
        entry!.proc = null
        reject(error)
      }
      // A request that was already in flight must never hang until its own
      // timeout — the process is gone, so settle it immediately.
      const rejectPending = (message: string) => {
        for (const pending of [...entry!.pending.values()]) pending.reject(new Error(message))
        entry!.pending.clear()
      }
      child.on('error', (error: Error) => {
        const wasReady = entry!.ready
        this.onEvent(projectId, { type: 'rpc_error', error: error.message })
        rejectPending('omp process failed to start')
        fail(error)
        this.maybeRestart(projectId, wasReady)
      })
      child.stdout.on('data', (chunk: Buffer) => {
        if (!entry!.ready && !startupError) {
          // omp prints a plain-text error (e.g. "No models available") and
          // exits before the RPC ready frame when the provider is missing.
          const text = chunk.toString('utf8').trim()
          if (text && !text.startsWith('{')) startupError = text.slice(0, 400)
        }
        this._onData(projectId, chunk)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        if (!entry!.ready && !startupError) {
          const text = chunk.toString('utf8').trim()
          if (text && !text.startsWith('{')) startupError = text.slice(0, 400)
        }
        this._onData(projectId, chunk, true)
      })
      child.on('exit', (code: number | null) => {
        const wasReady = entry!.ready
        entry!.ready = false
        entry!.proc = null
        if (!settled) fail(new Error(startupError || `omp exited with code ${code} before starting`))
        rejectPending(`omp process exited${code === null ? '' : ` (code ${code})`} before responding`)
        this.onEvent(projectId, { type: 'rpc_exit', code })
        this.maybeRestart(projectId, wasReady)
      })
      // Wait for the ready frame before resolving.
      const timeout = setTimeout(() => {
        if (entry!.ready) return
        fail(new Error(startupError || 'omp RPC did not start (check provider configuration)'))
      }, 12000)
      const checkReady = () => {
        if (settled) return
        if (entry!.ready) {
          clearTimeout(timeout)
          resolve(entry)
        } else {
          setTimeout(checkReady, 50)
        }
      }
      checkReady()
    }).then((entry: RpcEntry) => {
      this.negotiateProtocol(entry, projectId)
      return entry
    })
  }

  _onData(projectId: string, chunk: Buffer, isStderr = false) {
    const entry = this.rpcs.get(projectId)
    if (!entry) return
    // Reset idle timer on every incoming data event to prevent mid-stream kill
    this._touch(projectId)
    entry.buffer += chunk.toString('utf8')
    let newlineIndex: number
    while ((newlineIndex = entry.buffer.indexOf('\n')) !== -1) {
      const line = entry.buffer.slice(0, newlineIndex).trim()
      entry.buffer = entry.buffer.slice(newlineIndex + 1)
      if (!line) continue
      let frame: unknown
      try {
        frame = JSON.parse(line)
      } catch {
        if (isStderr) this.onEvent(projectId, { type: 'rpc_log', level: 'error', message: line.slice(0, 500) })
        continue
      }
      this._handleFrame(projectId, frame as RpcFrame)
    }
  }

  _handleFrame(projectId: string, frame: RpcFrame) {
    const entry = this.rpcs.get(projectId)
    if (!entry) return
    if (frame.type === 'ready') {
      entry.ready = true
      return
    }
    // Extension UI requests (select, confirm, input, editor, notify, etc.) are
    // forwarded to the host so it can show a dialog and respond with an
    // extension_ui_response frame. The response is dispatched via
    // dispatchRpcControlFrame at the omp process, so it must be sent as a raw
    // JSON line on stdin, not through the command queue.
    if (frame.type === 'extension_ui_request') {
      this.onEvent(projectId, frame)
      return
    }
    // Command response → resolve pending promise
    if (frame.type === 'response' && frame.id && entry.pending.has(frame.id)) {
      const { resolve, reject } = entry.pending.get(frame.id)!
      entry.pending.delete(frame.id)
      if (frame.success) resolve(frame.data)
      else reject(new Error(frame.error || 'omp command failed'))
      return
    }
    // Forward agent/session events to the caller
    if (frame.type && frame.type !== 'response') {
      this.onEvent(projectId, frame)
    }
  }

  /** Send an extension_ui_response frame to the omp RPC stdin (not a command). */
  respondExtensionUi(projectId: string, response: Record<string, unknown>): boolean {
    const entry = this.rpcs.get(projectId)
    if (!entry || !entry.proc || entry.proc.killed) return false
    response.type = 'extension_ui_response'
    try {
      entry.proc.stdin!.write(JSON.stringify(response) + '\n')
      return true
    } catch {
      return false
    }
  }

  /** Check whether the protocol supports chunked frames (v2). */
  isV2Protocol(projectId: string): boolean {
    const entry = this.rpcs.get(projectId)
    return entry?.protocolVersion === 2
  }

  /** Enable or disable auto-restart on crash. */
  setAutoRestart(projectId: string, enabled: boolean) {
    // Remember for the next spawn — callers may set this before the entry
    // exists (OmpManager.ensureRpc enables it by default on every ensure).
    this.autoRestartDefaults.set(projectId, enabled)
    const entry = this.rpcs.get(projectId)
    if (!entry) return
    entry.autoRestart = enabled
    entry.restartBackoff = 1000
  }

  // TODO(ts): RPC responses are external dynamic JSON — callers narrow the
  // shape per command (getState/getMessages/... cast to the expected record).
  _send(projectId: string, command: Record<string, unknown>, timeoutMs = 120000): Promise<unknown> {
    const entry = this.rpcs.get(projectId)
    if (!entry || !entry.proc || entry.proc.killed) {
      return Promise.reject(new Error('omp process is not running'))
    }
    this._touch(projectId)
    const id = `req_${entry.nextId++}`
    const payload = { ...command, id }
    return new Promise((resolve, reject) => {
      entry.pending.set(id, { resolve, reject })
      entry.proc!.stdin!.write(JSON.stringify(payload) + '\n')
      setTimeout(() => {
        if (entry.pending.has(id)) {
          entry.pending.delete(id)
          reject(new Error(`omp command timed out: ${String(command.type)}`))
        }
      }, timeoutMs)
    })
  }

  _touch(projectId: string) {
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

  killRpc(projectId: string) {
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
}
