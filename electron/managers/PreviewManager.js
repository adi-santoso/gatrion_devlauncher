const { WebContentsView, session } = require('electron')

/**
 * PreviewManager
 *
 * Owns one WebContentsView per project. The embedded preview runs in a real
 * Chromium view (like a browser tab) instead of an iframe, so cookies,
 * localStorage, service workers, popups and permissions behave as in a real
 * browser. Each project gets its own persistent session partition, so its
 * storage survives app restarts and is isolated from other projects.
 *
 * The renderer drives the view: it sends the target bounds (in DIPs relative
 * to the window content) plus URL, and asks to show/hide/destroy. Only one
 * view is visible at a time; the rest stay alive (hidden) so their page state
 * is preserved when switching between projects.
 */
class PreviewManager {
  constructor() {
    this.win = null
    this.views = new Map() // projectId -> { view, url }
  }

  setWindow(win) {
    this.win = win
  }

  partitionFor(projectId) {
    return `persist:preview-${projectId}`
  }

  getView(projectId) {
    return this.views.get(projectId)?.view || null
  }

  /** Create (lazily) and return the view for a project. */
  ensureView(projectId) {
    let entry = this.views.get(projectId)
    if (entry) return entry

    if (!this.win || this.win.isDestroyed()) return null

    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // Per-project persistent partition: cookies/storage survive restarts
        // and are isolated between projects.
        session: session.fromPartition(this.partitionFor(projectId)),
      },
    })

    // Project apps are local dev servers; block window.open to the outside and
    // route external links to the OS browser instead of another embedded view.
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (url && url.startsWith('http')) {
        require('electron').shell.openExternal(url).catch(() => {})
      }
      return { action: 'deny' }
    })
    view.webContents.on('will-navigate', (event) => {
      // Allow any http(s) navigation (the project app itself may redirect);
      // the page was already loaded from a local dev URL.
      const url = event.url || ''
      if (!/^https?:\/\//.test(url)) event.preventDefault()
    })

    this.win.contentView.addChildView(view)
    view.setVisible(false)
    entry = { view, url: null }
    this.views.set(projectId, entry)
    return entry
  }

  /**
   * Show a project's preview. Loads the URL on first use, keeps the view
   * mounted afterwards (navigate() is used for manual URL changes).
   */
  show({ projectId, url, bounds }) {
    if (!projectId) return { success: false, error: 'Missing project id' }
    const entry = this.ensureView(projectId)
    if (!entry) return { success: false, error: 'Preview unavailable' }

    if (entry.url !== url) {
      entry.url = url
      entry.view.webContents.loadURL(url).catch((error) => {
        console.error(`[Preview] Failed to load ${url}:`, error)
      })
    }

    this.setBounds(projectId, bounds)
    entry.view.setVisible(true)
    this.hideOthers(projectId)
    return { success: true }
  }

  /** Hide a project's view but keep it alive (page state preserved). */
  hide(projectId) {
    const view = this.getView(projectId)
    if (view) view.setVisible(false)
    return { success: true }
  }

  hideOthers(exceptProjectId) {
    for (const [id, entry] of this.views) {
      if (id !== exceptProjectId) entry.view.setVisible(false)
    }
  }

  setBounds(projectId, bounds) {
    const view = this.getView(projectId)
    if (!view || !bounds) return
    const { x, y, width, height } = bounds
    if (![x, y, width, height].every(Number.isFinite)) return
    view.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    })
  }

  navigate(projectId, url) {
    const entry = this.views.get(projectId)
    if (!entry) return { success: false, error: 'Preview not created yet' }
    entry.url = url
    entry.view.webContents.loadURL(url).catch((error) => {
      console.error(`[Preview] Navigate failed:`, error)
    })
    return { success: true }
  }

  reload(projectId) {
    const view = this.getView(projectId)
    if (!view) return { success: false, error: 'Preview not created yet' }
    view.webContents.reload()
    return { success: true }
  }

  setZoom(projectId, zoomLevel) {
    const view = this.getView(projectId)
    if (!view) return { success: false, error: 'Preview not created yet' }
    const factor = Math.max(0.25, Math.min(3, (zoomLevel || 100) / 100))
    view.webContents.setZoomFactor(factor)
    return { success: true }
  }

  async clearSiteData(projectId) {
    try {
      const ses = session.fromPartition(this.partitionFor(projectId))
      await ses.clearStorageData()
      await ses.clearCache()
      await ses.clearAuthCache()
      if (typeof ses.cookies?.flushStore === 'function') {
        await new Promise((resolve) => ses.cookies.flushStore(resolve))
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /** Destroy a project's view (frees its renderer process). */
  destroy(projectId) {
    const entry = this.views.get(projectId)
    if (!entry) return { success: true }
    try {
      this.win?.contentView.removeChildView(entry.view)
      if (!entry.view.webContents.isDestroyed()) {
        entry.view.webContents.close()
      }
    } catch (error) {
      console.error('[Preview] Error destroying view:', error)
    }
    this.views.delete(projectId)
    return { success: true }
  }

  destroyAll() {
    for (const projectId of [...this.views.keys()]) {
      this.destroy(projectId)
    }
  }
}

module.exports = PreviewManager
