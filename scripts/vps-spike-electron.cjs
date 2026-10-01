/**
 * F0 spike (Electron leg) — proves the ssh2 dependency loads and speaks SSH
 * inside the Electron main process on Windows (the packaged runtime), not just
 * plain Node. Uses the same in-process server fixture as scripts/vps-spike.mjs.
 *
 * Run: npx electron scripts/vps-spike-electron.cjs
 */
const { app } = require('electron')
const ssh2 = require('ssh2')

async function run() {
  const serverKey = ssh2.utils.generateKeyPairSync('ed25519')
  const userKey = ssh2.utils.generateKeyPairSync('ed25519')

  const server = new ssh2.Server({ hostKeys: [serverKey.private] }, (client) => {
    client.on('authentication', (ctx) => ctx.accept())
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept()
        session.on('exec', (accept, _reject, info) => {
          const stream = accept()
          stream.write(`electron-exec:${info.command}\n`)
          stream.exit(0)
          stream.end()
        })
      })
    })
    client.on('error', () => {})
  })

  const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })

  const output = await new Promise((resolve, reject) => {
    const conn = new ssh2.Client()
    conn
      .on('ready', () => {
        conn.exec('uname -a', (err, stream) => {
          if (err) return reject(err)
          let out = ''
          stream.on('data', (d) => { out += d.toString('utf8') })
          stream.on('close', () => { conn.end(); resolve(out.trim()) })
        })
      })
      .on('error', reject)
      .connect({ host: '127.0.0.1', port, username: 'fixture', privateKey: userKey.private, hostVerifier: () => true })
  })

  server.close()
  const ok = output === 'electron-exec:uname -a'
  console.log(`${ok ? 'PASS' : 'FAIL'}  ssh2 inside Electron main — ${JSON.stringify(output)}`)
  console.log(`electron=${process.versions.electron} node=${process.versions.node} modules=${process.versions.modules} ssh2=${require('ssh2/package.json').version}`)
  app.exit(ok ? 0 : 1)
}

app.whenReady().then(() =>
  run().catch((err) => {
    console.error('FAIL  ssh2 inside Electron —', err && err.message ? err.message : err)
    app.exit(1)
  }),
)
