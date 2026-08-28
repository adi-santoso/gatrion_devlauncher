import { describe, test, expect, vi } from 'vitest'
import { createCloseConfirmLatch } from '../../closeConfirm'

function makeDeps(overrides = {}) {
  return {
    isQuitting: () => false,
    isMinimizeToTray: () => false,
    getBusyCount: () => 0,
    sendCloseRequest: vi.fn(),
    closeWindow: vi.fn(),
    hideWindow: vi.fn(),
    ...overrides,
  }
}

describe('createCloseConfirmLatch', () => {
  test('minimize-to-tray ON: prevents close and hides the window', () => {
    const deps = makeDeps({ isMinimizeToTray: () => true })
    const latch = createCloseConfirmLatch(deps)
    const event = { preventDefault: vi.fn() }

    const proceed = latch.handleClose(event)
    expect(proceed).toBe(false)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(deps.hideWindow).toHaveBeenCalled()
    expect(deps.sendCloseRequest).not.toHaveBeenCalled()
  })

  test('minimize-to-tray OFF: first close asks the renderer and is prevented', () => {
    const deps = makeDeps({ getBusyCount: () => 3 })
    const latch = createCloseConfirmLatch(deps)
    const event = { preventDefault: vi.fn() }

    const proceed = latch.handleClose(event)
    expect(proceed).toBe(false)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(deps.sendCloseRequest).toHaveBeenCalledWith({ busyCount: 3 })
  })

  test('repeated closes while the prompt is open are prevented but not re-sent', () => {
    const deps = makeDeps()
    const latch = createCloseConfirmLatch(deps)
    latch.handleClose({ preventDefault: vi.fn() })
    latch.handleClose({ preventDefault: vi.fn() })

    expect(deps.sendCloseRequest).toHaveBeenCalledTimes(1)
  })

  test('handleConfirmed releases the latch and re-closes the window', () => {
    const deps = makeDeps()
    const latch = createCloseConfirmLatch(deps)
    latch.handleClose({ preventDefault: vi.fn() })

    latch.handleConfirmed()
    expect(deps.closeWindow).toHaveBeenCalled()

    // After confirming, a close is allowed to proceed (returns true).
    const event = { preventDefault: vi.fn() }
    expect(latch.handleClose(event)).toBe(true)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  test('handleCancelled resets so the next close asks again', () => {
    const deps = makeDeps()
    const latch = createCloseConfirmLatch(deps)
    latch.handleClose({ preventDefault: vi.fn() })

    latch.handleCancelled()
    latch.handleClose({ preventDefault: vi.fn() })

    expect(deps.sendCloseRequest).toHaveBeenCalledTimes(2)
  })

  test('a real quit (isQuitting) always proceeds without asking', () => {
    const deps = makeDeps({ isQuitting: () => true })
    const latch = createCloseConfirmLatch(deps)
    const event = { preventDefault: vi.fn() }

    expect(latch.handleClose(event)).toBe(true)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(deps.sendCloseRequest).not.toHaveBeenCalled()
  })
})