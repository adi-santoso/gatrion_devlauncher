import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onTerminalData, onTerminalExit } from '../terminal'

describe('terminal data push multiplexing', () => {
  beforeEach(() => {
    window.electron = {
      onTerminalData: vi.fn(),
      onTerminalExit: vi.fn(),
    }
  })

  it('uses one preload listener for many terminal subscribers', () => {
    let pushData
    let pushExit
    const stopData = vi.fn()
    const stopExit = vi.fn()
    window.electron.onTerminalData.mockImplementation((callback) => {
      pushData = callback
      return stopData
    })
    window.electron.onTerminalExit.mockImplementation((callback) => {
      pushExit = callback
      return stopExit
    })

    const dataA = vi.fn()
    const dataB = vi.fn()
    const exitA = vi.fn()
    const removeDataA = onTerminalData(dataA)
    const removeDataB = onTerminalData(dataB)
    const removeExitA = onTerminalExit(exitA)

    expect(window.electron.onTerminalData).toHaveBeenCalledTimes(1)
    expect(window.electron.onTerminalExit).toHaveBeenCalledTimes(1)
    pushData('term-1', 'hello')
    pushExit('term-1', 0)
    expect(dataA).toHaveBeenCalledWith('term-1', 'hello')
    expect(dataB).toHaveBeenCalledWith('term-1', 'hello')
    expect(exitA).toHaveBeenCalledWith('term-1', 0)

    removeDataA()
    expect(stopData).not.toHaveBeenCalled()
    removeDataB()
    removeExitA()
    expect(stopData).toHaveBeenCalledTimes(1)
    expect(stopExit).toHaveBeenCalledTimes(1)
  })
})
