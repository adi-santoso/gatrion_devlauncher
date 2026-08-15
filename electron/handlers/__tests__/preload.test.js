import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest'
import { createRequire } from 'node:module'

const { ipcRenderer, contextBridge, __reset } = createRequire(import.meta.url)('electron')

// preload.ts runs its exposeInMainWorld at load time and Node caches the
// module, so load it exactly once per worker. Load it through vitest's own
// transform (import, not native require): native `require('../../preload.ts')`
// only works on Node ≥ 23.6 (type stripping), which broke CI on Node 20. The
// `require('electron')` inside preload.ts still hits the Node loader mock.
let api
beforeAll(async () => {
  await import('../../preload.ts')
  api = contextBridge._exposed.api
})

beforeEach(() => __reset())

describe('preload API surface', () => {
  test('is exposed as window.electron', () => {
    expect(api).toBeTruthy()
    expect(typeof api.getProjects).toBe('function')
    expect(typeof api.onProcessStatus).toBe('function')
    expect(typeof api.ompChat).toBe('function')
  })

  test('representative invoke wrappers forward args to the right channel', async () => {
    ipcRenderer.invoke = vi.fn(async () => ({ success: true }))

    await api.getProjects()
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith('get-projects')

    await api.startProject('p1')
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith('start-project', 'p1')

    await api.ompChat('p1', 'C:\\proj', 'hello', { sessionId: 's1' })
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith('omp-chat', 'p1', 'C:\\proj', 'hello', { sessionId: 's1' })

    await api.gitStage('C:\\proj', ['a.js'])
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith('git-stage', 'C:\\proj', ['a.js'])

    await api.updateProject('p1', { name: 'x' })
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith('update-project', 'p1', { name: 'x' })

    await api.terminalCreate({ cwd: 'C:\\proj' })
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith('terminal-create', { cwd: 'C:\\proj' })
  })

  test('every invoke wrapper makes exactly one invoke call', async () => {
    ipcRenderer.invoke = vi.fn(async () => ({ success: true }))
    const wrappers = Object.entries(api).filter(([name]) => !name.startsWith('on'))
    for (const [, fn] of wrappers) {
      await fn('p1', 's1', 'message', { option: true }, ['a'], 1, null)
    }
    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(wrappers.length)
  })

  test('on* subscriptions register listeners and return an unsubscribe', () => {
    const onStatus = vi.fn()
    const unsubscribe = api.onProcessStatus(onStatus)
    const listeners = ipcRenderer._listeners.get('process-status')
    expect(listeners.size).toBe(1)

    for (const listener of listeners) listener({}, 'p1', { status: 'running' })
    expect(onStatus).toHaveBeenCalledWith('p1', { status: 'running' })

    unsubscribe()
    expect(ipcRenderer._listeners.get('process-status').size).toBe(0)
  })

  test('onProcessLog strips the event from the callback args', () => {
    const cb = vi.fn()
    api.onProcessLog(cb)
    for (const listener of ipcRenderer._listeners.get('process-log')) listener({}, 'p1', 'line')
    expect(cb).toHaveBeenCalledWith('p1', 'line')
  })

  test('onOmpEvent / onUpdateState / onConfigUpdated pass the payload through', () => {
    const cb = vi.fn()
    api.onOmpEvent(cb)
    for (const listener of ipcRenderer._listeners.get('omp-event')) listener({}, { type: 'agent_start' })
    expect(cb).toHaveBeenCalledWith({ type: 'agent_start' })

    const updater = vi.fn()
    api.onUpdateState(updater)
    for (const listener of ipcRenderer._listeners.get('update-state')) listener({}, { status: 'downloaded' })
    expect(updater).toHaveBeenCalledWith({ status: 'downloaded' })

    const configCb = vi.fn()
    api.onConfigUpdated(configCb)
    for (const listener of ipcRenderer._listeners.get('config-updated')) listener({}, { theme: 'light' })
    expect(configCb).toHaveBeenCalledWith({ theme: 'light' })
  })
})
