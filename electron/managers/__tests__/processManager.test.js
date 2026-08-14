import { describe, test, expect, vi, afterEach } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import ProcessManager from '../ProcessManager'

async function waitForStatus(manager, projectId, expected, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (manager.getProcessStatus(projectId).status === expected) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for ${projectId} to reach ${expected}`)
}

const LONG_RUNNING = 'node -e "setInterval(() => {}, 1000)"'

describe('ProcessManager', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('secret masking', () => {
    test('env secrets never appear in DevLauncher logs or persisted output', async () => {
      const pm = new ProcessManager()
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-secret-'))
      pm.setLogsDir(tempDir)

      const onLogs = []
      await pm.startProcess('p1', process.cwd(), LONG_RUNNING, { DB_PASSWORD: 'supersecret_123' }, null, (projectId, entry) => onLogs.push(entry))
      await waitForStatus(pm, 'p1', pm.STATUS.RUNNING)
      await pm.stopProcess('p1')

      const buffered = pm.getLogs('p1')
      expect(buffered.length).toBeGreaterThan(0)
      for (const entry of buffered) {
        expect(entry.message.includes('supersecret_123')).toBe(false)
      }
      for (const entry of onLogs) {
        expect(entry.message.includes('supersecret_123')).toBe(false)
      }
      const persisted = await fs.readFile(path.join(tempDir, 'p1.jsonl'), 'utf8')
      expect(persisted.includes('supersecret_123')).toBe(false)

      await fs.rm(tempDir, { recursive: true, force: true })
    })
  })

  describe('late exit race after a graceful stop (POSIX)', () => {
    test('an exit event arriving after STOPPED keeps the project stopped', () => {
      const pm = new ProcessManager()
      const child = { id: 'main', name: 'Application', status: pm.STATUS.STOPPED, pid: null, process: null }
      const runId = Symbol('run')
      pm.processes.set('p1', {
        status: pm.STATUS.STOPPED,
        runId,
        commands: new Map([['main', child]]),
        logs: [],
      })
      // POSIX sends SIGTERM and resolves before the 'exit' event fires, so the
      // manager is already STOPPED when this arrives. It must not flip to ERROR.
      pm.handleChildExit('p1', runId, child, null, 'SIGTERM', () => {}, () => {})
      expect(pm.getProcessStatus('p1').status).toBe('STOPPED')
    })

    test('a non-zero exit while running still marks the project as errored', () => {
      const pm = new ProcessManager()
      const child = { id: 'main', name: 'Application', status: pm.STATUS.RUNNING, pid: 123, process: {} }
      const runId = Symbol('run')
      pm.processes.set('p1', {
        status: pm.STATUS.RUNNING,
        runId,
        commands: new Map([['main', child]]),
        logs: [],
      })
      pm.handleChildExit('p1', runId, child, 1, null, () => {}, () => {})
      expect(pm.getProcessStatus('p1').status).toBe('ERROR')
    })
  })

  describe('auto-restart backoff', () => {
    const makeErrorData = (overrides = {}) => ({
      projectPath: 'C:/projects/demo',
      command: 'npm run dev',
      launchCommands: [{ id: 'main', name: 'App', command: 'npm run dev', port: null, primary: true }],
      port: null,
      env: {},
      restartCount: 0,
      status: 'ERROR',
      logs: [],
      ...overrides,
    })

    test('applies exponential backoff and caps at maxRetries', () => {
      const pm = new ProcessManager()
      pm.autoRestartConfig = { enabled: true, maxRetries: 3, delayMs: 100 }
      const data = makeErrorData()
      pm.processes.set('p1', data)

      const delays = []
      const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms) => {
        delays.push(ms)
        return 0 // record the delay without executing the callback
      })
      try {
        pm.maybeAutoRestart('p1', Symbol('run'), data)
        pm.maybeAutoRestart('p1', Symbol('run'), data)
        pm.maybeAutoRestart('p1', Symbol('run'), data)

        expect(delays).toEqual([100, 200, 400])
        expect(data.restartCount).toBe(3)
        const logs = pm.getLogs('p1')
        expect(logs.some((entry) => entry.message.includes('attempt 1/3'))).toBe(true)
        expect(logs.some((entry) => entry.message.includes('attempt 3/3'))).toBe(true)
      } finally {
        spy.mockRestore()
      }

      // Past maxRetries the restart is refused, not scheduled again.
      pm.maybeAutoRestart('p1', Symbol('run'), data)
      expect(data.restartCount).toBe(3)
      expect(pm.getLogs('p1').some((entry) => entry.message.includes('max retries'))).toBe(true)
    })

    test('does nothing when auto-restart is disabled', () => {
      const pm = new ProcessManager()
      pm.autoRestartConfig = { enabled: false, maxRetries: 3, delayMs: 100 }
      const data = makeErrorData()
      pm.processes.set('p1', data)

      pm.maybeAutoRestart('p1', Symbol('run'), data)
      expect(data.restartCount).toBe(0)
    })
  })

  describe('startProcess validation', () => {
    test('rejects duplicate ports in a composite command set', async () => {
      const pm = new ProcessManager()
      await expect(pm.startProcess('p1', 'C:/projects/demo', [
        { id: 'a', command: 'npm run a', port: 3000, primary: true },
        { id: 'b', command: 'npm run b', port: 3000 },
      ])).rejects.toThrow(/more than once/)
    })

    test('requires exactly one primary command', async () => {
      const pm = new ProcessManager()
      await expect(pm.startProcess('p1', 'C:/projects/demo', [
        { id: 'a', command: 'npm run a', primary: false },
        { id: 'b', command: 'npm run b', primary: false },
      ])).rejects.toThrow(/exactly one primary/)
    })
  })
})
