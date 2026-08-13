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

const { setupProcessHandlers, resolveLaunchConfig, withRequestedPort } = require('../../electron/handlers/processHandlers')
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
  const expectedCommands = [
    { ...project.commands[0] },
    { ...project.commands[1], command: 'npm run dev -- --port=5173' },
  ]
  const started = await handlers.get('start-project')(event, project.id, ...maliciousArgs)
  assert.equal(started.success, true)
  assert.deepEqual(calls[0].slice(0, 5), [project.id, project.path, expectedCommands, { TOKEN: 'secret' }, project.port])

  const restarted = await handlers.get('restart-project')(event, project.id, ...maliciousArgs)
  assert.equal(restarted.success, true)
  assert.deepEqual(calls[1].slice(0, 5), [project.id, project.path, expectedCommands, { TOKEN: 'secret' }, project.port])

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
  assert.deepEqual(calls[2][2], expectedCommands)

  const injected = await handlers.get('start-all-projects')(event, [{ id: project.id, path: 'C:/bad' }])
  assert.deepEqual(injected, [])
  assert.equal(calls.length, 3)

  const laravelProject = {
    id: 'laravel-id', path: 'C:/laravel', type: 'LARAVEL', startCommand: 'php artisan serve',
    commands: [
      { id: 'app', name: 'Laravel', command: 'php artisan serve', port: 8001, primary: true },
      { id: 'assets', name: 'Inertia Vue assets', command: 'npm run dev', port: 5173, primary: false },
    ],
    envVars: [], port: 8001,
  }
  storageManager.loadProjects = async () => [laravelProject]
  const laravelStarted = await handlers.get('start-project')(event, laravelProject.id)
  assert.equal(laravelStarted.success, true)
  assert.equal(calls[3][2][0].command, 'php artisan serve --port=8001')
  assert.equal(calls[3][2][1].command, 'npm run dev -- --port=5173')
  assert.equal(calls[3][4], 8001)

  const laravelRestarted = await handlers.get('restart-project')(event, laravelProject.id)
  assert.equal(laravelRestarted.success, true)
  assert.equal(calls[4][2][0].command, 'php artisan serve --port=8001')
  assert.equal(calls[4][2][1].command, 'npm run dev -- --port=5173')

  assert.equal(withRequestedPort('php artisan serve', 8001), 'php artisan serve --port=8001')
  assert.equal(withRequestedPort('php artisan serve --port=9000', 8001), 'php artisan serve --port=9000')
  assert.equal(withRequestedPort('npm run dev', 5174), 'npm run dev -- --port=5174')
  assert.equal(withRequestedPort('npm run dev -- --port=5175', 5174), 'npm run dev -- --port=5175')
  assert.equal(withRequestedPort('pnpm dev', 5174), 'pnpm dev --port=5174')
  assert.equal(withRequestedPort('yarn dev', 5174), 'yarn dev --port=5174')
  assert.equal(withRequestedPort('bun dev', 5174), 'bun dev --port=5174')

  const fallbackLaravel = resolveLaunchConfig({ ...laravelProject, commands: null })
  assert.equal(fallbackLaravel.command, 'php artisan serve --port=8001')
  assert.equal(fallbackLaravel.port, 8001)

  console.log('Process handler checks passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
