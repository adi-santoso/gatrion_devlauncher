import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import StackLogo from '../Common/StackLogo'
import Icon from '../Common/Icon'
import * as ipc from '../../utils/ipcRenderer'
import { previewUrl } from '../../utils/previewUrl'
import type { ViewProject } from '../Dashboard/ProjectCard'
import PreviewDeviceBar from './PreviewDeviceBar'
import PreviewPlaceholder from './PreviewPlaceholder'
import { deviceLabel } from './devicePresets'
import { usePreviewDevice } from './usePreviewDevice'
import { usePreviewNavigation } from './usePreviewNavigation'

const statusClasses: Record<string, string> = {
  running: 'text-success bg-success/10 border-success/20',
  starting: 'text-warning bg-warning/10 border-warning/20',
  stopping: 'text-warning bg-warning/10 border-warning/20',
  error: 'text-danger bg-danger/10 border-danger/20',
  stopped: 'text-ink-faint bg-surface-3 border-border'
}

const nativeAvailable = (): boolean => typeof window !== 'undefined' && window.electron?.previewShow !== undefined

/** Project may be a placeholder `{ id }` while keep-alive previews are mounted. */
export type PreviewProject = ViewProject | { id: string }

interface AppPreviewTabProps {
  project: PreviewProject
  onStart?: (project: PreviewProject) => void
  onEdit?: () => void
  onBack?: () => void
  fullscreen?: boolean
  onToggleFullscreen?: () => void
  onPrevProject?: () => void
  onNextProject?: () => void
  active?: boolean
  keepAlive?: boolean
}

export default function AppPreviewTab({
  project,
  onStart,
  onEdit,
  onBack,
  fullscreen = false,
  onToggleFullscreen,
  onPrevProject,
  onNextProject,
  active = true,
  keepAlive = true,
}: AppPreviewTabProps) {
  const [zoomLevel, setZoomLevel] = useState(100)
  const [nativeMode] = useState(() => nativeAvailable() && Boolean((project as ViewProject)?.port))
  const [nativeFailed, setNativeFailed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const wasInactiveRef = useRef(false)
  const status = ((project as ViewProject)?.status || 'stopped').toLowerCase()
  const isRunning = status === 'running'
  const appUrl = previewUrl((project as ViewProject)?.port, (project as ViewProject)?.previewHost)
  const projectId = project?.id
  // Empty state (no port configured, or project stopped): a small centered card
  // is rendered instead of a preview surface.
  const showPlaceholder = appUrl == null || !isRunning

  // Device simulator: selection + orientation persist per project.
  const { device, landscape, size: deviceSize, emulation, setDevice, toggleLandscape } = usePreviewDevice(projectId)
  const deviceActive = deviceSize != null

  const useNative = nativeMode && !nativeFailed && isRunning && appUrl != null
  const nav = usePreviewNavigation(projectId, appUrl, useNative)

  // Apply/clear CDP device emulation whenever the selection changes. Sent
  // after `preview-show` on mount (IPC ordering), so a fresh view already
  // carries the override.
  useEffect(() => {
    if (!useNative) return
    void ipc.previewSetDevice(projectId, emulation)
  }, [useNative, projectId, emulation])

  // Keep the native view sized/positioned to match the placeholder div. The
  // renderer owns layout; main positions the WebContentsView at these bounds.
  // In device mode the placeholder is the device-sized screen (measured), so
  // the view lands exactly inside the drawn bezel.
  useEffect(() => {
    if (!useNative || !containerRef.current) return undefined
    let disposed = false

    const sendBounds = (): void => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      // Clip to the visible viewport (the page may scroll under the view)
      const x = Math.max(0, rect.left)
      const y = Math.max(0, rect.top)
      const right = Math.min(vw, rect.right)
      const bottom = Math.min(vh, rect.bottom)
      if (right <= x || bottom <= y) {
        ipc.previewHide(projectId)
        return
      }
      ipc.previewSetBounds(projectId, {
        x, y, width: right - x, height: bottom - y,
      })
    }

    const show = async (): Promise<void> => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const result = await ipc.previewShow({
        projectId,
        url: appUrl as string,
        bounds: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      })
      if (disposed) return
      if (!result?.success) {
        setNativeFailed(true)
        return
      }
      // Returning from another top-level view does not necessarily fire a
      // window focus event. Wait for the hidden wrapper's layout to be
      // committed, then explicitly repaint the native view.
      if (wasInactiveRef.current) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (!disposed && active) {
            sendBounds()
            void ipc.previewNudge(projectId)
          }
        }))
      }
      wasInactiveRef.current = false
    }

    if (useNative && active) void show()
    else {
      wasInactiveRef.current = true
      void ipc.previewHide(projectId)
    }

    // Re-assert bounds after the layout settles (e.g. the top bar hides one
    // frame after the fullscreen toggle), so the native view lands exactly on
    // the final container rect instead of an intermediate one.
    const settle = (): void => {
      requestAnimationFrame(() => requestAnimationFrame(sendBounds))
    }
    settle()

    // Regaining window focus can leave the native view stale on Windows (the
    // compositor keeps the last painted frame). Re-assert bounds, then nudge
    // the view to force a repaint.
    const onWindowFocus = (): void => {
      if (!active) return
      sendBounds()
      ipc.previewNudge(projectId)
    }

    const ro = new ResizeObserver(sendBounds)
    ro.observe(containerRef.current)
    window.addEventListener('resize', sendBounds)
    window.addEventListener('scroll', sendBounds, true)
    window.addEventListener('focus', onWindowFocus)

    return () => {
      disposed = true
      ro.disconnect()
      window.removeEventListener('resize', sendBounds)
      window.removeEventListener('scroll', sendBounds, true)
      window.removeEventListener('focus', onWindowFocus)
      // If we never owned the native view (project stopped, or this renderer
      // can't drive it), there is nothing to clean up for this project.
      if (!nativeAvailable()) return
      if (keepAlive) ipc.previewHide(projectId)
      else ipc.previewDestroy(projectId)
      // `fullscreen` and `deviceActive` are dependencies on purpose: toggling
      // them changes the container layout (top bar hides / screen shrinks to
      // the device), so the view is re-shown with fresh bounds. Without it, a
      // view resized to the full window can stay black on Windows until it is
      // re-placed/repainted.
    }
  }, [useNative, active, keepAlive, projectId, appUrl, fullscreen, deviceActive])

  // Apply zoom level to the native view
  useEffect(() => {
    if (useNative && zoomLevel !== 100) {
      ipc.previewZoom(projectId, zoomLevel)
    }
  }, [useNative, zoomLevel, projectId])

  const handleToggleDevTools = useCallback((): void => {
    if (useNative) {
      ipc.previewToggleDevTools(projectId)
    }
  }, [useNative, projectId])

  // Keyboard shortcuts while in fullscreen preview: Ctrl/Cmd+Left/Right to
  // jump between projects, F12 / Ctrl+Shift+I to toggle project DevTools.
  useEffect(() => {
    if (!fullscreen) return undefined
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
        e.preventDefault()
        onPrevProject?.()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
        e.preventDefault()
        onNextProject?.()
      } else if (e.key === 'F12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i')) {
        e.preventDefault()
        handleToggleDevTools()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fullscreen, onPrevProject, onNextProject, handleToggleDevTools])

  const projectName = 'name' in project ? project.name : project.id
  const projectType = 'type' in project ? project.type : 'CUSTOM'

  // DevTools cannot attach while CDP device emulation (mobile presets) holds
  // the debugger — hide the button for touch presets.
  const devtoolsBlocked = emulation?.mobile === true

  const devicePill = deviceActive ? deviceLabel(device, landscape) : null

  // Editable address input shared by the normal and fullscreen mini-browser
  // bars. Read-only when a native view is unavailable (iframe fallback).
  const addressEditable = useNative && isRunning
  const addressInputEl = (
    <input
      value={nav.address}
      readOnly={!addressEditable}
      onChange={(e) => nav.onAddressChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') nav.onAddressSubmit()
      }}
      onBlur={nav.onAddressBlur}
      aria-label="Preview address"
      className="flex-1 min-w-0 bg-transparent text-xs font-mono text-ink focus:outline-none placeholder:text-ink-faint"
      placeholder={appUrl || 'No app port configured'}
    />
  )

  const navButtonClass = 'w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0'
  const backBtn = useNative ? (
    <button type="button" onClick={nav.back} disabled={!nav.canGoBack} title="Back" className={navButtonClass}>
      <Icon name="chevronLeft" size={14} />
    </button>
  ) : null
  const forwardBtn = useNative ? (
    <button type="button" onClick={nav.forward} disabled={!nav.canGoForward} title="Forward" className={navButtonClass}>
      <Icon name="chevronRight" size={14} />
    </button>
  ) : null

  const deviceBar = (
    <PreviewDeviceBar
      device={device}
      landscape={landscape}
      disabled={!isRunning || !appUrl}
      onChange={setDevice}
      onRotate={toggleLandscape}
    />
  )

  const zoomSelector = (
    <div className="flex items-center gap-1 bg-surface-3 border border-border rounded-md px-1.5 py-0.5 text-xs text-ink-soft font-mono">
      <span className="text-[10px] text-ink-faint">Zoom:</span>
      <select
        value={zoomLevel}
        disabled={deviceActive}
        aria-label="Zoom"
        title={deviceActive ? 'Zoom is fixed while a device is selected' : undefined}
        onChange={(e) => setZoomLevel(Number(e.target.value))}
        className="bg-transparent text-xs text-ink font-semibold focus:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <option value={50}>50%</option>
        <option value={75}>75%</option>
        <option value={100}>100%</option>
        <option value={125}>125%</option>
        <option value={150}>150%</option>
      </select>
    </div>
  )

  // The element the native view overlays: full area, or the device-sized
  // screen inside the bezel. Measured for bounds in both cases.
  const screenEl = (
    <div
      ref={containerRef}
      style={deviceSize ? { width: deviceSize.width, height: deviceSize.height, maxWidth: '100%' } : undefined}
      className={deviceActive ? 'relative overflow-hidden bg-black' : 'w-full h-full flex-1 relative overflow-hidden'}
    >
      {useNative ? (
        /* The WebContentsView is layered above this empty region by main */
        <div className="w-full h-full" aria-label={`Native preview of ${projectName}`} />
      ) : (
        <iframe
          key={nav.iframeKey}
          src={appUrl as string}
          title={`${projectName} preview`}
          style={{ zoom: `${zoomLevel}%` }}
          className={
            deviceActive
              ? 'w-full h-full border-0 bg-white'
              : fullscreen
                ? 'w-full h-full flex-1 border-0 rounded-none bg-white'
                : 'w-full h-full min-h-[500px] border-0 rounded-b-lg bg-white'
          }
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
      )}
    </div>
  )

  // Icon-only tool button used in the mini-browser bars.
  const toolBtn = (key: string, icon: 'restart' | 'external' | 'code' | 'trash' | 'chevronLeft' | 'chevronRight', title: string, onClick: () => void, opts: { disabled?: boolean; danger?: boolean } = {}): JSX.Element => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      disabled={opts.disabled}
      title={title}
      className={`w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0 ${opts.danger ? 'hover:text-danger hover:bg-danger/10' : 'hover:text-ink'}`}
    >
      <Icon name={icon} size={14} />
    </button>
  )

  return (
    <div
      className={
        fullscreen
          ? 'flex flex-col h-full w-full bg-base overflow-hidden border-0 rounded-none'
          : 'flex flex-col h-full min-h-[520px] bg-surface border border-border rounded-xl shadow-card overflow-hidden'
      }
    >
      {/* Mode Fullscreen Floating Info Bar */}
      {fullscreen ? (
        <div className="sticky top-0 z-30 flex items-center justify-between gap-3 px-3 py-1.5 bg-surface/95 backdrop-blur border-b border-border text-[11px] font-mono select-none">
          {/* Left Metadata */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBack}
              title="Back to projects"
              className="w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-3 transition-colors shrink-0"
            >
              <Icon name="chevronLeft" size={15} />
            </button>
            <div className="w-5 h-5 rounded bg-surface-3 border border-border flex items-center justify-center text-ink-soft shrink-0">
              <StackLogo type={projectType} size={12} />
            </div>
            <span className="font-bold text-ink truncate max-w-[150px] sm:max-w-xs">{projectName}</span>
            <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusClasses[status] || statusClasses.stopped}`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
            <span className="text-ink-faint hidden sm:inline">·</span>
            <span className="text-ink-faint truncate hidden sm:inline">
              {projectType} {'port' in project && project.port != null ? `· :${project.port}` : ''} {'pid' in project && project.pid != null ? `· PID ${project.pid}` : ''}
            </span>
          </div>

          {/* Editable Address Bar (fullscreen) */}
          <div className="flex-1 min-w-0 mx-2 h-7 bg-base border border-border rounded-md px-2 flex items-center gap-1.5 text-xs font-mono">
            {backBtn}
            {forwardBtn}
            <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-success' : 'bg-ink-faint'} shrink-0`} />
            {addressInputEl}
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {deviceBar}
            {onPrevProject && toolBtn('prev', 'chevronLeft', 'Previous project (Ctrl+←)', onPrevProject)}
            {onNextProject && toolBtn('next', 'chevronRight', 'Next project (Ctrl+→)', onNextProject)}
            {toolBtn('reload', 'restart', 'Reload preview', nav.reload, { disabled: !isRunning || !appUrl })}
            {toolBtn('external', 'external', 'Open in external browser', nav.openExternal, { disabled: !appUrl })}
            {useNative && !devtoolsBlocked && (
              <>
                {toolBtn('devtools', 'code', 'Toggle project DevTools (F12)', handleToggleDevTools)}
                {toolBtn('clear', 'trash', 'Clear site data (cookies, storage) for this project', nav.clearData, { danger: true })}
              </>
            )}
            <button
              type="button"
              onClick={onToggleFullscreen}
              title="Exit fullscreen (ESC)"
              className="h-7 pl-2 pr-2.5 rounded-md bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 font-semibold transition-colors flex items-center gap-1.5"
            >
              <Icon name="minimize" size={13} />
              <span className="text-[11px]">Exit</span>
            </button>
          </div>
        </div>
      ) : (
        /* Normal Mode Mini Browser Bar */
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-surface-2 border-b border-border flex-wrap">
          <div className="flex items-center gap-1">
            {backBtn}
            {forwardBtn}
            {toolBtn('reload', 'restart', 'Reload preview', nav.reload, { disabled: !isRunning || !appUrl })}
          </div>

          {/* Editable Address Bar */}
          <div className="flex-1 min-w-[200px] max-w-xl h-7 bg-base border border-border rounded-md px-3 flex items-center gap-2 text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-success' : 'bg-ink-faint'} shrink-0`} />
            {addressInputEl}
          </div>

          {/* Right Controls (Device + Zoom + Open externally + Toggle Fullscreen) */}
          <div className="flex items-center gap-3">
            {deviceBar}
            {zoomSelector}

            {useNative && toolBtn('clear', 'trash', 'Clear site data (cookies, storage) for this project', nav.clearData, { danger: true })}

            <button
              type="button"
              onClick={nav.openExternal}
              disabled={!appUrl}
              title="Open in external browser"
              className="text-xs font-medium text-ink-faint hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
            >
              <Icon name="external" size={13} />
              <span>Open externally</span>
            </button>
            <button
              type="button"
              onClick={onToggleFullscreen}
              title="Toggle Fullscreen"
              className="w-7 h-7 rounded-md bg-surface-3 hover:bg-surface-2 text-xs font-medium text-ink-soft hover:text-ink border border-border flex items-center justify-center transition-colors"
            >
              <Icon name="maximize" size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Main Preview Container — the fit-mode branch keeps the measured
          element as a DIRECT child so its h-full/flex-1 chain never collapses
          (a wrapping h-full div in an auto-height flex parent measures 0).
          Centering is dropped ONLY for a real fit-to-window preview; the
          placeholder is a small card and must stay centered in every mode. */}
      <div
        className={
          fullscreen && !deviceActive && !showPlaceholder
            ? 'flex-1 relative bg-base flex flex-col w-full h-full p-0 overflow-hidden'
            : fullscreen
              ? 'flex-1 relative bg-base flex flex-col items-center justify-center w-full h-full p-4 overflow-hidden'
              : 'flex-1 relative bg-base flex flex-col items-center justify-center p-4'
        }
      >
        {!appUrl ? (
          <PreviewPlaceholder variant="no-port" onEdit={onEdit} />
        ) : !isRunning ? (
          <PreviewPlaceholder variant="not-running" appUrl={appUrl} onStart={() => onStart?.(project)} />
        ) : (
          <>
            {devicePill && (
              <span className="text-[10px] font-mono text-ink-soft bg-surface-2 border border-border rounded-full px-2.5 py-0.5 shrink-0 mb-2">
                {devicePill}
              </span>
            )}
            {deviceActive ? (
              <div className="p-1.5 rounded-[26px] bg-ink/15 ring-1 ring-ink/20 shadow-2xl shrink-0">
                {screenEl}
              </div>
            ) : screenEl}
          </>
        )}
      </div>
    </div>
  )
}