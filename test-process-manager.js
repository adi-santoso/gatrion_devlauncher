const assert = require('assert/strict')
const ProcessManager = require('./electron/managers/ProcessManager')

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

  assert.throws(() => manager.startProcess('', '.', 'node --version'), /Project ID is required/)
  assert.throws(() => manager.startProcess('missing-command', '.', ''), /Start command is required/)

  manager.startProcess('clean-exit', '.', 'node -e "process.exit(0)"')
  await waitForStatus(manager, 'clean-exit', manager.STATUS.STOPPED)

  manager.startProcess('failed-exit', '.', 'node -e "process.exit(7)"')
  await waitForStatus(manager, 'failed-exit', manager.STATUS.ERROR)
  assert.equal(manager.getProcessStatus('failed-exit').exitCode, 7)

  manager.startProcess('long-running', '.', 'node -e "setInterval(() => {}, 1000)"')
  assert.equal(manager.getProcessStatus('long-running').status, manager.STATUS.RUNNING)
  await manager.stopProcess('long-running')
  assert.equal(manager.getProcessStatus('long-running').status, manager.STATUS.STOPPED)
  assert.equal(manager.getProcessStatus('long-running').pid, null)

  console.log('ProcessManager checks passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
