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

  test('size change forces a repaint; position-only move does not', () => {
    // Windows: growing the view can leave the newly exposed area black until
    // the web contents repaints — invalidate() is the sanctioned fix.
    const manager = new PreviewManager()
    manager.setWindow(makeWindow())
    manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })
    const view = manager.getView('p1')
    // The fake's webContents.invalidate closes over the view's `this`, so the
    // counter lives on the view instance.
    const before = view.invalidateCount

    // Same size, moved -> no new surface exposed, no repaint needed
    manager.setBounds('p1', { x: 99, y: 99, width: bounds.width, height: bounds.height })
    expect(view.invalidateCount).toBe(before)

    // Size grows (e.g. entering the in-app fullscreen preview) -> force repaint
    manager.setBounds('p1', { x: 0, y: 0, width: 1920, height: 1080 })
    expect(view.invalidateCount).toBe(before + 1)
    expect(view.bounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })

    // Shrinking back also exposes/repaints and stays clamped to >=1px
    manager.setBounds('p1', { x: 0, y: 0, width: 0, height: 50 })
    expect(view.bounds).toEqual({ x: 0, y: 0, width: 1, height: 50 })
    expect(view.invalidateCount).toBe(before + 2)
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

describe('PreviewManager.nudge', () => {
  // Windows: after the window regains focus a WebContentsView can keep its last
  // painted frame. nudge() invalidates and briefly resizes by 1px so the
  // compositor hands out a fresh surface, then restores the original bounds.
  const flushImmediate = () => new Promise((resolve) => setImmediate(resolve))

  test('invalidates, shrinks by 1px, then restores the original bounds', async () => {
    const manager = new PreviewManager()
    manager.setWindow(makeWindow())
    manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })
    const view = manager.getView('p1')
    const invalidateBefore = view.invalidateCount
    view.boundsHistory.length = 0

    expect(manager.nudge('p1').success).toBe(true)
    expect(view.invalidateCount).toBe(invalidateBefore + 1)
    // Synchronously the view is 1px narrower...
    expect(view.bounds).toEqual({ ...bounds, width: bounds.width - 1 })

    await flushImmediate()
    // ...and back to its real size on the next tick, so layout is unchanged.
    expect(view.bounds).toEqual(bounds)
    expect(view.boundsHistory).toEqual([
      { ...bounds, width: bounds.width - 1 },
      bounds,
    ])
  })

  test('does not resize a 1px-wide view (0 width would be rejected)', async () => {
    const manager = new PreviewManager()
    manager.setWindow(makeWindow())
    manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })
    manager.setBounds('p1', { x: 0, y: 0, width: 1, height: 40 })
    const view = manager.getView('p1')
    view.boundsHistory.length = 0

    expect(manager.nudge('p1').success).toBe(true)
    await flushImmediate()
    expect(view.boundsHistory).toEqual([])
    expect(view.bounds).toEqual({ x: 0, y: 0, width: 1, height: 40 })
  })

  test('does not overwrite bounds updated while the restore is queued', async () => {
    const manager = new PreviewManager()
    manager.setWindow(makeWindow())
    manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })
    const view = manager.getView('p1')
    view.boundsHistory.length = 0

    expect(manager.nudge('p1').success).toBe(true)
    const updated = { ...bounds, width: bounds.width + 200 }
    manager.setBounds('p1', updated)

    await flushImmediate()
    expect(view.bounds).toEqual(updated)
    expect(view.boundsHistory).toEqual([
      { ...bounds, width: bounds.width - 1 },
      updated,
    ])
  })

  test('coalesces consecutive nudges into one complete restore cycle', async () => {
    const manager = new PreviewManager()
    manager.setWindow(makeWindow())
    manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })
    const view = manager.getView('p1')
    view.boundsHistory.length = 0

    expect(manager.nudge('p1').success).toBe(true)
    expect(manager.nudge('p1').success).toBe(true)

    await flushImmediate()
    expect(view.bounds).toEqual(bounds)
    expect(view.boundsHistory).toEqual([
      { ...bounds, width: bounds.width - 1 },
      bounds,
    ])
  })

  test('succeeds on a view that was never given bounds', async () => {
    const manager = new PreviewManager()
    manager.setWindow(makeWindow())
    // ensureView without show(): no bounds have been assigned yet.
    manager.ensureView('p1')
    const view = manager.getView('p1')
    expect(view.getBounds()).toBeNull()

    expect(manager.nudge('p1').success).toBe(true)
    await flushImmediate()
    expect(view.invalidateCount).toBe(1)
    expect(view.boundsHistory).toEqual([])
  })

  test('errors for an unknown project instead of throwing', () => {
    const manager = new PreviewManager()
    manager.setWindow(makeWindow())
    expect(manager.nudge('ghost')).toEqual({
      success: false,
      error: 'Preview not created yet',
    })
  })

  test('reports a failing setBounds as an error result', () => {
    const manager = new PreviewManager()
    manager.setWindow(makeWindow())
    manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })
    const view = manager.getView('p1')
    view.setBounds = () => { throw new Error('view detached') }

    expect(manager.nudge('p1')).toEqual({ success: false, error: 'view detached' })
  })
})
