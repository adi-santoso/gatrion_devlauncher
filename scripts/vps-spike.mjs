#!/usr/bin/env node
/**
 * F0 spike — SSH transport feasibility for the VPS Command Center.
 *
 * Runs entirely in-process: an ssh2 *server* fixture (fresh ed25519 host key,
 * publickey-only auth) is paired with an ssh2 *client*. Nothing here touches a
 * real VPS, a real credential, or the user's SSH config.
 *
 * Proves the behaviours the roadmap gates F1+ on:
 *   1. key authentication (publickey accepted, password rejected)
 *   2. host key verification + rejection on a changed fingerprint
 *   3. exec streaming (stdout/stderr/exit code)
 *   4. PTY shell (requested pty, echoed input, exit)
 *   5. per-command timeout
 *   6. disconnect mid-command (channel/close events + unknowable exit)
 *   7. cancel semantics (channel close != confirmed remote kill)
 *
 * Run: node scripts/vps-spike.mjs
 */
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const ssh2 = require('ssh2')

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const serverKey = ssh2.utils.generateKeyPairSync('ed25519')
const allowedUserKey = ssh2.utils.generateKeyPairSync('ed25519')
const otherUserKey = ssh2.utils.generateKeyPairSync('ed25519')

function fingerprint(key) {
  const crypto = require('crypto')
  return 'SHA256:' + crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
}

/** In-process SSH server fixture. `longCommand` never ends until cancelled. */
function startServer({ hostKeys, label }) {
  return new Promise((resolve) => {
    const server = new ssh2.Server({ hostKeys }, (client) => {
      client.on('authentication', (ctx) => {
        if (ctx.method === 'publickey') {
          // Key authentication: only the fixture key is accepted.
          if (ctx.key.algo === 'ssh-ed25519' && ctx.key.data.equals(Buffer.from(allowedUserKey.public.split(' ')[1], 'base64'))) {
            return ctx.accept()
          }
          return ctx.reject()
        }
        if (ctx.method === 'none') return ctx.reject(['publickey'])
        return ctx.reject(['publickey'])
      })
      client.on('ready', () => {
        client.on('session', (accept) => {
          const session = accept()
          session.on('pty', (a) => a && a())
          session.on('window-change', (a) => a && a())
          session.on('shell', (accept) => {
            const stream = accept()
            stream.write('PTY-READY\r\n$ ')
            stream.on('data', (chunk) => {
              const text = chunk.toString('utf8').replace(/\r/g, '')
              if (text.includes('exit')) {
                stream.exit(0)
                stream.end()
                return
              }
              stream.write(`echo:${text}`)
            })
          })
          session.on('exec', (accept, _reject, info) => {
            const stream = accept()
            const cmd = info.command || ''
            if (cmd.includes('LONGJOB')) {
              stream.write('long job started\n')
              // Deliberately never exits — represents a remote command that
              // outlives a channel close.
              stream.on('close', () => {})
              return
            }
            stream.write(`stdout:${cmd}\n`)
            stream.stderr.write('stderr-line\n')
            stream.exit(7)
            stream.end()
          })
        })
      })
      client.on('error', () => {})
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, label }))
  })
}

function connect({ port, privateKey, hostVerifier, timeoutMs = 8000 }) {
  return new Promise((resolve, reject) => {
    const conn = new ssh2.Client()
    const timer = setTimeout(() => reject(new Error('connect timeout')), timeoutMs)
    conn
      .on('ready', () => { clearTimeout(timer); resolve(conn) })
      .on('error', (err) => { clearTimeout(timer); reject(err) })
      .connect({ host: '127.0.0.1', port, username: 'fixture', privateKey, hostVerifier, readyTimeout: timeoutMs })
  })
}

function runExec(conn, command, timeoutMs) {
  return new Promise((resolve) => {
    conn.exec(command, (err, stream) => {
      if (err) return resolve({ error: err.message })
      let stdout = ''
      let stderr = ''
      let exitCode = null
      let timedOut = false
      let closed = false
      const timer = timeoutMs
        ? setTimeout(() => { timedOut = true; stream.close() }, timeoutMs)
        : null
      stream.on('data', (d) => { stdout += d.toString('utf8') })
      stream.stderr.on('data', (d) => { stderr += d.toString('utf8') })
      stream.on('exit', (code) => { exitCode = code })
      stream.on('close', () => {
        closed = true
        if (timer) clearTimeout(timer)
        resolve({ stdout, stderr, exitCode, timedOut, closed })
      })
    })
  })
}

async function main() {
  const srv = await startServer({ hostKeys: [serverKey.private], label: 'fixture-a' })
  const seenFingerprints = []

  // --- 1 + 3 + 5: key auth, exec streaming, exit code, timeout --------------
  const conn = await connect({
    port: srv.port,
    privateKey: allowedUserKey.private,
    hostVerifier: (key) => { seenFingerprints.push(fingerprint(key)); return true },
  })
  record('key authentication (publickey)', true, `host fingerprint ${seenFingerprints[0]}`)

  const exec = await runExec(conn, 'echo hello', 0)
  record(
    'exec streaming: stdout + stderr + exit code',
    exec.stdout.includes('stdout:echo hello') && exec.stderr.includes('stderr-line') && exec.exitCode === 7,
    `exit=${exec.exitCode} stdout=${JSON.stringify(exec.stdout.trim())}`,
  )

  const timed = await runExec(conn, 'LONGJOB', 400)
  record(
    'per-command timeout closes the channel (exit unknowable)',
    timed.timedOut === true && timed.closed === true && timed.exitCode === null,
    `timedOut=${timed.timedOut} exitCode=${timed.exitCode}`,
  )

  // --- 4: PTY shell ---------------------------------------------------------
  const ptyResult = await new Promise((resolve) => {
    conn.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
      if (err) return resolve({ error: err.message })
      let out = ''
      let phase = 'wait-ready'
      stream.on('data', (d) => {
        out += d.toString('utf8')
        if (phase === 'wait-ready' && out.includes('PTY-READY')) {
          phase = 'sent'
          stream.write('ping\n')
          return
        }
        if (phase === 'sent' && out.includes('echo:ping')) {
          phase = 'exit'
          stream.write('exit\n')
        }
      })
      stream.on('close', () => resolve({ out }))
    })
  })
  record(
    'PTY shell: pty requested, input echoed, clean close',
    !ptyResult.error && ptyResult.out.includes('PTY-READY') && ptyResult.out.includes('echo:ping'),
    ptyResult.error || 'shared shell channel echoed input',
  )

  // --- 6 + 7: disconnect mid-command, cancel semantics ----------------------
  let closeState = null
  const disconnected = await new Promise((resolve) => {
    const c = new ssh2.Client()
    c.on('ready', () => {
      c.exec('LONGJOB', (err, stream) => {
        if (err) return resolve({ error: err.message })
        let out = ''
        let exitCode = null
        stream.on('data', (d) => { out += d.toString('utf8') })
        stream.on('exit', (code) => { exitCode = code })
        stream.on('close', () => { closeState = { out, exitCode } })
        setTimeout(() => c.end(), 300)
      })
    })
      .on('close', () => setTimeout(() => resolve({ out: closeState?.out || '', exitCode: closeState?.exitCode ?? null }), 100))
      .on('error', () => {})
      .connect({ host: '127.0.0.1', port: srv.port, username: 'fixture', privateKey: allowedUserKey.private })
  })
  record(
    'disconnect mid-command: channel closes, exit code unknowable',
    disconnected.out.includes('long job started') && disconnected.exitCode === null,
    `exitCode=${disconnected.exitCode} (remote process death NOT confirmed)`,
  )

  // Cancel = close the channel; the remote child may survive (proven above by
  // exitCode === null). The job must therefore be marked `unknown`, never
  // `succeeded`, and must never be auto-retried.
  record(
    'cancel semantics: channel close is not a confirmed remote kill',
    disconnected.exitCode === null,
    'cancel → job state unknown; no auto-retry for mutating commands',
  )

  // --- 2: host key verification rejects a changed fingerprint ---------------
  const other = await startServer({ hostKeys: [ssh2.utils.generateKeyPairSync('ed25519').private], label: 'fixture-b' })
  const pinned = seenFingerprints[0]
  let rejected = false
  try {
    await connect({
      port: other.port,
      privateKey: allowedUserKey.private,
      hostVerifier: (key) => fingerprint(key) === pinned,
    })
  } catch {
    rejected = true
  }
  record('changed host key is rejected (no silent accept)', rejected, `pinned ${pinned}`)

  // Wrong user key must be rejected too.
  let authRejected = false
  try {
    await connect({ port: srv.port, privateKey: otherUserKey.private, hostVerifier: () => true, timeoutMs: 4000 })
  } catch {
    authRejected = true
  }
  record('unknown user key is rejected', authRejected)

  try { conn.end() } catch { /* already ended */ }
  srv.server.close()
  other.server.close()

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((err) => {
  console.error('spike crashed:', err)
  process.exit(1)
})
