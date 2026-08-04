const assert = require('assert/strict')
const Module = require('module')

const handlers = new Map()
const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
  if (request === 'electron') {
    return { app: { isPackaged: false }, ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const { setupProcessHandlers } = require('./electron/handlers/processHandlers')
Module._load = originalLoad

async function run() {
  const project = {
    id: 'trusted-id', path: 'C:/trusted', startCommand: 'npm start',
    commands: [
      { id: 'app', name: 'App', command: 'npm start', port: 3000, primary: true },
      { id: 'assets', name: 'Assets', command: 'npm run dev', port: 5173, primary: false },
    ],
    envVars: [{ key: 'TOKEN', value: 'secret' }], port: 3000,
  }
  const calls = []
  const processManager = {
    on: () => {},
    startProcess: async (...args) => { calls.push(args); return { status: 'RUNNING' } },
    restartProcess: async (...args) => { calls.push(args); return { status: 'RUNNING' } },
    getProcessStatus: () => ({ status: 'RUNNING' }),
  }
  const storageManager = { loadProjects: async () => [project] }
  const mainWindow = { isDestroyed: () => false, webContents: { send: () => {} } }
  setupProcessHandlers(processManager, storageManager, mainWindow)
  const event = { senderFrame: { url: 'http://localhost:5173/' } }

  const maliciousArgs = ['C:/malicious', 'del /s /q C:\\*', { TOKEN: 'attacker' }, 1]
  const started = await handlers.get('start-project')(event, project.id, ...maliciousArgs)
  assert.equal(started.success, true)
  assert.deepEqual(calls[0].slice(0, 5), [project.id, project.path, project.commands, { TOKEN: 'secret' }, project.port])

  const restarted = await handlers.get('restart-project')(event, project.id, ...maliciousArgs)
  assert.equal(restarted.success, true)
  assert.deepEqual(calls[1].slice(0, 5), [project.id, project.path, project.commands, { TOKEN: 'secret' }, project.port])

  const missing = await handlers.get('start-project')(event, 'missing')
  assert.equal(missing.success, false)
  assert.match(missing.error, /not found/)
  assert.equal(calls.length, 2)

  const unauthorized = await handlers.get('start-project')(
    { senderFrame: { url: 'https://attacker.example/' } },
    project.id
  )
  assert.equal(unauthorized.success, false)
  assert.match(unauthorized.error, /Unauthorized/)
  assert.equal(calls.length, 2)

  const all = await handlers.get('start-all-projects')(event, [project.id])
  assert.equal(all[0].projectId, project.id)
  assert.equal(calls[2][1], project.path)
  assert.deepEqual(calls[2][2], project.commands)

  const injected = await handlers.get('start-all-projects')(event, [{ id: project.id, path: 'C:/bad' }])
  assert.deepEqual(injected, [])
  assert.equal(calls.length, 3)

  console.log('Process handler checks passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
