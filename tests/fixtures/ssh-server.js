// In-process SSH server fixture for VPS tests.
//
// Fresh ed25519 host + user keys per fixture; publickey-only auth; canned exec
// responses for the overview/services/logs probes and a never-ending long job
// so timeout/disconnect/cancel paths can be exercised. Nothing here touches a
// real host, key, or the user's ~/.ssh.
const ssh2 = require('ssh2')

const OVERVIEW_OUTPUT = [
  '___os___',
  'NAME="Fixture Linux"',
  'VERSION="1.0"',
  'PRETTY_NAME="Fixture Linux 1.0"',
  '___kernel___',
  '6.8.0-fixture',
  '___host___',
  'fixture-host',
  '___uptime___',
  '172800.42 999999.00',
  '___mem___',
  'MemTotal:        2048000 kB',
  'MemFree:          512000 kB',
  'MemAvailable:    1024000 kB',
  '___load___',
  '0.15 0.10 0.05 1/200 4242',
  '___stat___',
  'cpu  100 0 50 1000 20 0 5 0 0 0',
  '___disk___',
  'Filesystem     1024-blocks     Used Available Capacity Mounted on',
  '/dev/sda1         41000000 20500000  20500000      50% /',
  '___cwd___',
  '/var/www/app',
  '___end___',
].join('\n')

const SERVICES_OUTPUT = [
  '  nginx.service      loaded active running A high performance web server',
  '  api.service        loaded active running Fixture API',
  '  broken.service     loaded failed failed  Fixture broken unit',
  '● dead.service       not-found inactive dead dead.service',
  'LOAD   = Reflects whether the unit definition was properly loaded.',
].join('\n')

const LOGS_OUTPUT = [
  '2026-09-30T10:00:01+0000 api[101]: started',
  '2026-09-30T10:00:02+0000 api[101]: listening on :8080',
].join('\n')

function defaultResponse(command) {
  if (command.includes('___os___')) return { stdout: OVERVIEW_OUTPUT, exitCode: 0 }
  if (command.includes('systemctl list-units')) return { stdout: SERVICES_OUTPUT, exitCode: 0 }
  if (command.includes('journalctl')) return { stdout: LOGS_OUTPUT, exitCode: 0 }
  return { stdout: `ran:${command}\n`, exitCode: 0 }
}

/**
 * Start the fixture. `handlers` lets a test override a command:
 *   [{ match: 'restart', result: { stdout: 'exit:1', exitCode: 0 } }]
 */
function fixtureKey() {
  // ssh2 1.17 can occasionally generate a key its own parser rejects (also
  // reproduced outside Vitest). Validate fixture setup, never user credentials.
  for (let attempt = 0; attempt < 10; attempt++) {
    const key = ssh2.utils.generateKeyPairSync('ed25519')
    if (!(ssh2.utils.parseKey(key.private) instanceof Error)) return key
  }
  throw new Error('Could not generate a valid SSH fixture key')
}

function createSshFixture(options = {}) {
  const serverKey = fixtureKey()
  const userKey = fixtureKey()
  const userKeyBlob = Buffer.from(userKey.public.split(' ')[1], 'base64')
  const commands = []
  const authAttempts = []
  const shellInputs = []
  const shellWindows = []

  const server = new ssh2.Server({ hostKeys: [options.hostKey || serverKey.private] }, (client) => {
    client.on('authentication', (ctx) => {
      authAttempts.push(ctx.method)
      if (ctx.method === 'publickey' && ctx.key.data.equals(userKeyBlob)) return ctx.accept()
      if (ctx.method === 'none') return ctx.reject(['publickey'])
      return ctx.reject(['publickey'])
    })
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept()
        session.on('pty', (a) => a && a())
        session.on('window-change', (a, _reject, info) => { shellWindows.push(info); if (a) a() })
        session.on('shell', (accept) => {
          const stream = accept()
          stream.write('fixture-shell$ ')
          stream.on('data', (chunk) => {
            shellInputs.push(chunk.toString('utf8'))
            const text = chunk.toString('utf8').replace(/\r/g, '')
            if (text.includes('exit')) { stream.exit(0); stream.end(); return }
            stream.write(`echo:${text}`)
          })
        })
        session.on('exec', (accept, _reject, info) => {
          const command = info.command || ''
          commands.push(command)
          const stream = accept()
          if (options.longCommandMatch && command.includes(options.longCommandMatch)) {
            stream.write('long job started\n')
            return // deliberately never exits
          }
          const custom = (options.handlers || []).find((handler) => command.includes(handler.match))
          const result = custom ? custom.result : defaultResponse(command)
          if (result.stdout) stream.write(result.stdout)
          if (result.stderr) stream.stderr.write(result.stderr)
          stream.exit(result.exitCode ?? 0)
          stream.end()
        })
      })
    })
    client.on('error', () => {})
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        authAttempts,
        shellInputs,
        shellWindows,
        clientPrivateKey: userKey.private,
        otherPrivateKey: ssh2.utils.generateKeyPairSync('ed25519').private,
        commands,
        close: () => new Promise((done) => { server.close(done); setImmediate(done) }),
      })
    })
  })
}

module.exports = { createSshFixture, OVERVIEW_OUTPUT, SERVICES_OUTPUT, LOGS_OUTPUT }
