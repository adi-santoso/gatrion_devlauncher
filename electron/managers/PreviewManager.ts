import type { BrowserWindow, WebContentsView as WebContentsViewType } from 'electron'

const { WebContentsView, session } = require('electron') as typeof import('electron')
import type { CredentialManager } from './CredentialManager'
import { applyDeviceEmulation, clearDeviceEmulation, sanitizeEmulationConfig } from './previewDeviceEmulation'

interface PreviewEntry {
  view: WebContentsViewType
  url: string | null
  /** Base app URL the view was (re)loaded with — reload only when it changes. */
  baseUrl: string | null
  canGoBack: boolean
  canGoForward: boolean
  title: string
}

/** Snapshot pushed to the renderer whenever the preview URL/state changes. */
export interface PreviewNavState {
  projectId: string
  url: string
  canGoBack: boolean
  canGoForward: boolean
  title: string
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
  private pendingNudges = new WeakSet<WebContentsViewType>()
  /** Optional credential vault; enables password autofill for the preview. */
  private credentialManager: CredentialManager | null
  /** Preload script path registered per preview partition (autofill bridge). */
  private preloadScriptPath = ''
  /** Preloaded credential content script (IIFE string) injected on load. */
  private credentialContentScript = ''
  private preloadRegistered = new Set<string>()

  constructor(credentialManager?: CredentialManager) {
    this.win = null
    this.views = new Map() // projectId -> { view, url }
    this.onConsoleMessage = null
    this.credentialManager = credentialManager || null
  }

  /** Configure the preload path so each preview partition gets the autofill bridge. */
  setPreloadScriptPath(preloadPath: string) {
    this.preloadScriptPath = preloadPath
  }

  /** Set the content script (form detection / dropdown / save) injected on load. */
  setCredentialContentScript(script: string) {
    this.credentialContentScript = script
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

    const ses = session.fromPartition(this.partitionFor(projectId))

    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // Per-project persistent partition: cookies/storage survive restarts
        // and are isolated between projects.
        session: ses,
      },
    })

    // Register the credential autofill preload bridge once per partition.
    if (this.preloadScriptPath && this.credentialManager) {
      const key = this.partitionFor(projectId)
      if (!this.preloadRegistered.has(key)) {
        try {
          ses.registerPreloadScript({
            type: 'frame',
            filePath: this.preloadScriptPath,
          })
          this.preloadRegistered.add(key)
        } catch (error) {
          console.error('[Preview] Failed to register preview preload:', error)
        }
      }
      // Inject the form-detection / dropdown / save content script on load.
      const contentScript = this.credentialContentScript
      if (contentScript) {
        const onLoaded = (): void => {
          view.webContents
            .executeJavaScript(contentScript, true)
            .catch((error) => console.error('[Preview] Credential script injection failed:', error))
        }
        view.webContents.once('did-finish-load', onLoaded)
        view.webContents.on('did-navigate', onLoaded)
      }
    }

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
    entry = { view, url: null, baseUrl: null, canGoBack: false, canGoForward: false, title: '' }

    // Keep the renderer's mini-browser in sync with the actual page state so
    // the address bar reflects the URL currently being viewed and can offer
    // back/forward. `did-navigate` covers cross-document navigations (including
    // the initial load after loadURL/navigate); `did-navigate-in-page` covers
    // hash/spa changes that don't hit the document.
    const pushState = (): void => {
      const url = view.webContents.getURL() || entry!.url || ''
      entry!.url = url
      entry!.title = view.webContents.getTitle?.() || ''
      this.pushNavState(projectId)
    }
    view.webContents.on('did-navigate', pushState)
    view.webContents.on('did-navigate-in-page', pushState)
    view.webContents.on('page-title-updated', (_e: Electron.Event, title: string) => {
      entry!.title = title
      this.pushNavState(projectId)
    })

    this.views.set(projectId, entry)
    return entry
  }

  /**
   * Push the current navigation state of a preview to the renderer so it can
   * mirror the live URL, title and back/forward capability.
   */
  pushNavState(projectId: string) {
    const entry = this.views.get(projectId)
    if (!entry) return
    const canGoBack = entry.view.webContents.navigationHistory?.canGoBack?.() ?? false
    const canGoForward = entry.view.webContents.navigationHistory?.canGoForward?.() ?? false
    entry.canGoBack = canGoBack
    entry.canGoForward = canGoForward
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('preview-url-updated', {
        projectId,
        url: entry.url || '',
        title: entry.title,
        canGoBack,
        canGoForward,
      } satisfies PreviewNavState)
    }
  }

  /**
   * Show a project's preview. Loads the URL only on first use or when the
   * project's base URL changes (port/host edited); afterwards keeps the view
   * mounted so the user's current page — including any navigation made via the
   * address bar — is preserved when re-showing (tab switch, fullscreen toggle,
   * device change). navigate() is used for manual URL changes.
   */
  show({ projectId, url, bounds }: { projectId: string; url: string; bounds?: PreviewBounds }) {
    if (!projectId) return { success: false, error: 'Missing project id' }
    const entry = this.ensureView(projectId)
    if (!entry) return { success: false, error: 'Preview unavailable' }

    if (entry.baseUrl !== url) {
      // Only reload when the project's base URL changed (port/host edited, or
      // the very first load). Re-showing a mounted view (tab switch, fullscreen
      // toggle, device change) resets to the same base URL, so the user's
      // current page — including any navigation made via the address bar —
      // is preserved instead of being bounced back to the app root.
      entry.baseUrl = url
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
    const next = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    }
    const prev = view.getBounds?.() ?? null
    view.setBounds(next)
    // Windows compositor quirk: growing a WebContentsView can leave the newly
    // exposed area black until the web contents repaints (classic "blank
    // fullscreen" symptom — e.g. entering the in-app fullscreen preview).
    // Force a repaint when the size changed; position-only moves expose no
    // new surface and can skip it.
    if (!prev || prev.width !== next.width || prev.height !== next.height) {
      view.webContents.invalidate?.()
    }
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

  /** Return the current navigation state (url, title, back/forward) of a preview. */
  getState(projectId: string): { success: boolean; data?: PreviewNavState; error?: string } {
    const entry = this.views.get(projectId)
    if (!entry) return { success: false, error: 'Preview not created yet' }
    this.pushNavState(projectId)
    return {
      success: true,
      data: {
        projectId,
        url: entry.url || '',
        title: entry.title,
        canGoBack: entry.canGoBack,
        canGoForward: entry.canGoForward,
      },
    }
  }

  back(projectId: string): { success: boolean; error?: string } {
    const view = this.getView(projectId)
    if (!view) return { success: false, error: 'Preview not created yet' }
    view.webContents.goBack?.()
    return { success: true }
  }

  forward(projectId: string): { success: boolean; error?: string } {
    const view = this.getView(projectId)
    if (!view) return { success: false, error: 'Preview not created yet' }
    view.webContents.goForward?.()
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

  /**
   * Apply (or clear, when null) CDP device emulation on a project's view:
   * device pixel ratio, touch support and user agent. The view is already
   * resized by the renderer; this adds the emulation fidelity on top.
   */
  async setDevice(projectId: string, config: unknown) {
    const view = this.getView(projectId)
    if (!view) return { success: false, error: 'Preview not created yet' }
    try {
      const params = sanitizeEmulationConfig((config || null) as Record<string, unknown> | null)
      if (!params) {
        await clearDeviceEmulation(view.webContents)
      } else {
        await applyDeviceEmulation(view.webContents, params)
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
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

  /**
   * Force the view to repaint without changing its layout.
   *
   * Windows compositor quirk: after the window loses and regains focus (or is
   * restored), a WebContentsView can keep showing its last painted frame — the
   * classic "black/frozen preview". `invalidate()` alone is not always enough,
   * so shrink the view by 1px and restore it on the next tick: the resize makes
   * the compositor hand out a fresh surface. Net bounds are unchanged.
   */
  nudge(projectId: string) {
    const view = this.getView(projectId)
    if (!view) return { success: false, error: 'Preview not created yet' }
    try {
      view.webContents.invalidate?.()
      // Coalesce repeated focus events while the current repaint cycle is
      // pending; shrinking again would make the second restore target 1px off.
      if (this.pendingNudges.has(view)) return { success: true }
      const bounds = view.getBounds?.()
      // No bounds yet (never shown) — invalidate is all we can do.
      if (!bounds || !Number.isFinite(bounds.width)) return { success: true }
      // Keep the temporary width >= 1: setBounds with 0/negative width is
      // rejected by Chromium and would leave the view mis-sized.
      const shrunk = Math.max(1, bounds.width - 1)
      if (shrunk === bounds.width) return { success: true }
      const temporaryBounds = { ...bounds, width: shrunk }
      view.setBounds(temporaryBounds)
      this.pendingNudges.add(view)
      setImmediate(() => {
        try {
          const current = view.getBounds?.()
          // A resize or a newer nudge may have updated the view while this
          // restore was queued. Do not overwrite those newer bounds.
          if (!current || current.x !== temporaryBounds.x || current.y !== temporaryBounds.y
            || current.width !== temporaryBounds.width || current.height !== temporaryBounds.height) return
          view.setBounds(bounds)
        } catch (error) {
          console.error('[Preview] Error restoring bounds after nudge:', error)
        } finally {
          this.pendingNudges.delete(view)
        }
      })
      return { success: true }
    } catch (error) {
      console.error('[Preview] Error nudging view:', error)
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
