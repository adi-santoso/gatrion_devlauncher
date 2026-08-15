import { useEffect, useState } from 'react'
import { noDragRegion } from './windowChrome'

interface WindowState {
  maximized?: boolean
  platform?: string
}

const svgProps = {
  width: 12,
  height: 12,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/**
 * Renderer-drawn title bar buttons for the frameless window. The main process
 * broadcasts `window-maximized-changed` ({ maximized, platform }) after the
 * window is created and whenever it maximizes/unmaximizes (button, Aero snap,
 * or double-click on the drag region). Hidden until the first state event
 * arrives (also hides on macOS, which keeps the native traffic lights).
 */
export default function WindowControls() {
  const [state, setState] = useState<WindowState | null>(null)

  useEffect(() => {
    const electron = window.electron as Record<string, (...args: unknown[]) => unknown> | undefined
    if (!electron?.onWindowMaximizedChange || !electron.getWindowState) return
    // Pull the initial state first — the did-finish-load push can arrive
    // before React mounts and subscribes.
    let cancelled = false
    void Promise.resolve(electron.getWindowState()).then((payload) => {
      if (!cancelled && payload && typeof payload === 'object') {
        setState(payload as WindowState)
      }
    })
    const subscribe = electron.onWindowMaximizedChange as ((cb: (s: unknown) => void) => (() => void) | undefined) | undefined
    const unsubscribe = subscribe?.((payload) => {
      setState((payload || {}) as WindowState)
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  // Hidden until the first state event (also hidden on macOS, which keeps the
  // native traffic lights).
  if (state === null || state.platform === 'darwin') return null

  const electron = window.electron as Record<string, (...args: unknown[]) => unknown> | undefined
  const handleMinimize = () => electron?.minimizeWindow?.()
  const handleMaximize = () => electron?.maximizeWindow?.()
  const handleClose = () => electron?.closeWindow?.()
  const isMaximized = !!state.maximized

  return (
    <div className="flex h-full items-stretch" style={noDragRegion}>
      <button
        type="button"
        onClick={handleMinimize}
        title="Minimize"
        aria-label="Minimize"
        className="w-[42px] flex items-center justify-center text-ink-soft transition-colors hover:bg-surface-3 hover:text-ink"
      >
        <svg {...svgProps}><path d="M5 12h14" /></svg>
      </button>
      <button
        type="button"
        onClick={handleMaximize}
        title={isMaximized ? 'Restore' : 'Maximize'}
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        className="w-[42px] flex items-center justify-center text-ink-soft transition-colors hover:bg-surface-3 hover:text-ink"
      >
        {isMaximized ? (
          <svg {...svgProps}><rect x="5" y="8" width="11" height="11" rx="1" /><path d="M8 8V6h11v11h-2" /></svg>
        ) : (
          <svg {...svgProps}><rect x="5" y="5" width="14" height="14" rx="1" /></svg>
        )}
      </button>
      <button
        type="button"
        onClick={handleClose}
        title="Close"
        aria-label="Close"
        className="w-[42px] flex items-center justify-center text-ink-soft transition-colors hover:bg-danger hover:text-white"
      >
        <svg {...svgProps}><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  )
}
