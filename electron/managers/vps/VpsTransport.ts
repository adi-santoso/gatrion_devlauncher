/**
 * VpsTransport — thin ssh2 wrapper for one persistent server connection.
 *
 * One Client per server (D2). Each `exec` opens its own channel; a shell
 * channel carries the interactive PTY terminal. The transport never decides
 * policy or job state — it only surfaces bytes, exit codes, and connection
 * events so VpsManager can apply policy, redaction, and bounded buffers.
 *
 * Host key verification is a hard gate: `hostVerifier` must accept the observed
 * key before the handshake completes, so a changed key can never be silently
 * trusted (proven by the F0 spike).
 */
import { EventEmitter } from 'events'
import * as crypto from 'crypto'
import type { VpsSecret } from './vpsCredentials'

const ssh2 = require('ssh2') as typeof import('ssh2')

export interface HostKeyInfo {
  algorithm: string
  fingerprint: string
}

/** Parse the SSH host key blob into algorithm + SHA256 fingerprint (OpenSSH style). */
export function describeHostKey(key: Buffer): HostKeyInfo {
  let algorithm = 'unknown'
  try {
    const len = key.readUInt32BE(0)
    algorithm = key.subarray(4, 4 + len).toString('utf8')
  } catch {
    /* malformed blob — keep the fingerprint anyway */
  }
  const digest = crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
  return { algorithm, fingerprint: `SHA256:${digest}` }
}

export interface VpsTransportConfig {
  host: string
  port: number
  username: string
  secret: VpsSecret | null
  /** Called with the observed host key; return true to accept the handshake. */
  verifyHostKey: (info: HostKeyInfo) => boolean
  readyTimeoutMs?: number
}

export interface VpsExecOutcome {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  cancelled: boolean
  closed: boolean
}

export interface VpsExecHandle {
  result: Promise<VpsExecOutcome>
  /** Ask the channel to close. NOT a confirmed remote kill (F0 spike). */
  cancel: () => void
}

export interface VpsShellHandle {
  id: string
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  close: () => void
}

export class VpsTransport extends EventEmitter {
  private client: InstanceType<typeof ssh2.Client> | null = null
  private connected = false
  private shells = new Map<string, VpsShellHandle>()

  constructor(private config: VpsTransportConfig) {
    super()
  }

  get isConnected(): boolean {
    return this.connected
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = new ssh2.Client()
      this.client = client
      let settled = false
      const fail = (error: Error): void => {
        if (settled) return
        settled = true
        this.connected = false
        reject(error)
      }
      client
        .on('ready', () => {
          settled = true
          this.connected = true
          resolve()
        })
        .on('error', (error: Error) => {
          this.connected = false
          if (!settled) fail(error)
          else this.emit('connection-error', error)
        })
        .on('close', () => {
          const wasConnected = this.connected
          this.connected = false
          this.client = null
          this.shells.clear()
          if (!settled) fail(new Error('SSH connection closed before authentication completed'))
          if (wasConnected) this.emit('close')
        })

      const connectConfig: Record<string, unknown> = {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        readyTimeout: this.config.readyTimeoutMs ?? 12000,
        keepaliveInterval: 15000,
        keepaliveCountMax: 3,
        hostVerifier: (key: Buffer) => this.config.verifyHostKey(describeHostKey(key)),
      }
      const secret = this.config.secret
      if (secret?.kind === 'key' && secret.privateKey) {
        connectConfig.privateKey = secret.privateKey
        if (secret.passphrase) connectConfig.passphrase = secret.passphrase
      } else if (secret?.kind === 'password' && secret.password) {
        connectConfig.password = secret.password
      } else if (secret?.kind === 'agent') {
        connectConfig.agent =
          process.env.SSH_AUTH_SOCK ||
          (process.platform === 'win32' ? '\\\\.\\pipe\\openssh-ssh-agent' : undefined)
      }
      try {
        client.connect(connectConfig)
      } catch (error) {
        fail(error as Error)
      }
    })
  }

  /** Run one command on its own channel. Streams data through `onData`. */
  exec(command: string, opts: { timeoutMs?: number; onData?: (chunk: string) => void } = {}): VpsExecHandle {
    let stream: { close: () => void } | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    const state = { timedOut: false, cancelled: false }
    let finished = false
    let stdout = ''
    let stderr = ''
    let exitCode: number | null = null
    let finishUnknown: () => void = () => {}

    const result = new Promise<VpsExecOutcome>((resolve, reject) => {
      const finish = (closed: boolean): void => {
        if (finished) return
        finished = true
        if (timer) clearTimeout(timer)
        resolve({ stdout, stderr, exitCode, timedOut: state.timedOut, cancelled: state.cancelled, closed })
      }
      finishUnknown = () => finish(false)
      const client = this.client
      if (!client || !this.connected) {
        reject(new Error('SSH connection is not established'))
        return
      }
      if (opts.timeoutMs && opts.timeoutMs > 0) {
        timer = setTimeout(() => {
          state.timedOut = true
          try { stream?.close() } catch { /* peer unavailable */ }
          finish(false)
        }, opts.timeoutMs)
      }
      client.exec(command, (error: Error | undefined, channel) => {
        if (error) {
          if (timer) clearTimeout(timer)
          reject(error)
          return
        }
        stream = channel
        if (finished) { channel.close(); return }
        channel.on('data', (chunk: Buffer) => {
          if (finished) return
          const text = chunk.toString('utf8')
          stdout = (stdout + text).slice(-128 * 1024)
          opts.onData?.(text)
        })
        channel.stderr.on('data', (chunk: Buffer) => {
          if (finished) return
          const text = chunk.toString('utf8')
          stderr = (stderr + text).slice(-128 * 1024)
          opts.onData?.(text)
        })
        channel.on('exit', (code: number | null) => { exitCode = code ?? null })
        channel.on('close', () => {
          finish(true)
        })
        channel.on('error', (err: Error) => {
          if (timer) clearTimeout(timer)
          reject(err)
        })
      })
    })

    return {
      result,
      cancel: () => {
        state.cancelled = true
        try { stream?.close() } catch { /* channel already closed */ }
        finishUnknown()
      },
    }
  }

  /** Open an interactive PTY shell and register it by id. */
  openShell(id: string, opts: { cols: number; rows: number; term?: string }): Promise<VpsShellHandle> {
    return new Promise((resolve, reject) => {
      const client = this.client
      if (!client || !this.connected) {
        reject(new Error('SSH connection is not established'))
        return
      }
      client.shell({ term: opts.term || 'xterm-256color', cols: opts.cols, rows: opts.rows }, (error: Error | undefined, stream) => {
        if (error) {
          reject(error)
          return
        }
        const handle: VpsShellHandle = {
          id,
          write: (data: string) => { try { stream.write(data) } catch { /* channel closed */ } },
          resize: (cols: number, rows: number) => { try { stream.setWindow(rows, cols, 0, 0) } catch { /* pty gone */ } },
          close: () => { try { stream.close() } catch { /* already closed */ } },
        }
        this.shells.set(id, handle)
        stream.on('data', (chunk: Buffer) => this.emit('shell-data', id, chunk.toString('utf8')))
        stream.on('error', (err: Error) => this.emit('shell-error', id, err.message))
        stream.on('close', () => {
          this.shells.delete(id)
          this.emit('shell-close', id)
        })
        resolve(handle)
      })
    })
  }

  writeShell(id: string, data: string): boolean {
    const handle = this.shells.get(id)
    if (!handle) return false
    handle.write(data)
    return true
  }

  resizeShell(id: string, cols: number, rows: number): boolean {
    const handle = this.shells.get(id)
    if (!handle) return false
    handle.resize(cols, rows)
    return true
  }

  closeShell(id: string): void {
    const handle = this.shells.get(id)
    this.shells.delete(id)
    handle?.close()
  }

  /** Tear the connection down. Remote children may outlive the channel. */
  disconnect(): void {
    for (const id of [...this.shells.keys()]) this.closeShell(id)
    const client = this.client
    this.client = null
    this.connected = false
    try { client?.end() } catch { /* already gone */ }
  }
}

export default VpsTransport
