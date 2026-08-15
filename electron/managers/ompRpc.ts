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
  private onEvent: (projectId: string, event: unknown) => void

  constructor(onEvent: (projectId: string, event: unknown) => void) {
    this.onEvent = onEvent
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
    }
    this.rpcs.set(projectId, entry)
    this._touch(projectId)
    return new Promise((resolve, reject) => {
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
      child.on('error', (error: Error) => {
        this.onEvent(projectId, { type: 'rpc_error', error: error.message })
        fail(error)
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
        entry!.ready = false
        entry!.proc = null
        if (!settled) fail(new Error(startupError || `omp exited with code ${code} before starting`))
        this.onEvent(projectId, { type: 'rpc_exit', code })
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
    })
  }

  _onData(projectId: string, chunk: Buffer, isStderr = false) {
    const entry = this.rpcs.get(projectId)
    if (!entry) return
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
