const assert = require('assert/strict')
const net = require('net')
const ProcessManager = require('./electron/managers/ProcessManager')

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server.address().port))
  })
}

function close(server) {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}

async function waitForStatus(manager, projectId, expected, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (manager.getProcessStatus(projectId).status === expected) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.fail(`Timed out waiting for ${projectId} to reach ${expected}`)
}

async function run() {
  const manager = new ProcessManager()

  await assert.rejects(manager.startProcess('', '.', 'node --version'), /Project ID is required/)
  await assert.rejects(manager.startProcess('missing-command', '.', ''), /Start command is required/)
  await assert.rejects(manager.startProcess('bad-port', '.', 'node --version', {}, 0), /Port must be an integer/)
  await assert.rejects(manager.startProcess('missing-primary', '.', [
    { id: 'one', name: 'One', command: 'node --version', port: null, primary: false },
  ]), /exactly one primary/)
  await assert.rejects(manager.startProcess('duplicate-port', '.', [
    { id: 'one', name: 'One', command: 'node --version', port: 3000, primary: true },
    { id: 'two', name: 'Two', command: 'node --version', port: 3000, primary: false },
  ]), /configured more than once/)

  const occupiedServer = net.createServer()
  const occupiedPort = await listen(occupiedServer)
  await assert.rejects(
    manager.startProcess('occupied-port', '.', 'node --version', {}, occupiedPort),
    new RegExp(`Port ${occupiedPort} is already in use`)
  )
  await close(occupiedServer)

  manager.processes.set('readiness-check', { status: manager.STATUS.STARTING })
  manager.isPortOpen = async () => true
  await manager.waitForPort('readiness-check', 1234, 100)
  assert.equal(manager.getProcessStatus('readiness-check').status, manager.STATUS.RUNNING)

  manager.processes.set('readiness-cancelled', { status: manager.STATUS.STOPPED })
  assert.equal(await manager.waitForPort('readiness-cancelled', 1234, 100), false)

  manager.processes.set('readiness-timeout', { status: manager.STATUS.STARTING })
  manager.isPortOpen = async () => false
  await assert.rejects(manager.waitForPort('readiness-timeout', 1234, 10), /Timed out waiting for port 1234/)
  manager.processes.delete('readiness-check')
  manager.processes.delete('readiness-cancelled')
  manager.processes.delete('readiness-timeout')
  delete manager.isPortOpen

  manager.processes.set('stopping-project', { status: manager.STATUS.STOPPING })
  await assert.rejects(manager.startProcess('stopping-project', '.', 'node --version'), /already active/)
  manager.processes.delete('stopping-project')

  manager.processes.set('resource-project', {
    pid: 101,
    status: manager.STATUS.RUNNING,
    commands: new Map([
      ['app', { pid: 101 }],
      ['assets', { pid: 202 }],
    ]),
  })
  const originalTreeResources = manager.getProcessTreeResources.bind(manager)
  let sampledPids
  manager.getProcessTreeResources = async (pids) => {
    sampledPids = pids
    return { cpu: 12.5, memory: 345 }
  }
  const projectStats = await manager.getProjectStats('resource-project')
  assert.deepEqual({ ...projectStats, lastUpdated: 0 }, {
    pid: 101, cpu: 12.5, memory: 345, lastUpdated: 0,
  })
  assert.ok(projectStats.lastUpdated > 0)
  assert.deepEqual(sampledPids, [101, 202])
  manager.getProcessTreeResources = originalTreeResources
  manager.processes.delete('resource-project')

  await manager.startProcess('clean-exit', '.', 'node -e "process.exit(0)"')
  await waitForStatus(manager, 'clean-exit', manager.STATUS.STOPPED)

  await manager.startProcess('failed-exit', '.', 'node -e "process.exit(7)"')
  await waitForStatus(manager, 'failed-exit', manager.STATUS.ERROR)
  assert.equal(manager.getProcessStatus('failed-exit').exitCode, 7)

  await manager.startProcess('long-running', '.', 'node -e "setInterval(() => {}, 1000)"')
  await waitForStatus(manager, 'long-running', manager.STATUS.RUNNING)
  const runningStatus = manager.getProcessStatus('long-running')
  assert.equal(runningStatus.status, manager.STATUS.RUNNING)
  assert.ok(runningStatus.pid)
  assert.ok(runningStatus.startedAt)

  const log = manager.addLog('long-running', 'hydrated output', 'stdout')
  assert.deepEqual(manager.getLogs('long-running'), [log])
  assert.ok(log.id)
  assert.deepEqual(manager.getLogs('long-running', 0), [])
  assert.deepEqual(manager.getLogs('long-running', 'invalid'), [log])
  manager.clearLogs('long-running')
  assert.deepEqual(manager.getLogs('long-running'), [])

  if (process.platform === 'win32') {
    const resources = await manager.getProcessResources(runningStatus.pid)
    assert.ok(resources, 'Windows process resources should be available')
    assert.ok(resources.memory > 0, 'Windows memory usage should be greater than zero')
    assert.ok(resources.cpu >= 0 && resources.cpu <= 100, 'Windows CPU usage should be a percentage')
  }

  await manager.stopProcess('long-running')
  assert.equal(manager.getProcessStatus('long-running').status, manager.STATUS.STOPPED)
  assert.equal(manager.getProcessStatus('long-running').pid, null)

  await manager.startProcess('composite', '.', [
    { id: 'app', name: 'App', command: 'node -e "setInterval(() => {}, 1000)"', port: null, primary: true },
    { id: 'assets', name: 'Assets', command: 'node -e "setInterval(() => {}, 1000)"', port: null, primary: false },
  ])
  await waitForStatus(manager, 'composite', manager.STATUS.RUNNING)
  const compositeStatus = manager.getProcessStatus('composite')
  assert.equal(compositeStatus.commands.length, 2)
  assert.ok(compositeStatus.commands.every((item) => item.pid))
  await manager.stopProcess('composite')
  assert.equal(manager.getProcessStatus('composite').status, manager.STATUS.STOPPED)
  assert.ok(manager.getProcessStatus('composite').commands.every((item) => item.pid === null))

  await manager.startProcess('composite-failure', '.', [
    { id: 'app', name: 'App', command: 'node -e "setInterval(() => {}, 1000)"', port: null, primary: true },
    { id: 'assets', name: 'Assets', command: 'node -e "setTimeout(() => process.exit(9), 100)"', port: null, primary: false },
  ])
  await waitForStatus(manager, 'composite-failure', manager.STATUS.ERROR)
  assert.match(manager.getProcessStatus('composite-failure').error, /Assets exited with code 9/)

  const staggeredPorts = { app: 0, assets: 0 }
  manager.processes.set('staggered-readiness', {
    status: manager.STATUS.STARTING,
    runId: Symbol('staggered-readiness'),
    commands: new Map([
      ['app', { id: 'app', name: 'Laravel', port: null, primary: true, status: manager.STATUS.STARTING, ready: false }],
      ['assets', { id: 'assets', name: 'Inertia Vue assets', port: null, primary: false, status: manager.STATUS.STARTING, ready: false }],
    ]),
    logs: [],
  })
  const staggered = manager.processes.get('staggered-readiness')
  const appPort = 38081
  const assetsPort = 35173
  staggered.commands.get('app').port = appPort
  staggered.commands.get('assets').port = assetsPort
  staggeredPorts.app = appPort
  staggeredPorts.assets = assetsPort
  const staggeredReadyAt = Date.now() + 450
  manager.isPortOpen = async (port) => {
    if (port === staggeredPorts.assets) return true
    if (port === staggeredPorts.app) return Date.now() >= staggeredReadyAt
    return false
  }
  await manager.waitForCompositeReady('staggered-readiness', staggered.runId)
  const staggeredStatus = manager.getProcessStatus('staggered-readiness')
  assert.equal(staggeredStatus.status, manager.STATUS.RUNNING)
  assert.ok(staggeredStatus.commands.every((item) => item.ready && item.status === manager.STATUS.RUNNING))
  delete manager.isPortOpen
  manager.processes.delete('staggered-readiness')

  console.log('ProcessManager checks passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
