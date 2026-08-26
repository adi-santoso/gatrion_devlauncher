import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyboardShortcuts } from '../useKeyboardShortcuts'

const makeDeps = () => ({
  openModal: null,
  onOpenModal: vi.fn(),
  onCloseModal: vi.fn(),
  onStartAll: vi.fn(),
  onStopAll: vi.fn(),
  setOpenModal: vi.fn(),
})

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('? opens the shortcuts modal when not typing', () => {
    const deps = makeDeps()
    renderHook(() => useKeyboardShortcuts(deps))

    const event = new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true })
    window.dispatchEvent(event)

    expect(deps.setOpenModal).toHaveBeenCalledWith('shortcuts')
    expect(event.defaultPrevented).toBe(true)
  })

  test('? types normally into a textarea instead of opening the modal', () => {
    const deps = makeDeps()
    renderHook(() => useKeyboardShortcuts(deps))

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()

    const event = new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true })
    textarea.dispatchEvent(event)

    expect(deps.setOpenModal).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  test('? types normally into an input instead of opening the modal', () => {
    const deps = makeDeps()
    renderHook(() => useKeyboardShortcuts(deps))

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    const event = new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true })
    input.dispatchEvent(event)

    expect(deps.setOpenModal).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  test('? opens the modal when focus is on the body (not typing)', () => {
    const deps = makeDeps()
    renderHook(() => useKeyboardShortcuts(deps))

    const event = new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)

    expect(deps.setOpenModal).toHaveBeenCalledWith('shortcuts')
  })
})
