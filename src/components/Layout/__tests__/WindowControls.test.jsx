import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WindowControls from '../WindowControls'

function makeElectron(initialState, { onMaximized } = {}) {
  const emit = vi.fn((cb) => cb)
  const unsubscribe = vi.fn()
  const electron = {
    getWindowState: vi.fn(async () => initialState),
    onWindowMaximizedChange: vi.fn((cb) => {
      emit.mockImplementation(cb)
      return unsubscribe
    }),
    minimizeWindow: vi.fn(async () => ({ success: true })),
    maximizeWindow: vi.fn(async () => ({ success: true })),
    closeWindow: vi.fn(async () => ({ success: true })),
  }
  if (onMaximized) onMaximized.emit = emit
  return electron
}

async function flush() {
  await act(async () => {})
}

describe('WindowControls', () => {
  const originalElectron = window.electron

  afterEach(() => {
    window.electron = originalElectron
    vi.restoreAllMocks()
  })

  it('renders nothing when not running inside Electron', () => {
    const { container } = render(<WindowControls />)
    expect(container.firstChild).toBeNull()
  })

  it('pulls the initial state and renders the three controls', async () => {
    const electron = makeElectron({ maximized: false, platform: 'win32' })
    window.electron = electron

    render(<WindowControls />)
    await flush()

    expect(screen.getByRole('button', { name: 'Minimize' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Maximize' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(electron.minimizeWindow).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }))
    expect(electron.maximizeWindow).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(electron.closeWindow).toHaveBeenCalledTimes(1)
  })

  it('shows the restore button while maximized and updates from live events', async () => {
    const onMaximized = {}
    const electron = makeElectron({ maximized: true, platform: 'win32' }, { onMaximized })
    window.electron = electron

    render(<WindowControls />)
    await flush()

    expect(screen.queryByRole('button', { name: 'Maximize' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(electron.maximizeWindow).toHaveBeenCalledTimes(1)

    // Live unmaximize event flips it back to Maximize
    act(() => onMaximized.emit({ maximized: false, platform: 'win32' }))
    expect(screen.getByRole('button', { name: 'Maximize' })).toBeInTheDocument()
  })

  it('stays hidden on macOS (native traffic lights are kept)', async () => {
    window.electron = makeElectron({ maximized: false, platform: 'darwin' })
    const { container } = render(<WindowControls />)
    await flush()
    expect(container.firstChild).toBeNull()
  })

  it('unsubscribes on unmount', async () => {
    const electron = makeElectron({ maximized: false, platform: 'win32' })
    window.electron = electron
    const { unmount } = render(<WindowControls />)
    await flush()
    unmount()
    expect(electron.onWindowMaximizedChange.mock.results[0].value).toHaveBeenCalledTimes(1)
  })
})
