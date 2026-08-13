const assert = require('assert/strict')
const fs = require('fs').promises
const os = require('os')
const path = require('path')
const Module = require('module')

const handlers = new Map()
const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: { isPackaged: false },
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const { setupProjectHandlers } = require('../../electron/handlers/projectHandlers')
Module._load = originalLoad

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gatrion-envfiles-'))
  const event = { senderFrame: { url: 'http://localhost:5173/' } }

  const storageManager = { loadProjects: async () => [], updateProjects: async (fn) => fn([]) }
  const processManager = { on: () => {}, getProcessStatus: () => ({ status: 'STOPPED' }), STATUS: { RUNNING: 'RUNNING', STARTING: 'STARTING', STOPPING: 'STOPPING' } }
  const mainWindow = { isDestroyed: () => false, webContents: { send: () => {} } }
  setupProjectHandlers(storageManager, processManager, mainWindow)

  try {
    await fs.writeFile(path.join(root, '.env'), 'APP_KEY=secret\n', 'utf8')
    await fs.writeFile(path.join(root, '.env.local'), 'LOCAL=1\n', 'utf8')
    await fs.writeFile(path.join(root, 'package.json'), '{}', 'utf8')
    await fs.mkdir(path.join(root, 'nested'))
    await fs.writeFile(path.join(root, 'nested', '.env'), 'NESTED=1\n', 'utf8')

    const list = await handlers.get('list-env-files')(event, root)
    assert.equal(list.success, true)
    assert.deepEqual(list.files, ['.env', '.env.local'])

    const read = await handlers.get('read-env-file')(event, root, '.env')
    assert.equal(read.success, true)
    assert.equal(read.content, 'APP_KEY=secret\n')
    assert.ok(read.modifiedAt > 0)

    const write = await handlers.get('write-env-file')(event, root, '.env', 'APP_KEY=rotated\n')
    assert.equal(write.success, true)
    assert.equal(await fs.readFile(path.join(root, '.env'), 'utf8'), 'APP_KEY=rotated\n')
    const backups = (await fs.readdir(root)).filter((name) => name.startsWith('.env.backup-'))
    assert.equal(backups.length, 1)
    assert.equal(await fs.readFile(path.join(root, backups[0]), 'utf8'), 'APP_KEY=secret\n')

    const traversal = await handlers.get('read-env-file')(event, root, '../.env')
    assert.equal(traversal.success, false)
    assert.match(traversal.error, /\.env file/)

    const nestedDenied = await handlers.get('read-env-file')(event, root, 'nested/.env')
    assert.equal(nestedDenied.success, false)

    const badName = await handlers.get('read-env-file')(event, root, 'package.json')
    assert.equal(badName.success, false)
    assert.match(badName.error, /\.env file/)

    const missing = await handlers.get('read-env-file')(event, root, '.env.production')
    assert.equal(missing.success, false)
    assert.match(missing.error, /does not exist/)

    const untrusted = await handlers.get('list-env-files')({ senderFrame: { url: 'https://attacker.example/' } }, root)
    assert.equal(untrusted.success, false)
    assert.match(untrusted.error, /Unauthorized/)

    console.log('Env file handler checks passed')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
