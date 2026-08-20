import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// AppPreviewTab drives the native WebContentsView through the IPC layer; stub
// the whole bridge so the effect runs without Electron.
vi.mock('../../../utils/ipcRenderer', () => ({
  previewShow: vi.fn(async () => ({ success: true })),
  previewHide: vi.fn(async () => ({ success: true })),
  previewSetBounds: vi.fn(async () => ({ success: true })),
  previewNudge: vi.fn(async () => ({ success: true })),
  previewZoom: vi.fn(async () => ({ success: true })),
  previewReload: vi.fn(async () => ({ success: true })),
  previewClearData: vi.fn(async () => ({ success: true })),
  previewToggleDevTools: vi.fn(async () => ({ success: true })),
  previewDestroy: vi.fn(async () => ({ success: true })),
  openExternalUrl: vi.fn(async () => ({ success: true })),
}))

import * as ipc from '../../../utils/ipcRenderer'
import AppPreviewTab from '../AppPreviewTab'

const project = { id: 'p1', name: 'Alpha', type: 'NODEJS', port: 3000, status: 'running' }

// jsdom has no ResizeObserver and reports a zero-sized layout; give elements a
// real rect so sendBounds takes the "visible" path instead of hiding the view.
const rect = {
  x: 0, y: 40, top: 40, left: 0, right: 800, bottom: 640, width: 800, height: 600, toJSON: () => {},
}
const originalGetBoundingClientRect = window.Element.prototype.getBoundingClientRect

beforeEach(() => {
  vi.clearAllMocks()
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.Element.prototype.getBoundingClientRect = () => rect
  // nativeAvailable() gates on the preload bridge exposing previewShow.
  window.electron = { previewShow: () => {} }
})

afterEach(() => {
  window.Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
  delete window.electron
})

describe('AppPreviewTab native view focus handling', () => {
  it('re-asserts bounds and nudges a repaint when the window regains focus', () => {
    render(<AppPreviewTab project={project} />)
    expect(screen.getByLabelText('Native preview of Alpha')).toBeInTheDocument()

    fireEvent.focus(window)

    expect(ipc.previewNudge).toHaveBeenCalledTimes(1)
    expect(ipc.previewNudge).toHaveBeenCalledWith('p1')
    expect(ipc.previewSetBounds).toHaveBeenCalledWith('p1', {
      x: 0, y: 40, width: 800, height: 600,
    })
  })

  it('removes the focus listener on unmount (no leak across remounts)', () => {
    const { unmount } = render(<AppPreviewTab project={project} />)
    unmount()

    fireEvent.focus(window)
    expect(ipc.previewNudge).not.toHaveBeenCalled()
  })

  it('does not accumulate focus listeners when the effect re-runs', () => {
    // `fullscreen` is an effect dependency, so toggling it tears the effect
    // down and sets it up again — one listener must remain, not three.
    const { rerender } = render(<AppPreviewTab project={project} fullscreen={false} />)
    rerender(<AppPreviewTab project={project} fullscreen />)
    rerender(<AppPreviewTab project={project} fullscreen={false} />)

    fireEvent.focus(window)
    expect(ipc.previewNudge).toHaveBeenCalledTimes(1)
  })

  it('skips the nudge while the preview is inactive (keep-alive, hidden tab)', () => {
    render(<AppPreviewTab project={project} active={false} />)

    fireEvent.focus(window)
    expect(ipc.previewNudge).not.toHaveBeenCalled()
  })

  it('repaints after returning from an inactive keep-alive view', async () => {
    const { rerender } = render(<AppPreviewTab project={project} active={false} />)

    rerender(<AppPreviewTab project={project} active />)

    await waitFor(() => expect(ipc.previewNudge).toHaveBeenCalledWith('p1'))
  })

  it('does not touch the native view for a stopped project (iframe fallback)', () => {
    render(<AppPreviewTab project={{ ...project, status: 'stopped' }} />)

    fireEvent.focus(window)
    expect(ipc.previewNudge).not.toHaveBeenCalled()
    expect(ipc.previewShow).not.toHaveBeenCalled()
  })
})
