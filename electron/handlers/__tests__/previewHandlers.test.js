import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'node:module'

const { ipcMain, __reset } = createRequire(import.meta.url)('electron')

import { setupPreviewHandlers } from '../previewHandlers'

const fakeEvent = { senderFrame: { url: 'http://localhost:5173/' } }

function makePreviewManager() {
  return {
    show: vi.fn(async () => ({ success: true })),
    hide: vi.fn(async () => ({ success: true })),
    setBounds: vi.fn(),
    navigate: vi.fn(async () => ({ success: true })),
    reload: vi.fn(async () => ({ success: true })),
    setZoom: vi.fn(async () => ({ success: true })),
    toggleDevTools: vi.fn(async () => ({ success: true })),
    clearSiteData: vi.fn(async () => ({ success: true })),
    destroy: vi.fn(async () => ({ success: true })),
  }
}

describe('previewHandlers', () => {
  beforeEach(() => __reset())

  test('preview-show / preview-hide delegate with the payload', async () => {
    const pm = makePreviewManager()
    setupPreviewHandlers(pm)
    const show = ipcMain._handlers.get('preview-show')
    const hide = ipcMain._handlers.get('preview-hide')

    await show(fakeEvent, { projectId: 'p1', bounds: { width: 800 } })
    expect(pm.show).toHaveBeenCalledWith({ projectId: 'p1', bounds: { width: 800 } })

    await hide(fakeEvent, 'p1')
    expect(pm.hide).toHaveBeenCalledWith('p1')
  })

  test('preview-set-bounds returns success and delegates', async () => {
    const pm = makePreviewManager()
    setupPreviewHandlers(pm)
    const handler = ipcMain._handlers.get('preview-set-bounds')
    const result = await handler(fakeEvent, 'p1', { x: 0, y: 0, width: 800, height: 600 })
    expect(result).toEqual({ success: true })
    expect(pm.setBounds).toHaveBeenCalledWith('p1', { x: 0, y: 0, width: 800, height: 600 })
  })

  test('navigation/zoom/devtools/data lifecycle channels delegate', async () => {
    const pm = makePreviewManager()
    setupPreviewHandlers(pm)

    await ipcMain._handlers.get('preview-navigate')(fakeEvent, 'p1', 'http://localhost:5173/')
    expect(pm.navigate).toHaveBeenCalledWith('p1', 'http://localhost:5173/')

    await ipcMain._handlers.get('preview-reload')(fakeEvent, 'p1')
    expect(pm.reload).toHaveBeenCalledWith('p1')

    await ipcMain._handlers.get('preview-zoom')(fakeEvent, 'p1', 1.5)
    expect(pm.setZoom).toHaveBeenCalledWith('p1', 1.5)

    await ipcMain._handlers.get('preview-toggle-devtools')(fakeEvent, 'p1')
    expect(pm.toggleDevTools).toHaveBeenCalledWith('p1')

    await ipcMain._handlers.get('preview-clear-data')(fakeEvent, 'p1')
    expect(pm.clearSiteData).toHaveBeenCalledWith('p1')

    await ipcMain._handlers.get('preview-destroy')(fakeEvent, 'p1')
    expect(pm.destroy).toHaveBeenCalledWith('p1')
  })
})
