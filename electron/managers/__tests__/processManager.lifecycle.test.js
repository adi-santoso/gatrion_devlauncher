import { describe, test, expect } from 'vitest'
import net from 'node:net'
import ProcessManager from '../ProcessManager'

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server.address().port))
  })
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}

async function waitForStatus(manager, projectId, expected, timeout = 8000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (manager.getProcessStatus(projectId).status === expected) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for ${projectId} to reach ${expected}`)
}

describe('ProcessManager lifecycle (real spawns)', () => {
  test('rejects invalid start requests', async () => {
    const manager = new ProcessManager()
    await expect(manager.startProcess('', '.', 'node --version')).rejects.toThrow(/Project ID is required/)
    await expect(manager.startProcess('missing-command', '.', '')).rejects.toThrow(/Start command is required/)
    await expect(manager.startProcess('bad-port', '.', 'node --version', {}, 0)).rejects.toThrow(/Port must be an integer/)
    await expect(manager.startProcess('missing-primary', '.', [
      { id: 'one', name: 'One', command: 'node --version', port: null, primary: false },
    ])).rejects.toThrow(/exactly one primary/)
    await expect(manager.startProcess('duplicate-port', '.', [
      { id: 'one', name: 'One', command: 'node --version', port: 3000, primary: true },
      { id: 'two', name: 'Two', command: 'node --version', port: 3000, primary: false },
    ])).rejects.toThrow(/configured more than once/)
  })

  test('rejects an already-occupied requested port', async () => {
    const occupiedServer = net.createServer()
    const occupiedPort = await listen(occupiedServer)
    const manager = new ProcessManager()
    await expect(
      manager.startProcess('occupied-port', '.', 'node --version', {}, occupiedPort)
    ).rejects.toThrow(new RegExp(`Port ${occupiedPort} is already in use`))
    await close(occupiedServer)
  })

  test('readiness timeout is longer for Go toolchain commands', async () => {
    const manager = new ProcessManager()
    await manager.startProcess('go-app', '.', 'echo go run .', {}, null)
    expect(manager.processes.get('go-app').readyTimeoutMs).toBe(120000)

    await manager.startProcess('node-app', '.', 'npm --version', {}, null)
    expect(manager.processes.get('node-app').readyTimeoutMs).toBe(60000)
  })

  test('waitForPort transitions to RUNNING when the port opens', async () => {
    const manager = new ProcessManager()
    manager.processes.set('readiness-check', { status: manager.STATUS.STARTING })
    manager.isPortOpen = async () => true
    await manager.waitForPort('readiness-check', 1234, 100)
    expect(manager.getProcessStatus('readiness-check').status).toBe(manager.STATUS.RUNNING)
  })

  test('waitForPort bails when the process is no longer starting', async () => {
    const manager = new ProcessManager()
    manager.processes.set('readiness-cancelled', { status: manager.STATUS.STOPPED })
    expect(await manager.waitForPort('readiness-cancelled', 1234, 100)).toBe(false)
  })

  test('waitForPort times out when the port never opens', async () => {
    const manager = new ProcessManager()
    manager.processes.set('readiness-timeout', { status: manager.STATUS.STARTING })
    manager.isPortOpen = async () => false
    await expect(manager.waitForPort('readiness-timeout', 1234, 10)).rejects.toThrow(/Timed out waiting for port 1234/)
  })

  test('startProcess refuses while another lifecycle is active', async () => {
    const manager = new ProcessManager()
    manager.processes.set('stopping-project', { status: manager.STATUS.STOPPING })
    await expect(manager.startProcess('stopping-project', '.', 'node --version')).rejects.toThrow(/already active/)
  })

  test('getProjectStats samples the whole process tree', async () => {
    const manager = new ProcessManager()
    manager.processes.set('resource-project', {
      pid: 101,
      status: manager.STATUS.RUNNING,
      commands: new Map([
        ['app', { pid: 101 }],
        ['assets', { pid: 202 }],
      ]),
    })
    const original = manager.getProcessTreeResources.bind(manager)
    let sampledPids
    manager.getProcessTreeResources = async (pids) => {
      sampledPids = pids
      return { cpu: 12.5, memory: 345 }
    }
    const projectStats = await manager.getProjectStats('resource-project')
    expect({ ...projectStats, lastUpdated: 0 }).toEqual({ pid: 101, cpu: 12.5, memory: 345, lastUpdated: 0 })
    expect(projectStats.lastUpdated).toBeGreaterThan(0)
    expect(sampledPids).toEqual([101, 202])
    manager.getProcessTreeResources = original
  })

  test('clean exit transitions to STOPPED', async () => {
    const manager = new ProcessManager()
    await manager.startProcess('clean-exit', '.', 'node -e "process.exit(0)"')
    await waitForStatus(manager, 'clean-exit', manager.STATUS.STOPPED)
  })

  test('non-zero exit lands in ERROR with the exit code', async () => {
    const manager = new ProcessManager()
    await manager.startProcess('failed-exit', '.', 'node -e "process.exit(7)"')
    await waitForStatus(manager, 'failed-exit', manager.STATUS.ERROR)
    expect(manager.getProcessStatus('failed-exit').exitCode).toBe(7)
  })

  test('long-running process can be logged, cleared and stopped', async () => {
    const manager = new ProcessManager()
    await manager.startProcess('long-running', '.', 'node -e "setInterval(() => {}, 1000)"')
    await waitForStatus(manager, 'long-running', manager.STATUS.RUNNING)
    const runningStatus = manager.getProcessStatus('long-running')
    expect(runningStatus.status).toBe(manager.STATUS.RUNNING)
    expect(runningStatus.pid).toBeTruthy()
    expect(runningStatus.startedAt).toBeTruthy()

    const log = manager.addLog('long-running', 'hydrated output', 'stdout')
    expect(manager.getLogs('long-running')).toEqual([log])
    expect(log.id).toBeTruthy()
    expect(manager.getLogs('long-running', 0)).toEqual([])
    expect(manager.getLogs('long-running', 'invalid')).toEqual([log])
    manager.clearLogs('long-running')
    expect(manager.getLogs('long-running')).toEqual([])

    await manager.stopProcess('long-running')
    expect(manager.getProcessStatus('long-running').status).toBe(manager.STATUS.STOPPED)
    expect(manager.getProcessStatus('long-running').pid).toBeNull()
  })

  test('composite command lifecycle starts and stops every child', async () => {
    const manager = new ProcessManager()
    await manager.startProcess('composite', '.', [
      { id: 'app', name: 'App', command: 'node -e "setInterval(() => {}, 1000)"', port: null, primary: true },
      { id: 'assets', name: 'Assets', command: 'node -e "setInterval(() => {}, 1000)"', port: null, primary: false },
    ])
    await waitForStatus(manager, 'composite', manager.STATUS.RUNNING)
    const compositeStatus = manager.getProcessStatus('composite')
    expect(compositeStatus.commands).toHaveLength(2)
    expect(compositeStatus.commands.every((item) => item.pid)).toBe(true)

    await manager.stopProcess('composite')
    expect(manager.getProcessStatus('composite').status).toBe(manager.STATUS.STOPPED)
    expect(manager.getProcessStatus('composite').commands.every((item) => item.pid === null)).toBe(true)
  })

  test('a failing child fails the whole composite', async () => {
    const manager = new ProcessManager()
    await manager.startProcess('composite-failure', '.', [
      { id: 'app', name: 'App', command: 'node -e "setInterval(() => {}, 1000)"', port: null, primary: true },
      { id: 'assets', name: 'Assets', command: 'node -e "setTimeout(() => process.exit(9), 100)"', port: null, primary: false },
    ])
    await waitForStatus(manager, 'composite-failure', manager.STATUS.ERROR)
    expect(manager.getProcessStatus('composite-failure').error).toMatch(/Assets exited with code 9/)
  })

  test('waitForCompositeReady waits for each command port independently', async () => {
    const manager = new ProcessManager()
    const staggeredPorts = { app: 38081, assets: 35173 }
    manager.processes.set('staggered-readiness', {
      status: manager.STATUS.STARTING,
      runId: Symbol('staggered-readiness'),
      commands: new Map([
        ['app', { id: 'app', name: 'Laravel', port: staggeredPorts.app, primary: true, status: manager.STATUS.STARTING, ready: false }],
        ['assets', { id: 'assets', name: 'Inertia Vue assets', port: staggeredPorts.assets, primary: false, status: manager.STATUS.STARTING, ready: false }],
      ]),
      logs: [],
    })
    const staggeredReadyAt = Date.now() + 450
    manager.isPortOpen = async (port) => {
      if (port === staggeredPorts.assets) return true
      if (port === staggeredPorts.app) return Date.now() >= staggeredReadyAt
      return false
    }
    const runId = manager.processes.get('staggered-readiness').runId
    await manager.waitForCompositeReady('staggered-readiness', runId)
    const status = manager.getProcessStatus('staggered-readiness')
    expect(status.status).toBe(manager.STATUS.RUNNING)
    expect(status.commands.every((item) => item.ready && item.status === manager.STATUS.RUNNING)).toBe(true)
  })
}, 60000)
