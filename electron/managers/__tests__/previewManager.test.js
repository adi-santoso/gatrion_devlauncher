import { describe, test, expect, beforeEach } from 'vitest'
import { createRequire } from 'node:module'

// Same instance the manager sees through the Module._load patch in setup.js.
const { WebContentsView, __reset, __previewState } = createRequire(import.meta.url)('electron')

import PreviewManager from '../PreviewManager'

function makeWindow() {
  const state = new Map()
  return {
    isDestroyed: () => false,
    contentView: {
      addChildView: (view) => state.set(view, true),
      removeChildView: (view) => state.delete(view),
    },
    __state: state,
  }
}

const bounds = { x: 10, y: 20, width: 800, height: 600 }

beforeEach(() => {
  __reset()
})

describe('PreviewManager', () => {
  test('creates a sandboxed persistent-partition view and shows it', () => {
    const manager = new PreviewManager()
    const win = makeWindow()
    manager.setWindow(win)

    const created = manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })
    expect(created.success).toBe(true)

    const view = manager.getView('p1')
    expect(view).toBeInstanceOf(WebContentsView)
    expect(view.visible).toBe(true)
    expect(view.bounds).toEqual(bounds)
    expect(view.options.webPreferences.session.partition).toBe('persist:preview-p1')
    expect(view.options.webPreferences.sandbox).toBe(true)
    expect(view.options.webPreferences.contextIsolation).toBe(true)
    expect(view.options.webPreferences.nodeIntegration).toBe(false)
    expect(win.__state.has(view)).toBe(true)
  })

  test('same URL is not reloaded; a second project hides the first', () => {
    const manager = new PreviewManager()
    manager.setWindow(makeWindow())
    manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })
    const view = manager.getView('p1')

    manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })
    expect(view.loadedUrls).toEqual(['http://localhost:3000'])

    manager.show({ projectId: 'p2', url: 'http://localhost:5173', bounds })
    expect(manager.getView('p1').visible).toBe(false)
    expect(manager.getView('p2').visible).toBe(true)
  })

  test('hide keeps the view mounted and bounds update', () => {
    const manager = new PreviewManager()
    manager.setWindow(makeWindow())
    manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })
    manager.show({ projectId: 'p2', url: 'http://localhost:5173', bounds })

    manager.hide('p2')
    expect(manager.getView('p2').visible).toBe(false)
    expect(manager.getView('p2')).toBeTruthy()

    manager.setBounds('p1', { x: 0, y: 0, width: 100, height: 50 })
    expect(manager.getView('p1').bounds).toEqual({ x: 0, y: 0, width: 100, height: 50 })
  })

  test('zoom clamps to 0.25x–3x', () => {
    const manager = new PreviewManager()
    manager.setWindow(makeWindow())
    manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })
    const view = manager.getView('p1')

    manager.setZoom('p1', 125)
    expect(view.zoomFactor).toBe(1.25)
    manager.setZoom('p1', 500)
    expect(view.zoomFactor).toBe(3)
    manager.setZoom('p1', 10)
    expect(view.zoomFactor).toBe(0.25)
  })

  test('devtools toggles and missing project errors gracefully', () => {
    const manager = new PreviewManager()
    manager.setWindow(makeWindow())
    manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })
    const view = manager.getView('p1')

    expect(manager.toggleDevTools('p1').success).toBe(true)
    expect(view.devtoolsOpen).toBe(true)
    expect(manager.toggleDevTools('p1').success).toBe(true)
    expect(view.devtoolsOpen).toBe(false)
    expect(manager.toggleDevTools('missing').success).toBe(false)

    expect(manager.reload('nope').success).toBe(false)
    expect(manager.show({ projectId: '', url: 'http://x', bounds }).success).toBe(false)
  })

  test('console messages are normalized and forwarded to the listener', () => {
    const manager = new PreviewManager()
    manager.setWindow(makeWindow())
    const consoleMessages = []
    manager.setConsoleListener((msg) => consoleMessages.push(msg))
    manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })
    const view = manager.getView('p1')

    view.emitConsole('error', 'Unhandled rejection in App', 'http://localhost:3000', 42)
    expect(consoleMessages).toHaveLength(1)
    expect(consoleMessages[0]).toMatchObject({
      projectId: 'p1',
      level: 'error',
      message: 'Unhandled rejection in App',
      source: 'http://localhost:3000',
      line: 42,
    })

    view.emitConsole('warning', 'deprecated', 'http://localhost:3000', 7)
    expect(consoleMessages[1].level).toBe('warning')
  })

  test('clearSiteData hits the per-project persistent partition', async () => {
    const manager = new PreviewManager()
    manager.setWindow(makeWindow())
    manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })

    const cleared = await manager.clearSiteData('p1')
    expect(cleared.success).toBe(true)
    const { sessions } = __previewState()
    expect(sessions.has('persist:preview-p1')).toBe(true)
  })

  test('destroy removes from window and map; destroyAll cleans everything', () => {
    const manager = new PreviewManager()
    const win = makeWindow()
    manager.setWindow(win)
    manager.show({ projectId: 'p1', url: 'http://a', bounds })
    const view = manager.getView('p1')

    manager.destroy('p1')
    expect(manager.getView('p1')).toBeNull()
    expect(win.__state.has(view)).toBe(false)

    manager.show({ projectId: 'a', url: 'http://a', bounds })
    manager.show({ projectId: 'b', url: 'http://b', bounds })
    manager.destroyAll()
    expect(manager.getView('a')).toBeNull()
    expect(manager.getView('b')).toBeNull()
  })

  test('destroy is a no-op for unknown projects', () => {
    const manager = new PreviewManager()
    manager.setWindow(makeWindow())
    expect(manager.destroy('ghost').success).toBe(true)
    expect(manager.reload('ghost').success).toBe(false)
  })
})
