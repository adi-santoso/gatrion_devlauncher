import type { BrowserWindow, WebContentsView as WebContentsViewType } from 'electron'

const { WebContentsView, session } = require('electron') as typeof import('electron')

interface PreviewEntry {
  view: WebContentsViewType
  url: string | null
}

interface PreviewBounds {
  x: number
  y: number
  width: number
  height: number
}

interface ConsoleInfo {
  projectId: string
  level: string
  message: string
  source: string
  line: number
}

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
  win: BrowserWindow | null
  views: Map<string, PreviewEntry>
  onConsoleMessage: ((info: ConsoleInfo) => void) | null
  /** Recent console messages per project (MCP preview_read_console). */
  private consoleBuffer = new Map<string, ConsoleInfo[]>()

  constructor() {
    this.win = null
    this.views = new Map() // projectId -> { view, url }
    this.onConsoleMessage = null
  }

  setWindow(win: BrowserWindow) {
    this.win = win
  }

  /** Renderer callback for console messages coming from project apps. */
  setConsoleListener(callback: (info: ConsoleInfo) => void) {
    this.onConsoleMessage = callback
  }

  /**
   * Ring buffer of recent console messages per project (feeds the MCP
   * `devlauncher_preview_read_console` tool). Filled regardless of listeners.
   */
  getConsoleBuffer(projectId: string, limit = 50): ConsoleInfo[] {
    const safe = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 50
    const buffer = this.consoleBuffer.get(projectId) || []
    return buffer.slice(-safe)
  }

  partitionFor(projectId: string) {
    return `persist:preview-${projectId}`
  }

  getView(projectId: string): WebContentsViewType | null {
    return this.views.get(projectId)?.view || null
  }

  /** Create (lazily) and return the view for a project. */
  ensureView(projectId: string): PreviewEntry | null {
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
    view.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
      if (url && url.startsWith('http')) {
        (require('electron') as typeof import('electron')).shell.openExternal(url).catch(() => {})
      }
      return { action: 'deny' }
    })
    view.webContents.on('will-navigate', (event: Electron.Event<Electron.WebContentsWillNavigateEventParams>) => {
      // Allow any http(s) navigation (the project app itself may redirect);
      // the page was already loaded from a local dev URL.
      const url = event.url || ''
      if (!/^https?:\/\//.test(url)) event.preventDefault()
    })

    // Forward the project app's console output to the renderer so it can be
    // surfaced (e.g. logged alongside the process log stream).
    view.webContents.on('console-message', (_event: Electron.Event, level: number | string, message: string, line: number, sourceId: string) => {
      // Electron 43 passes level as a numeric code (0-3), older versions as a
      // string — normalize both to a stable name.
      const LEVEL_NAMES = ['verbose', 'info', 'warning', 'error']
      const levelName = typeof level === 'number'
        ? LEVEL_NAMES[level] || 'info'
        : LEVEL_NAMES.includes(level) ? level : 'info'
      const info: ConsoleInfo = {
        projectId,
        level: levelName,
        message: String(message || '').slice(0, 2000),
        source: sourceId || '',
        line,
      }
      // Ring buffer for the MCP read tool (last 200 per project).
      const buffer = this.consoleBuffer.get(projectId) || []
      buffer.push(info)
      if (buffer.length > 200) buffer.splice(0, buffer.length - 200)
      this.consoleBuffer.set(projectId, buffer)
      this.onConsoleMessage?.(info)
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
  show({ projectId, url, bounds }: { projectId: string; url: string; bounds?: PreviewBounds }) {
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
    console.log(`[Preview] Showing native WebContentsView for ${projectId} at ${url} (${bounds?.width}x${bounds?.height})`)
    return { success: true }
  }

  /** Hide a project's view but keep it alive (page state preserved). */
  hide(projectId: string) {
    const view = this.getView(projectId)
    if (view) view.setVisible(false)
    return { success: true }
  }

  hideOthers(exceptProjectId: string) {
    for (const [id, entry] of this.views) {
      if (id !== exceptProjectId) entry.view.setVisible(false)
    }
  }

  setBounds(projectId: string, bounds?: PreviewBounds) {
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

  navigate(projectId: string, url: string) {
    const entry = this.views.get(projectId)
    if (!entry) return { success: false, error: 'Preview not created yet' }
    entry.url = url
    entry.view.webContents.loadURL(url).catch((error) => {
      console.error(`[Preview] Navigate failed:`, error)
    })
    return { success: true }
  }

  reload(projectId: string) {
    const view = this.getView(projectId)
    if (!view) return { success: false, error: 'Preview not created yet' }
    view.webContents.reload()
    return { success: true }
  }

  setZoom(projectId: string, zoomLevel: number) {
    const view = this.getView(projectId)
    if (!view) return { success: false, error: 'Preview not created yet' }
    const factor = Math.max(0.25, Math.min(3, (zoomLevel || 100) / 100))
    view.webContents.setZoomFactor(factor)
    return { success: true }
  }

  toggleDevTools(projectId: string) {
    const view = this.getView(projectId)
    if (!view) return { success: false, error: 'Preview not created yet' }
    if (view.webContents.isDevToolsOpened()) {
      view.webContents.closeDevTools()
    } else {
      view.webContents.openDevTools({ mode: 'detach' })
    }
    return { success: true }
  }

  async clearSiteData(projectId: string) {
    try {
      const ses = session.fromPartition(this.partitionFor(projectId))
      await ses.clearStorageData()
      await ses.clearCache()
      await ses.clearAuthCache()
      if (typeof ses.cookies?.flushStore === 'function') {
        await ses.cookies.flushStore()
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  /** Destroy a project's view (frees its renderer process). */
  destroy(projectId: string) {
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

export default PreviewManager


export type { PreviewManager }
