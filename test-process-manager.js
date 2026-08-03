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

  await manager.startProcess('clean-exit', '.', 'node -e "process.exit(0)"')
  await waitForStatus(manager, 'clean-exit', manager.STATUS.STOPPED)

  await manager.startProcess('failed-exit', '.', 'node -e "process.exit(7)"')
  await waitForStatus(manager, 'failed-exit', manager.STATUS.ERROR)
  assert.equal(manager.getProcessStatus('failed-exit').exitCode, 7)

  await manager.startProcess('long-running', '.', 'node -e "setInterval(() => {}, 1000)"')
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

  console.log('ProcessManager checks passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
