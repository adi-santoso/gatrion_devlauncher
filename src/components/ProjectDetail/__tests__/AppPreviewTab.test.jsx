import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  previewNavigate: vi.fn(async () => ({ success: true })),
  previewGetState: vi.fn(async () => ({ success: true, data: { url: 'http://localhost:3000', canGoBack: false, canGoForward: false } })),
  previewBack: vi.fn(async () => ({ success: true })),
  previewForward: vi.fn(async () => ({ success: true })),
  previewSetDevice: vi.fn(async () => ({ success: true })),
  onPreviewUrlUpdated: vi.fn(() => () => {}),
  openExternalUrl: vi.fn(async () => ({ success: true })),
}))

import * as ipc from '../../../utils/ipcRenderer'
import AppPreviewTab from '../AppPreviewTab'
import { I18nProvider } from '../../../i18n/I18nContext'

const project = { id: 'p1', name: 'Alpha', type: 'NODEJS', port: 3000, status: 'running' }

// jsdom has no ResizeObserver and reports a zero-sized layout; give elements a
// real rect so sendBounds takes the "visible" path instead of hiding the view.
const rect = {
  x: 0, y: 40, top: 40, left: 0, right: 800, bottom: 640, width: 800, height: 600, toJSON: () => {},
}
const originalGetBoundingClientRect = window.Element.prototype.getBoundingClientRect

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
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

describe('AppPreviewTab editable address bar', () => {
  it('reads the initial URL from the native view state', async () => {
    render(<AppPreviewTab project={project} />)
    await waitFor(() => {
      expect(screen.getByLabelText('Preview address')).toHaveValue('http://localhost:3000')
    })
  })

  it('navigates to a bare path resolved onto the app origin on Enter', async () => {
    render(<AppPreviewTab project={project} />)
    const input = screen.getByLabelText('Preview address')

    fireEvent.change(input, { target: { value: 'login' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(ipc.previewNavigate).toHaveBeenCalledWith('p1', 'http://localhost:3000/login')
  })

  it('navigates to a bare host:port with an http scheme on Enter', async () => {
    render(<AppPreviewTab project={project} />)
    const input = screen.getByLabelText('Preview address')

    fireEvent.change(input, { target: { value: 'localhost:9999' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(ipc.previewNavigate).toHaveBeenCalledWith('p1', 'http://localhost:9999')
  })

  it('reverts to the live URL when the input loses focus without submitting', async () => {
    render(<AppPreviewTab project={project} />)
    await waitFor(() => {
      expect(screen.getByLabelText('Preview address')).toHaveValue('http://localhost:3000')
    })
    const input = screen.getByLabelText('Preview address')

    fireEvent.change(input, { target: { value: 'garbage' } })
    fireEvent.blur(input)

    expect(input).toHaveValue('http://localhost:3000')
    expect(ipc.previewNavigate).not.toHaveBeenCalled()
  })

  it('disables the address input for a stopped project (iframe fallback)', async () => {
    render(<AppPreviewTab project={{ ...project, status: 'stopped' }} />)
    await act(async () => {})
    expect(screen.getByLabelText('Preview address')).toHaveProperty('readOnly', true)
  })
})

describe('AppPreviewTab device simulator', () => {
  // PreviewDeviceBar strings come from the i18n dictionary — provide the real
  // EN translations so queries can use the visible labels.
  const renderApp = (el) => render(<I18nProvider language="en">{el}</I18nProvider>)

  const screenEl = () => {
    const placeholder = screen.getByLabelText('Native preview of Alpha')
    return placeholder.parentElement
  }

  const deviceSelect = () => screen.getByLabelText('Device')

  it('starts in Fit to window mode with no device screen or zoom lock', async () => {
    renderApp(<AppPreviewTab project={project} />)
    expect(deviceSelect()).toHaveValue('')
    expect(ipc.previewSetDevice).toHaveBeenCalledWith('p1', null)
    const zoom = screen.getByRole('combobox', { name: /zoom/i })
    expect(zoom).not.toBeDisabled()
  })

  it('resizes the viewport to the selected preset and applies CDP emulation', async () => {
    renderApp(<AppPreviewTab project={project} />)
    fireEvent.change(deviceSelect(), { target: { value: 'iphone-15' } })

    await waitFor(() => expect(ipc.previewSetDevice).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({ width: 393, height: 852, mobile: true, deviceScaleFactor: 3 }),
    ))
    expect(screenEl().style.width).toBe('393px')
    expect(screenEl().style.height).toBe('852px')
    // Zoom is fixed while a device screen is sized.
    expect(screen.getByRole('combobox', { name: /zoom/i })).toBeDisabled()
  })

  it('rotate swaps the viewport dimensions and re-applies emulation', async () => {
    renderApp(<AppPreviewTab project={project} />)
    fireEvent.change(deviceSelect(), { target: { value: 'iphone-15' } })
    await waitFor(() => expect(screenEl().style.width).toBe('393px'))

    fireEvent.click(screen.getByLabelText('Rotate (portrait/landscape)'))
    await waitFor(() => expect(screenEl().style.width).toBe('852px'))
    expect(ipc.previewSetDevice).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({ width: 852, height: 393 }),
    )
  })

  it('laptop presets resize the viewport without CDP emulation (null config)', async () => {
    renderApp(<AppPreviewTab project={project} />)
    fireEvent.change(deviceSelect(), { target: { value: 'laptop-1366' } })

    await waitFor(() => expect(screenEl().style.width).toBe('1366px'))
    expect(ipc.previewSetDevice).toHaveBeenLastCalledWith('p1', null)
  })

  it('custom size: entering W×H applies a clamped custom viewport', async () => {
    renderApp(<AppPreviewTab project={project} />)
    fireEvent.change(deviceSelect(), { target: { value: 'custom' } })

    const width = screen.getByLabelText('Width')
    const height = screen.getByLabelText('Height')
    fireEvent.change(width, { target: { value: '500' } })
    fireEvent.change(height, { target: { value: '99999' } })
    fireEvent.keyDown(height, { key: 'Enter' })

    await waitFor(() => expect(screenEl().style.width).toBe('500px'))
    expect(screenEl().style.height).toBe('4096px')
    // Custom sizes are viewport-only: no CDP override.
    expect(ipc.previewSetDevice).toHaveBeenLastCalledWith('p1', null)
  })

  it('returning to Fit to window clears emulation and restores the full area', async () => {
    renderApp(<AppPreviewTab project={project} />)
    fireEvent.change(deviceSelect(), { target: { value: 'iphone-15' } })
    await waitFor(() => expect(screenEl().style.width).toBe('393px'))

    fireEvent.change(deviceSelect(), { target: { value: '' } })
    await waitFor(() => expect(ipc.previewSetDevice).toHaveBeenLastCalledWith('p1', null))
    expect(screenEl().style.width).toBe('')
  })

  it('persists the selection per project and restores it on remount', async () => {
    const { unmount } = renderApp(<AppPreviewTab project={project} />)
    fireEvent.change(deviceSelect(), { target: { value: 'pixel-8' } })
    await waitFor(() => expect(screenEl().style.width).toBe('412px'))
    unmount()

    expect(window.localStorage.getItem('devlauncher:preview-device:p1')).toContain('"mode":"preset"')

    renderApp(<AppPreviewTab project={project} />)
    expect(deviceSelect()).toHaveValue('pixel-8')
    await waitFor(() => expect(screenEl().style.width).toBe('412px'))
  })

  it('shows a device pill above the simulated screen with name and dimensions', async () => {
    renderApp(<AppPreviewTab project={project} />)
    fireEvent.change(deviceSelect(), { target: { value: 'iphone-15' } })
    await waitFor(() => expect(screen.getByText('iPhone 15 · 393 × 852')).toBeInTheDocument())
  })

  it('does not touch the native view or CDP for a stopped project', async () => {
    renderApp(<AppPreviewTab project={{ ...project, status: 'stopped' }} />)
    fireEvent.change(deviceSelect(), { target: { value: 'iphone-15' } })
    expect(ipc.previewSetDevice).not.toHaveBeenCalled()
    expect(ipc.previewShow).not.toHaveBeenCalled()
  })
})

describe('AppPreviewTab preview area centering', () => {
  const renderApp = (el) => render(<I18nProvider language="en">{el}</I18nProvider>)

  // The card sits inside the "main preview container" — the element that also
  // carries the centering classes. Its parentElement is that container.
  const previewContainer = () => screen.getByText('Project is Not Running').closest('div').parentElement

  it('centers the not-running card in fullscreen preview', () => {
    // Regression: fullscreen dropped items-center/justify-center (needed so a
    // fit-to-window preview can bleed edge to edge), which also applied to the
    // placeholder and pinned the card to the left edge instead of centering it.
    renderApp(<AppPreviewTab project={{ ...project, status: 'stopped' }} fullscreen />)

    expect(previewContainer().className).toContain('items-center')
    expect(previewContainer().className).toContain('justify-center')
  })

  it('centers the not-running card in normal mode too', () => {
    renderApp(<AppPreviewTab project={{ ...project, status: 'stopped' }} />)

    expect(previewContainer().className).toContain('items-center')
    expect(previewContainer().className).toContain('justify-center')
  })

  it('centers the no-port card in fullscreen preview', () => {
    renderApp(<AppPreviewTab project={{ ...project, port: null, status: 'stopped' }} fullscreen />)

    const card = screen.getByText('No App Port Configured')
    expect(card.closest('div').parentElement.className).toContain('justify-center')
  })

  it('still drops centering for a live fit-to-window preview', () => {
    // The full-bleed branch is intentional: an uncentered flex parent lets the
    // native/iframe preview fill the whole area. Keep it for running projects.
    renderApp(<AppPreviewTab project={project} fullscreen />)

    const container = screen.getByLabelText('Native preview of Alpha').parentElement
    expect(container.className).not.toContain('items-center')
    expect(container.className).not.toContain('justify-center')
  })

  it('centers a device-simulated preview in fullscreen', async () => {
    renderApp(<AppPreviewTab project={project} fullscreen />)
    fireEvent.change(screen.getByLabelText('Device'), { target: { value: 'iphone-15' } })

    // With a device selected the screen is wrapped in a bezel, so the preview
    // container is two levels up from the measured element.
    await waitFor(() => {
      const screenEl = screen.getByLabelText('Native preview of Alpha').parentElement
      const container = screenEl.parentElement.parentElement
      expect(container.className).toContain('items-center')
      expect(container.className).toContain('justify-center')
    })
  })
})
