const assert = require('assert/strict')
const Module = require('module')

// Intercept electron like the other CLI tests do (test-process-handlers.js).
// vi.mock cannot reach CJS require('electron'), so these run as plain scripts.
const views = new Map()
const sessions = new Map()

class FakeWebContentsView {
  constructor(options) {
    this.options = options
    this.visible = false
    this.bounds = null
    this.loadedUrls = []
    this.webContents = {
      loadURL: (url) => { this.loadedUrls.push(url); return Promise.resolve() },
      reload: () => { this.reloadCount = (this.reloadCount || 0) + 1 },
      setZoomFactor: (f) => { this.zoomFactor = f },
      setWindowOpenHandler: () => {},
      on: () => {},
      isDestroyed: () => false,
      close: () => {},
    }
  }
  setVisible(v) { this.visible = v }
  setBounds(b) { this.bounds = b }
}

const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
  if (request === 'electron') {
    return {
      WebContentsView: FakeWebContentsView,
      session: {
        fromPartition: (partition) => {
          if (!sessions.has(partition)) {
            sessions.set(partition, {
              partition,
              clearStorageData: async () => {},
              clearCache: async () => {},
              clearAuthCache: async () => {},
              cookies: { flushStore: (cb) => cb && cb() },
            })
          }
          return sessions.get(partition)
        },
      },
      shell: { openExternal: async () => {} },
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const PreviewManager = require('./electron/managers/PreviewManager')
Module._load = originalLoad

function makeWindow() {
  return {
    isDestroyed: () => false,
    contentView: {
      addChildView: (view) => views.set(view, true),
      removeChildView: (view) => views.delete(view),
    },
  }
}

async function run() {
  const manager = new PreviewManager()
  const win = makeWindow()
  manager.setWindow(win)

  // Create + show with persistent per-project partition
  const bounds = { x: 10, y: 20, width: 800, height: 600 }
  const created = manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })
  assert.equal(created.success, true)
  const view = manager.getView('p1')
  assert.ok(view instanceof FakeWebContentsView, 'view created')
  assert.equal(view.visible, true)
  assert.deepEqual(view.bounds, bounds)
  assert.equal(view.options.webPreferences.session.partition, 'persist:preview-p1')
  assert.equal(view.options.webPreferences.sandbox, true)
  assert.equal(view.options.webPreferences.contextIsolation, true)
  assert.equal(view.options.webPreferences.nodeIntegration, false)
  assert.ok(views.has(view), 'view attached to window')

  // Same URL again -> no reload
  manager.show({ projectId: 'p1', url: 'http://localhost:3000', bounds })
  assert.deepEqual(view.loadedUrls, ['http://localhost:3000'])

  // Second project hides the first
  manager.show({ projectId: 'p2', url: 'http://localhost:5173', bounds })
  assert.equal(manager.getView('p1').visible, false)
  assert.equal(manager.getView('p2').visible, true)

  // Hide keeps alive
  manager.hide('p2')
  assert.equal(manager.getView('p2').visible, false)
  assert.ok(manager.getView('p2'), 'still mounted after hide')

  // Bounds update
  manager.setBounds('p1', { x: 0, y: 0, width: 100, height: 50 })
  assert.deepEqual(manager.getView('p1').bounds, { x: 0, y: 0, width: 100, height: 50 })

  // Zoom clamps
  manager.setZoom('p1', 125)
  assert.equal(manager.getView('p1').zoomFactor, 1.25)
  manager.setZoom('p1', 500)
  assert.equal(manager.getView('p1').zoomFactor, 3)
  manager.setZoom('p1', 10)
  assert.equal(manager.getView('p1').zoomFactor, 0.25)

  // Clear site data hits the right partition
  const cleared = await manager.clearSiteData('p1')
  assert.equal(cleared.success, true)
  assert.ok(sessions.has('persist:preview-p1'))

  // Destroy removes from window and map
  manager.destroy('p1')
  assert.equal(manager.getView('p1'), null)
  assert.ok(!views.has(view), 'view removed from window')

  // Missing project -> graceful error
  assert.equal(manager.show({ projectId: '', url: 'http://x', bounds }).success, false)
  assert.equal(manager.reload('nope').success, false)

  // destroyAll cleans everything
  manager.show({ projectId: 'a', url: 'http://a', bounds })
  manager.show({ projectId: 'b', url: 'http://b', bounds })
  manager.destroyAll()
  assert.equal(manager.getView('a'), null)
  assert.equal(manager.getView('b'), null)

  console.log('Preview manager checks passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
