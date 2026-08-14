import { describe, test, expect, vi } from 'vitest'
import { createUpdater } from '../updater'

function makeFakeAutoUpdater() {
  const handlers = {}
  const autoUpdater = {
    on: vi.fn((event, handler) => { handlers[event] = handler }),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  }
  const fire = (event, payload) => handlers[event]?.(payload)
  return { autoUpdater, fire }
}

function makeWindow() {
  const send = vi.fn()
  return { isDestroyed: () => false, webContents: { send } }
}

describe('createUpdater', () => {
  test('forwards every transition to the renderer window', () => {
    const { autoUpdater, fire } = makeFakeAutoUpdater()
    const win = makeWindow()
    const updater = createUpdater({ autoUpdater, getWindow: () => win, isEnabled: () => true })
    updater.wireEvents()

    fire('update-available')
    expect(win.webContents.send).toHaveBeenCalledWith('update-state', { state: 'available', progress: null, error: null })

    fire('download-progress', { percent: 42.5, transferred: 100, total: 200, bytesPerSecond: 5 })
    expect(win.webContents.send).toHaveBeenLastCalledWith('update-state', {
      state: 'downloading',
      progress: expect.objectContaining({ percent: 42.5, total: 200 }),
      error: null,
    })

    fire('update-downloaded')
    expect(win.webContents.send).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ state: 'downloaded' }))

    fire('error', new Error('boom'))
    expect(win.webContents.send).toHaveBeenLastCalledWith('update-state', expect.objectContaining({ state: 'error', error: 'boom' }))
  })

  test('skips the window when it is destroyed or missing', () => {
    const { autoUpdater, fire } = makeFakeAutoUpdater()
    const updater = createUpdater({ autoUpdater, getWindow: () => null, isEnabled: () => true })
    updater.wireEvents()
    expect(() => fire('update-available')).not.toThrow()
  })

  test('startDownload resolves on success and reports failures', async () => {
    const { autoUpdater } = makeFakeAutoUpdater()
    const updater = createUpdater({ autoUpdater, isEnabled: () => true })

    autoUpdater.downloadUpdate.mockResolvedValue()
    await expect(updater.startDownload()).resolves.toEqual({ success: true })

    autoUpdater.downloadUpdate.mockRejectedValue(new Error('network down'))
    await expect(updater.startDownload()).resolves.toEqual({ success: false, error: 'network down' })
    expect(updater.getState().state).toBe('error')
    expect(updater.getState().error).toBe('network down')
  })

  test('check resolves on success and reports failures', async () => {
    const { autoUpdater } = makeFakeAutoUpdater()
    const updater = createUpdater({ autoUpdater, isEnabled: () => true })

    autoUpdater.checkForUpdates.mockResolvedValue()
    await expect(updater.check()).resolves.toEqual({ success: true })

    autoUpdater.checkForUpdates.mockRejectedValue(new Error('no feed'))
    await expect(updater.check()).resolves.toEqual({ success: false, error: 'no feed' })
  })

  test('guards every operation when disabled', async () => {
    const { autoUpdater } = makeFakeAutoUpdater()
    const updater = createUpdater({ autoUpdater, isEnabled: () => false })

    await expect(updater.check()).resolves.toMatchObject({ success: false })
    await expect(updater.startDownload()).resolves.toMatchObject({ success: false })
    expect(updater.quitAndInstall()).toMatchObject({ success: false })
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled()
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  test('quitAndInstall delegates when enabled', () => {
    const { autoUpdater } = makeFakeAutoUpdater()
    const updater = createUpdater({ autoUpdater, isEnabled: () => true })
    expect(updater.quitAndInstall()).toEqual({ success: true })
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  test('onChange notifies subscribers and supports unsubscribe', () => {
    const { autoUpdater, fire } = makeFakeAutoUpdater()
    const updater = createUpdater({ autoUpdater, isEnabled: () => true })
    updater.wireEvents()

    const listener = vi.fn()
    const unsubscribe = updater.onChange(listener)
    fire('checking-for-update')
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ state: 'checking' }))

    unsubscribe()
    fire('update-available')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
